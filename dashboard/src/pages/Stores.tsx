import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  Database,
  Edit,
  ExternalLink,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  Store as StoreIcon,
  Trash2,
  X,
  BookOpen,
  ShieldCheck,
  Link2,
  CheckCircle2,
  Settings2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { StoreManager } from '../components/StoreManager';
import { PageHeader } from '../components/PageHeader';
import { PlanUpgradeNotice, usePlanLimit } from '../components/PlanLimitGate';
import { useRole } from '../hooks/useRole';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  useCreateStoreMutation,
  useDeleteStoreMutation,
  useSessionsQuery,
  useStoresQuery,
  useUpdateStoreMutation,
} from '../hooks/queries';
import {
  shopifyApi,
  woocommerceApi,
  youcanApi,
  storesApi,
  type Store,
  type StoreOrder,
  type OrderAiConversation,
  type StorePayload,
  type StoreProduct,
} from '../services/api';
import './Stores.css';

const emptyForm: StorePayload = {
  sessionId: '',
  provider: 'shopify',
  status: 'active',
  settings: {
    shopDomain: '',
    clientId: '',
    clientSecret: '',
    scopes: 'read_orders,write_orders,read_products,read_customers,read_fulfillments,write_fulfillments,read_legal_policies',
    redirectUri: `${window.location.origin}/api/shopify/oauth/callback`,
    webhookBaseUrl: window.location.origin,
    catalogAssistantEnabled: true,
    confirmationSuccessTemplate: 'Merci {{customerName}}, votre commande {{orderNumber}} est confirmée ✅',
    relatedProductsTemplate:
      'Vous pourriez aussi aimer :\n{{products}}\n\nRépondez avec le nom du produit pour plus d’informations.',
  },
};

