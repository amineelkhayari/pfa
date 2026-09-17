import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRole } from '../../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';
import { HumanCommerceActionService } from '../services/human-commerce-action.service';

@ApiTags('commerce-support')
@Controller('commerce-support/stores/:storeId')
@RequireRole(ApiKeyRole.OPERATOR)
export class HumanCommerceActionController {
  constructor(private readonly actions: HumanCommerceActionService) {}

  @Post('orders')
  @ApiOperation({ summary: 'Create and confirm a provider order for a customer from the human support workspace' })
  create(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() body: {
      productId: string;
      variantId?: string | null;
      variantTitle?: string | null;
      quantity: number;
      customerName: string;
      phone: string;
      address1: string;
      city: string;
      postalCode?: string;
      country: string;
      notifyCustomer?: boolean;
    },
  ) {
    return this.actions.createOrder(storeId, body);
  }

  @Post('orders/:orderId/order-history-pdf')
  @ApiOperation({ summary: 'Generate and send the customer order-history PDF from the human support workspace' })
  orderHistoryPdf(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.actions.sendOrderHistoryPdf(storeId, orderId);
  }

  @Post('orders/:orderId/status')
  @ApiOperation({ summary: 'Confirm or cancel an order in its commerce provider from the human support workspace' })
  status(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: { action: 'confirm' | 'cancel'; notifyCustomer?: boolean },
  ) {
    if (!['confirm', 'cancel'].includes(body.action)) throw new BadRequestException('Invalid order action.');
    return this.actions.changeStatus(storeId, orderId, body.action, body.notifyCustomer !== false);
  }

  @Patch('orders/:orderId/shipping-address')
  @ApiOperation({ summary: 'Update an order shipping address in its commerce provider' })
  address(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: { customerName: string; address1: string; city: string; postalCode?: string; country: string; phone?: string },
  ) {
    return this.actions.updateAddress(storeId, orderId, body);
  }
}
