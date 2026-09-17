import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Bot, Check, Circle, ClipboardList, ContactRound, Megaphone, MessageSquare, PlayCircle, Search, Send, ShoppingBag, Smartphone, Store, Webhook } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { START_PRODUCT_TOUR_EVENT } from '../components/ProductTour';
import { useSessionsQuery, useStoresQuery } from '../hooks/queries';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './Guide.css';

const sections = [
  { id: 'whatsapp', icon: Smartphone, title: '1. Connect WhatsApp', path: '/sessions', action: 'Open sessions', steps: ['Click New session.', 'Enter a short unique name.', 'Create and start the session.', 'Scan the QR code from WhatsApp → Linked devices.', 'Wait until the status becomes Connected.'] },
  { id: 'store', icon: Store, title: '2. Connect a store', path: '/stores', action: 'Open stores', steps: ['Click Add store.', 'Choose the connected WhatsApp session.', 'Select Shopify, WooCommerce, or YouCan.', 'Enter only the provider credentials requested by the form.', 'Complete OAuth or API connection, then verify product and order sync.'] },
  { id: 'ai', icon: Bot, title: '3. Test the AI commerce agent', path: '/ai-test', action: 'Test AI', steps: ['Select a connected store.', 'Ask for products and product details.', 'Simulate creating an order.', 'Verify tool calls and provider results.', 'Test French, Arabic, or Darija before enabling customer automation.'] },
  { id: 'templates', icon: ClipboardList, title: '4. Configure message templates', path: '/templates', action: 'Open templates', steps: ['Create or edit the order confirmation template.', 'Add delivery, cancellation, reminder, and support templates.', 'Use available store/order variables.', 'Preview the message before saving.'] },
  { id: 'test', icon: Send, title: '5. Send a WhatsApp test', path: '/message-tester', action: 'Open message tester', steps: ['Select the WhatsApp session.', 'Search or enter a test contact.', 'Choose text, image, audio, document, buttons, or another supported type.', 'Send and verify delivery in WhatsApp.'] },
  { id: 'webhooks', icon: Webhook, title: '6. Verify store webhooks', path: '/webhooks', action: 'Open webhooks', steps: ['Confirm the public HTTPS webhook URL.', 'Verify order-created and order-updated events.', 'Create a test provider order.', 'Check that it appears in SmartConfirm without a manual sync.'] },
  { id: 'chats', icon: MessageSquare, title: '7. Support customers', path: '/chats', action: 'Open chats', steps: ['Open a real customer conversation.', 'Review their store orders and products.', 'Use Take over before replying manually.', 'Send a reminder, summary, product, or order PDF.', 'Create or update an order, then Resume AI when the issue is solved.'] },
  { id: 'campaigns', icon: Megaphone, title: '8. Create a campaign', path: '/campaigns', action: 'Open campaigns', steps: ['Select a connected WhatsApp session.', 'Choose the customer audience and exclude unwanted contacts.', 'Compose or select a template.', 'Review risk and limits, then start the campaign.', 'Monitor sent, delivered, failed, and reply metrics.'] },
  { id: 'daily', icon: ShoppingBag, title: '9. Daily operations', path: '/', action: 'View dashboard', steps: ['Monitor plan and AI usage.', 'Review pending confirmations and failed messages.', 'Check disconnected devices and store sync health.', 'Resolve human handoffs and open support issues.', 'Follow fulfillment and delivery notifications.'] },
];

