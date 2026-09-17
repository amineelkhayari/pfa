import { useEffect, useMemo, useState } from 'react';
import { Bot, BellRing, ClipboardPen, FileText, Headphones, Image as ImageIcon, Loader2, PackageSearch, RefreshCw, Search, ShoppingBag, UserRoundCheck, X } from 'lucide-react';
import type { CustomerContext, CustomerOrderContext, CustomerProductContext, MessageTemplate } from '../../services/api';

interface Props {
  context?: CustomerContext;
  loading: boolean;
  error: boolean;
  busyAction: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onChatHandoff: (human: boolean) => void;
  onSaveIssue: (data: { summary: string; status: 'open' | 'resolved'; priority: 'low' | 'normal' | 'high' | 'urgent'; tags: string[] }) => void;
  onRemind: (order: CustomerOrderContext) => void;
  onPrepareSummary: (order: CustomerOrderContext) => void;
  onSendOrderHistoryPdf: (order: CustomerOrderContext) => void;
  onPrepareProduct: (product: CustomerProductContext) => void;
  onSendProduct: (product: CustomerProductContext) => void;
  onCreateOrder: (product: CustomerProductContext, data: { variantId?: string | null; variantTitle?: string | null; quantity: number; customerName: string; phone: string; address1: string; city: string; postalCode?: string; country: string; notifyCustomer: boolean }) => void;
  onOrderAction: (order: CustomerOrderContext, action: 'confirm' | 'cancel') => void;
  onUpdateAddress: (order: CustomerOrderContext, address: { customerName: string; address1: string; city: string; postalCode?: string; country: string; phone?: string }) => void;
  templates: MessageTemplate[];
  onUseTemplate: (template: MessageTemplate) => void;
}

const itemLabel = (item: Record<string, unknown>) => `${String(item.name ?? item.title ?? 'Product')} × ${Number(item.quantity ?? 1)}`;
const nextAction = (order: CustomerOrderContext) => {
  if (['pending', 'processing_reply'].includes(order.confirmationStatus)) return 'Awaiting customer confirmation';
  if (order.confirmationStatus === 'failed') return 'Retry confirmation message';
  if (order.confirmationStatus === 'not_sent') return 'Send confirmation message';
  if (order.confirmationStatus === 'confirmed' && !order.fulfillmentStatus) return 'Waiting for fulfillment';
  if (order.fulfillmentStatus && !['completed', 'delivered'].includes(order.fulfillmentStatus)) return `Delivery: ${order.fulfillmentStatus}`;
  return 'No action required';
};

