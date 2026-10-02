/**
 * Utility functions for analyzing store order status and WhatsApp confirmation eligibility.
 */

export interface MinimalOrderState {
  status?: string | null;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  confirmationStatus?: string | null;
}

/**
 * Checks whether an order is already completed, fulfilled, or closed in the store.
 * Such orders do not require initial WhatsApp confirmation messages.
 */
export function isOrderFulfilledOrClosed(order: MinimalOrderState): boolean {
  const status = (order.status ?? '').toLowerCase().trim();
  const fulfillment = (order.fulfillmentStatus ?? '').toLowerCase().trim();
  const financial = (order.financialStatus ?? '').toLowerCase().trim();

  return (
    status === 'closed' ||
    status === 'completed' ||
    status === 'delivered' ||
    fulfillment === 'fulfilled' ||
    fulfillment === 'completed' ||
    fulfillment === 'delivered' ||
    fulfillment === 'shipped' ||
    (financial === 'paid' && (fulfillment === 'fulfilled' || status === 'closed'))
  );
}

/**
 * Determines whether an order is eligible for sending or resending a WhatsApp confirmation reminder.
 * Returns false if the order is already cancelled, confirmed, or already fulfilled/closed in store.
 */
export function canSendOrderConfirmation(order: MinimalOrderState): boolean {
  if (isOrderFulfilledOrClosed(order)) return false;

  const status = (order.status ?? '').toLowerCase().trim();
  if (status.includes('cancel')) return false;

  const confirmation = (order.confirmationStatus ?? '').toLowerCase().trim();
  if (confirmation === 'confirmed' || confirmation === 'cancelled') return false;

  return ['pending', 'not_sent', 'failed'].includes(confirmation);
}
