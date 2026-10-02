import { escapeCsvCell } from './csv';
import type { StoreOrder, StoreReportData, OrderConfirmationSummary } from '../services/api';

export function exportStoreReportCsv(
  report: StoreReportData,
  orders: StoreOrder[] = [],
): void {
  const { store, summary, statusBreakdown, evolution, periodDays } = report;
  const lines: string[] = [];

  // 1. Report Header & Summary
  lines.push(['Store Name', escapeCsvCell(store.name)].join(','));
  lines.push(['Store Provider', escapeCsvCell(store.provider)].join(','));
  lines.push(['Generated Date', escapeCsvCell(new Date().toLocaleString())].join(','));
  lines.push(['Period', escapeCsvCell(periodDays ? `Last ${periodDays} days` : 'All time')].join(','));
  lines.push(['Total Revenue', escapeCsvCell(`${summary.totalRevenue} ${summary.currency}`)].join(','));
  lines.push(['Total Orders', escapeCsvCell(summary.totalOrders)].join(','));
  lines.push(['Confirmed Orders', escapeCsvCell(summary.confirmedOrders)].join(','));
  lines.push(['Confirmation Rate', escapeCsvCell(`${summary.confirmationRate}%`)].join(','));
  lines.push(['Total Products in Catalog', escapeCsvCell(summary.totalProducts)].join(','));
  lines.push(['Average Order Value (AOV)', escapeCsvCell(`${summary.averageOrderValue} ${summary.currency}`)].join(','));
  lines.push('');

  // 2. Status Breakdown
  lines.push(['--- Order Confirmation & Fulfillment Breakdown ---'].join(','));
  lines.push(['Status', 'Count'].join(','));
  lines.push(['Confirmed via WhatsApp', escapeCsvCell(statusBreakdown.confirmed)].join(','));
  lines.push(['Fulfilled / Closed in Store', escapeCsvCell(statusBreakdown.fulfilled)].join(','));
  lines.push(['Awaiting Customer Reply (Pending)', escapeCsvCell(statusBreakdown.pending)].join(','));
  lines.push(['Cancelled', escapeCsvCell(statusBreakdown.cancelled)].join(','));
  lines.push(['Not Sent', escapeCsvCell(statusBreakdown.notSent)].join(','));
  lines.push(['Delivery Failed', escapeCsvCell(statusBreakdown.failed)].join(','));
  lines.push('');

  // 3. Daily Evolution
  if (evolution.length > 0) {
    lines.push(['--- Daily Performance Evolution ---'].join(','));
    lines.push(['Date', 'Orders', `Revenue (${summary.currency})`, 'Confirmed', 'Fulfilled', 'Pending', 'Cancelled'].join(','));
    for (const point of evolution) {
      lines.push([
        escapeCsvCell(point.date),
        escapeCsvCell(point.orders),
        escapeCsvCell(point.revenue),
        escapeCsvCell(point.confirmed),
        escapeCsvCell(point.fulfilled),
        escapeCsvCell(point.pending),
        escapeCsvCell(point.cancelled),
      ].join(','));
    }
    lines.push('');
  }

  // 4. Detailed Orders List
  if (orders.length > 0) {
    lines.push(['--- Orders Detailed List ---'].join(','));
    lines.push([
      'Order #',
      'Date',
      'Customer Name',
      'Phone',
      'Total Amount',
      'Currency',
      'Order Status',
      'WhatsApp Status',
      'Payment Status',
      'Fulfillment Status',
    ].join(','));

    for (const order of orders) {
      lines.push([
        escapeCsvCell(order.orderNumber || order.externalOrderId || order.id),
        escapeCsvCell(order.externalCreatedAt ? new Date(order.externalCreatedAt).toLocaleString() : ''),
        escapeCsvCell(order.customerName || 'Customer'),
        escapeCsvCell(order.phone || ''),
        escapeCsvCell(order.totalPrice ?? 0),
        escapeCsvCell(order.currency || summary.currency),
        escapeCsvCell(order.status || 'open'),
        escapeCsvCell(order.confirmationStatus || 'not_sent'),
        escapeCsvCell(order.financialStatus || ''),
        escapeCsvCell(order.fulfillmentStatus || ''),
      ].join(','));
    }
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (store.name || 'store').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('href', url);
  link.setAttribute('download', `report-${safeName}-${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface AdminPlatformExportData {
  merchantsCount: number;
  activeMerchants: number;
  netEarnings: string;
  totalMessages: number;
  activeSessions: number;
  registeredSessions: number;
  connectedStores: number;
  catalogProducts: number;
  ingestedOrders: number;
  orderSummary?: OrderConfirmationSummary | null;
  messageTimeSeries?: Array<{ timestamp: string; sent: number; received: number }>;
}

export function exportAdminPlatformCsv(data: AdminPlatformExportData): void {
  const lines: string[] = [];
  const now = new Date().toLocaleString();

  lines.push(['SmartConfirm Platform - Executive Admin Summary Report'].join(','));
  lines.push(['Generated At', escapeCsvCell(now)].join(','));
  lines.push('');

  lines.push(['--- Business & System Vitals ---'].join(','));
  lines.push(['Metric', 'Value'].join(','));
  lines.push(['Total Merchants', escapeCsvCell(data.merchantsCount)].join(','));
  lines.push(['Active Merchants', escapeCsvCell(data.activeMerchants)].join(','));
  lines.push(['Net Platform Earnings', escapeCsvCell(data.netEarnings)].join(','));
  lines.push(['Total Messages Throughput', escapeCsvCell(data.totalMessages)].join(','));
  lines.push(['Active WhatsApp Engines', escapeCsvCell(`${data.activeSessions} of ${data.registeredSessions}`)].join(','));
  lines.push(['Connected E-Commerce Stores', escapeCsvCell(data.connectedStores)].join(','));
  lines.push(['Synced Catalog Products', escapeCsvCell(data.catalogProducts)].join(','));
  lines.push(['Total Ingested Orders', escapeCsvCell(data.ingestedOrders)].join(','));
  lines.push('');

  if (data.orderSummary) {
    const s = data.orderSummary;
    const rate = s.total > 0 ? Math.round((s.confirmed / s.total) * 100) : 0;
    const codSavings = Math.round(s.cancelled * 4.5);

    lines.push(['--- Platform Order Confirmations & Delivery Protection ---'].join(','));
    lines.push(['Status', 'Count'].join(','));
    lines.push(['Total Ingested Orders', escapeCsvCell(s.total)].join(','));
    lines.push(['Confirmed via WhatsApp', escapeCsvCell(s.confirmed)].join(','));
    lines.push(['Awaiting Customer Reply', escapeCsvCell(s.pending)].join(','));
    lines.push(['Cancelled / Avoided (Fake COD)', escapeCsvCell(s.cancelled)].join(','));
    lines.push(['Not Sent', escapeCsvCell(s.notSent)].join(','));
    lines.push(['Delivery Failed', escapeCsvCell(s.failed)].join(','));
    lines.push(['Overall Confirmation Rate', escapeCsvCell(`${rate}%`)].join(','));
    lines.push(['Estimated Return Cost Savings', escapeCsvCell(`$${codSavings}`)].join(','));
    lines.push('');
  }

  if (data.messageTimeSeries && data.messageTimeSeries.length > 0) {
    lines.push(['--- Platform Message Throughput Evolution ---'].join(','));
    lines.push(['Timestamp', 'Sent Messages', 'Received Messages', 'Total'].join(','));
    for (const p of data.messageTimeSeries) {
      lines.push([
        escapeCsvCell(p.timestamp),
        escapeCsvCell(p.sent),
        escapeCsvCell(p.received),
        escapeCsvCell(p.sent + p.received),
      ].join(','));
    }
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('href', url);
  link.setAttribute('download', `admin-platform-report-${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
