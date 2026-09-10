import { Repository } from 'typeorm';
import { CommerceToolExecution } from '../../stores/entities/commerce-tool-execution.entity';
import { CommerceExecutionLogService } from './commerce-execution-log.service';

describe('CommerceExecutionLogService', () => {
  const update = jest.fn<
    Promise<{ affected: number; generatedMaps: never[]; raw: never[] }>,
    [Record<string, unknown>, Partial<CommerceToolExecution>]
  >();
  const create = jest.fn((value: Partial<CommerceToolExecution>) => value as CommerceToolExecution);
  const save = jest.fn((value: CommerceToolExecution) => Promise.resolve(value));
  const service = new CommerceExecutionLogService({
    update,
    create,
    save,
  } as unknown as Repository<CommerceToolExecution>);

  beforeEach(() => jest.clearAllMocks());

  it('marks abandoned provider calls uncertain on startup', async () => {
    update.mockResolvedValue({ affected: 2, generatedMaps: [], raw: [] });
    await service.onModuleInit();
    const [criteria, changes] = update.mock.calls[0];
    expect(criteria.status).toBe('started');
    expect(changes.status).toBe('uncertain');
    expect(changes.completedAt).toBeInstanceOf(Date);
  });

  it('records sanitized execution context and provider success', async () => {
    const execution = await service.start({
      operationKey: 'cart:create:1:message-1',
      storeId: 'store-1',
      sessionId: 'session-1',
      messageId: 'message-1',
      customerPhone: '212600000000',
      provider: 'shopify',
      tool: 'create_order',
      input: { productId: 'product-1', quantity: 1 },
    });
    execution.createdAt = new Date();
    await service.succeed(execution, { providerOrderId: 'order-1', orderNumber: '#1025' });
    expect(execution.status).toBe('succeeded');
    expect(execution.result).toEqual({ providerOrderId: 'order-1', orderNumber: '#1025' });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('records provider failures without storing credentials', async () => {
    const execution = create({ createdAt: new Date(), input: { productId: 'product-1' } });
    await service.fail(execution, new Error('Provider timeout'));
    expect(execution.status).toBe('failed');
    expect(execution.errorMessage).toBe('Provider timeout');
    expect(execution.input).toEqual({ productId: 'product-1' });
  });
});
