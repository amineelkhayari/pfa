import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  CircleCheck,
  Menu,
  MessageCircle,
  MessageSquareText,
  PlugZap,
  Send,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  X,
  Zap,
} from 'lucide-react';
import './Landing.css';
import { billingApi, type BillingPlan } from '../services/api';

interface LandingProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

const features = [
  {
    icon: ShoppingBag,
    title: 'Order confirmation',
    text: 'Confirm or cancel ecommerce orders automatically and keep their status synchronized.',
  },
  {
    icon: Bot,
    title: 'Human-like AI agent',
    text: 'Answer product and order questions in the customer’s language with store context.',
  },
  {
    icon: Send,
    title: 'Smart campaigns',
    text: 'Choose customers, reuse templates, personalize messages, and track every delivery.',
  },
  {
    icon: MessageSquareText,
    title: 'Unified conversations',
    text: 'See customer chats, order context, templates, and handoff activity in one workspace.',
  },
  {
    icon: PlugZap,
    title: 'Store integrations',
    text: 'Connect Shopify and WooCommerce, import products and orders, and receive webhooks.',
  },
  {
    icon: BarChart3,
    title: 'Clear reporting',
    text: 'Monitor devices, sent and received messages, campaigns, failures, risk, and usage.',
  },
];

const faqs = [
  [
    'What is SmartConfirm?',
    'SmartConfirm connects your ecommerce store and WhatsApp so orders, customer questions, campaigns, and confirmations can be handled from one workspace.',
  ],
  [
    'Does it support Shopify and WooCommerce?',
    'Yes. You can connect stores, synchronize products and orders, receive new-order webhooks, and link each store to a WhatsApp session.',
  ],
  [
    'Can the AI talk in Darija or French?',
    'Yes. The agent can respond naturally in the customer’s language and use the relevant store, catalog, and order context.',
  ],
  [
    'Can I control who receives a campaign?',
    'Yes. Before launch, you can search customers, view their numbers and stores, and exclude any recipients you do not want to contact.',
  ],
  [
    'Do I need a credit card for the Free plan?',
    'No. Create an account and start on Free. You can upgrade to Pro when you need more stores, devices, and messages.',
  ],
];

