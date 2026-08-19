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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useRole } from '../hooks/useRole';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  useCreateStoreMutation,
  useCreateMerchantMutation,
  useDeleteStoreMutation,
  useMerchantsQuery,
  useSessionsQuery,
  useStoresQuery,
  useUpdateStoreMutation,
} from '../hooks/queries';
import {
  shopifyApi,
  storesApi,
  type Store,
  type StoreOrder,
  type OrderAiConversation,
  type StorePayload,
  type StoreProduct,
} from '../services/api';
import './Stores.css';

const emptyForm: StorePayload = {
  merchantId: '',
  sessionId: '',
  name: '',
  provider: 'shopify',
  ownerName: '',
  email: '',
  phone: '',
  language: 'fr',
  timezone: 'Africa/Casablanca',
  currency: 'MAD',
  status: 'active',
  settings: {
    shopDomain: '',
    clientId: '',
    clientSecret: '',
    scopes: 'read_orders,write_orders,read_products',
    redirectUri: 'http://localhost:2785/api/shopify/oauth/callback',
    webhookBaseUrl: '',
    catalogAssistantEnabled: true,
    confirmationSuccessTemplate: 'Merci {{customerName}}, votre commande {{orderNumber}} est confirmée ✅',
    relatedProductsTemplate: 'Vous pourriez aussi aimer :\n{{products}}\n\nRépondez avec le nom du produit pour plus d’informations.',
  },
};

