import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UserRole } from '../types/role';
import './ProductTour.css';

const STORAGE_PREFIX = 'smartconfirm_product_tour_v1';
export const START_PRODUCT_TOUR_EVENT = 'smartconfirm:start-product-tour';

type Copy = { title: string; body: string };
type Step = Copy & { selector?: string; path?: string };

const copy: Record<'en' | 'fr' | 'ar', { steps: Copy[]; skip: string; back: string; next: string; finish: string }> = {
  en: {
    steps: [
      { title: 'Welcome to SmartConfirm', body: 'Let’s configure your commerce automation workspace. This tour only takes about one minute.' },
      { title: 'Your dashboard', body: 'Monitor messages, confirmations, AI usage, connected stores and WhatsApp device health.' },
      { title: 'Connect WhatsApp', body: 'Create your first WhatsApp session and scan the QR code. Every store can use a selected connected session.' },
      { title: 'Connect your store', body: 'Install Shopify, WooCommerce or YouCan, then sync products and orders.' },
      { title: 'Configure and test AI', body: 'Test natural customer conversations and commerce tools before enabling automation.' },
      { title: 'Prepare message templates', body: 'Customize order, confirmation, delivery and support messages.' },
      { title: 'Send a safe test', body: 'Verify the selected WhatsApp session and message format before contacting customers.' },
      { title: 'Support customers', body: 'View conversations, take over from AI, inspect orders and create provider orders from one workspace.' },
    ],
    skip: 'Skip tour', back: 'Back', next: 'Next', finish: 'Finish setup',
  },
  fr: {
    steps: [
      { title: 'Bienvenue sur SmartConfirm', body: 'Configurons votre espace d’automatisation commerciale. Cette visite prend environ une minute.' },
      { title: 'Votre tableau de bord', body: 'Suivez les messages, confirmations, usages IA, boutiques et appareils WhatsApp.' },
      { title: 'Connectez WhatsApp', body: 'Créez votre première session et scannez le QR code. Chaque boutique utilise une session connectée.' },
      { title: 'Connectez votre boutique', body: 'Installez Shopify, WooCommerce ou YouCan, puis synchronisez produits et commandes.' },
      { title: 'Configurez et testez l’IA', body: 'Testez les conversations et outils commerciaux avant d’activer l’automatisation.' },
      { title: 'Préparez les modèles', body: 'Personnalisez les messages de commande, confirmation, livraison et support.' },
      { title: 'Envoyez un test', body: 'Vérifiez la session WhatsApp et le format du message avant de contacter vos clients.' },
      { title: 'Aidez vos clients', body: 'Consultez les conversations, reprenez la main sur l’IA et gérez les commandes depuis un seul espace.' },
    ],
    skip: 'Ignorer', back: 'Retour', next: 'Suivant', finish: 'Terminer',
  },
  ar: {
    steps: [
      { title: 'مرحباً بك في SmartConfirm', body: 'لنقم بإعداد مساحة أتمتة التجارة الخاصة بك. تستغرق الجولة حوالي دقيقة.' },
      { title: 'لوحة التحكم', body: 'تابع الرسائل والتأكيدات واستخدام الذكاء الاصطناعي والمتاجر وأجهزة واتساب.' },
      { title: 'ربط واتساب', body: 'أنشئ أول جلسة واتساب وامسح رمز QR، ثم اربط المتجر بالجلسة المناسبة.' },
      { title: 'ربط المتجر', body: 'اربط Shopify أو WooCommerce أو YouCan ثم زامن المنتجات والطلبات.' },
      { title: 'إعداد واختبار الذكاء الاصطناعي', body: 'اختبر المحادثات وأدوات التجارة قبل تفعيل الأتمتة.' },
      { title: 'قوالب الرسائل', body: 'خصص رسائل الطلب والتأكيد والتوصيل ودعم العملاء.' },
      { title: 'إرسال رسالة اختبار', body: 'تحقق من جلسة واتساب وشكل الرسالة قبل التواصل مع العملاء.' },
      { title: 'دعم العملاء', body: 'شاهد المحادثات واستلمها من الذكاء الاصطناعي وأدر الطلبات من مساحة واحدة.' },
    ],
    skip: 'تخطي', back: 'السابق', next: 'التالي', finish: 'إنهاء الإعداد',
  },
};

