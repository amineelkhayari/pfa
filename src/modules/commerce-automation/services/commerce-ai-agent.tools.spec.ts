import { CommerceAiAgentService } from './commerce-ai-agent.service';
import { CommerceToolService } from './commerce-tool.service';

const response = (payload: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { get: () => 'application/json' },
  json: async () => payload,
}) as never;

describe('CommerceAiAgentService native tool loop', () => {
  it('executes a requested tool, returns its result to the model, then emits final text', async () => {
    const config = {
      aiProvider: () => 'custom',
      aiApiKey: () => 'test-key',
      aiModel: () => 'auto',
      aiBaseUrl: () => 'https://example.test/api/v1/chat/completions',
    };
    const planUsage = { consumeAiContextTokens: jest.fn().mockResolvedValue(undefined) };
    const agent = new CommerceAiAgentService(config as never, planUsage as never);
    const fetchProvider = jest
      .fn()
      .mockResolvedValueOnce(response({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search_products', arguments: '{"query":"liquid"}' } }],
          },
        }],
      }))
      .mockResolvedValueOnce(response({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Liquid coûte 749.95 MAD.' } }],
      }));
    (agent as unknown as { fetchProvider: jest.Mock }).fetchProvider = fetchProvider;
    const execute = jest.fn().mockResolvedValue({ count: 1, products: [{ id: 'p1', name: 'Liquid', price: 749.95 }] });

    const reply = await agent.chatWithTools(
      [{ role: 'customer', text: 'Ch7al Liquid?', at: new Date().toISOString() }],
      { name: 'Test Store', language: 'fr' },
      new CommerceToolService().definitions(),
      execute,
    );

    expect(reply).toBe('Liquid coûte 749.95 MAD.');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ id: 'call-1', name: 'search_products', arguments: { query: 'liquid' } }));
    const secondBody = JSON.parse(fetchProvider.mock.calls[1][1].body as string);
    expect(secondBody.messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }));
  });
});
