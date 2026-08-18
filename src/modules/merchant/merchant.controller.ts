import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { MerchantService } from './merchant.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('Merchants')
@Controller('merchants')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a merchant' })
  @ApiResponse({
    status: 201,
    description: 'Merchant created successfully.',
  })
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all merchants' })
  @ApiResponse({
    status: 200,
    description: 'List of merchants.',
  })
  findAll() {
    return this.merchantService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get merchant by ID' })
  @ApiResponse({
    status: 200,
    description: 'Merchant found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Merchant not found.',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.merchantService.findById(id);
  }

  @Patch(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a merchant' })
  @ApiResponse({
    status: 200,
    description: 'Merchant updated successfully.',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMerchantDto) {
    return this.merchantService.update(id, dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete a merchant' })
  @ApiResponse({
    status: 200,
    description: 'Merchant deleted successfully.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.merchantService.remove(id);
  }
}
