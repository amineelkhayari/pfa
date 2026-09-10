export type LandingLanguage = 'en' | 'fr' | 'ar';

const en = {
  nav: ['Features', 'How it works', 'Integrations', 'Pricing', 'FAQ'],
  signIn: 'Sign in', signUp: 'Create free account', menu: 'Toggle menu',
  badge: 'WhatsApp automation for ecommerce',
  heroStart: 'Turn WhatsApp conversations into', heroAccent: 'confirmed orders.',
  heroText: 'Connect your store, automate order confirmation, help customers with AI, and run targeted campaigns—all from one clear workspace.',
  seeHow: 'See how it works', trust: ['No card required', 'Shopify, WooCommerce & YouCan', 'Setup in minutes'],
  madeFor: 'Made for ecommerce teams using',
  featureEyebrow: 'ONE OPERATING SYSTEM', featureTitle: 'Everything your WhatsApp sales workflow needs',
  featureText: 'Replace disconnected tools and repetitive follow-up with an ecommerce-first automation workspace.', explore: 'Explore feature',
  features: [
    ['Order confirmation', 'Confirm or cancel ecommerce orders automatically and keep their status synchronized.'],
    ['Human-like AI agent', 'Answer product and order questions in the customer’s language with store context.'],
    ['Smart campaigns', 'Choose customers, reuse templates, personalize messages, and track every delivery.'],
    ['Unified conversations', 'See customer chats, order context, templates, and handoff activity in one workspace.'],
    ['Store integrations', 'Connect Shopify, WooCommerce, and YouCan; synchronize products, orders, customers, and webhooks.'],
    ['Clear reporting', 'Monitor devices, sent and received messages, campaigns, failures, risk, and usage.'],
    ['Action-taking AI', 'Let the AI search products and orders, create or update orders, change addresses, and synchronize verified actions.'],
    ['Voice conversations', 'Transcribe customer voice notes and answer with text or generated audio when the plan allows it.'],
    ['Plans and usage control', 'Manage trials, subscriptions, message and AI quotas, audio allowances, Stripe, and PayPal.'],
  ],
  automationEyebrow: 'FROM ORDER TO CONFIRMATION', automationTitle: 'Your store works—even when your team is offline.',
  automationText: 'SmartConfirm reacts to store events, starts the right WhatsApp conversation, understands the reply, and writes the result back to your commerce platform.',
  automationPoints: ['New orders trigger the confirmation workflow', 'AI answers natural follow-up questions', 'Confirmed and cancelled statuses stay synchronized', 'Complex conversations can be handed to a person'],
  automate: 'Automate my store',
  integrationEyebrow: 'CONNECTED COMMERCE', integrationTitle: 'Your store, WhatsApp, and AI—working together',
  integrationText: 'Use one standardized automation layer across commerce providers and AI models.',
  campaignEyebrow: 'CAMPAIGNS WITH CONTROL', campaignTitle: 'Reach the right customers, not just every number.',
  campaignText: 'Preview your audience, exclude contacts, choose a template, personalize customer fields, control timing, and watch delivery health live.',
  campaignPoints: ['Customer selection', 'Saved templates', 'Personal variables', 'Risk monitoring'],
  pricingEyebrow: 'SIMPLE PRICING', pricingTitle: 'Start free. Upgrade when you grow.',
  pricingText: 'No complicated tiers. Every plan includes the core ecommerce automation workspace.',
  popular: 'MOST POPULAR', month: '/month', choose: 'Choose', startFree: 'Start free', session: 'WhatsApp session', sessions: 'WhatsApp sessions', store: 'ecommerce store', stores: 'ecommerce stores', sent: 'sent messages', tokens: 'AI tokens',
  faqTitle: 'Questions before you connect?', faqText: 'Everything you need to know before launching your first WhatsApp automation.', startToday: 'Start free today',
  faqs: [
    ['What is SmartConfirm?', 'SmartConfirm connects your ecommerce store and WhatsApp so orders, customer questions, campaigns, and confirmations can be handled from one workspace.'],
    ['Which ecommerce platforms are supported?', 'Shopify, WooCommerce, and YouCan are supported through a common integration layer for products, orders, customers, webhooks, and status updates.'],
    ['Can the AI talk in Darija or French?', 'Yes. The agent can respond naturally in the customer’s language and use the relevant store, catalog, and order context.'],
    ['Can I control who receives a campaign?', 'Yes. Before launch, you can search customers, view their numbers and stores, and exclude any recipients you do not want to contact.'],
    ['Do I need a credit card for the Free plan?', 'No. Create an account and start on Free. You can upgrade when you need more stores, devices, and messages.'],
    ['Can customers send voice notes?', 'Yes. When enabled by the plan, SmartConfirm can transcribe voice notes and reply naturally with text or generated audio.'],
  ],
  safe: 'Built for clear, controlled communication', finalTitle: 'Ready to confirm more orders with less manual work?', finalText: 'Connect your first WhatsApp session and ecommerce store today.',
  footerText: 'WhatsApp order confirmation, AI support, and campaigns for ecommerce.', product: 'Product', automation: 'Automation', account: 'Account', createAccount: 'Create account', rights: 'All rights reserved.',
};

