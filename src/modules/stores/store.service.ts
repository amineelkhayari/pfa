import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Store } from './entities/store.entity';

import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { MessageService } from '../message/message.service';
import { Session } from '../session/entities/session.entity';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { getRequestUserScope } from '../../common/services/request-context';
import { PlanUsageService } from '../auth/plan-usage.service';
import { OrderAiConversation } from './entities/order-ai-conversation.entity';
import { Message } from '../message/entities/message.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store, 'data')
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(Session, 'data')
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Product, 'data')
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order, 'data')
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderAiConversation, 'data')
    private readonly conversationRepository: Repository<OrderAiConversation>,
    @InjectRepository(Message, 'data')
    private readonly messageRepository: Repository<Message>,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly messageService: MessageService,
    private readonly planUsage: PlanUsageService,
  ) {}

  async create(dto: CreateStoreDto): Promise<Store> {
    const scope = getRequestUserScope();
    await this.planUsage.assertCanCreateStore();
    // this.messageService.sendText('8e460a4e-2d7e-48fa-b0c6-877131c8afc2',
    //   {
    //     "chatId": "212673518365@c.us",
    //     "text": "Hello from OpenWA!"+dto.ownerName,
    //     "mentions": [
    //       "628123456789@c.us"
    //     ]
    //   }
    // );
    await this.assertSessionAvailable(dto.sessionId);

    const exists = await this.storeRepository
      .createQueryBuilder('store')
      .where('store.name = :name', { name: dto.name })
      .andWhere(scope.userId ? 'store.userId = :userId' : 'store.userId IS NULL', { userId: scope.userId })
      .getOne();

    if (exists) {
      throw new ConflictException('A store with this name already exists.');
    }

    const store = this.storeRepository.create({
      ...dto,
      settings: dto.settings ? this.credentialEncryption.protectSettings(dto.settings) : undefined,
      userId: scope.userId ?? null,
    });

    return await this.storeRepository.save(store);
  }

  async findAll(): Promise<Store[]> {
    const scope = getRequestUserScope();
    return await this.storeRepository.find({
      where: scope.userId && !scope.isAdmin ? { userId: scope.userId } : undefined,
      relations: {
        session: true,
        // integrations: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getOrderConfirmationSummary(filters?: { days?: number; type?: string }) {
    const scope = getRequestUserScope();
    const sessionWhere = scope.userId && !scope.isAdmin ? { userId: scope.userId } : undefined;
    const storeWhere = scope.userId && !scope.isAdmin ? { userId: scope.userId } : undefined;
    const since =
      filters?.days && filters.days > 0 ? new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000) : undefined;
    const query = this.orderRepository
      .createQueryBuilder('order')
      .innerJoin(Store, 'store', 'store.id = order.storeId')
      .select('order.confirmationStatus', 'status')
      .addSelect('COUNT(*)', 'count');

    if (scope.userId && !scope.isAdmin) query.andWhere('store.userId = :userId', { userId: scope.userId });

    if (since) {
      query.andWhere('order.shopifyCreatedAt >= :since', { since });
    }
    if (filters?.type && filters.type !== 'all') {
      const statuses = filters.type === 'pending' ? ['pending', 'processing_reply'] : [filters.type];
      query.andWhere('order.confirmationStatus IN (:...statuses)', { statuses });
    }

    const sessions = await this.sessionRepository.find({ where: sessionWhere, order: { createdAt: 'DESC' } });
    const stores = await this.storeRepository.find({
      where: storeWhere,
      relations: { session: true },
      order: { createdAt: 'DESC' },
    });
    const sessionIds = sessions.map(session => session.id);
    const storeIds = stores.map(store => store.id);

    const messageQuery = this.messageRepository
      .createQueryBuilder('message')
      .select('message.sessionId', 'sessionId')
      .addSelect("SUM(CASE WHEN message.direction = 'outgoing' THEN 1 ELSE 0 END)", 'sent')
      .addSelect("SUM(CASE WHEN message.direction = 'incoming' THEN 1 ELSE 0 END)", 'received')
      .addSelect("SUM(CASE WHEN message.status = 'failed' THEN 1 ELSE 0 END)", 'failed')
      .addSelect('MAX(message.createdAt)', 'lastMessageAt')
      .groupBy('message.sessionId');
    if (sessionIds.length) messageQuery.where('message.sessionId IN (:...sessionIds)', { sessionIds });
    else messageQuery.where('1 = 0');
    if (since) messageQuery.andWhere('message.createdAt >= :messageSince', { messageSince: since });

    const orderByStoreQuery = this.orderRepository
      .createQueryBuilder('order')
      .select('order.storeId', 'storeId')
      .addSelect('order.confirmationStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MAX(order.shopifyCreatedAt)', 'lastOrderAt')
      .groupBy('order.storeId')
      .addGroupBy('order.confirmationStatus');
    if (storeIds.length) orderByStoreQuery.where('order.storeId IN (:...storeIds)', { storeIds });
    else orderByStoreQuery.where('1 = 0');
    if (since) orderByStoreQuery.andWhere('order.shopifyCreatedAt >= :orderSince', { orderSince: since });
    if (filters?.type && filters.type !== 'all') {
      const statuses = filters.type === 'pending' ? ['pending', 'sending', 'processing_reply'] : [filters.type];
      orderByStoreQuery.andWhere('order.confirmationStatus IN (:...storeStatuses)', { storeStatuses: statuses });
    }

    const productQuery = this.productRepository
      .createQueryBuilder('product')
      .select('product.storeId', 'storeId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('product.storeId');
    if (storeIds.length) productQuery.where('product.storeId IN (:...storeIds)', { storeIds });
    else productQuery.where('1 = 0');

    const aiQuery = this.conversationRepository
      .createQueryBuilder('conversation')
      .select('conversation.storeId', 'storeId')
      .addSelect('conversation.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('conversation.storeId')
      .addGroupBy('conversation.status');
    if (storeIds.length) aiQuery.where('conversation.storeId IN (:...storeIds)', { storeIds });
    else aiQuery.where('1 = 0');
    if (since) aiQuery.andWhere('conversation.updatedAt >= :aiSince', { aiSince: since });

    const [rows, totalProducts, messageRows, orderStoreRows, productRows, aiRows] = await Promise.all([
      query.groupBy('order.confirmationStatus').getRawMany<{ status: string; count: string | number }>(),
      this.productRepository
        .createQueryBuilder('product')
        .innerJoin(Store, 'store', 'store.id = product.storeId')
        .where(scope.userId && !scope.isAdmin ? 'store.userId = :userId' : '1=1', { userId: scope.userId })
        .getCount(),
      messageQuery.getRawMany<{
        sessionId: string;
        sent: string;
        received: string;
        failed: string;
        lastMessageAt: string | null;
      }>(),
      orderByStoreQuery.getRawMany<{ storeId: string; status: string; count: string; lastOrderAt: string | null }>(),
      productQuery.getRawMany<{ storeId: string; count: string }>(),
      aiQuery.getRawMany<{ storeId: string; status: string; count: string }>(),
    ]);

    const counts = new Map(rows.map(row => [row.status, Number(row.count)]));
    const value = (status: string) => counts.get(status) ?? 0;
    const messageBySession = new Map(messageRows.map(row => [row.sessionId, row]));
    const productByStore = new Map(productRows.map(row => [row.storeId, Number(row.count)]));
    const ordersByStore = new Map<string, Record<string, number | string | null>>();
    for (const row of orderStoreRows) {
      const current = ordersByStore.get(row.storeId) ?? { total: 0, lastOrderAt: null };
      current.total = Number(current.total) + Number(row.count);
      current[row.status] = Number(row.count);
      if (row.lastOrderAt && (!current.lastOrderAt || row.lastOrderAt > String(current.lastOrderAt)))
        current.lastOrderAt = row.lastOrderAt;
      ordersByStore.set(row.storeId, current);
    }
    const aiByStore = new Map<string, Record<string, number>>();
    for (const row of aiRows) {
      const current = aiByStore.get(row.storeId) ?? {};
      current[row.status] = Number(row.count);
      aiByStore.set(row.storeId, current);
    }
    const storeMetrics = stores.map(store => {
      const messages = messageBySession.get(store.sessionId);
      const orders = ordersByStore.get(store.id) ?? { total: 0 };
      const ai = aiByStore.get(store.id) ?? {};
      return {
        id: store.id,
        name: store.name,
        provider: store.provider,
        status: store.status,
        sessionId: store.sessionId,
        sessionName: store.session?.name ?? null,
        sessionStatus: store.session?.status ?? 'disconnected',
        products: productByStore.get(store.id) ?? 0,
        orders: Number(orders.total ?? 0),
        pending: Number(orders.pending ?? 0) + Number(orders.sending ?? 0) + Number(orders.processing_reply ?? 0),
        confirmed: Number(orders.confirmed ?? 0),
        cancelled: Number(orders.cancelled ?? 0),
        confirmationFailed: Number(orders.failed ?? 0),
        notSent: Number(orders.not_sent ?? 0),
        sent: Number(messages?.sent ?? 0),
        received: Number(messages?.received ?? 0),
        failed: Number(messages?.failed ?? 0),
        aiActive: Number(ai.active ?? 0),
        aiEscalated: Number(ai.escalated ?? 0),
        lastOrderAt: orders.lastOrderAt ?? null,
        lastMessageAt: messages?.lastMessageAt ?? null,
      };
    });
    const storesBySession = new Map(storeMetrics.map(store => [store.sessionId, store]));
    const sessionMetrics = sessions.map(session => {
      const messages = messageBySession.get(session.id);
      const store = storesBySession.get(session.id);
      return {
        id: session.id,
        name: session.name,
        phone: session.phone,
        status: session.status,
        lastActiveAt: session.lastActiveAt,
        sent: Number(messages?.sent ?? 0),
        received: Number(messages?.received ?? 0),
        failed: Number(messages?.failed ?? 0),
        lastMessageAt: messages?.lastMessageAt ?? null,
        storeId: store?.id ?? null,
        storeName: store?.name ?? null,
        products: store?.products ?? 0,
        orders: store?.orders ?? 0,
        pending: store?.pending ?? 0,
        confirmed: store?.confirmed ?? 0,
        cancelled: store?.cancelled ?? 0,
        confirmationFailed: store?.confirmationFailed ?? 0,
        aiActive: store?.aiActive ?? 0,
        aiEscalated: store?.aiEscalated ?? 0,
      };
    });
    return {
      total: rows.reduce((sum, row) => sum + Number(row.count), 0),
      pending: value('pending') + value('sending') + value('processing_reply'),
      confirmed: value('confirmed'),
      cancelled: value('cancelled'),
      failed: value('failed'),
      notSent: value('not_sent'),
      totalStores: stores.length,
      totalProducts,
      periodDays: filters?.days ?? null,
      sessions: sessionMetrics,
      stores: storeMetrics,
      messageTotals: sessionMetrics.reduce(
        (total, session) => ({
          sent: total.sent + session.sent,
          received: total.received + session.received,
          failed: total.failed + session.failed,
        }),
        { sent: 0, received: 0, failed: 0 },
      ),
    };
  }

  async findOneById(id: string): Promise<Store> {
    const scope = getRequestUserScope();
    const store = await this.storeRepository.findOne({
      where: scope.userId && !scope.isAdmin ? { id, userId: scope.userId } : { id },
      relations: {
        session: true,
        // integrations: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found.');
    }

    return store;
  }

  async findProducts(storeId: string): Promise<Product[]> {
    await this.findOneById(storeId);
    return this.productRepository.find({ where: { storeId }, order: { title: 'ASC' } });
  }

  async findOrders(storeId: string): Promise<Order[]> {
    await this.findOneById(storeId);
    return this.orderRepository.find({ where: { storeId }, order: { shopifyCreatedAt: 'DESC' } });
  }

  async getOrderConversation(storeId: string, orderId: string) {
    await this.findOneById(storeId);
    const order = await this.orderRepository.findOneBy({ id: orderId, storeId });
    if (!order) throw new NotFoundException('Order not found.');
    return this.conversationRepository.findOneBy({ orderId });
  }

  async getOrderConversations(storeId: string) {
    await this.findOneById(storeId);
    const rows = await this.conversationRepository.find({ where: { storeId } });
    return Object.fromEntries(rows.map(row => [row.orderId, row]));
  }

  async getConversationOwnership(sessionId: string, chatId: string) {
    const phone = chatId.split('@')[0].replace(/\D/g, '');
    if (!phone) return { locked: false };
    const stores = await this.findAll();
    const storeIds = stores.filter(store => store.sessionId === sessionId).map(store => store.id);
    if (!storeIds.length) return { locked: false };
    const candidates = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.confirmationStatus IN (:...statuses)', { statuses: ['pending', 'processing_reply'] })
      .orderBy('order.shopifyCreatedAt', 'DESC')
      .getMany();
    const order = candidates.find(candidate => candidate.phone?.replace(/\D/g, '') === phone);
    if (!order) return { locked: false };
    const conversation = await this.conversationRepository.findOneBy({ orderId: order.id });
    const locked = conversation?.status !== 'escalated';
    return {
      locked,
      storeId: order.storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      automation: conversation ? 'ai' : 'confirmation',
      status: conversation?.status ?? 'active',
    };
  }

  async setOrderConversationHandoff(storeId: string, orderId: string, handoff: boolean) {
    await this.findOneById(storeId);
    const order = await this.orderRepository.findOneBy({ id: orderId, storeId });
    if (!order) throw new NotFoundException('Order not found.');
    let conversation = await this.conversationRepository.findOneBy({ orderId });
    conversation ??= this.conversationRepository.create({
      orderId,
      storeId,
      status: 'active',
      turnCount: 0,
      turns: [],
    });
    if (!['pending', 'processing_reply'].includes(order.confirmationStatus)) {
      throw new BadRequestException('Only an order awaiting confirmation can change AI handoff state.');
    }
    conversation.status = handoff ? 'escalated' : 'active';
    conversation.lastError = null;
    return this.conversationRepository.save(conversation);
  }

  async sendOrderReminder(storeId: string, orderId: string): Promise<Order> {
    const store = await this.findOneById(storeId);
    const order = await this.orderRepository.findOneBy({ id: orderId, storeId });
    if (!order) throw new NotFoundException('Order not found.');
    if (!['pending', 'not_sent', 'failed'].includes(order.confirmationStatus)) {
      throw new BadRequestException('Only orders awaiting confirmation can receive a confirmation message.');
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
    order.confirmationStatus = 'pending';
    return this.orderRepository.save(order);
  }

  async update(id: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.findOneById(id);

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
    const scope = getRequestUserScope();
    const session = await this.sessionRepository.findOneBy(
      scope.userId && !scope.isAdmin ? { id: sessionId, userId: scope.userId } : { id: sessionId },
    );
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