export function Landing({ onSignIn, onSignUp }: LandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  useEffect(() => { billingApi.plans().then(setPlans).catch(() => undefined); }, []);
  return (
    <div className="landing">
      <nav className="landing-nav">
        <a className="landing-brand" href="#top">
          <span className="brand-mark">
            <MessageCircle />
          </span>
          <span>SmartConfirm</span>
        </a>
        <button className="landing-menu" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
          {menuOpen ? <X /> : <Menu />}
        </button>
        <div className={`landing-links ${menuOpen ? 'open' : ''}`}>
          <a href="#features">Features</a>
          <a href="#automation">How it works</a>
          <a href="#integrations">Integrations</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="landing-actions">
          <button className="text-action" onClick={onSignIn}>
            Sign in
          </button>
          <button className="primary-action" onClick={onSignUp}>
            Start free <ArrowRight size={16} />
          </button>
        </div>
      </nav>

      <main id="top">
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="hero-badge">
              <Zap size={14} /> WhatsApp automation for ecommerce
            </div>
            <h1>
              Turn WhatsApp conversations into <span>confirmed orders.</span>
            </h1>
            <p>
              Connect your store, automate order confirmation, help customers with AI, and run targeted campaigns—all
              from one clear workspace.
            </p>
            <div className="hero-actions">
              <button className="hero-primary" onClick={onSignUp}>
                Create free account <ArrowRight />
              </button>
              <a href="#automation" className="hero-secondary">
                See how it works
              </a>
            </div>
            <div className="hero-trust">
              <span>
                <Check /> No card required
              </span>
              <span>
                <Check /> Shopify & WooCommerce
              </span>
              <span>
                <Check /> Setup in minutes
              </span>
            </div>
          </div>
          <div className="hero-visual" aria-label="SmartConfirm product preview">
            <div className="visual-glow" />
            <div className="dashboard-shell">
              <aside>
                <div className="mini-logo">
                  <MessageCircle />
                </div>
                {[BarChart3, Smartphone, Store, MessageSquareText, Send].map((Icon, i) => (
                  <span className={i === 0 ? 'active' : ''} key={i}>
                    <Icon />
                  </span>
                ))}
              </aside>
              <div className="dash-main">
                <div className="dash-top">
                  <div>
                    <small>GOOD MORNING</small>
                    <b>WhatsApp overview</b>
                  </div>
                  <div className="avatar">MA</div>
                </div>
                <div className="mini-stats">
                  <div>
                    <span>Orders confirmed</span>
                    <strong>128</strong>
                    <em>+18.4%</em>
                  </div>
                  <div>
                    <span>Messages sent</span>
                    <strong>486</strong>
                    <em>97% delivered</em>
                  </div>
                  <div>
                    <span>Devices</span>
                    <strong>2</strong>
                    <em>All connected</em>
                  </div>
                </div>
                <div className="dash-content">
                  <div className="chart-card">
                    <div className="card-head">
                      <b>Order confirmations</b>
                      <span>Last 7 days</span>
                    </div>
                    <div className="fake-chart">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="chart-labels">
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span>Sat</span>
                      <span>Sun</span>
                    </div>
                  </div>
                  <div className="activity-card">
                    <b>Live activity</b>
                    <div>
                      <span className="activity-icon green">
                        <CircleCheck />
                      </span>
                      <p>
                        <strong>Order #1048 confirmed</strong>
                        <small>Just now · Shopify</small>
                      </p>
                    </div>
                    <div>
                      <span className="activity-icon purple">
                        <Bot />
                      </span>
                      <p>
                        <strong>AI answered a product question</strong>
                        <small>2 min · WhatsApp</small>
                      </p>
                    </div>
                    <div>
                      <span className="activity-icon orange">
                        <Send />
                      </span>
                      <p>
                        <strong>Campaign delivered</strong>
                        <small>8 min · 96 recipients</small>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-message">
              <span>
                <MessageCircle />
              </span>
              <div>
                <small>NEW CONFIRMATION</small>
                <b>Order #1048 confirmed</b>
              </div>
              <CircleCheck />
            </div>
          </div>
        </section>

        <section className="logo-strip">
          <p>Made for ecommerce teams using</p>
          <div>
            <span>SHOPIFY</span>
            <span>Woo</span>
            <span>WhatsApp</span>
            <span>OpenRouter</span>
            <span>Gemini</span>
          </div>
        </section>

        <section className="landing-section" id="features">
          <div className="section-heading">
            <span>ONE OPERATING SYSTEM</span>
            <h2>Everything your WhatsApp sales workflow needs</h2>
            <p>Replace disconnected tools and repetitive follow-up with an ecommerce-first automation workspace.</p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span>
                  <Icon />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
                <a href="#pricing">
                  Explore feature <ArrowRight />
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="automation-section" id="automation">
          <div className="automation-copy">
            <span className="section-tag">FROM ORDER TO CONFIRMATION</span>
            <h2>Your store works—even when your team is offline.</h2>
            <p>
              SmartConfirm reacts to store events, starts the right WhatsApp conversation, understands the reply, and
              writes the result back to your commerce platform.
            </p>
            <ul>
              <li>
                <CircleCheck /> New orders trigger the confirmation workflow
              </li>
              <li>
                <CircleCheck /> AI answers natural follow-up questions
              </li>
              <li>
                <CircleCheck /> Confirmed and cancelled statuses stay synchronized
              </li>
              <li>
                <CircleCheck /> Complex conversations can be handed to a person
              </li>
            </ul>
            <button className="primary-action large" onClick={onSignUp}>
              Automate my store <ArrowRight />
            </button>
          </div>
          <div className="flow-card">
            <div className="flow-step">
              <span className="shopify-node">
                <ShoppingBag />
              </span>
              <div>
                <small>01 · STORE EVENT</small>
                <b>New order received</b>
                <p>Order #1052 · 885.95 MAD</p>
              </div>
              <em>Live</em>
            </div>
            <div className="flow-line">
              <i />
            </div>
            <div className="flow-step focus">
              <span>
                <MessageCircle />
              </span>
              <div>
                <small>02 · WHATSAPP</small>
                <b>Confirmation sent</b>
                <p>Personalized in the customer’s language</p>
              </div>
              <em>4s</em>
            </div>
            <div className="flow-line">
              <i />
            </div>
            <div className="flow-step">
              <span className="ai-node">
                <Bot />
              </span>
              <div>
                <small>03 · AI DECISION</small>
                <b>Customer confirmed</b>
                <p>Status and conversation saved</p>
              </div>
              <em>Done</em>
            </div>
          </div>
        </section>

        <section className="integration-section" id="integrations">
          <div className="section-heading">
            <span>CONNECTED COMMERCE</span>
            <h2>Your store, WhatsApp, and AI—working together</h2>
            <p>Use one standardized automation layer across commerce providers and AI models.</p>
          </div>
          <div className="integration-canvas">
            <div className="integration-side">
              <article>
                <ShoppingBag />
                <div>
                  <b>Shopify</b>
                  <small>Orders, products, customers</small>
                </div>
              </article>
              <article>
                <Store />
                <div>
                  <b>WooCommerce</b>
                  <small>Webhooks and store sync</small>
                </div>
              </article>
            </div>
            <div className="connector left" />
            <div className="integration-core">
              <MessageCircle />
              <b>SmartConfirm</b>
              <small>Automation workspace</small>
            </div>
            <div className="connector right" />
            <div className="integration-side">
              <article>
                <Bot />
                <div>
                  <b>OpenAI & OpenRouter</b>
                  <small>Natural conversations</small>
                </div>
              </article>
              <article>
                <Zap />
                <div>
                  <b>Gemini & more</b>
                  <small>Provider-independent AI</small>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="campaign-showcase">
          <div className="campaign-preview">
            <div className="campaign-preview-head">
              <div>
                <small>CAMPAIGN REPORT</small>
                <b>Summer customer offer</b>
              </div>
              <span>Running</span>
            </div>
            <div className="campaign-numbers">
              <div>
                <strong>312</strong>
                <small>Recipients</small>
              </div>
              <div>
                <strong>94%</strong>
                <small>Delivered</small>
              </div>
              <div>
                <strong>18</strong>
                <small>Replies</small>
              </div>
            </div>
            <div className="delivery-bar">
              <i />
            </div>
            <div className="recipient-row">
              <span className="checked">
                <Check />
              </span>
              <p>
                <b>Mohammed Amine</b>
                <small>+212 673 518 365 · Shopify</small>
              </p>
              <em>Sent</em>
            </div>
            <div className="recipient-row">
              <span className="checked">
                <Check />
              </span>
              <p>
                <b>Sarah Benali</b>
                <small>+212 612 345 678 · WooCommerce</small>
              </p>
              <em>Delivered</em>
            </div>
          </div>
          <div className="showcase-copy">
            <span className="section-tag">CAMPAIGNS WITH CONTROL</span>
            <h2>Reach the right customers, not just every number.</h2>
            <p>
              Preview your audience, exclude contacts, choose a template, personalize customer fields, control timing,
              and watch delivery health live.
            </p>
            <div className="check-grid">
              <span>
                <Check /> Customer selection
              </span>
              <span>
                <Check /> Saved templates
              </span>
              <span>
                <Check /> Personal variables
              </span>
              <span>
                <Check /> Risk monitoring
              </span>
            </div>
          </div>
        </section>

        <section className="pricing-section" id="pricing">
          <div className="section-heading">
            <span>SIMPLE PRICING</span>
            <h2>Start free. Upgrade when you grow.</h2>
            <p>No complicated tiers. Both plans include the core ecommerce automation workspace.</p>
          </div>
          <div className="pricing-grid">
            {(plans.length ? plans : [{ id: 'free', slug: 'free', name: 'Free', description: 'Try your first workflows.', priceMonthly: 0, currency: 'USD', limits: { sessions: 1, stores: 1, sentMessages: 20, receivedMessages: 20, aiTokens: 5000 }, features: ['WhatsApp commerce automation', 'AI order assistant'], trialDays: 1, active: true, highlighted: false, sortOrder: 0, stripePriceId: null, paypalPlanId: null }]).map(plan => <article className={plan.highlighted ? 'featured' : ''} key={plan.id}>
              {plan.highlighted && <div className="popular">MOST POPULAR</div>}
              <div className="price-head"><div><h3>{plan.name}</h3><p>{plan.description}</p></div><strong>{new Intl.NumberFormat('en', { style: 'currency', currency: plan.currency, maximumFractionDigits: 2 }).format(plan.priceMonthly / 100)}<small>/month</small></strong></div>
              <button onClick={onSignUp}>{plan.priceMonthly ? `Choose ${plan.name}` : 'Start free'} <ArrowRight /></button>
              <ul>{plan.features.map(feature => <li key={feature}><Check/> {feature}</li>)}<li><Check/> {plan.limits.sessions} WhatsApp session{plan.limits.sessions === 1 ? '' : 's'}</li><li><Check/> {plan.limits.stores} ecommerce store{plan.limits.stores === 1 ? '' : 's'}</li><li><Check/> {plan.limits.sentMessages.toLocaleString()} sent messages</li><li><Check/> {plan.limits.aiTokens.toLocaleString()} AI tokens</li></ul>
            </article>)}
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="faq-title">
            <span className="section-tag">FAQ</span>
            <h2>Questions before you connect?</h2>
            <p>Everything you need to know before launching your first WhatsApp automation.</p>
            <button className="text-link" onClick={onSignUp}>
              Start free today <ArrowRight />
            </button>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a], i) => (
              <article className={openFaq === i ? 'open' : ''} key={q}>
                <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                  <span>{q}</span>
                  <ChevronDown />
                </button>
                {openFaq === i && <p>{a}</p>}
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <div>
            <span>
              <ShieldCheck /> Built for clear, controlled communication
            </span>
            <h2>Ready to confirm more orders with less manual work?</h2>
            <p>Connect your first WhatsApp session and ecommerce store today.</p>
          </div>
          <button onClick={onSignUp}>
            Create your free account <ArrowRight />
          </button>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="footer-top">
          <div>
            <a className="landing-brand" href="#top">
              <span className="brand-mark">
                <MessageCircle />
              </span>
              <span>SmartConfirm</span>
            </a>
            <p>WhatsApp order confirmation, AI support, and campaigns for ecommerce.</p>
          </div>
          <div>
            <b>Product</b>
            <a href="#features">Features</a>
            <a href="#automation">Automation</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div>
            <b>Integrations</b>
            <a href="#integrations">Shopify</a>
            <a href="#integrations">WooCommerce</a>
            <a href="#integrations">AI providers</a>
          </div>
          <div>
            <b>Account</b>
            <button onClick={onSignIn}>Sign in</button>
            <button onClick={onSignUp}>Create account</button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 SmartConfirm. All rights reserved.</span>
          <span>Designed for ecommerce teams in Morocco and beyond.</span>
        </div>
      </footer>
    </div>
  );
}
