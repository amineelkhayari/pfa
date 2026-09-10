import { Repository } from 'typeorm';
import { CommerceMessageReceipt } from '../../stores/entities/commerce-message-receipt.entity';
import { CommerceMessageIdempotencyService } from './commerce-message-idempotency.service';

describe('CommerceMessageIdempotencyService', () => {
  const insert = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const service = new CommerceMessageIdempotencyService({
    insert,
    update,
    delete: remove,
  } as unknown as Repository<CommerceMessageReceipt>);

  beforeEach(() => jest.clearAllMocks());

  it('claims a newly received WhatsApp message', async () => {
    insert.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] });
    await expect(service.claim('session-1', 'wamid-1')).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith({ sessionId: 'session-1', messageId: 'wamid-1', status: 'processing' });
  });

  it('rejects a duplicate message with a live or completed receipt', async () => {
    insert.mockRejectedValue({ code: '23505' });
    update.mockResolvedValue({ affected: 0, generatedMaps: [], raw: [] });
    await expect(service.claim('session-1', 'wamid-1')).resolves.toBe(false);
  });

  it('reclaims a stale processing receipt after a crashed worker', async () => {
    insert.mockRejectedValue({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
    update.mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] });
    await expect(service.claim('session-1', 'wamid-1')).resolves.toBe(true);
  });

  it('does not persist a receipt when the engine supplied no message id', async () => {
    await expect(service.claim('session-1', undefined)).resolves.toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });

  it('releases a failed message so the engine can retry it', async () => {
    remove.mockResolvedValue({ affected: 1, raw: [] });
    await service.release('session-1', 'wamid-1');
    expect(remove).toHaveBeenCalledWith({ sessionId: 'session-1', messageId: 'wamid-1', status: 'processing' });
  });
});
