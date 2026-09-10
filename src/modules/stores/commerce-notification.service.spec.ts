import { CommerceNotificationService, isWhatsAppCreatedOrder } from './commerce-notification.service';

describe('CommerceNotificationService WhatsApp-created orders', () => {
  it('recognizes provider origin markers', () => {
    expect(isWhatsAppCreatedOrder(['woocommerce', 'openwa:whatsapp-confirmed'])).toBe(true);
    expect(isWhatsAppCreatedOrder(['youcan', 'whatsapp-confirmed'])).toBe(true);
    expect(isWhatsAppCreatedOrder(['whatsapp-bot-confirmed'])).toBe(true);
    expect(isWhatsAppCreatedOrder(['shopify'])).toBe(false);
  });

  it('does not send a second confirmation when the provider echoes the order webhook', async () => {
    const messages = { sendText: jest.fn() };
    const orders = { save: jest.fn(async (value: unknown) => value) };
    const service = new CommerceNotificationService(messages as any, orders as any, {} as any);
    const order = {
      tags: ['openwa:whatsapp-confirmed'],
      status: 'open',
      confirmationStatus: 'not_sent',
      confirmationSentAt: null,
      confirmationError: 'old error',
    } as any;

    await expect(service.sendNewOrderConfirmation({} as any, order, {})).resolves.toBe('skipped_whatsapp_created');
    expect(messages.sendText).not.toHaveBeenCalled();
    expect(orders.save).toHaveBeenCalledWith(order);
    expect(order).toMatchObject({ status: 'confirmed', confirmationStatus: 'confirmed', confirmationError: null });
    expect(order.confirmationSentAt).toBeInstanceOf(Date);
  });
});