export function Stores() {
  const { t } = useTranslation();
  useDocumentTitle(t('stores.title'));
  const { canWrite } = useRole();
  const { data: stores = [], isLoading, isError, refetch: refetchStores } = useStoresQuery();
  const { data: merchants = [] } = useMerchantsQuery();
  const { data: sessions = [] } = useSessionsQuery();
  const createStore = useCreateStoreMutation();
  const createMerchant = useCreateMerchantMutation();
  const updateStore = useUpdateStoreMutation();
  const deleteStore = useDeleteStoreMutation();
  const [form, setForm] = useState<StorePayload>(emptyForm);
  const [editing, setEditing] = useState<Store | null>(null);
  const [deleting, setDeleting] = useState<Store | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showMerchantForm, setShowMerchantForm] = useState(false);
  const [merchantForm, setMerchantForm] = useState({ name: '', email: '', phone: '' });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [detailStore, setDetailStore] = useState<Store | null>(null);
  const [detailTab, setDetailTab] = useState<'products' | 'orders'>('products');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [remindingOrderId, setRemindingOrderId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Record<string, OrderAiConversation | null>>({});
  const [handoffOrderId, setHandoffOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopify') !== 'connected') return;
    const products = params.get('products') ?? '0';
    const orders = params.get('orders') ?? '0';
    setToast({ type: 'success', message: `Shopify connected. Imported ${products} products and ${orders} orders.` });
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const linkedSessionIds = useMemo(() => new Set(stores.map(store => store.sessionId)), [stores]);
  const availableSessions = sessions.filter(
    session => !linkedSessionIds.has(session.id) || session.id === editing?.sessionId,
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, merchantId: merchants[0]?.id ?? '', sessionId: availableSessions[0]?.id ?? '' });
    setShowForm(true);
  };

  const openEdit = (store: Store) => {
    setEditing(store);
    setForm({
      merchantId: store.merchantId,
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
      settings: { ...store.settings, shopDomain: store.settings?.shopDomain ?? '', clientSecret: '' },
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
      const payload = { ...form, settings };
      if (editing) {
        await updateStore.mutateAsync({ id: editing.id, data: payload });
      } else {
        const created = await createStore.mutateAsync(payload);
        if (created.provider === 'shopify') {
          window.location.assign(shopifyApi.installUrl(created.id));
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

  const submitMerchant = async () => {
    try {
      await createMerchant.mutateAsync(merchantForm);
      setShowMerchantForm(false);
      setMerchantForm({ name: '', email: '', phone: '' });
      setToast({ type: 'success', message: 'Merchant created successfully.' });
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to create the merchant.' });
    }
  };

  const syncStore = async (store: Store) => {
    setSyncingId(store.id);
    try {
      const result = await shopifyApi.sync(store.id);
      await refetchStores();
      setToast({ type: 'success', message: `Sync complete: ${result.products} products and ${result.orders} orders.` });
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Shopify synchronization failed.' });
    } finally {
      setSyncingId(null);
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
        message: updated.status === 'escalated' ? 'Conversation assigned to a human agent.' : 'AI conversation resumed.',
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
  const valid = Boolean(
    form.merchantId && form.sessionId && form.name.trim() && form.email.trim() && shopDomainValid && shopifyConfigValid,
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
            <button
              className="btn-primary"
              onClick={openCreate}
              disabled={!merchants.length || !availableSessions.length}
            >
              <Plus size={16} /> {t('stores.addStore')}
            </button>
          ) : undefined
        }
      />

      {!merchants.length && !isLoading && (
        <div className="stores-notice">
          <AlertTriangle size={18} /> Create a merchant before adding a store.
          {canWrite && (
            <button className="btn-secondary" onClick={() => setShowMerchantForm(true)}>
              Create merchant
            </button>
          )}
        </div>
      )}
      {!!merchants.length && !availableSessions.length && !stores.length && !isLoading && (
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
                      onClick={() => window.location.assign(shopifyApi.installUrl(store.id))}
                    >
                      <ExternalLink size={15} /> Install
                    </button>
                  )}
                  {store.provider === 'shopify' && store.settings?.connected && canWrite && (
                    <button
                      className="btn-secondary"
                      onClick={() => syncStore(store)}
                      disabled={syncingId === store.id}
                    >
                      <RefreshCw className={syncingId === store.id ? 'animate-spin' : ''} size={15} /> Sync
                    </button>
                  )}
                  {store.provider === 'shopify' && store.settings?.connected && (
                    <button className="btn-secondary" onClick={() => openDetails(store, 'products')}>
                      <Package size={15} /> Products
                    </button>
                  )}
                  {store.provider === 'shopify' && store.settings?.connected && (
                    <button className="btn-secondary" onClick={() => openDetails(store, 'orders')}>
                      <ShoppingBag size={15} /> Orders
                    </button>
                  )}
                  {canWrite && (
                    <button className="icon-btn" onClick={() => openEdit(store)} aria-label="Edit store">
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
                  <span>Merchant</span>
                  <strong>{store.merchant?.name ?? store.merchantId}</strong>
                </div>
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
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => !saving && setShowForm(false)}
        title={editing ? t('stores.editStore') : t('stores.addStore')}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!valid || saving} onClick={submit}>
              {saving && <Loader2 className="animate-spin" size={16} />} Save
            </button>
          </>
        }
      >
        <div className="store-form-grid">
          <label>
            Merchant
            <select value={form.merchantId} onChange={e => setField('merchantId', e.target.value)} required>
              {merchants.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.email}
                </option>
              ))}
            </select>
          </label>
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
          <label>
            Store name
            <input value={form.name} onChange={e => setField('name', e.target.value)} maxLength={150} required />
          </label>
          <label>
            Platform
            <select
              value={form.provider}
              onChange={e => setField('provider', e.target.value as StorePayload['provider'])}
            >
              <option value="shopify">Shopify</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="youcan">YouCan</option>
              <option value="prestashop">PrestaShop</option>
            </select>
          </label>
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
              Scopes
              <input
                value={form.settings?.scopes ?? ''}
                onChange={e => setField('settings', { ...form.settings, scopes: e.target.value })}
                required
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
          {form.provider === 'shopify' && (
            <label>
              AI catalog assistant
              <select
                value={form.settings?.catalogAssistantEnabled === false ? 'false' : 'true'}
                onChange={e => setField('settings', { ...form.settings, catalogAssistantEnabled: e.target.value === 'true' })}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>
          )}
          {form.provider === 'shopify' && (
            <label className="store-form-full">
              Confirmation message template
              <textarea
                rows={3}
                value={form.settings?.confirmationSuccessTemplate ?? ''}
                onChange={e => setField('settings', { ...form.settings, confirmationSuccessTemplate: e.target.value })}
                placeholder="Merci {{customerName}}, votre commande {{orderNumber}} est confirmée ✅"
              />
              <small>Available: {'{{customerName}}'}, {'{{orderNumber}}'}, {'{{storeName}}'}</small>
            </label>
          )}
          {form.provider === 'shopify' && (
            <label className="store-form-full">
              Related products template
              <textarea
                rows={4}
                value={form.settings?.relatedProductsTemplate ?? ''}
                onChange={e => setField('settings', { ...form.settings, relatedProductsTemplate: e.target.value })}
                placeholder={'Vous pourriez aussi aimer :\n{{products}}'}
              />
              <small>Available: {'{{products}}'}, {'{{orderNumber}}'}, {'{{storeName}}'}</small>
            </label>
          )}
          <label>
            Owner name
            <input value={form.ownerName} onChange={e => setField('ownerName', e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} required />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="+212612345678" />
          </label>
          <label>
            Currency
            <input
              value={form.currency}
              onChange={e => setField('currency', e.target.value.toUpperCase())}
              maxLength={10}
            />
          </label>
          <label>
            Language
            <input value={form.language} onChange={e => setField('language', e.target.value)} maxLength={10} />
          </label>
          <label>
            Timezone
            <input value={form.timezone} onChange={e => setField('timezone', e.target.value)} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={e => setField('status', e.target.value as StorePayload['status'])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
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
                              disabled={remindingOrderId === order.id}
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
                              disabled={handoffOrderId === order.id}
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
        open={showMerchantForm}
        onClose={() => setShowMerchantForm(false)}
        title="Create merchant"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowMerchantForm(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!merchantForm.name.trim() || !merchantForm.email.trim() || createMerchant.isPending}
              onClick={submitMerchant}
            >
              Create
            </button>
          </>
        }
      >
        <div className="store-form-grid">
          <label>
            Business name
            <input
              value={merchantForm.name}
              onChange={e => setMerchantForm(current => ({ ...current, name: e.target.value }))}
              maxLength={150}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={merchantForm.email}
              onChange={e => setMerchantForm(current => ({ ...current, email: e.target.value }))}
              required
            />
          </label>
          <label>
            Phone
            <input
              value={merchantForm.phone}
              onChange={e => setMerchantForm(current => ({ ...current, phone: e.target.value }))}
              placeholder="+212612345678"
            />
          </label>
        </div>
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
