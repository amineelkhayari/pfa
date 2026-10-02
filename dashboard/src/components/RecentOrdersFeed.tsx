import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertTriangle,
  Send,
  MessageSquare,
  RefreshCw,
  ExternalLink,
  Loader2,
  Store as StoreIcon,
  PackageCheck,
  BarChart3,
} from 'lucide-react';
import { useStoresQuery } from '../hooks/queries';
import { storesApi, type StoreOrder } from '../services/api';
import { useToast } from '../hooks/useToast';
import { isOrderFulfilledOrClosed, canSendOrderConfirmation } from '../utils/orderStatus';
import { StoreReportModal } from './StoreReportModal';
import './RecentOrdersFeed.css';

export const RecentOrdersFeed: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: stores = [], isLoading: loadingStores } = useStoresQuery();
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [remindingOrderId, setRemindingOrderId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Default to first store if none selected
  const activeStoreId = selectedStoreId || (stores.length > 0 ? stores[0].id : '');
  const activeStore = stores.find(s => s.id === activeStoreId);

  const {
    data: orders = [],
    isLoading: loadingOrders,
    isFetching: fetchingOrders,
    refetch: refetchOrders,
  } = useQuery<StoreOrder[]>({
    queryKey: ['store', activeStoreId, 'recent-orders'],
    queryFn: () => storesApi.orders(activeStoreId),
    enabled: !!activeStoreId,
    refetchInterval: 20_000,
  });

  const handleRemind = async (order: StoreOrder) => {
    if (!activeStoreId) return;
    setRemindingOrderId(order.id);
    try {
      await storesApi.remindOrder(activeStoreId, order.id);
      toast.success(
        'WhatsApp Reminder Sent',
        `Verification message sent to ${order.customerName || order.phone || 'customer'}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['store', activeStoreId, 'recent-orders'] });
    } catch (err) {
      toast.error('Failed to Send Reminder', err instanceof Error ? err.message : 'Please check your connection.');
    } finally {
      setRemindingOrderId(null);
    }
  };

  const formatTimeAgo = (dateStr?: string | null) => {
    if (!dateStr) return 'Recently';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusBadge = (order: StoreOrder) => {
    const confirmation = order.confirmationStatus?.toLowerCase();
    const status = order.status?.toLowerCase();

    // 1. Cancelled orders
    if (confirmation === 'cancelled' || status?.includes('cancel')) {
      return (
        <span className="order-status-badge cancelled">
          <XCircle size={13} />
          <span>Cancelled</span>
        </span>
      );
    }

    // 2. Confirmed orders
    if (confirmation === 'confirmed') {
      return (
        <span className="order-status-badge confirmed">
          <CheckCircle2 size={13} />
          <span>Confirmed</span>
        </span>
      );
    }

    // 3. Awaiting customer reply
    if (confirmation === 'pending' || confirmation === 'processing_reply') {
      return (
        <span className="order-status-badge pending">
          <Clock3 size={13} />
          <span>Awaiting Reply</span>
        </span>
      );
    }

    // 4. Delivery failed
    if (confirmation === 'failed') {
      return (
        <span className="order-status-badge failed">
          <AlertTriangle size={13} />
          <span>Delivery Failed</span>
        </span>
      );
    }

    // 5. Already closed, paid & fulfilled in store (e.g. past imported orders)
    if (isOrderFulfilledOrClosed(order)) {
      return (
        <span
          className="order-status-badge fulfilled"
          title="Order closed, paid & fulfilled in store · No confirmation required"
        >
          <PackageCheck size={13} />
          <span>Fulfilled</span>
        </span>
      );
    }

    // 6. Regular unfulfilled order not sent yet
    return (
      <span className="order-status-badge not-sent" title="WhatsApp confirmation message not sent yet">
        <Clock3 size={13} />
        <span>Not Sent</span>
      </span>
    );
  };

  if (loadingStores) {
    return null;
  }

  if (stores.length === 0) {
    return (
      <div className="recent-orders-card empty-state">
        <div className="empty-icon-wrapper">
          <ShoppingCart size={32} />
        </div>
        <h3>No Connected Stores Yet</h3>
        <p>Connect your Shopify, WooCommerce, or YouCan store to see real-time order verification on WhatsApp.</p>
        <button type="button" className="btn-primary" onClick={() => navigate('/stores')}>
          <StoreIcon size={16} />
          <span>Connect Your First Store</span>
        </button>
      </div>
    );
  }

  // Show top 8 latest orders
  const displayOrders = orders.slice(0, 8);

  return (
    <div className="recent-orders-card">
      <div className="recent-orders-header">
        <div className="recent-orders-title-group">
          <div className="recent-orders-icon">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h3>Live Order Confirmations</h3>
            <span className="recent-orders-subtitle">
              Real-time WhatsApp verification stream from your connected stores
            </span>
          </div>
        </div>

        <div className="recent-orders-controls">
          {stores.length > 1 && (
            <select
              className="store-selector-dropdown"
              value={activeStoreId}
              onChange={e => setSelectedStoreId(e.target.value)}
            >
              {stores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.provider})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="icon-refresh-btn"
            onClick={() => refetchOrders()}
            title="Refresh orders"
            disabled={fetchingOrders}
          >
            <RefreshCw size={15} className={fetchingOrders ? 'animate-spin' : ''} />
          </button>

          {activeStore && (
            <button
              type="button"
              className="btn-view-all"
              onClick={() => setShowReport(true)}
              title="View revenue, order evolution graphs, and export report"
            >
              <BarChart3 size={14} />
              <span>Store Report</span>
            </button>
          )}

          <button
            type="button"
            className="btn-view-all"
            onClick={() => navigate('/stores')}
          >
            <span>View All Orders</span>
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {loadingOrders ? (
        <div className="orders-loading-state">
          <Loader2 size={24} className="animate-spin text-muted" />
          <span>Syncing latest orders...</span>
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="orders-empty-feed">
          <p>No orders received yet for this store. Incoming orders will appear here automatically.</p>
        </div>
      ) : (
        <div className="orders-table-wrapper">
          <table className="recent-orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>WhatsApp Status</th>
                <th>Time</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(order => {
                const isReminding = remindingOrderId === order.id;
                const isActionable = canSendOrderConfirmation(order);
                const actionLabel = order.confirmationStatus === 'failed' ? 'Retry' : order.confirmationStatus === 'pending' ? 'Resend' : 'Send';
                const actionTitle = order.confirmationStatus === 'failed' ? 'Retry WhatsApp message' : order.confirmationStatus === 'pending' ? 'Resend WhatsApp confirmation' : 'Send WhatsApp confirmation';
                return (
                  <tr key={order.id} className="order-row">
                    <td className="order-cell-id">
                      <div className="order-number-tag">
                        <strong>#{order.orderNumber || order.externalOrderId || order.id.slice(0, 6)}</strong>
                        {activeStore && (
                          <span className={`store-badge ${activeStore.provider}`}>
                            {activeStore.provider}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="order-cell-customer">
                      <div className="customer-info-box">
                        <span className="customer-name">{order.customerName || 'Customer'}</span>
                        <span className="customer-phone">{order.phone || 'No phone'}</span>
                      </div>
                    </td>

                    <td className="order-cell-price">
                      <strong>
                        {new Intl.NumberFormat(undefined, {
                          style: 'currency',
                          currency: order.currency || activeStore?.currency || 'USD',
                        }).format(order.totalPrice ?? 0)}
                      </strong>
                    </td>

                    <td>{getStatusBadge(order)}</td>

                    <td className="order-cell-time">
                      <span>{formatTimeAgo(order.externalCreatedAt)}</span>
                    </td>

                    <td className="order-cell-actions text-right">
                      <div className="order-action-buttons">
                        {isActionable && (
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => handleRemind(order)}
                            title={actionTitle}
                            disabled={isReminding}
                          >
                            {isReminding ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Send size={14} />
                            )}
                            <span>{actionLabel}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => navigate('/chats')}
                          title="Open WhatsApp chat with this customer"
                        >
                          <MessageSquare size={14} />
                          <span>Chat</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <StoreReportModal
        store={showReport ? activeStore ?? null : null}
        onClose={() => setShowReport(false)}
      />
    </div>
  );
};