const actionReference = [
  { page: 'WhatsApp sessions', path: '/sessions', rows: [
    ['New session', 'Opens the session creation form.', 'Session name: unique lowercase name such as store-rabat.'],
    ['Create', 'Creates the database session. It does not connect WhatsApp yet.', 'A valid unused session name.'],
    ['Start / Generate QR', 'Starts Baileys and generates the QR or pairing code.', 'No field; the session must not already be connected.'],
    ['QR code', 'Links the device using WhatsApp → Linked devices.', 'Scan with the merchant WhatsApp account.'],
    ['Pair with phone', 'Uses an eight-character pairing code instead of QR.', 'International phone number without spaces.'],
    ['Stop / Restart', 'Stops or restarts the WhatsApp engine safely.', 'Use Restart after temporary connection problems.'],
    ['Delete', 'Deletes the session after confirmation.', 'Only use when its stores no longer depend on it.'],
  ]},
  { page: 'Stores — common fields', path: '/stores', rows: [
    ['Add store', 'Opens the provider connection wizard.', 'A connected WhatsApp session is required first.'],
    ['WhatsApp session', 'Chooses which number sends this store’s messages.', 'Select one connected, unused session.'],
    ['Platform', 'Chooses Shopify, WooCommerce, or YouCan.', 'Select the platform where orders really exist.'],
    ['Connect / Save', 'Creates the store and starts OAuth/API connection.', 'Complete every required provider field.'],
    ['Sync', 'Imports current products and orders without waiting for webhooks.', 'The store must be connected.'],
    ['Reconnect', 'Refreshes authorization without deleting local data.', 'Use after revoked/expired credentials.'],
    ['Manage', 'Opens automation, templates, sync, courier, retry, and notification settings.', 'Store must already exist.'],
  ]},
  { page: 'Shopify connection fields', path: '/stores', rows: [
    ['Shop domain', 'Identifies the Shopify store.', 'example-store.myshopify.com'],
    ['Client ID', 'Public identifier of the Shopify custom/development app.', 'Copy from Shopify app credentials.'],
    ['Client secret', 'Signs OAuth and webhook requests.', 'Copy from Shopify; never send it in chat.'],
    ['Scopes', 'Permissions SmartConfirm requests.', 'Keep required order, product, customer and fulfillment scopes.'],
    ['Redirect URI', 'Shopify returns the authorization code here.', 'Public HTTPS URL ending /api/shopify/oauth/callback.'],
    ['Webhook base URL', 'Public base used to receive Shopify events.', 'Your public HTTPS domain, without the event path.'],
  ]},
  { page: 'WooCommerce connection fields', path: '/stores', rows: [
    ['Site URL', 'Base URL of the WordPress/WooCommerce store.', 'https://shop.example.com'],
    ['Consumer key', 'WooCommerce REST API identifier.', 'Key beginning with ck_.'],
    ['Consumer secret', 'WooCommerce REST API secret.', 'Secret beginning with cs_.'],
    ['Webhook secret', 'Validates incoming WooCommerce webhook signatures.', 'Use a long random secret.'],
    ['Webhook base URL', 'Public destination for order events.', 'Your SmartConfirm public HTTPS domain.'],
  ]},
  { page: 'YouCan connection fields', path: '/stores', rows: [
    ['Client ID', 'Identifies the YouCan OAuth application.', 'Copy the exact ID from YouCan developer settings.'],
    ['Client secret', 'Authenticates the OAuth token exchange.', 'Copy the current secret; never expose it publicly.'],
    ['Redirect URI', 'YouCan sends the authorization code here.', 'Public HTTPS URL ending /api/youcan/oauth/callback.'],
    ['Scopes', 'Controls access to orders, products, customers and rest hooks.', 'Use the scopes enabled for the YouCan application.'],
    ['Default shipping estimation ID', 'Required when AI or an agent creates a YouCan order.', 'A valid sz_… or sr_… value from the store.'],
  ]},
  { page: 'AI test agent', path: '/ai-test', rows: [
    ['Store', 'Provides the catalog, orders and policies used by AI.', 'Select the exact store you want to simulate.'],
    ['Message', 'Simulates what a WhatsApp customer says.', 'Example: Bghit nchri had produit.'],
    ['Send', 'Runs the AI and displays every executed commerce tool.', 'A non-empty message and available AI quota.'],
    ['Microphone / Upload audio', 'Transcribes speech before sending it to AI.', 'Supported audio and a plan with STT enabled.'],
    ['Audio response', 'Generates speech from the AI reply.', 'A configured TTS model and plan capability.'],
  ]},
  { page: 'Templates and test messages', path: '/templates', rows: [
    ['New template', 'Creates a reusable WhatsApp message.', 'Name, event/type, language and body.'],
    ['Header / Body / Footer', 'Defines the visible message sections.', 'Use supported variables such as {customer_name} and {order_number}.'],
    ['Buttons', 'Adds quick actions such as Confirm and Cancel.', 'Short labels and valid action values.'],
    ['Preview', 'Shows the rendered message before saving.', 'Review variables and mobile readability.'],
    ['Message type', 'Selects text, image, video, audio, document, location, contact, sticker, poll, forward or buttons.', 'Complete the fields shown for the selected type.'],
    ['Recipient', 'Chooses the test customer or group.', 'Search contacts or enter an international number.'],
    ['Send test', 'Sends a real WhatsApp message.', 'Connected session, recipient and valid content.'],
  ]},
  { page: 'Chats and human support', path: '/chats', rows: [
    ['New chat', 'Starts a conversation with a number not already listed.', 'International customer number.'],
    ['Customer', 'Opens orders, products and support context.', 'Available for individual customer chats.'],
    ['Take over', 'Pauses AI for the complete customer conversation.', 'Use before a human agent sends a reply.'],
    ['Resume AI', 'Returns the conversation to automation.', 'Resolve or document the current human issue first.'],
    ['Reminder / Summary / PDF', 'Sends order assistance to the customer.', 'Select the relevant customer order.'],
    ['Send product', 'Sends catalog information and optionally its image.', 'Select a product from the correct store.'],
    ['Create order', 'Creates and confirms a real provider order.', 'Product, variant, quantity, name, phone and complete shipping address.'],
    ['Confirm / Cancel order', 'Updates the provider and local status.', 'Review the order number and confirmation dialog.'],
    ['Edit address', 'Updates shipping information in the provider.', 'Name, address, city, country and optional postal code.'],
    ['Issue / Priority / Tags', 'Organizes the human support queue.', 'Internal summary, open/resolved state, priority and useful tags.'],
  ]},
  { page: 'Campaigns, webhooks and billing', path: '/campaigns', rows: [
    ['Create campaign', 'Queues one message for an eligible customer audience.', 'Name, session, message/template, delay and exclusions.'],
    ['Exclude number', 'Prevents a selected contact from receiving the campaign.', 'Choose from the audience or enter the normalized number.'],
    ['Start campaign', 'Begins queued delivery with safety limits.', 'Review audience size, plan quota and risk first.'],
    ['Create webhook', 'Sends SmartConfirm events to another application.', 'HTTPS endpoint, event list, secret and optional filters.'],
    ['Test webhook', 'Sends a test payload to verify the endpoint.', 'A saved active webhook URL.'],
    ['Upgrade plan', 'Starts Stripe or PayPal checkout.', 'Select plan and payment provider.'],
    ['Manage subscription', 'Changes renewal, cancellation or billing details.', 'An active paid subscription.'],
  ]},
];

