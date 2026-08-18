import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { StoreStatus } from '../enum/store-status.enum';
import { Platform } from '../enum/platform.enum';

export class CreateStoreDto {
  @ApiProperty({
    description: 'Merchant UUID that owns the store',
    example: '8c4c1c0f-cd65-45d9-a2a6-2d9c5b9db9b6',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  merchantId: string;

  @ApiProperty({
    description: 'Store display name',
    example: 'My Shopify Store',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({
    description: 'E-commerce platform/provider',
    enum: Platform,
    example: Platform.SHOPIFY,
  })
  @IsEnum(Platform)
  provider: Platform;

  @ApiPropertyOptional({
    description: 'Store owner name',
    example: 'Mohammed Dress',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  ownerName?: string;

  @ApiProperty({
    description: 'Store email',
    example: 'store@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({
    description: 'Store phone number',
    example: '+212612345678',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Store language',
    example: 'fr',
    default: 'fr',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: 'Store timezone',
    example: 'Africa/Casablanca',
    default: 'Africa/Casablanca',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Store currency',
    example: 'MAD',
    default: 'MAD',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Custom store settings',
    example: {
      notifications: true,
      orderPrefix: 'ORD',
      clientId: 'your-shopify-client-id',
      clientSecret: 'your-shopify-client-secret',
      scopes:
        'read_orders,write_orders,read_products,write_products,read_customers,write_customers,read_fulfillments,write_fulfillments,read_draft_orders,write_draft_orders,read_inventory,write_inventory',
      redirectUri: 'http://localhost:2785/api/shopify/oauth/callback',
    },
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Store status',
    enum: StoreStatus,
    example: StoreStatus.ACTIVE,
    default: StoreStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;

  @ApiProperty({
    description: 'Session UUID that owns the store',
    example: '8c4c1c0f-cd65-45d9-a2a6-2d9c5b9db9b6',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;
}
