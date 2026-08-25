import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { getRequestUserScope } from '../../common/services/request-context';
import { PlanUsageService } from '../auth/plan-usage.service';
import { BulkMessageService } from '../message/bulk-message.service';
import { BatchStatus, MessageBatch } from '../message/entities/message-batch.entity';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { Order } from '../stores/entities/order.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { Campaign, CampaignStatus } from './entities/campaign.entity';

@Injectable()
export class CampaignService {
  constructor(
    @InjectRepository(Campaign, 'data') private campaigns: Repository<Campaign>,
    @InjectRepository(Session, 'data') private sessions: Repository<Session>,
    @InjectRepository(Order, 'data') private orders: Repository<Order>,
    @InjectRepository(MessageBatch, 'data') private batches: Repository<MessageBatch>,
    @InjectRepository(Message, 'data') private messages: Repository<Message>,
    private bulk: BulkMessageService,
    private usage: PlanUsageService,
  ) {}

  private actor() {
    const s = getRequestUserScope();
    if (s.isAdmin) throw new ForbiddenException('Administrators cannot send campaigns');
    if (!s.userId) throw new ForbiddenException('User account required');
    return s.userId;
  }

  async create(dto: CreateCampaignDto) {
    const userId = this.actor();
    const session = await this.sessions.findOne({ where: { id: dto.sessionId, userId } });
    if (!session) throw new NotFoundException('WhatsApp session not found');
    if (session.status !== SessionStatus.READY) throw new BadRequestException('Connect this WhatsApp session first');
    const audience = await this.audienceFor(userId, dto.sessionId);
    const excluded = new Set(dto.excludedRecipients ?? []);
    const selectedCustomers = audience.customers.filter(customer => !excluded.has(customer.chatId));
    const recipients = selectedCustomers.map(customer => customer.chatId);
    if (!recipients.length) throw new BadRequestException('No store customers with valid phone numbers were found');
    const delay = dto.delayBetweenMessages ?? 4000;
    const riskScore = Math.min(100, Math.round(recipients.length / 5) + (delay < 3000 ? 35 : 0));
    if (riskScore >= 70 && !dto.confirmHighRisk)
      throw new BadRequestException(`High risk campaign (${riskScore}/100). Confirm the risk to launch.`);
    let c = await this.campaigns.save(
      this.campaigns.create({
        userId,
        sessionId: dto.sessionId,
        name: dto.name.trim(),
        message: dto.message.trim(),
        audienceType: 'store_customers',
        recipients,
        batchIds: [],
        status: CampaignStatus.RUNNING,
        riskScore,
        sent: 0,
        failed: 0,
        pending: recipients.length,
        skipped: audience.invalidPhones + audience.customers.length - recipients.length,
        completedAt: null,
      }),
    );
    try {
      // Keep a single sequential sender per device, even for audiences larger than the manual
      // bulk form's 100-recipient convenience limit. Quotas and moderation still run per message.
      const batchId = `campaign_${c.id.slice(0, 8)}`;
      await this.bulk.createBatch(c.sessionId, {
        batchId,
        messages: selectedCustomers.map(customer => ({
          chatId: customer.chatId,
          type: 'text',
          content: { text: c.message },
          variables: {
            customer: customer.name,
            name: customer.name,
            phone: customer.phone,
            store: customer.stores.join(', '),
          },
        })),
        options: { delayBetweenMessages: delay, randomizeDelay: true, stopOnError: false },
      });
      c.batchIds.push(batchId);
      c = await this.campaigns.save(c);
    } catch (e) {
      c.status = CampaignStatus.FAILED;
      c.completedAt = new Date();
      await this.campaigns.save(c);
      throw e;
    }
    return this.refresh(c);
  }

  async audience(sessionId: string) {
    if (!sessionId) throw new BadRequestException('sessionId is required');
    return this.audienceFor(this.actor(), sessionId);
  }

