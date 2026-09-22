import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationApi, type AppNotification } from '../services/api';
import './NotificationBell.css';

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
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
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const read = async (item: AppNotification) => {
    if (!item.read) {
      await notificationApi.markRead(item.id);
      setItems(value => value.map(row => (row.id === item.id ? { ...row, read: true } : row)));
      setUnread(value => Math.max(0, value - 1));
    }
    setOpen(false);
    if (item.link?.startsWith('/')) navigate(item.link);
  };
  return (
    <div className="notification-bell" ref={root}>
      <button
        type="button"
        className="theme-toggle-btn notification-trigger"
        onClick={() => setOpen(value => !value)}
        aria-label="Notifications"
      >
        <span className="notification-icon">
          <Bell size={18} />
          {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
        </span>
        {!collapsed && <span>Notifications</span>}
      </button>
      {open && (
        <div className="notification-popover">
          <header>
            <div>
              <strong>Notifications</strong>
              <small>
                {unread} non lue{unread === 1 ? '' : 's'}
              </small>
            </div>
            {unread > 0 && (
              <button
                onClick={() =>
                  void notificationApi.markAllRead().then(() => {
                    setItems(v => v.map(n => ({ ...n, read: true })));
                    setUnread(0);
                  })
                }
              >
                <CheckCheck size={16} /> Tout lire
              </button>
            )}
          </header>
          <div className="notification-list">
            {items.length === 0 ? (
              <p className="notification-empty">Aucune notification</p>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  className={`notification-item ${item.read ? '' : 'unread'} ${item.kind}`}
                  onClick={() => void read(item)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <time>{new Date(item.createdAt).toLocaleString()}</time>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
