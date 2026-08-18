import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ShopifyInstallDto {
  @ApiProperty({
    description: 'Shopify store domain',
    example: 'my-store.myshopify.com',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/, {
    message: 'Invalid Shopify shop domain',
  })
  shop: string;
}
