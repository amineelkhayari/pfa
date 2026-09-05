import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Store } from '../../stores/entities/store.entity';

import { ShopifyService } from '../services/shopify.service';
import { ShopifyOAuthService } from '../services/shopify-oauth.service';
import { StoreService } from '../../stores/store.service';
import { Public, RequireRole } from '../../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { PlanUsageService } from '../../auth/plan-usage.service';

interface ShopifyStoreSettings {
  shopDomain?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  redirectUri?: string;
  webhookBaseUrl?: string;
  accessToken?: string;
  scope?: string;
  [key: string]: unknown;
}

@ApiTags('Shopify OAuth')
@Controller('shopify')
export class ShopifyController {
  constructor(
    private readonly shopifyService: ShopifyService,
    private readonly shopifyOAuthService: ShopifyOAuthService,
    private readonly storeService: StoreService,
    private readonly configService: ConfigService,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly planUsage: PlanUsageService,
  ) {}

  private settings(store: Store): ShopifyStoreSettings | undefined {
    if (!store.settings) return undefined;
    return this.credentialEncryption.revealSettings(store.settings);
  }

  @Get('oauth/install')
  @ApiOperation({
    summary: 'Start Shopify OAuth installation',
  })
  @ApiQuery({
    name: 'storeId',
    type: String,
    format: 'uuid',
    example: '9d4c0e73-1d51-4d9a-8e3c-0b4d0bb6d3d1',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Shopify authorization page.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid configuration.',
  })
  async install(@Query('storeId') storeId: string, @Res() res: Response) {
    await this.planUsage.assertCurrentPlanActive();
    if (!storeId) {
      throw new BadRequestException('storeId is required.');
    }

    const connection = await this.storeService.getIntegrationConnection(storeId, 'shopify');

    const credentials = this.settings(connection);

    if (!credentials) {
      throw new BadRequestException('Shopify credentials not configured.');
    }

    const shopDomain = credentials.shopDomain;
    const { clientId, scopes, redirectUri } = credentials;

    if (!clientId || !shopDomain || !scopes || !redirectUri) {
      throw new BadRequestException('Incomplete Shopify credentials.');
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
      throw new BadRequestException('Invalid Shopify store domain.');
    }

    const state = await this.shopifyOAuthService.createState(storeId);

    const authorizationUrl = this.shopifyService.getAuthorizationUrl(shopDomain, clientId, scopes, redirectUri, state);

    return res.redirect(authorizationUrl);
  }

  @Post(':storeId/install-url')
  @RequireRole(ApiKeyRole.OPERATOR)
  async installUrl(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.planUsage.assertCurrentPlanActive();
    const connection = await this.storeService.getIntegrationConnection(storeId, 'shopify');
    const credentials = this.settings(connection);
    if (!credentials?.clientId || !credentials.shopDomain || !credentials.scopes || !credentials.redirectUri) {
      throw new BadRequestException('Incomplete Shopify credentials.');
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(credentials.shopDomain)) {
      throw new BadRequestException('Invalid Shopify store domain.');
    }
    const state = await this.shopifyOAuthService.createState(storeId);
    return {
      url: this.shopifyService.getAuthorizationUrl(
        credentials.shopDomain,
        credentials.clientId,
        credentials.scopes,
        credentials.redirectUri,
        state,
      ),
    };
  }

  @Get('oauth/callback')
  @Public()
  @ApiOperation({
    summary: 'Handle Shopify OAuth callback',
  })
  @ApiQuery({
    name: 'code',
    example: 'abc123',
  })
  @ApiQuery({
    name: 'shop',
    example: 'my-store.myshopify.com',
  })
  @ApiQuery({
    name: 'state',
    example: '2f8f8b17...',
  })
  @ApiResponse({
    status: 200,
    description: 'OAuth completed successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid callback.',
  })
  async callback(
    @Query('code') code: string,
    @Query('shop') shop: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() response: Response,
  ) {
    if (!code || !shop || !state) {
      throw new BadRequestException('Invalid Shopify OAuth callback.');
    }

    const storeId = await this.shopifyOAuthService.consumeState(state);

    const connection = await this.storeService.getIntegrationConnection(storeId, 'shopify');

    const credentials = this.settings(connection);

    if (!credentials) {
      throw new BadRequestException('Shopify credentials not found.');
    }
    const { clientId, clientSecret } = credentials;
    if (!clientId || !clientSecret) throw new BadRequestException('Shopify app is not configured for this store.');
    if (!this.shopifyOAuthService.verifyCallback(req.query, clientSecret)) {
      throw new UnauthorizedException('Invalid Shopify callback signature.');
    }
    if (shop.toLowerCase() !== String(credentials.shopDomain).toLowerCase()) {
      throw new UnauthorizedException('Shopify callback store does not match the requested installation.');
    }

    const token = await this.shopifyService.exchangeCodeForToken(shop, code, clientId, clientSecret);

    await this.storeService.updateIntegrationCredentials(storeId, 'shopify', {
      ...credentials,
      shopDomain: shop,
      accessToken: token.access_token,
      scope: token.scope,
    });

    const [products, orders] = await Promise.all([
      this.shopifyService.importProducts(shop, token.access_token, storeId),
      this.shopifyService.importOrders(shop, token.access_token, storeId),
    ]);
    const webhookBaseUrl =
      typeof credentials.webhookBaseUrl === 'string' && credentials.webhookBaseUrl
        ? credentials.webhookBaseUrl
        : new URL(credentials.redirectUri ?? '').origin;
    await this.shopifyService.ensureWebhooks(shop, token.access_token, webhookBaseUrl);
    await this.storeService.updateIntegrationCredentials(storeId, 'shopify', {
      ...credentials,
      shopDomain: shop,
      accessToken: token.access_token,
      scope: token.scope,
      lastSyncAt: new Date().toISOString(),
      importedProducts: products,
      importedOrders: orders,
    });

    const redirect = this.configService.get<string>('commerce.afterAuthRedirectUrl', '/stores');
    const separator = redirect.includes('?') ? '&' : '?';
    return response.redirect(
      `${redirect}${separator}shopify=connected&storeId=${encodeURIComponent(storeId)}&products=${products}&orders=${orders}`,
    );
  }