  async list() {
    const rows = await this.campaigns.find({
      where: { userId: this.actor() },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return Promise.all(rows.map(c => this.refresh(c)));
  }
  async cancel(id: string) {
    const c = await this.owned(id);
    for (const b of c.batchIds) {
      try {
        await this.bulk.cancelBatch(c.sessionId, b);
      } catch {
        /* already terminal */
      }
    }
    c.status = CampaignStatus.CANCELLED;
    c.completedAt = new Date();
    await this.campaigns.save(c);
    return this.refresh(c);
  }

  async report() {
    const userId = this.actor();
    const [sessions, usage, campaigns] = await Promise.all([
      this.sessions.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.usage.getUserUsage(userId),
      this.list(),
    ]);
    const ids = sessions.map(s => s.id),
      today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalSent = ids.length
      ? await this.messages.count({ where: { sessionId: In(ids), direction: MessageDirection.OUTGOING } })
      : 0;
    const todaySent = ids.length
      ? await this.messages.count({
          where: { sessionId: In(ids), direction: MessageDirection.OUTGOING, createdAt: MoreThanOrEqual(today) },
        })
      : 0;
    const sum = (key: 'sent' | 'failed' | 'pending' | 'skipped') => campaigns.reduce((n, c) => n + c[key], 0);
    const sent = sum('sent'),
      failed = sum('failed'),
      pending = sum('pending'),
      skipped = sum('skipped'),
      connected = sessions.filter(s => s.status === SessionStatus.READY).length;
    const devices = await Promise.all(
      sessions.map(async s => ({
        id: s.id,
        name: s.displayName || s.pushName || s.name,
        phone: s.phone,
        status: s.status,
        sent: await this.messages.count({ where: { sessionId: s.id, direction: MessageDirection.OUTGOING } }),
        received: await this.messages.count({ where: { sessionId: s.id, direction: MessageDirection.INCOMING } }),
        campaigns: campaigns.filter(c => c.sessionId === s.id).length,
      })),
    );
    const limit = usage.limits.sentMessages;
    return {
      summary: {
        todaySent,
        successRate: sent + failed ? Math.round((sent * 100) / (sent + failed)) : 0,
        activeCampaigns: campaigns.filter(c => c.status === CampaignStatus.RUNNING).length,
        connectedDevices: connected,
        pendingMessages: pending,
        highRiskCampaigns: campaigns.filter(c => c.riskScore >= 70 && c.status === CampaignStatus.RUNNING).length,
      },
      monthly: {
        used: usage.usage.sentMessages,
        limit,
        percent: Math.min(100, Math.round((usage.usage.sentMessages * 100) / limit)),
        periodStart: usage.periodStart,
      },
      totalSent,
      channels: { bulk: sent, chatbot: 0, autoresponder: 0, api: Math.max(0, totalSent - sent) },
      bulk: {
        sent,
        failed,
        pending,
        skipped,
        total: sent + failed + pending + skipped,
        successRate: sent + failed ? Math.round((sent * 100) / (sent + failed)) : 0,
        averageRiskScore: campaigns.length
          ? Math.round(campaigns.reduce((n, c) => n + c.riskScore, 0) / campaigns.length)
          : 0,
      },
      accountHealth: {
        percent: sessions.length ? Math.round((connected * 100) / sessions.length) : 0,
        connected,
        disconnected: sessions.length - connected,
        total: sessions.length,
      },
      devices,
      campaigns,
    };
  }

  private async owned(id: string) {
    const c = await this.campaigns.findOne({ where: { id, userId: this.actor() } });
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }
  private async audienceFor(userId: string, sessionId: string) {
    const session = await this.sessions.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('WhatsApp session not found');
    const rows = await this.orders
      .createQueryBuilder('o')
      .innerJoin('o.store', 's')
      .select(['o.phone AS phone', 'o.customerName AS customerName', 's.name AS storeName'])
      .where('s.userId=:userId', { userId })
      .andWhere('s.sessionId=:sessionId', { sessionId })
      .andWhere('o.phone IS NOT NULL')
      .orderBy('o.createdAt', 'DESC')
      .getRawMany<{ phone: string; customerName: string | null; storeName: string }>();
    const customers = new Map<
      string,
      { chatId: string; phone: string; name: string; orderCount: number; stores: string[] }
    >();
    let invalidPhones = 0;
    for (const row of rows) {
      const chatId = this.chatId(row.phone);
      if (!chatId) {
        invalidPhones++;
        continue;
      }
      const current = customers.get(chatId);
      if (current) {
        current.orderCount++;
        if (!current.stores.includes(row.storeName)) current.stores.push(row.storeName);
      } else {
        customers.set(chatId, {
          chatId,
          phone: `+${chatId.replace('@c.us', '')}`,
          name: row.customerName?.trim() || 'Customer',
          orderCount: 1,
          stores: [row.storeName],
        });
      }
    }
    return { sessionId, total: customers.size, invalidPhones, customers: [...customers.values()] };
  }
  private async refresh(c: Campaign) {
    if (!c.batchIds.length) return c;
    const bs = await this.batches.find({ where: { sessionId: c.sessionId, batchId: In(c.batchIds) } });
    c.sent = bs.reduce((n, b) => n + (b.progress?.sent ?? 0), 0);
    c.failed = bs.reduce((n, b) => n + (b.progress?.failed ?? 0), 0);
    c.pending = bs.reduce((n, b) => n + (b.progress?.pending ?? 0), 0);
    if (
      c.status !== CampaignStatus.CANCELLED &&
      bs.length === c.batchIds.length &&
      bs.every(b => [BatchStatus.COMPLETED, BatchStatus.FAILED, BatchStatus.CANCELLED].includes(b.status))
    ) {
      c.status = c.sent ? CampaignStatus.COMPLETED : CampaignStatus.FAILED;
      c.completedAt ??= new Date();
    }
    return this.campaigns.save(c);
  }
  private chatId(phone: string) {
    const d = String(phone ?? '')
      .replace(/\D/g, '')
      .replace(/^00/, '');
    return d.length >= 8 && d.length <= 15 ? `${d}@c.us` : null;
  }
}
