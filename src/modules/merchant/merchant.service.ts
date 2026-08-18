import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Merchant } from './entities/merchant.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { getRequestUserScope } from '../../common/services/request-context';

@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(Merchant, 'data')
    private readonly merchantRepository: Repository<Merchant>,
  ) {}

  async create(dto: CreateMerchantDto): Promise<Merchant> {
    const scope = getRequestUserScope();
    const exists = await this.merchantRepository.findOne({
      where: {
        email: dto.email,
      },
    });

    if (exists) {
      throw new ConflictException('Merchant email already exists.');
    }

    const merchant = this.merchantRepository.create({ ...dto, userId: scope.userId ?? null });

    return await this.merchantRepository.save(merchant);
  }

  async findAll(): Promise<Merchant[]> {
    const scope = getRequestUserScope();
    return await this.merchantRepository.find({
      where: scope.userId && !scope.isAdmin ? { userId: scope.userId } : undefined,
      order: {
        createdAt: 'DESC',
      },
      relations: {
        stores: true,
      },
    });
  }

  async findById(id: string): Promise<Merchant> {
    const scope = getRequestUserScope();
    const merchant = await this.merchantRepository.findOne({
      where: scope.userId && !scope.isAdmin ? { id, userId: scope.userId } : { id },
      relations: {
        stores: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found.');
    }

    return merchant;
  }

  async update(id: string, dto: UpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.findById(id);

    if (dto.email && dto.email !== merchant.email) {
      const exists = await this.merchantRepository.findOne({
        where: {
          email: dto.email,
        },
      });

      if (exists) {
        throw new ConflictException('Merchant email already exists.');
      }
    }

    Object.assign(merchant, dto);

    return await this.merchantRepository.save(merchant);
  }

  async remove(id: string): Promise<void> {
    const merchant = await this.findById(id);

    await this.merchantRepository.remove(merchant);
  }
}
