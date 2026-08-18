import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ShopifyCallbackDto {
  @ApiProperty({
    description: 'Temporary authorization code returned by Shopify',
    example: 'f3d2a7c9b8e1...',
  })
  @IsString()
  code: string;

  @ApiProperty({
    description: 'Shopify shop domain',
    example: 'my-store.myshopify.com',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/, {
    message: 'Invalid Shopify shop domain',
  })
  shop: string;

  @ApiProperty({
    description: 'HMAC signature used to verify the callback',
    example: '9b5c8f7d4e...',
  })
  @IsString()
  hmac: string;

  @ApiProperty({
    description: 'OAuth state value',
    example: 'a4b7e2d1c9',
  })
  @IsString()
  state: string;

  @ApiProperty({
    description: 'Unix timestamp sent by Shopify',
    example: '1754488325',
  })
  @Matches(/^\d+$/, {
    message: 'Timestamp must be a numeric string',
  })
  timestamp: string;
}
