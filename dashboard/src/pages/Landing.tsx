import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  AudioLines,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  CircleCheck,
  Menu,
  MessageCircle,
  MessageSquareText,
  Moon,
  Languages,
  PlugZap,
  Send,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Sun,
  WalletCards,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import './Landing.css';
import { billingApi, type BillingPlan } from '../services/api';
import { landingCopy, landingLanguage, type LandingLanguage } from './landing-copy';
import { useTheme } from '../hooks/useTheme';

interface LandingProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

const featureIcons = [ShoppingBag, Bot, Send, MessageSquareText, PlugZap, BarChart3, Wrench, AudioLines, WalletCards];

export function Landing({ onSignIn, onSignUp }: LandingProps) {
  const { i18n } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const language = landingLanguage(i18n.resolvedLanguage || i18n.language);
  const copy = landingCopy[language];
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  useEffect(() => { billingApi.plans().then(setPlans).catch(() => undefined); }, []);
  const selectLanguage = (next: LandingLanguage) => void i18n.changeLanguage(next);
  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  return (
    <div className="landing" data-theme={resolvedTheme} dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
      <nav className="landing-nav">
        <a className="landing-brand" href="#top">
          <span className="brand-mark">
            <MessageCircle />
          </span>
          <span>SmartConfirm</span>
        </a>
        <button className="landing-menu" onClick={() => setMenuOpen(v => !v)} aria-label={copy.menu}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        <div className={`landing-links ${menuOpen ? 'open' : ''}`}>
          {copy.nav.map((label, index) => <a key={label} href={['#features', '#automation', '#integrations', '#pricing', '#faq'][index]}>{label}</a>)}
        </div>
        <div className="landing-actions">
          <button type="button" className="landing-theme-toggle" onClick={toggleTheme} aria-label={resolvedTheme === 'dark' ? 'Use light theme' : 'Use dark theme'} title={resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}>
            <span className="theme-toggle-track"><Sun size={15}/><Moon size={15}/><i aria-hidden="true"/></span>
          </button>
          <label className="landing-language" aria-label="Language">
            <Languages size={16} />
            <select value={language} onChange={event => selectLanguage(event.target.value as LandingLanguage)}>
              <option value="en">EN</option><option value="fr">FR</option><option value="ar">AR</option>
            </select>
          </label>
          <button className="text-action" onClick={onSignIn}>
            {copy.signIn}
          </button>
        </div>
      </nav>

      <main id="top">
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="hero-badge">
              <Zap size={14} /> {copy.badge}
            </div>
            <h1>
              {copy.heroStart} <span>{copy.heroAccent}</span>
            </h1>
            <p>
              {copy.heroText}
            </p>
            <div className="hero-actions">
              <button className="hero-primary" onClick={onSignUp}>
                {copy.signUp} <ArrowRight />
              </button>
              <a href="#automation" className="hero-secondary">
                {copy.seeHow}
              </a>
            </div>
            <div className="hero-trust">
              <span>
                <Check /> {copy.trust[0]}
              </span>
              <span>
                <Check /> {copy.trust[1]}
              </span>
              <span>
                <Check /> {copy.trust[2]}
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
          <p>{copy.madeFor}</p>
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
            <span>{copy.featureEyebrow}</span>
            <h2>{copy.featureTitle}</h2>
            <p>{copy.featureText}</p>
          </div>
          <div className="feature-grid">
            {copy.features.map(([title, text], index) => {
              const Icon = featureIcons[index];
              return (
              <article key={title}>
                <span>
                  <Icon />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
                <a href="#pricing">
                  {copy.explore} <ArrowRight />
                </a>
              </article>
              );
            })}
          </div>
        </section>

        <section className="automation-section" id="automation">
          <div className="automation-copy">
            <span className="section-tag">{copy.automationEyebrow}</span>
            <h2>{copy.automationTitle}</h2>
            <p>{copy.automationText}</p>
            <ul>
              {copy.automationPoints.map(point => <li key={point}><CircleCheck /> {point}</li>)}
            </ul>
            <button className="primary-action large" onClick={onSignUp}>
              {copy.automate} <ArrowRight />
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
            <span>{copy.integrationEyebrow}</span>
            <h2>{copy.integrationTitle}</h2>
            <p>{copy.integrationText}</p>
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
              <article>
                <Zap />
                <div>
                  <b>YouCan</b>
                  <small>OAuth, orders, products, and rest hooks</small>
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
                <b>Amine</b>
                <small>+212 777 000 777 · Shopify</small>
              </p>
              <em>Sent</em>
            </div>
            <div className="recipient-row">
              <span className="checked">
                <Check />
              </span>
              <p>
                <b> mohammed</b>
                <small>+212 000 777 000 · WooCommerce</small>
              </p>
              <em>Delivered</em>
            </div>
          </div>
          <div className="showcase-copy">
            <span className="section-tag">{copy.campaignEyebrow}</span>
            <h2>{copy.campaignTitle}</h2>
            <p>{copy.campaignText}</p>
            <div className="check-grid">
              {copy.campaignPoints.map(point => <span key={point}><Check /> {point}</span>)}
            </div>
          </div>
        </section>

        <section className="pricing-section" id="pricing">
          <div className="section-heading">
            <span>{copy.pricingEyebrow}</span>
            <h2>{copy.pricingTitle}</h2>
            <p>{copy.pricingText}</p>
          </div>
          <div className="pricing-grid">
            {(plans.length ? plans : [{ id: 'free', slug: 'free', name: 'Free', description: 'Try your first workflows.', priceMonthly: 0, currency: 'USD', limits: { sessions: 1, stores: 1, sentMessages: 20, receivedMessages: 20, aiTokens: 5000, audioTranscriptions: 0, audioReplies: 0 }, features: ['WhatsApp commerce automation', 'AI order assistant'], trialDays: 1, active: true, highlighted: false, sortOrder: 0, stripePriceId: null, paypalPlanId: null }]).map(plan => <article className={plan.highlighted ? 'featured' : ''} key={plan.id}>
              {plan.highlighted && <div className="popular">{copy.popular}</div>}
              <div className="price-head"><div><h3>{plan.name}</h3><p>{plan.description}</p></div><strong>{new Intl.NumberFormat(language, { style: 'currency', currency: plan.currency, maximumFractionDigits: 2 }).format(plan.priceMonthly / 100)}<small>{copy.month}</small></strong></div>
              <button onClick={onSignUp}>{plan.priceMonthly ? `${copy.choose} ${plan.name}` : copy.startFree} <ArrowRight /></button>
              <ul>{plan.features.map(feature => <li key={feature}><Check/> {feature}</li>)}<li><Check/> {plan.limits.sessions} {plan.limits.sessions === 1 ? copy.session : copy.sessions}</li><li><Check/> {plan.limits.stores} {plan.limits.stores === 1 ? copy.store : copy.stores}</li><li><Check/> {plan.limits.sentMessages.toLocaleString(language)} {copy.sent}</li><li><Check/> {plan.limits.aiTokens.toLocaleString(language)} {copy.tokens}</li></ul>
            </article>)}
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="faq-title">
            <span className="section-tag">FAQ</span>
            <h2>{copy.faqTitle}</h2>
            <p>{copy.faqText}</p>
            <button className="text-link" onClick={onSignUp}>
              {copy.startToday} <ArrowRight />
            </button>
          </div>
          <div className="faq-list">
            {copy.faqs.map(([q, a], i) => (
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
              <ShieldCheck /> {copy.safe}
            </span>
            <h2>{copy.finalTitle}</h2>
            <p>{copy.finalText}</p>
          </div>
          <button onClick={onSignUp}>
            {copy.signUp} <ArrowRight />
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
            <p>{copy.footerText}</p>
          </div>
          <div>
            <b>{copy.product}</b>
            <a href="#features">{copy.nav[0]}</a>
            <a href="#automation">{copy.automation}</a>
            <a href="#pricing">{copy.nav[3]}</a>
          </div>
          <div>
            <b>{copy.nav[2]}</b>
            <a href="#integrations">Shopify</a>
            <a href="#integrations">WooCommerce</a>
            <a href="#integrations">AI providers</a>
          </div>
          <div>
            <b>{copy.account}</b>
            <button onClick={onSignIn}>{copy.signIn}</button>
            <button onClick={onSignUp}>{copy.createAccount}</button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 SmartConfirm. {copy.rights}</span>
        </div>
      </footer>
    </div>
  );
}
