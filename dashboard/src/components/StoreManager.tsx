import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bell, Bot, CheckCircle2, Clock3, Database, Link2, Loader2,
  MessageSquareText, PackageCheck, RefreshCw, Settings2, ShieldCheck, Store as StoreIcon,
} from 'lucide-react';
import { Modal } from './Modal';
import type { Session, Store, StorePayload } from '../services/api';

type Tab = 'overview' | 'automation' | 'settings';
type NotificationEvent = 'paid' | 'partiallyFulfilled' | 'shipped' | 'cancelled';

const defaults: Record<NotificationEvent, { label: string; help: string; enabled: boolean; template: string }> = {
  paid: { label: 'Payment received', help: 'Sent when the commerce platform marks the order as paid.', enabled: false, template: 'Bonjour {{customerName}} 👋\nLe paiement de votre commande {{orderNumber}} est confirmé.\nTotal : {{total}} {{currency}}.' },
  partiallyFulfilled: { label: 'Partially fulfilled', help: 'Sent when only part of the order is ready.', enabled: false, template: 'Bonjour {{customerName}} 👋\nUne partie de votre commande {{orderNumber}} est prête.\nStatut : {{fulfillmentStatus}}.' },
  shipped: { label: 'Shipped / fulfilled', help: 'Sent with tracking details after fulfillment.', enabled: true, template: 'Bonjour {{customerName}} 👋\nVotre commande {{orderNumber}} a été expédiée 📦\n\n{{items}}\n\nSuivi : {{trackingNumber}}' },
  cancelled: { label: 'Order cancelled', help: 'Sent when the order is cancelled in the store.', enabled: false, template: 'Bonjour {{customerName}},\nVotre commande {{orderNumber}} a été annulée.' },
};

interface Props {
  open: boolean;
  store: Store | null;
  sessions: Session[];
  saving: boolean;
  syncing: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (data: Partial<StorePayload>) => Promise<void>;
  onSync: () => Promise<void>;
}