const definitions = [
  {},
  { selector: '[data-tour="nav-dashboard"]', path: '/' },
  { selector: '[data-tour="session-create"]', path: '/sessions' },
  { selector: '[data-tour="store-create"]', path: '/stores' },
  { selector: '[data-tour="ai-test-workspace"]', path: '/ai-test' },
  { selector: '[data-tour="template-create"]', path: '/templates' },
  { selector: '[data-tour="message-tester-compose"]', path: '/message-tester' },
  { selector: '[data-tour="chat-workspace"]', path: '/chats' },
] as const;

function tourStorageKey(): string {
  const token = localStorage.getItem('smartConfirm_access_token') ?? '';
  let actor = '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    actor = String(payload.sub ?? payload.userId ?? payload.id ?? '');
  } catch {
    // Non-JWT legacy tokens still receive a stable, non-secret browser-local scope.
  }
  if (!actor) {
    let hash = 2166136261;
    for (const char of token) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    actor = (hash >>> 0).toString(36);
  }
  return `${STORAGE_PREFIX}:${actor || 'user'}`;
}

export function ProductTour({ role }: { role: UserRole | null }) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<DOMRect | null>(null);
  const language = i18n.resolvedLanguage?.startsWith('ar') ? 'ar' : i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';
  const content = copy[language];
  const storageKey = useMemo(tourStorageKey, []);
  const steps = useMemo<Step[]>(() => content.steps.map((item, position) => ({ ...item, ...definitions[position] })), [content]);

  const measure = useCallback(() => {
    const selector = steps[index]?.selector;
    const element = selector ? document.querySelector<HTMLElement>(selector) : null;
    if (!element) return setTarget(null);
    const rect = element.getBoundingClientRect();
    setTarget(rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth ? rect : null);
  }, [index, steps]);

  useEffect(() => {
    if (role !== 'operator' || localStorage.getItem(storageKey) === 'completed') return;
    const timer = window.setTimeout(() => setOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [role, storageKey]);

  useEffect(() => {
    const restart = () => { if (role === 'operator') { setIndex(0); setOpen(true); } };
    window.addEventListener(START_PRODUCT_TOUR_EVENT, restart);
    return () => window.removeEventListener(START_PRODUCT_TOUR_EVENT, restart);
  }, [role]);

  useEffect(() => {
    if (!open) return;
    const path = steps[index]?.path;
    if (path && location.pathname !== path) navigate(path);
    const timer = window.setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, index, location.pathname, measure, navigate, steps]);

  if (!open || role !== 'operator') return null;
  const step = steps[index];
  const close = () => { localStorage.setItem(storageKey, 'completed'); setOpen(false); };
  const tooltipStyle = target
    ? { top: Math.min(window.innerHeight - 260, Math.max(16, target.top)), left: Math.min(window.innerWidth - 370, Math.max(16, target.right + 18)) }
    : undefined;

  return createPortal(<div className="product-tour-layer" dir={language === 'ar' ? 'rtl' : 'ltr'}>
    <div className="product-tour-dim" />
    {target && <div className="product-tour-highlight" style={{ top: target.top - 6, left: target.left - 6, width: target.width + 12, height: target.height + 12 }} />}
    <section className={`product-tour-card ${target ? 'anchored' : 'centered'}`} style={tooltipStyle} role="dialog" aria-modal="true" aria-label={step.title}>
      <header><span>{index + 1} / {steps.length}</span><button type="button" onClick={close} aria-label={content.skip}><X size={18} /></button></header>
      {index === steps.length - 1 && <CheckCircle2 className="product-tour-success" size={34} />}
      <h2>{step.title}</h2><p>{step.body}</p>
      <div className="product-tour-progress"><i style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
      <footer><button type="button" className="tour-skip" onClick={close}>{content.skip}</button><div>{index > 0 && <button type="button" onClick={() => setIndex(value => value - 1)}><ChevronLeft size={16} />{content.back}</button>}<button type="button" className="tour-next" onClick={() => index === steps.length - 1 ? close() : setIndex(value => value + 1)}>{index === steps.length - 1 ? content.finish : content.next}<ChevronRight size={16} /></button></div></footer>
    </section>
  </div>, document.body);
}