export type LandingCopy = typeof en;

const fr: LandingCopy = {
  ...en,
  nav: ['Fonctionnalités', 'Fonctionnement', 'Intégrations', 'Tarifs', 'FAQ'], signIn: 'Se connecter', signUp: 'Créer un compte gratuit', menu: 'Ouvrir le menu',
  badge: 'Automatisation WhatsApp pour le e-commerce', heroStart: 'Transformez vos conversations WhatsApp en', heroAccent: 'commandes confirmées.',
  heroText: 'Connectez votre boutique, automatisez la confirmation des commandes, assistez vos clients avec l’IA et lancez des campagnes ciblées depuis un espace unique.',
  seeHow: 'Voir comment ça marche', trust: ['Aucune carte requise', 'Shopify, WooCommerce et YouCan', 'Installation en quelques minutes'], madeFor: 'Conçu pour les équipes e-commerce utilisant',
  featureEyebrow: 'UN SEUL ESPACE DE TRAVAIL', featureTitle: 'Tout ce dont votre activité commerciale WhatsApp a besoin', featureText: 'Remplacez les outils dispersés et les relances répétitives par un espace d’automatisation pensé pour le e-commerce.', explore: 'Découvrir',
  features: [['Confirmation des commandes', 'Confirmez ou annulez automatiquement les commandes et synchronisez leur statut.'], ['Agent IA naturel', 'Répondez aux questions sur les produits et commandes dans la langue du client.'], ['Campagnes intelligentes', 'Sélectionnez les clients, réutilisez vos modèles et suivez chaque livraison.'], ['Conversations unifiées', 'Regroupez discussions, commandes, modèles et transferts vers un conseiller.'], ['Intégrations boutiques', 'Connectez Shopify, WooCommerce et YouCan, puis synchronisez produits, commandes, clients et webhooks.'], ['Rapports clairs', 'Suivez les appareils, messages, campagnes, erreurs, risques et quotas.'], ['IA capable d’agir', 'L’IA peut rechercher, créer et modifier des commandes, changer une adresse et synchroniser chaque action vérifiée.'], ['Conversations vocales', 'Transcrivez les notes vocales et répondez par texte ou audio généré selon les droits du forfait.'], ['Forfaits et quotas', 'Gérez essais, abonnements, quotas de messages et d’IA, audio, Stripe et PayPal.']],
  automationEyebrow: 'DE LA COMMANDE À LA CONFIRMATION', automationTitle: 'Votre boutique travaille même lorsque votre équipe est absente.', automationText: 'SmartConfirm réagit aux événements de la boutique, démarre la bonne conversation WhatsApp, comprend la réponse et synchronise le résultat.', automationPoints: ['Les nouvelles commandes déclenchent la confirmation', 'L’IA répond aux questions complémentaires', 'Les statuts confirmés et annulés restent synchronisés', 'Les conversations complexes sont transférées à un conseiller'], automate: 'Automatiser ma boutique',
  integrationEyebrow: 'COMMERCE CONNECTÉ', integrationTitle: 'Votre boutique, WhatsApp et l’IA travaillent ensemble', integrationText: 'Utilisez une couche d’automatisation standardisée pour vos plateformes et modèles IA.',
  campaignEyebrow: 'CAMPAGNES MAÎTRISÉES', campaignTitle: 'Contactez les bons clients, pas simplement tous les numéros.', campaignText: 'Prévisualisez votre audience, excluez des contacts, choisissez un modèle, personnalisez les champs et suivez la livraison.', campaignPoints: ['Sélection des clients', 'Modèles enregistrés', 'Variables personnalisées', 'Suivi des risques'],
  pricingEyebrow: 'TARIFS SIMPLES', pricingTitle: 'Commencez gratuitement. Évoluez avec votre activité.', pricingText: 'Aucune formule compliquée. Chaque offre inclut l’espace principal d’automatisation e-commerce.', popular: 'LE PLUS POPULAIRE', month: '/mois', choose: 'Choisir', startFree: 'Commencer gratuitement', session: 'session WhatsApp', sessions: 'sessions WhatsApp', store: 'boutique e-commerce', stores: 'boutiques e-commerce', sent: 'messages envoyés', tokens: 'jetons IA',
  faqTitle: 'Des questions avant de vous connecter ?', faqText: 'Tout ce qu’il faut savoir avant de lancer votre première automatisation WhatsApp.', startToday: 'Commencer gratuitement',
  faqs: [['Qu’est-ce que SmartConfirm ?', 'SmartConfirm relie votre boutique e-commerce à WhatsApp pour gérer commandes, questions, campagnes et confirmations dans un seul espace.'], ['Quelles plateformes e-commerce sont prises en charge ?', 'Shopify, WooCommerce et YouCan utilisent une couche commune pour les produits, commandes, clients, webhooks et mises à jour de statut.'], ['L’IA peut-elle parler en darija ou en français ?', 'Oui. L’agent répond naturellement dans la langue du client avec le contexte de la boutique, du catalogue et des commandes.'], ['Puis-je contrôler les destinataires d’une campagne ?', 'Oui. Recherchez les clients, consultez leurs numéros et excluez les destinataires avant le lancement.'], ['Une carte bancaire est-elle nécessaire pour l’offre gratuite ?', 'Non. Créez votre compte gratuitement et passez à une offre supérieure lorsque vous avez besoin de plus de capacité.'], ['Les clients peuvent-ils envoyer des messages vocaux ?', 'Oui. Lorsque le forfait le permet, SmartConfirm transcrit les notes vocales et répond naturellement par texte ou audio généré.']],
  safe: 'Une communication claire et maîtrisée', finalTitle: 'Prêt à confirmer davantage de commandes avec moins de travail manuel ?', finalText: 'Connectez dès aujourd’hui votre première session WhatsApp et votre boutique.', footerText: 'Confirmation WhatsApp, assistance IA et campagnes pour le e-commerce.', product: 'Produit', automation: 'Automatisation', account: 'Compte', createAccount: 'Créer un compte', rights: 'Tous droits réservés.',
};