export function StoreManager({ open, store, sessions, saving, syncing, readOnly, onClose, onSave, onSync }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [sessionId, setSessionId] = useState('');
  const [currency, setCurrency] = useState('MAD');
  const [timezone, setTimezone] = useState('Africa/Casablanca');
  const [settings, setSettings] = useState<NonNullable<Store['settings']>>({});

  useEffect(() => {
    if (!store) return;
    setTab('overview');
    setSessionId(store.sessionId);
    setCurrency(store.currency);
    setTimezone(store.timezone);
    setSettings({ ...(store.settings ?? {}) });
  }, [store]);

  const health = useMemo(() => {
    if (!store) return [];
    const session = sessions.find(item => item.id === sessionId);
    return [
      { label: 'Store connection', ok: Boolean(settings.connected), value: settings.connected ? 'Connected' : 'Action required' },
      { label: 'API credentials', ok: store.provider === 'woocommerce' ? Boolean(settings.consumerSecretConfigured) : Boolean(settings.clientSecretConfigured), value: 'Protected' },
      { label: 'WhatsApp device', ok: session?.status === 'ready', value: session ? `${session.name} · ${session.status}` : 'Not assigned' },
      { label: 'Webhook activity', ok: Boolean(settings.lastWebhookAt), value: settings.lastWebhookAt ? new Date(settings.lastWebhookAt).toLocaleString() : 'Waiting for first event' },
    ];
  }, [sessionId, sessions, settings, store]);

  if (!store) return null;
  const operations = settings.operations ?? {};
  const notifications = settings.orderNotifications ?? ({} as NonNullable<Store['settings']>['orderNotifications']);
  const patchOperations = (patch: NonNullable<NonNullable<Store['settings']>['operations']>) =>
    setSettings(current => ({ ...current, operations: { ...(current.operations ?? {}), ...patch } }));
  const patchNotification = (event: NotificationEvent, patch: Partial<{ enabled: boolean; template: string }>) => {
    const current = notifications?.[event] ?? defaults[event];
    setSettings(value => ({ ...value, orderNotifications: { ...(value.orderNotifications ?? {}), [event]: { enabled: current.enabled, template: current.template, ...patch } } as any }));
  };

  const domain = store.provider === 'shopify' ? settings.shopDomain : store.provider === 'youcan' ? settings.storeDomain : settings.siteUrl;
  const isShopify = store.provider === 'shopify';
  const isYouCan = store.provider === 'youcan';
  const connectionMethod = isShopify ? 'Shopify App' : isYouCan ? 'YouCan External App' : 'WooCommerce Webhook / REST API';
  const webhookBase = settings.webhookBaseUrl?.replace(/\/$/, '') ?? '';
  const webhookEvents = isShopify
    ? [
        { topic: 'orders/create', path: '/api/shopify/webhooks/orders-create', purpose: 'Import the order and send the new-order confirmation template.' },
        { topic: 'orders/updated', path: '/api/shopify/webhooks/orders-updated', purpose: 'Detect payment, fulfillment, shipment, and cancellation changes.' },
        { topic: 'app/uninstalled', path: '/api/shopify/webhooks/app-uninstalled', purpose: 'Disconnect the store safely when the Shopify App is removed.' },
      ]
    : isYouCan ? [
        { topic: 'order.created', path: `/api/youcan/webhooks/${store.id}`, purpose: 'Import the order and send the confirmation message.' },
        { topic: 'order.updated / order.paid', path: `/api/youcan/webhooks/${store.id}`, purpose: 'Detect lifecycle and payment changes.' },
        { topic: 'app.uninstalled', path: `/api/youcan/webhooks/${store.id}`, purpose: 'Disconnect the store safely.' },
      ] : [
        { topic: 'order.created', path: `/api/woocommerce/webhooks/${store.id}/order-created`, purpose: 'Import the order and send the new-order confirmation template.' },
        { topic: 'order.updated', path: `/api/woocommerce/webhooks/${store.id}/order-updated`, purpose: 'Detect payment, fulfillment, shipment, and cancellation changes.' },
      ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="manager-title"><StoreIcon size={20} /> Manage {store.name}</span>}
      className="store-manager-modal"
      subheader={<div className="store-manager-tabs" role="tablist">{(['overview', 'automation', 'settings'] as Tab[]).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'overview' ? <Activity size={16} /> : item === 'automation' ? <MessageSquareText size={16} /> : <Settings2 size={16} />}{item}</button>)}</div>}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button>{!readOnly && <button className="btn-primary" disabled={saving} onClick={() => onSave({ sessionId, currency, timezone, settings })}>{saving ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />} Save configuration</button>}</>}
    >
      {tab === 'overview' && <div className="manager-stack">
        <section className="manager-hero"><div className={`provider-mark ${store.provider}`}>{isShopify ? 'S' : isYouCan ? 'Y' : 'W'}</div><div><span>Connected through {connectionMethod}</span><h3>{store.name}</h3><p>{domain || 'Store domain not configured'}</p></div><span className={`manager-status ${settings.connected ? 'ready' : ''}`}>{settings.connected ? (isShopify ? 'Shopify App connected' : 'Store connected') : 'Setup required'}</span></section>
        <div className="manager-metrics">
          <div><PackageCheck size={19} /><span>Imported products</span><strong>{settings.importedProducts ?? 0}</strong></div>
          <div><Database size={19} /><span>Imported orders</span><strong>{settings.importedOrders ?? 0}</strong></div>
          <div><Clock3 size={19} /><span>Last sync</span><strong>{settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : 'Never'}</strong></div>
        </div>
        <section className="manager-panel"><div className="manager-panel-head"><div><h3>Connection health</h3><p>{isShopify ? 'Shopify App events, API credentials, and the assigned WhatsApp device.' : 'WooCommerce webhooks, REST API credentials, and the assigned WhatsApp device.'}</p></div><button className="btn-secondary" disabled={syncing || !settings.connected} onClick={onSync}>{syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Sync now</button></div><div className="health-list">{health.map(item => <div key={item.label}><span className={item.ok ? 'health-dot ready' : 'health-dot'}>{item.ok ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}</span><span><strong>{item.label === 'API credentials' && isShopify ? 'Shopify App connection' : item.label}</strong><small>{item.value}</small></span></div>)}</div></section>
        <section className="manager-panel"><div className="manager-panel-head"><div><h3>Registered webhook events</h3><p className="manager-muted">These subscriptions are created automatically when the store is installed or synchronized.</p></div><span className={`manager-status ${settings.connected ? 'ready' : ''}`}>{settings.connected ? `${webhookEvents.length} configured` : 'Not connected'}</span></div><div className="manager-webhooks">{webhookEvents.map(event => <article key={event.topic}><div><strong>{event.topic}</strong><small>{event.purpose}</small></div><code>{webhookBase}{event.path}</code></article>)}</div>{!webhookBase && <p className="manager-note">Only provider paths are shown because this store has no public webhook base URL saved.</p>}</section>
      </div>}

      {tab === 'automation' && <div className="manager-stack">
        <section className="manager-panel manager-switch-row"><div><h3>WhatsApp order automation</h3><p>Master switch for lifecycle notifications from this store.</p></div><label className="switch"><input type="checkbox" checked={settings.automaticMessagesEnabled !== false} onChange={e => setSettings(value => ({ ...value, automaticMessagesEnabled: e.target.checked }))} disabled={readOnly} /><span /></label></section>
        <section className="manager-panel"><div className="manager-panel-head"><div><h3>{isShopify ? 'Shopify Message Automation' : 'WooCommerce Message Automation'}</h3><p>Control which WhatsApp messages are sent from verified order events.</p></div><span className="manager-live"><span /> Live automation</span></div><div className="manager-events"><article><div className="manager-event-title"><label className="switch"><input type="checkbox" checked={settings.newOrderMessageEnabled !== false} disabled={readOnly || settings.automaticMessagesEnabled === false} onChange={e => setSettings(value => ({ ...value, newOrderMessageEnabled: e.target.checked }))} /><span /></label><div><strong>New Order Message</strong><small>Sent when a new {isShopify ? 'Shopify' : 'WooCommerce'} order is received.</small></div></div><textarea value={settings.newOrderMessageTemplate ?? 'Bonjour {{customerName}} 👋\n\nNous avons reçu votre commande {{orderNumber}}.\n\n{{items}}\n\nTotal: {{total}} {{currency}}\n\nRépondez 1 pour confirmer ou 2 pour annuler.'} disabled={readOnly || settings.newOrderMessageEnabled === false || settings.automaticMessagesEnabled === false} onChange={e => setSettings(value => ({ ...value, newOrderMessageTemplate: e.target.value }))} /></article>{(Object.keys(defaults) as NotificationEvent[]).map(event => { const value = notifications?.[event] ?? defaults[event]; return <article key={event}><div className="manager-event-title"><label className="switch"><input type="checkbox" checked={value.enabled} disabled={readOnly || settings.automaticMessagesEnabled === false} onChange={e => patchNotification(event, { enabled: e.target.checked })} /><span /></label><div><strong>{defaults[event].label}</strong><small>{defaults[event].help}</small></div></div><textarea value={value.template} disabled={readOnly || !value.enabled || settings.automaticMessagesEnabled === false} onChange={e => patchNotification(event, { template: e.target.value })} /></article>; })}</div><p className="manager-variables">Variables: {'{{customerName}} · {{orderNumber}} · {{storeName}} · {{items}} · {{total}} · {{currency}} · {{trackingNumber}} · {{fulfillmentStatus}}'}</p></section>
        <section className="manager-panel"><div className="manager-panel-head"><div><h3>Catalog synchronization</h3><p>{isShopify ? 'Products are imported from Shopify using product IDs, variants, and SKUs.' : 'Products are imported from WooCommerce using product and variant identifiers.'}</p></div><strong>{settings.importedProducts ?? 0} products</strong></div><div className="manager-sync-summary"><span>Duplicate prevention</span><strong>Product ID · Variant ID · SKU</strong><span>Last successful sync</span><strong>{settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : 'Not synchronized yet'}</strong></div></section>
        <section className="manager-panel manager-capabilities"><h3>Additional workflows</h3><div><span><Bot size={17} /> AI product and order assistance</span><strong className={settings.catalogAssistantEnabled !== false ? 'enabled' : ''}>{settings.catalogAssistantEnabled !== false ? 'Enabled' : 'Disabled'}</strong></div><div><span><Bell size={17} /> Abandoned cart recovery</span><strong>Connector required</strong></div><div><span><Link2 size={17} /> Courier status updates</span><strong>Connector required</strong></div></section>
      </div>}

      {tab === 'settings' && <div className="manager-stack">
        <section className="manager-panel"><h3>Store profile & device</h3><div className="manager-form-grid"><label>WhatsApp device<select value={sessionId} disabled={readOnly} onChange={e => setSessionId(e.target.value)}>{sessions.map(session => <option key={session.id} value={session.id}>{session.name} ({session.status})</option>)}</select></label><label>Currency<input value={currency} disabled={readOnly} onChange={e => setCurrency(e.target.value.toUpperCase())} /></label><label>Timezone<input value={timezone} disabled={readOnly} onChange={e => setTimezone(e.target.value)} /></label><label>Notification email<input type="email" value={operations.notificationEmail ?? store.email} disabled={readOnly} onChange={e => patchOperations({ notificationEmail: e.target.value })} /></label></div></section>
        <section className="manager-panel"><h3>Message Sending</h3><div className="manager-form-grid"><label>Minimum interval (seconds)<input type="number" min="0" value={operations.sendingIntervalSeconds ?? 60} disabled={readOnly} onChange={e => patchOperations({ sendingIntervalSeconds: Number(e.target.value) })} /></label><label>Apply working window to<select value={operations.workingHoursApplyTo ?? 'confirmation'} disabled={readOnly} onChange={e => patchOperations({ workingHoursApplyTo: e.target.value })}><option value="confirmation">Confirmation messages only</option><option value="scheduled">All scheduled messages</option></select></label><label>Working day starts<input type="time" value={operations.workingHoursStart ?? '09:00'} disabled={readOnly} onChange={e => patchOperations({ workingHoursStart: e.target.value })} /></label><label>Working day ends<input type="time" value={operations.workingHoursEnd ?? '21:00'} disabled={readOnly} onChange={e => patchOperations({ workingHoursEnd: e.target.value })} /></label><label>First confirmation delay (hours)<input type="number" min="1" value={operations.firstConfirmationDelayHours ?? 2} disabled={readOnly} onChange={e => patchOperations({ firstConfirmationDelayHours: Number(e.target.value) })} /></label><label>Second reminder delay (hours)<input type="number" min="1" value={operations.secondReminderDelayHours ?? 4} disabled={readOnly} onChange={e => patchOperations({ secondReminderDelayHours: Number(e.target.value) })} /></label></div><div className="manager-checks"><label><input type="checkbox" checked={operations.workingHoursEnabled ?? false} disabled={readOnly} onChange={e => patchOperations({ workingHoursEnabled: e.target.checked })} /> Working hours</label><label><input type="checkbox" checked={operations.confirmationFollowUpEnabled ?? true} disabled={readOnly} onChange={e => patchOperations({ confirmationFollowUpEnabled: e.target.checked })} /> Confirmation follow-up</label><label><input type="checkbox" checked={operations.secondReminderEnabled ?? true} disabled={readOnly} onChange={e => patchOperations({ secondReminderEnabled: e.target.checked })} /> Second confirmation reminder</label><label><input type="checkbox" checked={settings.catalogAssistantEnabled !== false} disabled={readOnly} onChange={e => setSettings(value => ({ ...value, catalogAssistantEnabled: e.target.checked }))} /> AI order capture</label><label><input type="checkbox" checked={operations.campaignsEnabled ?? true} disabled={readOnly} onChange={e => patchOperations({ campaignsEnabled: e.target.checked })} /> Campaign messages</label><label><input type="checkbox" checked={operations.abandonedCartEnabled ?? false} disabled={readOnly} onChange={e => patchOperations({ abandonedCartEnabled: e.target.checked })} /> Abandoned cart policy</label></div><p className="manager-note">Webhook event messages run immediately. Delays and working-hour values are saved as scheduling policy for queue workers.</p></section>
        <section className="manager-panel"><h3>Inventory and Sync</h3><div className="manager-form-grid"><label>Product sync interval (minutes)<input type="number" min="5" value={operations.productSyncIntervalMinutes ?? 60} disabled={readOnly} onChange={e => patchOperations({ productSyncIntervalMinutes: Number(e.target.value) })} /></label><label>Order sync interval (minutes)<input type="number" min="5" value={operations.orderSyncIntervalMinutes ?? 60} disabled={readOnly} onChange={e => patchOperations({ orderSyncIntervalMinutes: Number(e.target.value) })} /></label><label>Low stock limit<input type="number" min="0" value={operations.lowStockLimit ?? 5} disabled={readOnly} onChange={e => patchOperations({ lowStockLimit: Number(e.target.value) })} /></label><label>Reduce stock when<select value={operations.reduceStockWhen ?? 'confirmed'} disabled={readOnly} onChange={e => patchOperations({ reduceStockWhen: e.target.value })}><option value="confirmed">Order confirmed</option><option value="created">Order created</option><option value="paid">Order paid</option></select></label></div><div className="manager-checks"><label><input type="checkbox" checked={operations.inventoryManagementEnabled ?? false} disabled={readOnly} onChange={e => patchOperations({ inventoryManagementEnabled: e.target.checked })} /> Inventory management</label><label><input type="checkbox" checked={operations.restoreStockOnCancel ?? true} disabled={readOnly} onChange={e => patchOperations({ restoreStockOnCancel: e.target.checked })} /> Restore stock on cancel</label><label><input type="checkbox" checked={operations.automaticProductSyncEnabled ?? false} disabled={readOnly} onChange={e => patchOperations({ automaticProductSyncEnabled: e.target.checked })} /> Auto product sync policy</label><label><input type="checkbox" checked={operations.automaticOrderSyncEnabled ?? false} disabled={readOnly} onChange={e => patchOperations({ automaticOrderSyncEnabled: e.target.checked })} /> Auto order sync policy</label>{isShopify && <label><input type="checkbox" checked={operations.shopifyOrderTagSyncEnabled ?? true} disabled={readOnly} onChange={e => patchOperations({ shopifyOrderTagSyncEnabled: e.target.checked })} /> Shopify WhatsApp status tags</label>}</div>{isShopify && <p className="manager-note">Shopify status tags require the read_orders and write_orders scopes.</p>}</section>
        <section className="manager-panel"><h3>Retry & alerts</h3><div className="manager-form-grid"><label>Retry delay (minutes)<input type="number" min="1" value={operations.retryDelayMinutes ?? 15} disabled={readOnly} onChange={e => patchOperations({ retryDelayMinutes: Number(e.target.value) })} /></label><label>Maximum attempts<input type="number" min="1" max="10" value={operations.retryMaxAttempts ?? 3} disabled={readOnly} onChange={e => patchOperations({ retryMaxAttempts: Number(e.target.value) })} /></label></div><div className="manager-checks"><label><input type="checkbox" checked={operations.retryEnabled ?? true} disabled={readOnly} onChange={e => patchOperations({ retryEnabled: e.target.checked })} /> Retry failed deliveries</label><label><input type="checkbox" checked={operations.inAppNotifications ?? true} disabled={readOnly} onChange={e => patchOperations({ inAppNotifications: e.target.checked })} /> In-app notifications</label><label><input type="checkbox" checked={operations.dailySummary ?? false} disabled={readOnly} onChange={e => patchOperations({ dailySummary: e.target.checked })} /> Daily summary</label><label><input type="checkbox" checked={operations.planLimitAlerts ?? true} disabled={readOnly} onChange={e => patchOperations({ planLimitAlerts: e.target.checked })} /> Plan-limit alerts</label></div></section>
      </div>}
    </Modal>
  );
}
