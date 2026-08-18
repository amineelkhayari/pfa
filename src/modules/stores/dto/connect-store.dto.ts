import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Platform } from '../enum/platform.enum';

export class ConnectStoreDto {
  @ApiProperty({
    description: 'E-commerce platform provider',
    enum: Platform,
    example: Platform.SHOPIFY,
  })
  @IsEnum(Platform)
  provider: Platform;

  @ApiProperty({
    description: 'Platform credentials',
    examples: {
      shopify: {
        summary: 'Shopify',
        value: {
          shop: 'my-store.myshopify.com',
          accessToken: 'shpat_xxxxxxxxxxxxx',
        },
      },
      woocommerce: {
        summary: 'WooCommerce',
        value: {
          url: 'https://store.example.com',
          consumerKey: 'ck_xxxxxxxxx',
          consumerSecret: 'cs_xxxxxxxxx',
        },
      },
    },
  })
  @IsObject()
  credentials: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Platform-specific configuration',
    example: {
      webhookVersion: '2026-07',
      syncProducts: true,
      syncOrders: true,
    },
  })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, any>;
}
