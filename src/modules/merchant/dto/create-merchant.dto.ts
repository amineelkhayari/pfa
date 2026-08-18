import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMerchantDto {
  @ApiProperty({
    description: 'Merchant business name',
    example: 'Acme Store',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({
    description: 'Merchant email address',
    example: 'owner@acmestore.com',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Merchant phone number',
    example: '+212612345678',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
