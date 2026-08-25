import { Body, Controller, Delete, Get, Param, Patch, Post, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('Stores')
@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  private publicStore(store: Awaited<ReturnType<StoreService['findOneById']>>) {
    const settings = (store.settings ?? {}) as Record<string, unknown>;
    const { clientSecret, accessToken, consumerSecret, webhookSecret, ...publicSettings } = settings;
    return {
      ...store,
      settings: {
        ...publicSettings,
        clientSecretConfigured: typeof clientSecret === 'string' && clientSecret.length > 0,
        consumerSecretConfigured: typeof consumerSecret === 'string' && consumerSecret.length > 0,
        webhookSecretConfigured: typeof webhookSecret === 'string' && webhookSecret.length > 0,
        connected:
          store.provider === 'woocommerce'
            ? typeof settings.consumerKey === 'string' &&
              settings.consumerKey.length > 0 &&
              typeof consumerSecret === 'string' &&
              consumerSecret.length > 0 &&
              settings.connected === true
            : typeof accessToken === 'string' && accessToken.length > 0,
      },
    };
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a new store' })
  @ApiResponse({
    status: 201,
    description: 'Store created successfully.',
  })
  async create(@Body() dto: CreateStoreDto) {
    return this.publicStore(await this.storeService.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Get all stores' })
  @ApiResponse({
    status: 200,
    description: 'List of stores.',
  })
  async findAll() {
    return (await this.storeService.findAll()).map(store => this.publicStore(store));
  }

  @Get('orders/confirmation-summary')
  @ApiOperation({ summary: 'Get WhatsApp order confirmation counts across stores' })
  getOrderConfirmationSummary(@Query('days') days?: string, @Query('type') type?: string) {
    const parsedDays = days ? Number.parseInt(days, 10) : undefined;
    const allowedTypes = new Set(['all', 'pending', 'confirmed', 'cancelled', 'failed', 'not_sent']);
    return this.storeService.getOrderConfirmationSummary({
      days: parsedDays && parsedDays > 0 ? parsedDays : undefined,
      type: type && allowedTypes.has(type) ? type : 'all',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a store by ID' })
  @ApiParam({
    name: 'id',
    description: 'Store UUID',
    example: '9d4c0e73-1d51-4d9a-8e3c-0b4d0bb6d3d1',
  })
  @ApiResponse({
    status: 200,
    description: 'Store found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Store not found.',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicStore(await this.storeService.findOneById(id));
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'List locally imported products for a store' })
  findProducts(@Param('id', ParseUUIDPipe) id: string) {
    return this.storeService.findProducts(id);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'List locally imported orders for a store' })
  findOrders(@Param('id', ParseUUIDPipe) id: string) {
    return this.storeService.findOrders(id);
  }

  @Get('conversation-ownership/current')
  getConversationOwnership(@Query('sessionId') sessionId: string, @Query('chatId') chatId: string) {
    return this.storeService.getConversationOwnership(sessionId, chatId);
  }

  @Get(':id/order-conversations')
  getOrderConversations(@Param('id', ParseUUIDPipe) id: string) {
    return this.storeService.getOrderConversations(id);
  }

  @Get(':id/orders/:orderId/conversation')
  getOrderConversation(@Param('id', ParseUUIDPipe) id: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.storeService.getOrderConversation(id, orderId);
  }

  @Post(':id/orders/:orderId/handoff')
  @RequireRole(ApiKeyRole.OPERATOR)
  setOrderHandoff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: { handoff: boolean },
  ) {
    return this.storeService.setOrderConversationHandoff(id, orderId, body.handoff !== false);
  }

  @Post(':id/orders/:orderId/remind')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send a WhatsApp reminder for a pending order confirmation' })
  remindOrder(@Param('id', ParseUUIDPipe) id: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.storeService.sendOrderReminder(id, orderId);
  }

  @Patch(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a store' })
  @ApiParam({
    name: 'id',
    description: 'Store UUID',
    example: '9d4c0e73-1d51-4d9a-8e3c-0b4d0bb6d3d1',
  })
  @ApiResponse({
    status: 200,
    description: 'Store updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Store not found.',
  })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStoreDto) {
    return this.publicStore(await this.storeService.update(id, dto));
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete a store' })
  @ApiParam({
    name: 'id',
    description: 'Store UUID',
    example: '9d4c0e73-1d51-4d9a-8e3c-0b4d0bb6d3d1',
  })
  @ApiResponse({
    status: 200,
    description: 'Store deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Store not found.',
  })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.storeService.delete(id);

    return {
      success: true,
      message: 'Store deleted successfully.',
    };
  }

  //   @Post(':id/connect')
  // @ApiOperation({
  //   summary: 'Connect a store to an e-commerce platform',
  //   description:
  //     'Creates or updates an integration connection for the specified store.',
  // })
  // @ApiParam({
  //   name: 'id',
  //   description: 'Store UUID',
  //   example: '9d4c0e73-1d51-4d9a-8e3c-0b4d0bb6d3d1',
  // })
  // @ApiBody({
  //   type: ConnectStoreDto,
  // })
  // @ApiResponse({
  //   status: 201,
  //   description: 'Store connected successfully.',
  // })
  // @ApiResponse({
  //   status: 400,
  //   description: 'Invalid provider or credentials.',
  // })
  // @ApiResponse({
  //   status: 404,
  //   description: 'Store not found.',
  // })
  // connect(
  //   @Param('id') id: string,
  //   @Body() dto: ConnectStoreDto,
  // ) {
  //   return this.storeService.connectIntegration(id, dto);
  // }
}