export default function CustomerContextPanel(props: Props) {
  const { context, loading, error, busyAction, onClose, onRefresh } = props;
  const [tab, setTab] = useState<'orders' | 'products' | 'support'>('orders');
  const [productSearch, setProductSearch] = useState('');
  const [issueSummary, setIssueSummary] = useState('');
  const [issueStatus, setIssueStatus] = useState<'open' | 'resolved'>('open');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [tags, setTags] = useState('');
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [address, setAddress] = useState({ customerName: '', address1: '', city: '', postalCode: '', country: 'Morocco', phone: '' });
  const [creatingProductId, setCreatingProductId] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState({ variantId: '', quantity: 1, customerName: '', phone: '', address1: '', city: '', postalCode: '', country: 'Morocco', notifyCustomer: true });
  useEffect(() => { setIssueSummary(context?.support?.issueSummary ?? ''); setIssueStatus(context?.support?.issueStatus ?? 'open'); setPriority(context?.support?.priority ?? 'normal'); setTags((context?.support?.tags ?? []).join(', ')); }, [context?.support?.issueSummary, context?.support?.issueStatus, context?.support?.priority, context?.support?.tags]);
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return (context?.products ?? []).filter(product => !query || [product.title, product.vendor, product.productType, product.store?.name].filter(Boolean).some(value => String(value).toLowerCase().includes(query)));
  }, [context?.products, productSearch]);
  const latestTurns = useMemo(() => (context?.orders ?? []).flatMap(order => order.conversation?.turns ?? []).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).reverse(), [context?.orders]);
  const brief = useMemo(() => {
    const orders = context?.orders ?? [];
    const pending = orders.filter(order => ['pending', 'processing_reply', 'not_sent', 'failed'].includes(order.confirmationStatus)).length;
    const delivery = orders.filter(order => order.confirmationStatus === 'confirmed' && !['completed', 'delivered'].includes(order.fulfillmentStatus ?? '')).length;
    return { total: orders.length, pending, delivery };
  }, [context?.orders]);
  const humanMode = context?.support?.mode === 'human';
  const startOrder = (product: CustomerProductContext) => {
    const shipping = context?.orders[0]?.shippingAddress ?? {};
    setOrderDraft({
      variantId: '',
      quantity: 1,
      customerName: String(shipping.name ?? context?.customerName ?? ''),
      phone: String(context?.phone ?? ''),
      address1: String(shipping.address1 ?? shipping.address ?? ''),
      city: String(shipping.city ?? ''),
      postalCode: String(shipping.zip ?? shipping.postalCode ?? ''),
      country: String(shipping.country ?? 'Morocco'),
      notifyCustomer: true,
    });
    setCreatingProductId(product.id);
  };

  return <aside className="customer-context" aria-label="Customer context">
    <header><div><strong>Customer workspace</strong><span>{context?.customerName || context?.phone || 'WhatsApp customer'}</span></div><button type="button" onClick={onRefresh} aria-label="Refresh customer context"><RefreshCw size={17} /></button><button type="button" onClick={onClose} aria-label="Close customer context"><X size={18} /></button></header>
    {loading ? <div className="customer-context-state"><Loader2 className="animate-spin" size={24} />Loading customer…</div>
    : error ? <div className="customer-context-state">Customer information could not be loaded.</div>
    : <>
      <div className={`support-owner ${humanMode ? 'human' : 'ai'}`}>
        {humanMode ? <UserRoundCheck size={18} /> : <Bot size={18} />}
        <div><strong>{humanMode ? 'Human agent has control' : 'AI automation is active'}</strong><span>{humanMode ? 'AI is paused for this complete chat.' : 'Take over before replying manually.'}</span></div>
        <button type="button" disabled={busyAction === 'handoff'} onClick={() => props.onChatHandoff(!humanMode)}>{busyAction === 'handoff' ? <Loader2 className="animate-spin" size={15} /> : humanMode ? <Bot size={15} /> : <Headphones size={15} />}{humanMode ? 'Resume AI' : 'Take over'}</button>
      </div>
      <nav className="customer-context-tabs" aria-label="Customer tools"><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Orders <b>{context?.orders.length ?? 0}</b></button><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Products <b>{context?.products.length ?? 0}</b></button><button className={tab === 'support' ? 'active' : ''} onClick={() => setTab('support')}>Support</button></nav>
      <div className="customer-context-body">
        {tab === 'orders' && (!context?.orders.length ? <div className="customer-context-state"><ShoppingBag size={28} /><strong>No store orders</strong><span>This number has no orders on the connected stores.</span></div> : context.orders.map(order => <article className="customer-order-card" key={order.id}>
          <div className="customer-order-title"><div><strong>#{order.orderNumber || order.externalOrderId}</strong><span><b>Store:</b> {order.store?.name || 'Unknown'} · <b>Provider:</b> {order.store?.provider || 'Unknown'}</span></div><b className={`order-state state-${order.confirmationStatus}`}>{order.confirmationStatus.replaceAll('_', ' ')}</b></div>
          <div className="customer-order-facts"><span><small>Total</small><b>{Number(order.totalPrice).toFixed(2)} {order.currency}</b></span><span><small>Payment</small><b>{order.financialStatus || '—'}</b></span><span><small>Fulfillment</small><b>{order.fulfillmentStatus || '—'}</b></span><span><small>Confirmation</small><b>{order.confirmationStatus.replaceAll('_', ' ')}</b></span></div>
          {Boolean(order.shippingAddress?.tracking_number || order.shippingAddress?.tracking_url) && <div className="customer-tracking"><small>Tracking</small><strong>{String(order.shippingAddress?.tracking_number ?? 'Available')}</strong>{Boolean(order.shippingAddress?.tracking_url) && <a href={String(order.shippingAddress?.tracking_url)} target="_blank" rel="noreferrer">Open tracking</a>}</div>}
          <div className="customer-next-action"><small>Next action</small><strong>{nextAction(order)}</strong></div>
          <section className="customer-order-section"><small>Products and quantities</small><div className="customer-order-items">{order.lineItems?.length ? order.lineItems.map((item, index) => <span key={index}>{itemLabel(item)}</span>) : <span>No product details saved.</span>}</div></section>
          {editingAddress === order.id && <div className="customer-address-form"><input placeholder="Customer name" value={address.customerName} onChange={event => setAddress(value => ({ ...value, customerName: event.target.value }))} /><input placeholder="Address" value={address.address1} onChange={event => setAddress(value => ({ ...value, address1: event.target.value }))} /><input placeholder="City" value={address.city} onChange={event => setAddress(value => ({ ...value, city: event.target.value }))} /><input placeholder="Postal code" value={address.postalCode} onChange={event => setAddress(value => ({ ...value, postalCode: event.target.value }))} /><input placeholder="Country" value={address.country} onChange={event => setAddress(value => ({ ...value, country: event.target.value }))} /><div><button type="button" onClick={() => setEditingAddress(null)}>Cancel</button><button type="button" disabled={busyAction === `address:${order.id}`} onClick={() => props.onUpdateAddress(order, { ...address, postalCode: address.postalCode || undefined, phone: address.phone || undefined })}>Save to store</button></div></div>}
          <div className="customer-order-actions">
            <button type="button" disabled={busyAction === order.id || !['pending', 'not_sent', 'failed'].includes(order.confirmationStatus)} onClick={() => props.onRemind(order)}><BellRing size={15} /> Reminder</button>
            <button type="button" onClick={() => props.onPrepareSummary(order)}><ClipboardPen size={15} /> Summary</button>
            <button type="button" disabled={busyAction === `pdf:${order.id}`} onClick={() => props.onSendOrderHistoryPdf(order)}>{busyAction === `pdf:${order.id}` ? <Loader2 className="animate-spin" size={15} /> : <FileText size={15} />} Send PDF</button>
            <button type="button" disabled={order.confirmationStatus === 'confirmed' || busyAction === `status:${order.id}`} onClick={() => props.onOrderAction(order, 'confirm')}>Confirm</button>
            <button type="button" disabled={order.confirmationStatus === 'cancelled' || busyAction === `status:${order.id}`} onClick={() => props.onOrderAction(order, 'cancel')}>Cancel order</button>
            <button type="button" onClick={() => { const shipping = order.shippingAddress ?? {}; setAddress({ customerName: String(shipping.name ?? order.customerName ?? ''), address1: String(shipping.address1 ?? shipping.address ?? ''), city: String(shipping.city ?? ''), postalCode: String(shipping.zip ?? shipping.postalCode ?? ''), country: String(shipping.country ?? 'Morocco'), phone: String(order.phone ?? '') }); setEditingAddress(order.id); }}>Edit address</button>
          </div>
        </article>))}
        {tab === 'products' && <>
          <label className="customer-product-search"><Search size={16} /><input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Search products, type, vendor or store…" /></label>
          {creatingProductId && (() => {
            const product = context?.products.find(item => item.id === creatingProductId);
            if (!product) return null;
            const variants = product.variants ?? [];
            const selectedVariant = variants.find(item => String(item.id ?? item.admin_graphql_api_id ?? '') === orderDraft.variantId);
            return <section className="human-order-builder">
              <header><div><small>New provider order</small><strong>{product.title}</strong><span>{product.store?.name} · {product.store?.provider}</span></div><button type="button" onClick={() => setCreatingProductId(null)}><X size={16} /></button></header>
              {variants.length > 0 && <label><span>Variant</span><select value={orderDraft.variantId} onChange={event => setOrderDraft(value => ({ ...value, variantId: event.target.value }))}><option value="">Default / no variant</option>{variants.map((variant, index) => { const id = String(variant.id ?? variant.admin_graphql_api_id ?? ''); return <option key={`${id}-${index}`} value={id}>{String(variant.title ?? variant.name ?? `Variant ${index + 1}`)} — {Number(variant.price ?? product.price).toFixed(2)}</option>; })}</select></label>}
              <div className="human-order-grid"><label><span>Quantity</span><input type="number" min="1" max="100" value={orderDraft.quantity} onChange={event => setOrderDraft(value => ({ ...value, quantity: Math.max(1, Number(event.target.value)) }))} /></label><label><span>Customer name</span><input value={orderDraft.customerName} onChange={event => setOrderDraft(value => ({ ...value, customerName: event.target.value }))} /></label><label><span>Phone</span><input value={orderDraft.phone} onChange={event => setOrderDraft(value => ({ ...value, phone: event.target.value }))} /></label><label><span>Address</span><input value={orderDraft.address1} onChange={event => setOrderDraft(value => ({ ...value, address1: event.target.value }))} /></label><label><span>City</span><input value={orderDraft.city} onChange={event => setOrderDraft(value => ({ ...value, city: event.target.value }))} /></label><label><span>Postal code</span><input value={orderDraft.postalCode} onChange={event => setOrderDraft(value => ({ ...value, postalCode: event.target.value }))} /></label><label><span>Country</span><input value={orderDraft.country} onChange={event => setOrderDraft(value => ({ ...value, country: event.target.value }))} /></label></div>
              <label className="human-order-notify"><input type="checkbox" checked={orderDraft.notifyCustomer} onChange={event => setOrderDraft(value => ({ ...value, notifyCustomer: event.target.checked }))} /><span>Send the created-order summary to the customer</span></label>
              <footer><span>Total: {(Number(selectedVariant?.price ?? product.price) * orderDraft.quantity).toFixed(2)} {product.store?.currency || 'USD'}</span><button type="button" disabled={busyAction === `create:${product.id}` || !orderDraft.customerName.trim() || !orderDraft.phone.trim() || !orderDraft.address1.trim() || !orderDraft.city.trim() || !orderDraft.country.trim() || (variants.length > 0 && !orderDraft.variantId)} onClick={() => props.onCreateOrder(product, { ...orderDraft, variantId: orderDraft.variantId || null, variantTitle: selectedVariant ? String(selectedVariant.title ?? selectedVariant.name ?? '') : null, postalCode: orderDraft.postalCode || undefined })}>{busyAction === `create:${product.id}` && <Loader2 className="animate-spin" size={14} />} Create & confirm</button></footer>
            </section>;
          })()}
          {!filteredProducts.length ? <div className="customer-context-state"><PackageSearch size={28} /><strong>No matching products</strong></div> : <div className="customer-product-grid">{filteredProducts.map(product => <article className="customer-product-card" key={product.id}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <div className="customer-product-placeholder"><ImageIcon size={22} /></div>}<div><strong>{product.title}</strong><span>{product.store?.name || 'Store'} · {product.store?.provider || 'commerce'}</span><p>{Number(product.price).toFixed(2)} {product.store?.currency || 'USD'}</p></div><div className="customer-product-actions"><button type="button" onClick={() => props.onPrepareProduct(product)}><ClipboardPen size={14} /> Prepare</button><button type="button" disabled={busyAction === `product:${product.id}`} onClick={() => props.onSendProduct(product)}>Send</button><button type="button" disabled={!product.store?.id} onClick={() => startOrder(product)}>Create order</button></div></article>)}</div>}
        </>}
        {tab === 'support' && <div className="customer-support-tools"><section className="support-brief"><small>Handoff brief</small><strong>{issueSummary || (brief.pending ? `${brief.pending} order(s) need confirmation attention.` : brief.delivery ? `${brief.delivery} confirmed order(s) are still being fulfilled.` : 'No urgent commerce action detected.')}</strong><span>{brief.total} total orders · {brief.pending} pending · {brief.delivery} in delivery</span></section><div className="support-facts"><span><small>Phone</small><b>{context?.phone || '—'}</b></span><span><small>Owner</small><b>{humanMode ? 'Human' : 'AI'}</b></span><span><small>Issue</small><b>{issueStatus}</b></span><span><small>Priority</small><b className={`priority-${priority}`}>{priority}</b></span></div><label><span>Problem / internal note</span><textarea value={issueSummary} onChange={event => setIssueSummary(event.target.value)} placeholder="Describe what the customer needs, promises made, and the next action…" /></label><label><span>Tags (comma separated)</span><input value={tags} onChange={event => setTags(event.target.value)} placeholder="delivery, vip, refund…" /></label><div className="support-note-actions"><select value={priority} onChange={event => setPriority(event.target.value as typeof priority)}><option value="low">Low priority</option><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent</option></select><select value={issueStatus} onChange={event => setIssueStatus(event.target.value as 'open' | 'resolved')}><option value="open">Open issue</option><option value="resolved">Resolved</option></select><button type="button" disabled={busyAction === 'issue'} onClick={() => props.onSaveIssue({ summary: issueSummary, status: issueStatus, priority, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean) })}>{busyAction === 'issue' && <Loader2 className="animate-spin" size={14} />}Save</button></div>{props.templates.length > 0 && <section className="customer-quick-replies"><small>Quick replies</small><div>{props.templates.slice(0, 12).map(template => <button type="button" key={template.id} onClick={() => props.onUseTemplate(template)}>{template.name}</button>)}</div></section>}<section className="customer-ai-history"><small>Recent AI conversation</small>{latestTurns.length ? latestTurns.map((turn, index) => <p key={`${turn.at}-${index}`}><b>{turn.role === 'assistant' ? 'AI' : 'Customer'}:</b> {turn.text}</p>) : <p>No AI transcript is available for this customer.</p>}</section></div>}
      </div>
    </>}
  </aside>;
}
