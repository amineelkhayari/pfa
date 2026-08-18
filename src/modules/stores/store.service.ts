import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Store } from './entities/store.entity';
import { Merchant } from '../merchant/entities/merchant.entity';

import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
// import { IntegrationConnection } from './entities/integration-connection.entity';
import { IntegrationProviderRegistry } from '../../ecomEngine/registry/integration-provider.registry';
import { MessageService } from '../message/message.service';
import { Session } from '../session/entities/session.entity';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store, 'data')
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(Merchant, 'data')
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(Session, 'data')
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Product, 'data')
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order, 'data')
    private readonly orderRepository: Repository<Order>,
    private readonly credentialEncryption: CredentialEncryptionService,
    // @InjectRepository(IntegrationConnection, 'data')
    // private readonly connectionRepository: Repository<IntegrationConnection>,
    private readonly integrationRegistry: IntegrationProviderRegistry,
    private readonly messageService: MessageService,
  ) {}

  async create(dto: CreateStoreDto): Promise<Store> {
    // this.messageService.sendText('8e460a4e-2d7e-48fa-b0c6-877131c8afc2',
    //   {
    //     "chatId": "212673518365@c.us",
    //     "text": "Hello from OpenWA!"+dto.ownerName,
    //     "mentions": [
    //       "628123456789@c.us"
    //     ]
    //   }
    // );
    const merchant = await this.merchantRepository.findOne({
      where: {
        id: dto.merchantId,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found.');
    }

    await this.assertSessionAvailable(dto.sessionId);

    const exists = await this.storeRepository.findOne({
      where: {
        merchantId: dto.merchantId,
        name: dto.name,
      },
    });

    if (exists) {
      throw new ConflictException('Store already exists for this merchant.');
    }

    const store = this.storeRepository.create({
      ...dto,
      settings: dto.settings ? this.credentialEncryption.protectSettings(dto.settings) : undefined,
    });

    return await this.storeRepository.save(store);
  }

  async findAll(): Promise<Store[]> {
    return await this.storeRepository.find({
      relations: {
        merchant: true,
        session: true,
        // integrations: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getOrderConfirmationSummary(filters?: { days?: number; type?: string }) {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .select('order.confirmationStatus', 'status')
      .addSelect('COUNT(*)', 'count');

    if (filters?.days && filters.days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - filters.days);
      query.andWhere('order.shopifyCreatedAt >= :since', { since });
    }
    if (filters?.type && filters.type !== 'all') {
      const statuses = filters.type === 'pending' ? ['pending', 'processing_reply'] : [filters.type];
      query.andWhere('order.confirmationStatus IN (:...statuses)', { statuses });
    }

    const [rows, totalStores, totalProducts] = await Promise.all([
      query.groupBy('order.confirmationStatus').getRawMany<{ status: string; count: string | number }>(),
      this.storeRepository.count(),
      this.productRepository.count(),
    ]);

    const counts = new Map(rows.map(row => [row.status, Number(row.count)]));
    const value = (status: string) => counts.get(status) ?? 0;
    return {
      total: rows.reduce((sum, row) => sum + Number(row.count), 0),
      pending: value('pending') + value('sending') + value('processing_reply'),
      confirmed: value('confirmed'),
      cancelled: value('cancelled'),
      failed: value('failed'),
      notSent: value('not_sent'),
      totalStores,
      totalProducts,
    };
  }

  async findOneById(id: string): Promise<Store> {
    const store = await this.storeRepository.findOne({
      where: {
        id,
      },
      relations: {
        merchant: true,
        session: true,
        // integrations: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found.');
    }

    return store;
  }

  async findByMerchant(merchantId: string): Promise<Store[]> {
    return await this.storeRepository.find({
      where: {
        merchantId,
      },
      // relations: {
      //   integrations: true,
      // },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findProducts(storeId: string): Promise<Product[]> {
    await this.findOneById(storeId);
    return this.productRepository.find({ where: { storeId }, order: { title: 'ASC' } });
  }

  async findOrders(storeId: string): Promise<Order[]> {
    await this.findOneById(storeId);
    return this.orderRepository.find({ where: { storeId }, order: { shopifyCreatedAt: 'DESC' } });
  }

  async sendOrderReminder(storeId: string, orderId: string): Promise<Order> {
    const store = await this.findOneById(storeId);
    const order = await this.orderRepository.findOneBy({ id: orderId, storeId });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.confirmationStatus !== 'pending') {
      throw new BadRequestException('Only pending orders can receive a confirmation reminder.');
    }
    if (!order.phone) throw new BadRequestException('Order has no customer phone number.');

    const items = (order.lineItems ?? [])
      .map(item => `• ${String(item.name ?? item.title ?? 'Product')} × ${String(item.quantity ?? 1)}`)
      .join('\n');
    const result = await this.messageService.sendText(store.sessionId, {
      chatId: `${order.phone.replace(/\D/g, '')}@c.us`,
      text: `Bonjour ${order.customerName ?? ''} 👋\n\nÊtes-vous toujours intéressé(e) par votre commande ${order.orderNumber ?? ''} ?\n\n${items}\n\nTotal: ${order.totalPrice} ${order.currency}\n\nRépondez 1 pour confirmer ou 2 pour annuler.`,
    });

    order.whatsappMessageId = result.messageId;
    order.confirmationSentAt = new Date();
    order.confirmationError = null;
    return this.orderRepository.save(order);
  }

  async update(id: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.findOneById(id);

    if (dto.merchantId && dto.merchantId !== store.merchantId) {
      const merchant = await this.merchantRepository.findOneBy({ id: dto.merchantId });
      if (!merchant) throw new NotFoundException('Merchant not found.');
    }

    if (dto.sessionId && dto.sessionId !== store.sessionId) {
      await this.assertSessionAvailable(dto.sessionId, id);
    }

    const settings = dto.settings
      ? this.credentialEncryption.protectSettings({ ...(store.settings ?? {}), ...dto.settings })
      : store.settings;
    Object.assign(store, dto, { settings });

    return await this.storeRepository.save(store);
  }

  private async assertSessionAvailable(sessionId: string, currentStoreId?: string): Promise<void> {
    const session = await this.sessionRepository.findOneBy({ id: sessionId });
    if (!session) throw new NotFoundException('WhatsApp session not found.');

    const linkedStore = await this.storeRepository.findOneBy({ sessionId });
    if (linkedStore && linkedStore.id !== currentStoreId) {
      throw new ConflictException('WhatsApp session is already linked to another store.');
    }
  }

  async delete(id: string): Promise<void> {
    const store = await this.findOneById(id);

    await this.storeRepository.remove(store);
  }
  async updateIntegrationCredentials(storeId: string, provider: string, credentials: Record<string, any>) {
    const connection = await this.getIntegrationConnection(storeId, provider);

    connection.settings = this.credentialEncryption.protectSettings(credentials);

    return this.storeRepository.save(connection);
  }
  // async connectIntegration(
  //   storeId: string,
  //   dto: Record<string, any>,
  // ): Promise<any> {

  //   const store =
  //     await this.storeRepository.findOne({
  //       where: {
  //         id: storeId,
  //         // provider: dto.provider,
  //       },
  //     });

  //   if (!store) {
  //     throw new NotFoundException(
  //       'Store not found.',
  //     );
  //   }

  //   // const exists =
  //   //   await this.connectionRepository.findOne({
  //   //     where: {
  //   //       storeId,
  //   //       provider: dto.provider,
  //   //     },
  //   //   });

  //   // if (exists) {
  //   //   throw new ConflictException(
  //   //     `${dto.provider} is already connected.`,
  //   //   );
  //   // }

  //   const provider =
  //     this.integrationRegistry.get(
  //       dto.provider,
  //     );

  //   await provider.validate(
  //     dto,
  //   );

  //   const connection =
  //     this.storeRepository.save({

  //       provider: dto.provider,

  //       credentials: dto.credentials,

  //       configuration:
  //         dto.configuration,

  //       status: StoreStatus.ACTIVE,

  //       connectedAt: new Date(),
  //     });

  //   return await this.connectionRepository.save(
  //     connection,
  //   );
  // }

  // async getIntegrationConnection(
  //   storeId: string,
  //   provider: string,
  // ): Promise<IntegrationConnection> {
  //   const connection =
  //     await this.connectionRepository
  //       .createQueryBuilder('connection')
  //       .addSelect('connection.credentials')
  //       .where('connection.storeId = :storeId', {
  //         storeId,
  //       })
  //       .andWhere('connection.provider = :provider', {
  //         provider,
  //       })
  //       .getOne();

  //   if (!connection) {
  //     throw new NotFoundException(
  //       'Integration connection not found.',
  //     );
  //   }

  //   return connection;
  // }
  async getIntegrationConnection(storeId: string, provider: string): Promise<Store> {
    const connection = await this.storeRepository
      .createQueryBuilder('connection')
      .addSelect('connection.settings')
      .where('connection.id = :storeId', {
        storeId,
      })
      .andWhere('connection.provider = :provider', {
        provider,
      })
      .getOne();

    if (!connection) {
      throw new NotFoundException(`${provider} integration not found.`);
    }

    return connection;
  }
}