export function Stores() {
  const storeLimit = usePlanLimit('stores');
  const trialGate = usePlanLimit();
  const { t } = useTranslation();
  useDocumentTitle(t('stores.title'));
  const { canWrite } = useRole();
  const { data: stores = [], isLoading, isError, refetch: refetchStores } = useStoresQuery();
  const { data: sessions = [] } = useSessionsQuery();
  const createStore = useCreateStoreMutation();
  const updateStore = useUpdateStoreMutation();
  const deleteStore = useDeleteStoreMutation();
  const [form, setForm] = useState<StorePayload>(emptyForm);
  const [editing, setEditing] = useState<Store | null>(null);
  const [deleting, setDeleting] = useState<Store | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [detailStore, setDetailStore] = useState<Store | null>(null);
  const [detailTab, setDetailTab] = useState<'products' | 'orders'>('products');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [remindingOrderId, setRemindingOrderId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Record<string, OrderAiConversation | null>>({});
  const [handoffOrderId, setHandoffOrderId] = useState<string | null>(null);
  const [managedStore, setManagedStore] = useState<Store | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedProvider = params.get('shopify') === 'connected' ? 'Shopify' : params.get('youcan') === 'connected' ? 'YouCan' : null;
    if (!connectedProvider) return;
    const products = params.get('products') ?? '0';
    const orders = params.get('orders') ?? '0';
    const webhookWarning = params.get('webhooks') === 'warning';
    setToast({
      type: webhookWarning ? 'error' : 'success',
      message: webhookWarning
        ? `${connectedProvider} connected and data imported, but webhook registration requires edit-rest-hooks.`
        : `${connectedProvider} connected. Imported ${products} products and ${orders} orders.`,
    });
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const linkedSessionIds = useMemo(() => new Set(stores.map(store => store.sessionId)), [stores]);
  const availableSessions = sessions.filter(
    session => !linkedSessionIds.has(session.id) || session.id === editing?.sessionId,
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, sessionId: availableSessions[0]?.id ?? '' });
    setShowForm(true);
  };

  const openEdit = (store: Store) => {
    setEditing(store);
    setForm({
      sessionId: store.sessionId,
      name: store.name,
      provider: store.provider,
      ownerName: store.ownerName ?? '',
      email: store.email,
      phone: store.phone ?? '',
      language: store.language,
      timezone: store.timezone,
      currency: store.currency,
      status: store.status,
      settings: {
        ...store.settings,
        shopDomain: store.settings?.shopDomain ?? '',
        clientSecret: '',
        consumerSecret: '',
      },
    });
    setShowForm(true);
  };

  const setField = <K extends keyof StorePayload>(key: K, value: StorePayload[K]) =>
    setForm(current => ({ ...current, [key]: value }));

  const submit = async () => {
    try {
      const settings = { ...form.settings };
      delete settings.connected;
      delete settings.clientSecretConfigured;
      if (!settings.clientSecret) delete settings.clientSecret;
      if (!settings.consumerSecret) delete settings.consumerSecret;
      const payload = { ...form, settings };
      if (editing) {
        await updateStore.mutateAsync({ id: editing.id, data: payload });
      } else {
        const created = await createStore.mutateAsync(payload);
        if (created.provider === 'shopify') {
          const authorization = await shopifyApi.authorizationUrl(created.id);
          window.location.assign(authorization.url);
          return;
        }
        if (created.provider === 'woocommerce') {
          setShowForm(false);
          const result = await woocommerceApi.connect(created.id);
          setToast({
            type: 'success',
            message: `WooCommerce connected. Imported ${result.products} products and ${result.orders} orders.`,
          });
        }
        if (created.provider === 'youcan') {
          const authorization = await youcanApi.authorizationUrl(created.id);
          window.location.assign(authorization.url);
          return;
        }
      }
      setShowForm(false);
      setToast({ type: 'success', message: editing ? 'Store updated successfully.' : 'Store created successfully.' });
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save the store.' });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteStore.mutateAsync(deleting.id);
      setDeleting(null);
      setToast({ type: 'success', message: 'Store deleted successfully.' });
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to delete the store.' });
    }
  };

  const syncStore = async (store: Store) => {
    setSyncingId(store.id);
    try {
      const result = store.provider === 'woocommerce'
        ? await woocommerceApi.sync(store.id)
        : store.provider === 'youcan' ? await youcanApi.sync(store.id) : await shopifyApi.sync(store.id);
      await refetchStores();
      setToast({ type: 'success', message: `Sync complete: ${result.products} products and ${result.orders} orders.` });
    } catch (error) {
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : `${store.provider} synchronization failed.`,
      });
    } finally {
      setSyncingId(null);
    }
  };

  const connectWooStore = async (store: Store) => {
    setSyncingId(store.id);
    try {
      const result = await woocommerceApi.connect(store.id);
      await refetchStores();
      setToast({
        type: 'success',
        message: `WooCommerce connected: ${result.products} products and ${result.orders} orders imported.`,
      });
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'WooCommerce connection failed.' });
    } finally {
      setSyncingId(null);
    }
  };

  const registerYouCanWebhooks = async (store: Store) => {
    setSyncingId(store.id);
    try {
      const result = await youcanApi.registerWebhooks(store.id);
      await refetchStores();
      setToast({ type: 'success', message: `YouCan webhooks ready: ${result.subscriptions.length} subscriptions.` });
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'YouCan webhook registration failed.' });
    } finally {
      setSyncingId(null);
    }
  };

  const reconnectStore = async (store: Store) => {
    setReconnectingId(store.id);
    try {
      if (store.provider === 'woocommerce') {
        const result = await woocommerceApi.connect(store.id);
        await refetchStores();
        setManagedStore(current => current?.id === store.id ? { ...current, settings: { ...current.settings, connected: true, importedProducts: result.products, importedOrders: result.orders } } : current);
        setToast({ type: 'success', message: `WooCommerce reconnected. Imported ${result.products} products and ${result.orders} orders.` });
        return;
      }
      const authorization = store.provider === 'youcan'
        ? await youcanApi.authorizationUrl(store.id)
        : await shopifyApi.authorizationUrl(store.id);
      window.location.assign(authorization.url);
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : `Unable to reconnect ${store.provider}.` });
    } finally {
      setReconnectingId(null);
    }
  };

  const openDetails = async (store: Store, tab: 'products' | 'orders') => {
    setDetailStore(store);
    setDetailTab(tab);
    setLoadingDetails(true);
    try {
      const [storeProducts, storeOrders] = await Promise.all([
        storesApi.products(store.id),
        storesApi.orders(store.id),
      ]);
      setProducts(storeProducts);
      setOrders(storeOrders);
      setConversations(await storesApi.orderConversations(store.id));
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load imported data.' });
    } finally {
      setLoadingDetails(false);
    }
  };

  const remindOrder = async (order: StoreOrder) => {
    if (!detailStore) return;
    setRemindingOrderId(order.id);
    try {
      const updated = await storesApi.remindOrder(detailStore.id, order.id);
      setOrders(current => current.map(item => (item.id === updated.id ? updated : item)));
      setToast({ type: 'success', message: `Reminder sent for order ${order.orderNumber ?? ''}.` });
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send reminder.' });
    } finally {
      setRemindingOrderId(null);
    }
  };

  const toggleHandoff = async (order: StoreOrder) => {
    if (!detailStore) return;
    setHandoffOrderId(order.id);
    try {
      const updated = await storesApi.setOrderHandoff(
        detailStore.id,
        order.id,
        conversations[order.id]?.status !== 'escalated',
      );
      setConversations(current => ({ ...current, [order.id]: updated }));
      setToast({
        type: 'success',
        message:
          updated.status === 'escalated' ? 'Conversation assigned to a human agent.' : 'AI conversation resumed.',
      });
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update handoff.' });
    } finally {
      setHandoffOrderId(null);
    }
  };

  const saving = createStore.isPending || updateStore.isPending;
  const shopDomainValid =
    form.provider !== 'shopify' || /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(form.settings?.shopDomain ?? '');
  const shopifyConfigValid =
    form.provider !== 'shopify' ||
    Boolean(
      form.settings?.clientId &&
      (form.settings.clientSecret || form.settings.clientSecretConfigured) &&
      form.settings.scopes &&
      form.settings.redirectUri,
    );
  const wooConfigValid =
    form.provider !== 'woocommerce' ||
    Boolean(
      /^https:\/\//i.test(form.settings?.siteUrl ?? '') &&
      form.settings?.consumerKey &&
      (form.settings.consumerSecret || form.settings.consumerSecretConfigured),
    );
  const youcanConfigValid = form.provider !== 'youcan' || Boolean(
    form.settings?.clientId && (form.settings.clientSecret || form.settings.clientSecretConfigured) && form.settings.redirectUri,
  );
  const valid = Boolean(
    form.sessionId && shopDomainValid && shopifyConfigValid && wooConfigValid && youcanConfigValid,
  );

  return (
    <div className="stores-page">
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
      )}

      <PageHeader
        title={t('stores.title')}
        subtitle={t('stores.subtitle')}
        actions={
          canWrite ? (
            <button className="btn-primary" onClick={openCreate} disabled={storeLimit.blocked || !availableSessions.length} title={storeLimit.reason ?? undefined}>
              <Plus size={16} /> {t('stores.addStore')}
            </button>
          ) : undefined
        }
      />

      {storeLimit.reason && <PlanUpgradeNotice reason={storeLimit.reason} />}

      {!availableSessions.length && !stores.length && !isLoading && (
        <div className="stores-notice">
          <AlertTriangle size={18} /> Create a WhatsApp session before adding a store.
        </div>
      )}

      {isLoading ? (
        <div className="stores-loading">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : isError ? (
        <div className="stores-notice error">
          <AlertTriangle size={18} /> Unable to load stores.
        </div>
      ) : stores.length === 0 ? (
        <div className="empty-table-state">
          <StoreIcon size={48} strokeWidth={1.25} />
          <h3>{t('stores.empty.title')}</h3>
          <p>{t('stores.empty.description')}</p>
        </div>
      ) : (
        <div className="stores-card-list">
          {stores.map(store => (
            <article className="store-card" key={store.id}>
              <div className="store-card-header">
                <div className="store-title">
                  <StoreIcon size={20} />
                  <div>
                    <strong>{store.name}</strong>
                    <span>{store.provider}</span>
                  </div>
                </div>
                <div className="store-card-actions">
                  {store.provider === 'shopify' && !store.settings?.connected && (
                    <button
                      className="btn-secondary"
                      onClick={() => reconnectStore(store)}
                      disabled={trialGate.blocked}
                      title={trialGate.reason ?? undefined}
                    >
                      <ExternalLink size={15} /> Install
                    </button>
                  )}
                  {store.provider === 'woocommerce' && !store.settings?.connected && canWrite && (
                    <button
                      className="btn-secondary"
                      onClick={() => connectWooStore(store)}
                      disabled={syncingId === store.id || trialGate.blocked}
                      title={trialGate.reason ?? undefined}
                    >
                      <ExternalLink size={15} /> Connect
                    </button>
                  )}
                  {store.provider === 'youcan' && !store.settings?.connected && (
                    <button className="btn-secondary" onClick={async () => {
                      try {
                        const authorization = await youcanApi.authorizationUrl(store.id);
                        window.location.assign(authorization.url);
                      } catch (error) {
                        setToast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to start YouCan installation.' });
                      }
                    }} disabled={trialGate.blocked}>
                      <ExternalLink size={15} /> Install
                    </button>
                  )}
                  {['shopify', 'woocommerce', 'youcan'].includes(store.provider) && store.settings?.connected && canWrite && (
                    <button
                      className="btn-secondary"
                      onClick={() => syncStore(store)}
                      disabled={syncingId === store.id || trialGate.blocked}
                      title={trialGate.reason ?? undefined}
                    >
                      <RefreshCw className={syncingId === store.id ? 'animate-spin' : ''} size={15} /> Sync
                    </button>
                  )}
                  {store.provider === 'youcan' && store.settings?.connected && canWrite && (
                    <button className="btn-secondary" onClick={() => registerYouCanWebhooks(store)} disabled={syncingId === store.id || trialGate.blocked} title={store.settings.webhookRegistrationError ?? 'Register or verify YouCan webhooks'}>
                      <Link2 size={15} /> Webhooks
                    </button>
                  )}
                  {['shopify', 'woocommerce', 'youcan'].includes(store.provider) && store.settings?.connected && (
                    <button className="btn-secondary" onClick={() => openDetails(store, 'products')}>
                      <Package size={15} /> Products
                    </button>
                  )}
                  {['shopify', 'woocommerce', 'youcan'].includes(store.provider) && store.settings?.connected && (
                    <button className="btn-secondary" onClick={() => openDetails(store, 'orders')}>
                      <ShoppingBag size={15} /> Orders
                    </button>
                  )}
                  {canWrite && (
                    <button className="btn-secondary" onClick={() => setManagedStore(store)}>
                      <Settings2 size={15} /> Manage
                    </button>
                  )}
                  {canWrite && (
                    <button className="icon-btn" onClick={() => openEdit(store)} aria-label="Edit store" disabled={trialGate.blocked} title={trialGate.reason ?? undefined}>
                      <Edit size={16} />
                    </button>
                  )}
                  {canWrite && (
                    <button className="icon-btn danger" onClick={() => setDeleting(store)} aria-label="Delete store">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div className="store-card-body store-details">
                <div>
                  <span>WhatsApp session</span>
                  <strong>{store.session?.name ?? store.sessionId}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{store.email}</strong>
                </div>
                <div>
                  <span>Currency</span>
                  <strong>{store.currency}</strong>
                </div>
                <div>
                  <span>Language</span>
                  <strong>{store.language}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong className={`status-badge ${store.status}`}>{store.status}</strong>
                </div>
                {store.provider === 'shopify' && (
                  <div>
                    <span>Shopify</span>
                    <strong>{store.settings?.connected ? 'Connected' : 'Not installed'}</strong>
                  </div>
                )}
                {store.provider === 'shopify' && store.settings?.connected && (
                  <div>
                    <span>Imported</span>
                    <strong>
                      {store.settings.importedProducts ?? 0} products · {store.settings.importedOrders ?? 0} orders
                    </strong>
                  </div>
                )}
                {store.provider === 'woocommerce' && (
                  <div>
                    <span>WooCommerce</span>
                    <strong>{store.settings?.connected ? 'Connected' : 'Connection required'}</strong>
                  </div>
                )}
                {store.provider === 'woocommerce' && store.settings?.connected && (
                  <div>
                    <span>Imported</span>
                    <strong>
                      {store.settings.importedProducts ?? 0} products · {store.settings.importedOrders ?? 0} orders
                    </strong>
                  </div>
                )}
                {store.provider === 'youcan' && <div><span>YouCan</span><strong>{store.settings?.connected ? 'Connected' : 'Not installed'}</strong></div>}
                {store.provider === 'youcan' && store.settings?.connected && <div><span>Imported</span><strong>{store.settings.importedProducts ?? 0} products · {store.settings.importedOrders ?? 0} orders</strong></div>}
              </div>
            </article>
          ))}
        </div>
      )}

      <StoreManager
        open={Boolean(managedStore)}
        store={managedStore}
        sessions={sessions}
        saving={updateStore.isPending}
        syncing={managedStore ? syncingId === managedStore.id : false}
        reconnecting={managedStore ? reconnectingId === managedStore.id : false}
        readOnly={!canWrite || trialGate.blocked}
        onClose={() => setManagedStore(null)}
        onSync={async () => { if (managedStore) await syncStore(managedStore); }}
        onReconnect={async () => { if (managedStore) await reconnectStore(managedStore); }}
        onSave={async data => {
          if (!managedStore) return;
          try {
            const updated = await updateStore.mutateAsync({ id: managedStore.id, data });
            setManagedStore(updated);
            setToast({ type: 'success', message: 'Store management settings saved.' });
          } catch (error) {
            setToast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save store settings.' });
          }
        }}
      />

      <Modal
        open={showForm}
        onClose={() => !saving && setShowForm(false)}
        title={editing ? t('stores.editStore') : t('stores.addStore')}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={storeLimit.blocked || trialGate.blocked || !valid || saving} onClick={submit}>
              {saving && <Loader2 className="animate-spin" size={16} />} Save
            </button>
          </>
        }
      >
        <div className="store-form-grid">
          <label>
            WhatsApp session
            <select value={form.sessionId} onChange={e => setField('sessionId', e.target.value)} required>
              {availableSessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </label>
          <div className="store-form-full provider-picker">
            <div className="field-heading">
              <span>Choose your commerce platform</span>
              <small>Only active integrations are selectable</small>
            </div>
            <div className="provider-options">
              {(['shopify', 'woocommerce', 'youcan'] as const).map(provider => (
                <button
                  type="button"
                  key={provider}
                  className={`provider-option ${form.provider === provider ? 'selected' : ''}`}
                  onClick={() => setForm(current => ({
                    ...current,
                    provider,
                    settings: {
                      ...current.settings,
                      ...(provider === 'youcan' ? {
                        scopes: 'read-orders edit-orders delete-orders read-products read-products-review read-categories read-coupons read-customers edit-customers read-pages read-menus read-rest-hooks edit-rest-hooks read-payments read-shipping-zones view-store-info view-store-profits read-upsells',
                        redirectUri: `${window.location.origin}/api/youcan/oauth/callback`,
                        webhookBaseUrl: window.location.origin,
                      } : provider === 'shopify' ? {
                        scopes: 'read_orders,write_orders,read_products,read_customers,read_fulfillments,write_fulfillments,read_legal_policies',
                        redirectUri: `${window.location.origin}/api/shopify/oauth/callback`,
                        webhookBaseUrl: window.location.origin,
                      } : {}),
                    },
                  }))}
                >
                  <span className="provider-mark">{provider === 'shopify' ? 'S' : provider === 'woocommerce' ? 'Woo' : 'Y'}</span>
                  <span>
                    <strong>{provider === 'shopify' ? 'Shopify' : provider === 'woocommerce' ? 'WooCommerce' : 'YouCan'}</strong>
                    <small>{provider === 'woocommerce' ? 'REST API keys' : 'OAuth app installation'}</small>
                  </span>
                  {form.provider === provider && <CheckCircle2 size={18} />}
                </button>
              ))}
            </div>
          </div>
          <aside className="store-connect-guide store-form-full">
            <div className="guide-title">
              <BookOpen size={19} />
              <div>
                <strong>
                  {form.provider === 'shopify' ? 'Shopify connection guide' : form.provider === 'woocommerce' ? 'WooCommerce connection guide' : 'YouCan connection guide'}
                </strong>
                <span>Follow these steps—OpenWA completes the import and webhook setup.</span>
              </div>
            </div>
            {form.provider === 'woocommerce' ? (
              <ol>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Create API credentials</strong>
                    <small>
                      WordPress → WooCommerce → Settings → Advanced → REST API → Add key. Select Read/Write access.
                    </small>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Paste the HTTPS store URL and keys</strong>
                    <small>The Consumer Key starts with ck_ and the Consumer Secret starts with cs_.</small>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Add your public OpenWA URL</strong>
                    <small>
                      Use only the tunnel/domain base URL. The order webhook path and secure signature secret are
                      created automatically.
                    </small>
                  </div>
                </li>
              </ol>
            ) : (
              <ol>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Create a Shopify development app</strong>
                    <small>Copy its Client ID and Client secret, then configure order and product scopes.</small>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Set the callback URL</strong>
                    <small>It must match the OpenWA OAuth callback shown below exactly.</small>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Save and install</strong>
                    <small>
                      You will be redirected to Shopify to approve access; import and webhook registration run
                      afterward.
                    </small>
                  </div>
                </li>
              </ol>
            )}
            <div className="guide-security">
              <ShieldCheck size={16} />
              <span>Credentials are encrypted. Secret values are never returned to the dashboard.</span>
            </div>
            <div className="connection-checks">
              <span className={form.sessionId ? 'ready' : ''}>
                <CheckCircle2 size={14} /> WhatsApp session
              </span>
              <span
                className={
                  (form.provider === 'shopify' ? shopifyConfigValid && shopDomainValid : form.provider === 'woocommerce' ? wooConfigValid : youcanConfigValid) ? 'ready' : ''
                }
              >
                <CheckCircle2 size={14} /> API credentials
              </span>
              <span className={form.settings?.webhookBaseUrl ? 'ready' : ''}>
                <CheckCircle2 size={14} /> Public webhook URL
              </span>
            </div>
          </aside>
          {form.provider === 'shopify' && (
            <label>
              Shopify domain
              <input
                value={form.settings?.shopDomain ?? ''}
                onChange={e =>
                  setField('settings', { ...form.settings, shopDomain: e.target.value.trim().toLowerCase() })
                }
                placeholder="your-store.myshopify.com"
                pattern="[a-zA-Z0-9][a-zA-Z0-9-]*\\.myshopify\\.com"
                required
              />
            </label>
          )}
          {form.provider === 'woocommerce' && (
            <>
              <label>
                WooCommerce site URL
                <input
                  type="url"
                  value={form.settings?.siteUrl ?? ''}
                  onChange={e => setField('settings', { ...form.settings, siteUrl: e.target.value.trim() })}
                  placeholder="https://shop.example.com"
                  required
                />
                <small>WordPress address where WooCommerce is installed. HTTPS is required.</small>
              </label>
              <label>
                Consumer key
                <input
                  value={form.settings?.consumerKey ?? ''}
                  onChange={e => setField('settings', { ...form.settings, consumerKey: e.target.value.trim() })}
                  placeholder="ck_..."
                  required
                />
                <small>Use a Read/Write key so confirmations can update orders.</small>
              </label>
              <label>
                Consumer secret
                <input
                  type="password"
                  value={form.settings?.consumerSecret ?? ''}
                  onChange={e => setField('settings', { ...form.settings, consumerSecret: e.target.value })}
                  placeholder={
                    form.settings?.consumerSecretConfigured ? 'Leave blank to keep existing secret' : 'cs_...'
                  }
                  required={!form.settings?.consumerSecretConfigured}
                />
              </label>
              <label>
                Public webhook base URL
                <input
                  type="url"
                  value={form.settings?.webhookBaseUrl ?? ''}
                  onChange={e => setField('settings', { ...form.settings, webhookBaseUrl: e.target.value.trim() })}
                  placeholder="https://your-public-domain.com"
                />
                <small>
                  <Link2 size={13} /> Enter only the base URL—do not add /api.
                </small>
              </label>
            </>
          )}
          {form.provider === 'shopify' && (
            <label>
              Client ID
              <input
                value={form.settings?.clientId ?? ''}
                onChange={e => setField('settings', { ...form.settings, clientId: e.target.value.trim() })}
                required
              />
            </label>
          )}
          {form.provider === 'shopify' && (
            <label>
              Client secret
              <input
                type="password"
                value={form.settings?.clientSecret ?? ''}
                onChange={e => setField('settings', { ...form.settings, clientSecret: e.target.value })}
                placeholder={form.settings?.clientSecretConfigured ? 'Leave blank to keep existing secret' : ''}
                required={!form.settings?.clientSecretConfigured}
              />
            </label>
          )}
          {form.provider === 'shopify' && (
            <label>
              Redirect URI
              <input
                type="url"
                value={form.settings?.redirectUri ?? ''}
                onChange={e => setField('settings', { ...form.settings, redirectUri: e.target.value.trim() })}
                required
              />
            </label>
          )}
          {form.provider === 'shopify' && (
            <label>
              Public webhook base URL
              <input
                type="url"
                value={form.settings?.webhookBaseUrl ?? ''}
                onChange={e => setField('settings', { ...form.settings, webhookBaseUrl: e.target.value.trim() })}
                placeholder="https://your-public-domain.com"
              />
            </label>
          )}
          {form.provider === 'youcan' && (
            <>
              <label>Client ID<input value={form.settings?.clientId ?? ''} onChange={e => setField('settings', { ...form.settings, clientId: e.target.value.trim() })} required /></label>
              <label>Client secret<input type="password" value={form.settings?.clientSecret ?? ''} onChange={e => setField('settings', { ...form.settings, clientSecret: e.target.value })} placeholder={form.settings?.clientSecretConfigured ? 'Leave blank to keep existing secret' : ''} required={!form.settings?.clientSecretConfigured} /></label>
              <label>Redirect URI<input type="url" value={form.settings?.redirectUri ?? ''} onChange={e => setField('settings', { ...form.settings, redirectUri: e.target.value.trim() })} placeholder="https://your-domain.com/api/youcan/oauth/callback" required /></label>
              <label>Public webhook base URL<input type="url" value={form.settings?.webhookBaseUrl ?? ''} onChange={e => setField('settings', { ...form.settings, webhookBaseUrl: e.target.value.trim() })} placeholder="https://your-public-domain.com" /><small><Link2 size={13} /> Enter only the base URL—do not add /api.</small></label>
              <label>Default shipping estimation ID<input value={form.settings?.youcanShippingEstimationId ?? ''} onChange={e => setField('settings', { ...form.settings, youcanShippingEstimationId: e.target.value.trim() })} placeholder="sz_... or sr_..." /><small>Required only when the WhatsApp AI creates new YouCan orders.</small></label>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(detailStore)}
        onClose={() => setDetailStore(null)}
        title={`${detailStore?.name ?? ''} — imported data`}
        className="store-data-modal"
        headerExtra={
          <div className="store-data-tabs">
            <button className={detailTab === 'products' ? 'active' : ''} onClick={() => setDetailTab('products')}>
              <Package size={15} /> Products ({products.length})
            </button>
            <button className={detailTab === 'orders' ? 'active' : ''} onClick={() => setDetailTab('orders')}>
              <ShoppingBag size={15} /> Orders ({orders.length})
            </button>
          </div>
        }
      >
        {loadingDetails ? (
          <div className="stores-loading">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : detailTab === 'products' ? (
          <div className="store-data-list">
            {products.length === 0 ? (
              <p>No imported products.</p>
            ) : (
              products.map(product => (
                <details key={product.id} className="store-data-item">
                  <summary>
                    {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Database size={30} />}
                    <span>
                      <strong>{product.title}</strong>
                      <small>
                        {product.vendor ?? 'No vendor'} · {product.price} {detailStore?.currency}
                      </small>
                    </span>
                    <span className={`status-badge ${product.status}`}>{product.status}</span>
                  </summary>
                  <div className="store-data-detail">
                    <p>{product.description?.replace(/<[^>]*>/g, '') || 'No description'}</p>
                    <dl>
                      <dt>Shopify ID</dt>
                      <dd>{product.shopifyProductId}</dd>
                      <dt>Type</dt>
                      <dd>{product.productType || '—'}</dd>
                      <dt>Variants</dt>
                      <dd>{product.variants?.length ?? 0}</dd>
                      <dt>Tags</dt>
                      <dd>{product.tags?.join(', ') || '—'}</dd>
                    </dl>
                  </div>
                </details>
              ))
            )}
          </div>
        ) : (
          <div className="store-data-list">
            {orders.length === 0 ? (
              <p>No imported orders.</p>
            ) : (
              orders.map(order => (
                <details key={order.id} className="store-data-item">
                  <summary>
                    <ShoppingBag size={30} />
                    <span>
                      <strong>{order.orderNumber ?? order.shopifyOrderId}</strong>
                      <small>
                        {order.customerName || order.email || 'Unknown customer'} · {order.totalPrice} {order.currency}
                      </small>
                    </span>
                    <span className={`status-badge ${order.status}`}>{order.status}</span>
                  </summary>
                  <div className="store-data-detail">
                    <dl>
                      <dt>Phone</dt>
                      <dd>{order.phone || '—'}</dd>
                      <dt>Email</dt>
                      <dd>{order.email || '—'}</dd>
                      <dt>Payment</dt>
                      <dd>{order.financialStatus || '—'}</dd>
                      <dt>Fulfillment</dt>
                      <dd>{order.fulfillmentStatus || '—'}</dd>
                      <dt>WhatsApp confirmation</dt>
                      <dd>{order.confirmationStatus || 'not_sent'}</dd>
                      <dt>Confirmation sent</dt>
                      <dd>{order.confirmationSentAt ? new Date(order.confirmationSentAt).toLocaleString() : '—'}</dd>
                      {order.confirmationError && (
                        <>
                          <dt>Confirmation error</dt>
                          <dd>{order.confirmationError}</dd>
                        </>
                      )}
                      <dt>AI conversation</dt>
                      <dd>
                        <span className={`status-badge ${conversations[order.id]?.status ?? 'not-started'}`}>
                          {conversations[order.id]?.status ?? 'not started'}
                        </span>
                        {conversations[order.id]?.turns?.length ? (
                          <div className="ai-order-transcript">
                            {conversations[order.id]!.turns!.slice(-6).map((turn, index) => (
                              <p key={`${turn.at}-${index}`} className={turn.role}>
                                <strong>{turn.role === 'customer' ? 'Customer' : 'AI'}:</strong> {turn.text}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </dd>
                      {canWrite && ['pending', 'not_sent', 'failed'].includes(order.confirmationStatus) && (
                        <>
                          <dt>Action</dt>
                          <dd>
                            <button
                              className="btn-secondary"
                              disabled={remindingOrderId === order.id || trialGate.blocked}
                              onClick={() => remindOrder(order)}
                            >
                              {remindingOrderId === order.id ? (
                                <Loader2 className="animate-spin" size={15} />
                              ) : (
                                <Bell size={15} />
                              )}
                              Send reminder
                            </button>
                            <button
                              className="btn-secondary"
                              disabled={handoffOrderId === order.id || trialGate.blocked}
                              onClick={() => toggleHandoff(order)}
                            >
                              {handoffOrderId === order.id && <Loader2 className="animate-spin" size={15} />}
                              {conversations[order.id]?.status === 'escalated' ? 'Resume AI' : 'Human handoff'}
                            </button>
                          </dd>
                        </>
                      )}
                      <dt>Items</dt>
                      <dd>
                        {order.lineItems
                          ?.map(item => `${String(item.name ?? item.title ?? 'Item')} × ${String(item.quantity ?? 1)}`)
                          .join(', ') || '—'}
                      </dd>
                      <dt>Address</dt>
                      <dd>
                        {order.shippingAddress
                          ? Object.values(order.shippingAddress)
                              .filter(value => typeof value === 'string')
                              .join(', ')
                          : '—'}
                      </dd>
                    </dl>
                  </div>
                </details>
              ))
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t('stores.deleteStore')}
        className="modal-sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn-danger" disabled={deleteStore.isPending} onClick={confirmDelete}>
              Delete
            </button>
          </>
        }
      >
        <p>
          {t('stores.deleteConfirm')} <strong>{deleting?.name}</strong>
        </p>
      </Modal>
    </div>
  );
}