const ar: LandingCopy = {
  ...en,
  nav: ['المميزات', 'كيف يعمل', 'التكاملات', 'الأسعار', 'الأسئلة'], signIn: 'تسجيل الدخول', signUp: 'إنشاء حساب مجاني', menu: 'فتح القائمة',
  badge: 'أتمتة واتساب للتجارة الإلكترونية', heroStart: 'حوّل محادثات واتساب إلى', heroAccent: 'طلبات مؤكدة.', heroText: 'اربط متجرك، وأتمت تأكيد الطلبات، وساعد العملاء بالذكاء الاصطناعي، وأطلق حملات مستهدفة من مساحة عمل واحدة.', seeHow: 'اكتشف كيف يعمل', trust: ['لا تحتاج إلى بطاقة', 'Shopify وWooCommerce وYouCan', 'إعداد خلال دقائق'], madeFor: 'مصمم لفرق التجارة الإلكترونية التي تستخدم',
  featureEyebrow: 'نظام عمل واحد', featureTitle: 'كل ما تحتاجه مبيعاتك عبر واتساب', featureText: 'استبدل الأدوات المتفرقة والمتابعة اليدوية بمنصة أتمتة مصممة للتجارة الإلكترونية.', explore: 'اكتشف الميزة', features: [['تأكيد الطلبات', 'أكد أو ألغِ الطلبات تلقائياً مع مزامنة حالتها.'], ['وكيل ذكاء اصطناعي طبيعي', 'أجب عن أسئلة المنتجات والطلبات بلغة العميل وبسياق المتجر.'], ['حملات ذكية', 'اختر العملاء واستخدم القوالب وخصص الرسائل وتابع التسليم.'], ['محادثات موحدة', 'شاهد المحادثات والطلبات والقوالب والتحويل للموظف في مكان واحد.'], ['تكامل المتاجر', 'اربط Shopify وWooCommerce وYouCan وزامن المنتجات والطلبات والعملاء والويب هوك.'], ['تقارير واضحة', 'راقب الأجهزة والرسائل والحملات والأخطاء والمخاطر والاستخدام.'], ['ذكاء اصطناعي ينفذ الإجراءات', 'يمكن للوكيل البحث وإنشاء الطلبات وتعديلها وتغيير العنوان ومزامنة الإجراءات الموثقة.'], ['محادثات صوتية', 'حوّل الرسائل الصوتية إلى نص وأجب بنص أو بصوت مولد عندما تسمح الخطة.'], ['إدارة الخطط والحصص', 'أدر التجارب والاشتراكات وحصص الرسائل والذكاء الاصطناعي والصوت وStripe وPayPal.']],
  automationEyebrow: 'من الطلب إلى التأكيد', automationTitle: 'متجرك يعمل حتى عندما يكون فريقك غير متصل.', automationText: 'يتفاعل SmartConfirm مع أحداث المتجر ويبدأ محادثة واتساب المناسبة ويفهم الرد ثم يزامن النتيجة.', automationPoints: ['الطلبات الجديدة تبدأ مسار التأكيد', 'الذكاء الاصطناعي يجيب عن الأسئلة', 'حالات التأكيد والإلغاء تبقى متزامنة', 'يمكن تحويل المحادثات المعقدة إلى موظف'], automate: 'أتمتة متجري',
  integrationEyebrow: 'تجارة مترابطة', integrationTitle: 'متجرك وواتساب والذكاء الاصطناعي يعملون معاً', integrationText: 'استخدم طبقة أتمتة موحدة عبر منصات التجارة ومزودي الذكاء الاصطناعي.', campaignEyebrow: 'حملات تحت السيطرة', campaignTitle: 'تواصل مع العملاء المناسبين، وليس كل الأرقام.', campaignText: 'عاين جمهورك واستبعد جهات الاتصال واختر قالباً وخصص البيانات وتابع صحة التسليم مباشرة.', campaignPoints: ['اختيار العملاء', 'قوالب محفوظة', 'متغيرات شخصية', 'مراقبة المخاطر'],
  pricingEyebrow: 'أسعار بسيطة', pricingTitle: 'ابدأ مجاناً وطوّر خطتك مع نموك.', pricingText: 'لا توجد خطط معقدة. كل خطة تشمل مساحة الأتمتة الأساسية.', popular: 'الأكثر شعبية', month: '/شهرياً', choose: 'اختر', startFree: 'ابدأ مجاناً', session: 'جلسة واتساب', sessions: 'جلسات واتساب', store: 'متجر إلكتروني', stores: 'متاجر إلكترونية', sent: 'رسالة مرسلة', tokens: 'رمز ذكاء اصطناعي',
  faqTitle: 'لديك أسئلة قبل الربط؟', faqText: 'كل ما تحتاج معرفته قبل إطلاق أول أتمتة واتساب.', startToday: 'ابدأ مجاناً اليوم', faqs: [['ما هو SmartConfirm؟', 'يربط SmartConfirm متجرك بواتساب لإدارة الطلبات والأسئلة والحملات والتأكيدات من مكان واحد.'], ['ما منصات التجارة المدعومة؟', 'يدعم SmartConfirm كلاً من Shopify وWooCommerce وYouCan عبر طبقة مشتركة للمنتجات والطلبات والعملاء والويب هوك والحالات.'], ['هل يستطيع الذكاء الاصطناعي التحدث بالدارجة أو الفرنسية؟', 'نعم. يجيب الوكيل بشكل طبيعي بلغة العميل مستخدماً سياق المتجر والمنتجات والطلبات.'], ['هل يمكنني التحكم في مستلمي الحملة؟', 'نعم. يمكنك البحث عن العملاء ومعاينة أرقامهم واستبعاد أي مستلم قبل الإطلاق.'], ['هل أحتاج إلى بطاقة للخطة المجانية؟', 'لا. أنشئ حساباً وابدأ مجاناً ثم قم بالترقية عندما تحتاج إلى سعة أكبر.'], ['هل يستطيع العملاء إرسال رسائل صوتية؟', 'نعم. عندما تسمح الخطة، يحوّل SmartConfirm الرسائل الصوتية إلى نص ويرد بنص أو بصوت مولد.']],
  safe: 'مصمم لتواصل واضح وتحت السيطرة', finalTitle: 'جاهز لتأكيد المزيد من الطلبات بعمل يدوي أقل؟', finalText: 'اربط أول جلسة واتساب ومتجر إلكتروني اليوم.', footerText: 'تأكيد الطلبات عبر واتساب ودعم ذكي وحملات للتجارة الإلكترونية.', product: 'المنتج', automation: 'الأتمتة', account: 'الحساب', createAccount: 'إنشاء حساب', rights: 'جميع الحقوق محفوظة.',
};

export const landingCopy: Record<LandingLanguage, LandingCopy> = { en, fr, ar };

export function landingLanguage(language?: string): LandingLanguage {
  const base = (language || 'en').toLowerCase().split('-')[0];
  return base === 'fr' || base === 'ar' ? base : 'en';
}