export function Guide() {
  useDocumentTitle('Setup guide');
  const { data: sessions = [] } = useSessionsQuery();
  const { data: stores = [] } = useStoresQuery();
  const connected = sessions.some(session => session.status === 'ready');
  const storeConnected = stores.some(store => store.status === 'active' && Boolean(store.settings?.connected));
  const completed = [connected, storeConnected].filter(Boolean).length;
  const [referenceSearch, setReferenceSearch] = useState('');
  const filteredReference = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase();
    if (!query) return actionReference;
    return actionReference.map(group => ({ ...group, rows: group.rows.filter(row => `${group.page} ${row.join(' ')}`.toLowerCase().includes(query)) })).filter(group => group.rows.length);
  }, [referenceSearch]);

  return <div className="guide-page">
    <PageHeader title="SmartConfirm guide" subtitle="A complete step-by-step guide from the first WhatsApp connection to daily customer support" actions={<button className="btn-primary" onClick={() => window.dispatchEvent(new Event(START_PRODUCT_TOUR_EVENT))}><PlayCircle size={18} /> Start interactive tour</button>} />
    <section className="guide-progress-card"><div><strong>Initial setup</strong><span>{completed} of 2 essential connections ready</span></div><div className="guide-progress"><i style={{ width: `${completed * 50}%` }} /></div><div className="guide-essential"><span>{connected ? <Check size={16} /> : <Circle size={16} />} WhatsApp connected</span><span>{storeConnected ? <Check size={16} /> : <Circle size={16} />} Store connected</span></div></section>
    <nav className="guide-index" aria-label="Guide contents">{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav>
    <div className="guide-sections">{sections.map(({ id, icon: Icon, title, path, action, steps }) => <section id={id} className="guide-section" key={id}><header><span><Icon size={21} /></span><div><h2>{title}</h2><p>{steps[0]}</p></div></header><ol>{steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol><Link to={path}>{action} →</Link></section>)}</div>
    <section className="guide-reference"><header><div><h2>Complete button and field reference</h2><p>Search any page, button or required field to understand what it does and what value to enter.</p></div><label><Search size={17} /><input value={referenceSearch} onChange={event => setReferenceSearch(event.target.value)} placeholder="Search actions, fields, Shopify, address…" /></label></header><div className="guide-reference-groups">{filteredReference.map(group => <details key={group.page} open={Boolean(referenceSearch)}><summary><span>{group.page}</span><b>{group.rows.length} actions</b></summary><div className="guide-reference-table">{group.rows.map(([action, purpose, required]) => <article key={`${group.page}-${action}`}><strong>{action}</strong><p>{purpose}</p><div><small>What to provide</small><span>{required}</span></div></article>)}</div><Link to={group.path}>Open page →</Link></details>)}</div>{filteredReference.length === 0 && <p className="guide-reference-empty">No matching action. Try another keyword.</p>}</section>
    <section className="guide-help"><ContactRound size={24} /><div><strong>Recommended first success</strong><p>Connect WhatsApp, connect one store, send a test message, then create a test order and confirm it from WhatsApp.</p></div></section>
  </div>;
}
