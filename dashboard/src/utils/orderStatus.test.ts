import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOrderFulfilledOrClosed, canSendOrderConfirmation } from './orderStatus.ts';

test('isOrderFulfilledOrClosed returns true for closed orders', () => {
  assert.equal(isOrderFulfilledOrClosed({ status: 'closed', financialStatus: 'paid', fulfillmentStatus: 'fulfilled' }), true);
  assert.equal(isOrderFulfilledOrClosed({ status: 'completed' }), true);
  assert.equal(isOrderFulfilledOrClosed({ fulfillmentStatus: 'fulfilled' }), true);
  assert.equal(isOrderFulfilledOrClosed({ fulfillmentStatus: 'delivered' }), true);
  assert.equal(isOrderFulfilledOrClosed({ financialStatus: 'paid', fulfillmentStatus: 'fulfilled' }), true);
});

test('isOrderFulfilledOrClosed returns false for open pending orders', () => {
  assert.equal(isOrderFulfilledOrClosed({ status: 'open', financialStatus: 'pending', fulfillmentStatus: 'unfulfilled' }), false);
  assert.equal(isOrderFulfilledOrClosed({ status: 'open' }), false);
});

test('canSendOrderConfirmation allows unfulfilled pending/not_sent/failed orders', () => {
  assert.equal(canSendOrderConfirmation({ status: 'open', confirmationStatus: 'not_sent' }), true);
  assert.equal(canSendOrderConfirmation({ status: 'open', confirmationStatus: 'pending' }), true);
  assert.equal(canSendOrderConfirmation({ status: 'open', confirmationStatus: 'failed' }), true);
});

test('canSendOrderConfirmation prevents closed/fulfilled/confirmed/cancelled orders', () => {
  // Order #003 example: closed, paid, fulfilled, confirmation not_sent
  assert.equal(canSendOrderConfirmation({ status: 'closed', financialStatus: 'paid', fulfillmentStatus: 'fulfilled', confirmationStatus: 'not_sent' }), false);
  // Confirmed orders
  assert.equal(canSendOrderConfirmation({ status: 'open', confirmationStatus: 'confirmed' }), false);
  // Cancelled orders
  assert.equal(canSendOrderConfirmation({ status: 'cancelled', confirmationStatus: 'not_sent' }), false);
  assert.equal(canSendOrderConfirmation({ status: 'open', confirmationStatus: 'cancelled' }), false);
});