  @Get(':storeId/shop')
  async getShop(@Param('storeId') storeId: string) {
    const connection = await this.storeService.getIntegrationConnection(storeId, 'shopify');

    const credentials = this.settings(connection);

    if (!credentials?.shopDomain || !credentials?.accessToken) {
      throw new BadRequestException('Shopify is not connected.');
    }

    return this.shopifyService.getShop(credentials.shopDomain, credentials.accessToken);
  }

  @Get(':storeId/products')
  async getProduct(@Param('storeId') storeId: string) {
    const connection = await this.storeService.getIntegrationConnection(storeId, 'shopify');

    const credentials = this.settings(connection);

    if (!credentials?.shopDomain || !credentials?.accessToken) {
      throw new BadRequestException('Shopify is not connected.');
    }

    return (await this.shopifyService.getProducts(credentials.shopDomain, credentials.accessToken)) as unknown;
  }

  @Get(':storeId/orders')
  async getOrders(@Param('storeId') storeId: string) {
    const connection = await this.storeService.getIntegrationConnection(storeId, 'shopify');

    const credentials = this.settings(connection);

    if (!credentials?.shopDomain || !credentials?.accessToken) {
      throw new BadRequestException('Shopify is not connected.');
    }

    return (await this.shopifyService.getOrders(credentials.shopDomain, credentials.accessToken)) as unknown;
  }

  @Post(':storeId/sync')
  @RequireRole(ApiKeyRole.OPERATOR)
  async sync(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.planUsage.assertCurrentPlanActive();
    const store = await this.storeService.getIntegrationConnection(storeId, 'shopify');
    const credentials = this.settings(store);
    if (!credentials?.shopDomain || !credentials.accessToken) {
      throw new BadRequestException('Shopify is not connected.');
    }
    const [products, orders] = await Promise.all([
      this.shopifyService.importProducts(credentials.shopDomain, credentials.accessToken, storeId),
      this.shopifyService.importOrders(credentials.shopDomain, credentials.accessToken, storeId),
    ]);
    const lastSyncAt = new Date().toISOString();
    await this.storeService.updateIntegrationCredentials(storeId, 'shopify', {
      ...credentials,
      importedProducts: products,
      importedOrders: orders,
      lastSyncAt,
    });
    return { storeId, products, orders, lastSyncAt };
  }

  // private async ImportsProducts(shopDomain: string, accessToken: string) {
  //   var res = await this.shopifyService.getProducts(shopDomain, accessToken);
  //   const products = res ?? [];
  //    if (products.length === 0) {
  //    return 0;
  //   }

  //    for (const product of products) {
  //     const productData: Product = {

  //       shopifyProductId: product.id,
  //       title: product.title ?? "Untitled",
  //       description: product.body_html ?? "",
  //       handle: product.handle ?? "",
  //       productType: product.product_type ?? "",
  //       vendor: product.vendor ?? "",
  //       status: product.status ?? "active",
  //       tags: (product.tags ?? "").split(",").map((t: string) => t.trim()).filter(Boolean),
  //       imageUrl: product.image?.src ?? product.images?.[0]?.src ?? null,
  //       variants: product.variants ?? [],
  //       price: parseFloat(product.variants?.[0]?.price ?? "0"),
  //       shopifyCreatedAt: new Date(product.created_at) ? new Date(product.created_at) : null,
  //       shopifyUpdatedAt: product.updated_at ? new Date(product.updated_at) : null,
  //       createdAt: new Date(),
  //       storeId: "",

  //     };

  //   }
  //   return products;

  // }
}
