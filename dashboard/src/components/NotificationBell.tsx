import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Package,
  Truck,
  CreditCard,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notificationApi, type AppNotification } from '../services/api';
import './NotificationBell.css';

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState<number>(460);
  const [openSide, setOpenSide] = useState<boolean>(false);
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(
    () =>
      notificationApi
        .list()
        .then(data => {
          setItems(data.items);
          setUnread(data.unread);
        })
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;

    // Intelligently calculate available viewport space to prevent ANY off-screen cutoff
    if (root.current) {
      const rect = root.current.getBoundingClientRect();
      const spaceAbove = rect.top - 16;
      // If we have at least 260px above the button, pop above with clamped height
      if (spaceAbove >= 260 && !collapsed) {
        setOpenSide(false);
        setPopoverMaxHeight(Math.max(220, Math.min(480, spaceAbove)));
      } else {
        // If screen height is tight or collapsed sidebar, open as a side flyout with full viewport height
        setOpenSide(true);
        setPopoverMaxHeight(Math.min(520, window.innerHeight - 32));
      }
    }

    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, collapsed]);

  const read = async (item: AppNotification) => {
    if (!item.read) {
      await notificationApi.markRead(item.id);
      setItems(value => value.map(row => (row.id === item.id ? { ...row, read: true } : row)));
      setUnread(value => Math.max(0, value - 1));
    }
    setOpen(false);
    if (item.link?.startsWith('/')) navigate(item.link);
  };

  const getNotificationIcon = (item: AppNotification) => {
    const text = (item.title + ' ' + (item.eventType || '')).toLowerCase();
    if (text.includes('ship') || text.includes('deliver')) return Truck;
    if (text.includes('paid') || text.includes('payment')) return CreditCard;
    if (text.includes('order')) return Package;
    if (text.includes('whatsapp') || text.includes('message')) return MessageSquare;
    if (text.includes('ai') || text.includes('agent')) return Sparkles;

    switch (item.kind) {
      case 'success':
        return CheckCircle2;
      case 'warning':
        return AlertTriangle;
      case 'error':
        return AlertCircle;
      default:
        return Info;
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60_000) return t('common.justNow', 'Just now');
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="notification-bell" ref={root}>
      <button
        type="button"
        className={`theme-toggle-btn notification-trigger ${open ? 'active' : ''}`}
        onClick={() => setOpen(value => !value)}
        aria-label={t('notifications.title', 'Notifications')}
        title={collapsed ? t('notifications.title', 'Notifications') : undefined}
      >
        <span className="notification-icon">
          <Bell size={18} />
          {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
        </span>
        {!collapsed && <span>{t('notifications.title', 'Notifications')}</span>}
      </button>

      {open && (
        <div
          className={`notification-popover ${openSide ? 'flyout-side' : ''}`}
          style={{ maxHeight: `${popoverMaxHeight}px` }}
        >
          <header className="notification-header">
            <div className="notification-header-info">
              <strong>{t('notifications.title', 'Notifications')}</strong>
              <small>
                {unread > 0
                  ? t('notifications.unreadCount', '{{count}} unread', { count: unread })
                  : t('notifications.allCaughtUp', 'All caught up')}
              </small>
            </div>
            {unread > 0 && (
              <button
                type="button"
                className="mark-all-read-btn"
                onClick={() =>
                  void notificationApi.markAllRead().then(() => {
                    setItems(v => v.map(n => ({ ...n, read: true })));
                    setUnread(0);
                  })
                }
              >
                <CheckCheck size={14} />
                <span>{t('notifications.markAllRead', 'Mark all read')}</span>
              </button>
            )}
          </header>

          <div className="notification-list">
            {items.length === 0 ? (
              <div className="notification-empty">
                <Bell size={24} className="notification-empty-icon" />
                <p>{t('notifications.empty', 'No notifications yet')}</p>
              </div>
            ) : (
              items.map(item => {
                const Icon = getNotificationIcon(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`notification-item ${item.read ? 'read' : 'unread'} tone-${item.kind}`}
                    onClick={() => void read(item)}
                  >
                    <div className="notification-item-icon">
                      <Icon size={16} />
                    </div>
                    <div className="notification-item-body">
                      <div className="notification-item-title-row">
                        <strong className="notification-item-title">{item.title}</strong>
                        {!item.read && <span className="notification-unread-dot" />}
                      </div>
                      <span className="notification-item-msg">{item.message}</span>
                      <time className="notification-item-time">{formatTimeAgo(item.createdAt)}</time>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
