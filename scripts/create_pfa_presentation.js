const pptxgen = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Amine';
pptx.subject = 'Projet de fin d\'annee SmartConfirm';
pptx.title = 'SmartConfirm — automatisation conversationnelle du commerce';
pptx.company = 'SmartConfirm';
pptx.lang = 'fr-FR';
pptx.theme = {
  headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'fr-FR'
};
pptx.defineSlideMaster({
  title: 'MASTER',
  background: { color: '0B1324' },
  objects: [
    { line: { x: 0.55, y: 7.12, w: 12.2, h: 0, line: { color: '233149', width: 1 } } },
    { text: { text: 'SMARTCONFIRM', options: { x: 0.55, y: 7.18, w: 2.5, h: 0.18, fontFace: 'Aptos', fontSize: 8, color: '70829F', bold: true, charSpacing: 1.5, margin: 0 } } },
  ],
  slideNumber: { x: 12.15, y: 7.16, w: 0.6, h: 0.2, color: '70829F', fontFace: 'Aptos', fontSize: 8, align: 'right', margin: 0 }
});

const C = { bg:'0B1324', panel:'142138', panel2:'101A2E', green:'23D36B', mint:'9BF3BE', white:'F7FAFF', text:'D7E2F2', muted:'8193B2', amber:'FFB547', blue:'57A8FF', red:'FF6B6B' };
const logo = path.resolve('dashboard/public/smartconfirm_logo_v2.png');
const shotChat = 'C:/Users/AMINE/AppData/Local/Temp/codex-clipboard-5e1571bd-8279-4fec-a5c4-c3b74a873226.png';
const shotContext = 'C:/Users/AMINE/AppData/Local/Temp/codex-clipboard-9330d52d-e0f4-49c6-8bb5-6f4f0a092f31.png';

function addTitle(slide, kicker, title, subtitle='') {
  slide.addText(kicker.toUpperCase(), {x:.65,y:.42,w:4.4,h:.25,fontSize:10,bold:true,color:C.green,charSpacing:2,margin:0});
  slide.addText(title, {x:.65,y:.78,w:12,h:.62,fontSize:28,bold:true,color:C.white,margin:0,breakLine:false,fit:'shrink'});
  if(subtitle) slide.addText(subtitle,{x:.67,y:1.45,w:11.8,h:.42,fontSize:13,color:C.muted,margin:0,fit:'shrink'});
}
function panel(slide,x,y,w,h,title,body,accent=C.green) {
  slide.addText(title,{x,y,w,h:.33,fontSize:15,bold:true,color:C.white,margin:0});
  slide.addText(body,{x,y:y+.47,w,h:h-.55,fontSize:11.5,color:C.text,breakLine:false,margin:0.05,fit:'shrink',valign:'top'});
  slide.addText('',{x:x-.15,y,w:.06,h,fill:{color:accent},line:{color:accent}});
}
function note(slide,text){ if(typeof slide.addNotes === 'function') slide.addNotes(text); }
function img(slide,file,x,y,w,h){ if(fs.existsSync(file)) slide.addImage({path:file,x,y,w,h}); }

// 1
{
 const s=pptx.addSlide('MASTER');
 img(s,logo,.7,.45,2.4,1.05);
 s.addText('SmartConfirm',{x:.72,y:2.05,w:7.8,h:.75,fontSize:44,bold:true,color:C.white,margin:0});
 s.addText('Automatisation intelligente des confirmations de commandes via WhatsApp',{x:.75,y:2.95,w:8.8,h:1.2,fontSize:24,bold:true,color:C.mint,margin:0,fit:'shrink'});
 s.addText('Projet de fin d\'année • Présenté par Amine • 2025–2026',{x:.76,y:4.55,w:7.5,h:.4,fontSize:14,color:C.text,margin:0});
 s.addText('Une idée née lors de notre participation à EMEC EXPO Casablanca',{x:.76,y:5.25,w:8.5,h:.35,fontSize:13,color:C.muted,margin:0});
 s.addText('SC',{x:10.1,y:1.65,w:1.8,h:1.8,fontSize:44,bold:true,color:C.green,align:'center',valign:'mid',fill:{color:'0F2C21'},line:{color:C.green,width:2},margin:0});
 note(s,'Bonjour. Je vais vous présenter SmartConfirm, une plateforme qui relie les boutiques e-commerce, WhatsApp et une intelligence artificielle orientée actions.');
}
// 2 — origine du projet
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Origine du projet','L’observation à EMEC EXPO Casablanca','L’idée de SmartConfirm est née pendant notre participation à un événement consacré au commerce électronique.');
 s.addText('Avec mes amis, nous avons rencontré des acteurs du e-commerce et observé leur manière de gérer les commandes et la relation client.',{x:.9,y:2.0,w:5.4,h:1.15,fontSize:19,bold:true,color:C.white,margin:0,fit:'shrink'});
 s.addText('Constat sur place',{x:7.05,y:1.95,w:3.2,h:.42,fontSize:18,bold:true,color:C.green,margin:0});
 s.addText('Les commerçants utilisent souvent WhatsApp pour confirmer les commandes, répondre aux questions et vérifier les informations de livraison.',{x:7.05,y:2.55,w:5.1,h:1.2,fontSize:16,color:C.text,margin:0,fit:'shrink'});
 s.addText('Le problème observé',{x:.9,y:3.75,w:3.2,h:.42,fontSize:18,bold:true,color:C.amber,margin:0});
 s.addText('Une grande partie de ce travail reste manuelle. L’agent passe de la boutique à WhatsApp, répète les mêmes tâches et perd le contexte du client.',{x:.9,y:4.35,w:5.45,h:1.25,fontSize:16,color:C.text,margin:0,fit:'shrink'});
 s.addText('L’idée retenue',{x:7.05,y:4.1,w:3.2,h:.42,fontSize:18,bold:true,color:C.blue,margin:0});
 s.addText('Créer une plateforme qui relie les boutiques à WhatsApp, automatise les échanges simples et laisse un agent humain intervenir dès que nécessaire.',{x:7.05,y:4.7,w:5.1,h:1.25,fontSize:16,color:C.text,margin:0,fit:'shrink'});
 note(s,'L’idée n’est pas venue seulement d’une recherche théorique. Avec mes amis, nous avons participé à EMEC EXPO à Casablanca. En discutant avec des professionnels, nous avons remarqué que WhatsApp occupe une place importante dans la confirmation des commandes, mais que les opérations restent souvent manuelles. Cette observation nous a conduits à imaginer SmartConfirm.');
}
// 2
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Contexte','Le problème métier','Une commande en ligne ne devient une vente réelle que lorsque le client est rassuré et confirmé.');
 panel(s,.85,2.2,3.55,3.7,'Temps perdu','Les équipes relancent manuellement les clients, vérifient les informations et changent de plusieurs outils.',C.red);
 panel(s,4.9,2.2,3.55,3.7,'Données dispersées','Commandes, produits, conversations, paiements et livraison restent séparés entre la boutique et WhatsApp.',C.amber);
 panel(s,8.95,2.2,3.55,3.7,'Expérience fragile','Réponses statiques, doublons de messages, manque de suivi et transfert humain tardif réduisent la confiance.',C.blue);
 note(s,'Le problème n’est pas uniquement d’envoyer un message. Il faut comprendre la demande, agir sur la bonne commande et garder une trace fiable.');
}
// 3
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Objectifs','Ce que SmartConfirm doit accomplir');
 const items=[['1','Connecter','Shopify, WooCommerce et YouCan'],['2','Converser','WhatsApp texte, média et audio'],['3','Agir','Créer, confirmer et mettre à jour une commande'],['4','Superviser','Donner le contrôle à un agent humain'],['5','Mesurer','Usage, campagnes, IA et performances'],['6','Monétiser','Plans, quotas et paiements récurrents']];
 items.forEach((it,i)=>{const col=i%3,row=Math.floor(i/3); const x=.75+col*4.15,y=2.05+row*2.15; s.addText(it[0],{x,y,w:.6,h:.6,fontSize:20,bold:true,color:C.bg,fill:{color:C.green},align:'center',valign:'mid',margin:0}); s.addText(it[1],{x:x+.82,y:y-.02,w:2.9,h:.32,fontSize:16,bold:true,color:C.white,margin:0}); s.addText(it[2],{x:x+.82,y:y+.45,w:2.95,h:.65,fontSize:11.5,color:C.text,margin:0,fit:'shrink'});});
 note(s,'Ces six objectifs structurent le projet : intégration, conversation, actions métier, collaboration humaine, pilotage et modèle SaaS.');
}
// 4
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Solution','Une plateforme, trois couches coordonnées');
 const blocks=[['Canaux & boutiques','WhatsApp / Baileys\nShopify • WooCommerce • YouCan',C.blue],['Orchestration SmartConfirm','Webhooks normalisés\nConversations • outils • files d’attente',C.green],['Exécution & contrôle','Commandes • messages • campagnes\nDashboard • humain • audit',C.amber]];
 blocks.forEach((b,i)=>{const x=.75+i*4.2;s.addText(b[0],{x,y:2.35,w:3.55,h:.5,fontSize:18,bold:true,color:C.white,align:'center',margin:0});s.addText(b[1],{x,y:3.05,w:3.55,h:1.6,fontSize:14,color:C.text,align:'center',valign:'mid',fill:{color:C.panel},line:{color:b[2],width:2},margin:.12,fit:'shrink'});if(i<2)s.addText('→',{x:x+3.65,y:3.45,w:.45,h:.5,fontSize:26,bold:true,color:C.green,align:'center',margin:0});});
 s.addText('Résultat : une conversation peut déclencher une action réelle, contrôlée et traçable.',{x:1.55,y:5.45,w:10.2,h:.55,fontSize:18,bold:true,color:C.mint,align:'center',margin:0});
 note(s,'SmartConfirm joue le rôle de couche d’orchestration. Le fournisseur d’IA ne connaît pas directement les boutiques : notre backend lui expose des outils sûrs.');
}
// 5
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Fonctionnel','Du message client à la commande');
 img(s,shotChat,.7,1.8,7.25,4.75);
 panel(s,8.45,2.0,3.85,1.1,'1. Comprendre','Langue naturelle, darija, français et contexte client.',C.blue);
 panel(s,8.45,3.45,3.85,1.1,'2. Proposer','Produits, variantes, images et informations de boutique.',C.green);
 panel(s,8.45,4.9,3.85,1.1,'3. Exécuter','Confirmation explicite avant création ou modification.',C.amber);
 note(s,'Cette capture montre la page de discussion. Le système centralise la conversation et les données utiles au support.');
}
// 6
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Architecture','Architecture technique modulaire');
 const layers=[['Frontend React + Vite','Dashboard, authentification, boutiques, chats, campagnes, administration'],['API NestJS','JWT, rôles, validation, services métier, Swagger, audit'],['Commerce Automation','Agent IA, tool calling, mémoire courte, handoff humain, audio'],['Provider Registry','Adaptateurs Shopify, WooCommerce, YouCan et normalisation'],['Données & infrastructure','PostgreSQL, TypeORM, Redis optionnel, Baileys, Docker']];
 layers.forEach((l,i)=>{const y=1.95+i*.93;s.addText(l[0],{x:.85,y,w:2.7,h:.55,fontSize:14,bold:true,color:i===2?C.bg:C.white,fill:{color:i===2?C.green:C.panel},margin:.12,valign:'mid'});s.addText(l[1],{x:3.75,y,w:8.55,h:.55,fontSize:12,color:C.text,fill:{color:C.panel2},margin:.12,valign:'mid',fit:'shrink'});});
 note(s,'Le backend est organisé par modules NestJS. Le registre de fournisseurs évite de dupliquer la logique générique entre les plateformes e-commerce.');
}
// 7
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Cycle métier','Confirmation d’une commande, sans ambiguïté');
 const steps=['Webhook reçu','Commande normalisée','Message planifié','Dialogue IA','Confirmation explicite','Mise à jour boutique','Notification & audit'];
 steps.forEach((t,i)=>{const x=.55+i*1.8;s.addText(String(i+1),{x,y:2.45,w:.5,h:.5,fontSize:16,bold:true,color:C.bg,fill:{color:i===4?C.amber:C.green},align:'center',valign:'mid',margin:0});s.addText(t,{x:x-.3,y:3.15,w:1.25,h:.75,fontSize:10.5,bold:true,color:C.white,align:'center',margin:0,fit:'shrink'});if(i<6)s.addText('→',{x:x+.65,y:2.5,w:.6,h:.35,fontSize:20,color:C.muted,align:'center',margin:0});});
 s.addText('Protection contre les doublons : identifiant d’événement, reçus de messages et règles d’idempotence.',{x:1.15,y:4.65,w:11,h:.8,fontSize:17,bold:true,color:C.mint,align:'center',margin:0,fit:'shrink'});
 note(s,'Un point important est l’idempotence. Une commande créée depuis WhatsApp ne doit pas être annoncée deux fois lorsque son webhook revient depuis la boutique.');
}
// 8
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Intelligence artificielle','Une IA utile parce qu’elle possède des outils');
 panel(s,.8,2.05,3.65,3.8,'Comprendre','Détecter l’intention, conserver un contexte compact, répondre dans la langue du client et demander les informations manquantes.',C.blue);
 panel(s,4.85,2.05,3.65,3.8,'Appeler un outil','Rechercher produits et commandes, calculer un panier, préparer une mutation ou créer une commande via le provider.',C.green);
 panel(s,8.9,2.05,3.65,3.8,'Sécuriser','Validation serveur, permissions, confirmation explicite, journal d’outil, quotas IA et transfert à un humain.',C.amber);
 note(s,'L’IA propose une intention structurée. Le backend valide chaque argument et exécute l’action. Le modèle ne reçoit jamais un accès direct à la base de données.');
}
// 9
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Intégrations','Même métier, fournisseurs différents');
 const rows=[['Shopify','OAuth App','Webhooks commandes / produits / fulfillment','Tags et mises à jour via API'],['WooCommerce','Clés REST','Webhooks WooCommerce','Statuts, notes, avis produits'],['YouCan','OAuth','Rest hooks','Commandes, produits, clients']];
 rows.forEach((r,i)=>{const y=2+i*1.25; const colors=[C.green,C.blue,C.amber];s.addText(r[0],{x:.8,y,w:1.55,h:.75,fontSize:17,bold:true,color:C.white,fill:{color:C.panel},line:{color:colors[i],width:2},align:'center',valign:'mid',margin:0});s.addText(r[1],{x:2.65,y,w:2.15,h:.75,fontSize:12,color:C.text,align:'center',valign:'mid',fill:{color:C.panel2},margin:.08});s.addText(r[2],{x:5.05,y,w:3.45,h:.75,fontSize:12,color:C.text,align:'center',valign:'mid',fill:{color:C.panel2},margin:.08});s.addText(r[3],{x:8.75,y,w:3.75,h:.75,fontSize:12,color:C.text,align:'center',valign:'mid',fill:{color:C.panel2},margin:.08});});
 s.addText('IntegrationProviderRegistry',{x:4.2,y:5.95,w:4.9,h:.4,fontSize:16,bold:true,color:C.green,align:'center',margin:0});
 note(s,'Le registre de providers fournit une interface commune. Ainsi, les outils IA ne sont pas écrits uniquement pour Shopify ou WooCommerce.');
}
// 10
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Support','Collaboration IA ↔ agent humain');
 img(s,shotContext,.65,1.85,7.4,4.8);
 panel(s,8.5,1.95,3.85,1.05,'Contexte immédiat','Boutique, commandes, produits, paiement, livraison et prochaine action.',C.blue);
 panel(s,8.5,3.35,3.85,1.05,'Prise en charge','Take over désactive l’IA pour toute la conversation, pas seulement une commande.',C.amber);
 panel(s,8.5,4.75,3.85,1.05,'Reprise contrôlée','Resume AI rend la conversation à l’agent automatique avec son historique utile.',C.green);
 note(s,'L’objectif est d’aider l’humain à résoudre rapidement le problème, sans relire toute la conversation ni ouvrir la boutique dans un autre onglet.');
}
// 11
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'SaaS & sécurité','Accès, quotas et traçabilité');
 const chips=['JWT + rôles','Isolation par utilisateur','Secrets chiffrés','Webhooks signés','Journal d’audit','Quotas messages','Quotas IA / audio','Stripe & PayPal'];
 chips.forEach((t,i)=>{const col=i%4,row=Math.floor(i/4);s.addText(t,{x:.75+col*3.05,y:2.15+row*1.25,w:2.65,h:.72,fontSize:13,bold:true,color:C.white,align:'center',valign:'mid',fill:{color:C.panel},line:{color:i<5?C.green:C.blue,width:1.5},margin:.05,fit:'shrink'});});
 s.addText('Administrateur : gouvernance globale  •  Utilisateur : uniquement ses sessions, boutiques et données',{x:1.0,y:5.25,w:11.3,h:.75,fontSize:16,bold:true,color:C.mint,align:'center',margin:0,fit:'shrink'});
 note(s,'L’administrateur gère les plans, paiements, utilisateurs et journaux. Il n’utilise pas les fonctions commerciales réservées aux comptes clients.');
}
// 12
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Démonstration','Scénario proposé pendant la soutenance');
 const flow=[['01','Connecter une session','Scanner le QR et vérifier l’état connecté'],['02','Connecter une boutique','Installer Shopify, WooCommerce ou YouCan'],['03','Créer une commande','Le client demande un produit sur WhatsApp'],['04','Confirmer et suivre','L’IA appelle les outils et synchronise la boutique'],['05','Prendre la main','L’agent humain consulte le contexte puis reprend l’IA']];
 flow.forEach((f,i)=>{const y=1.85+i*.95;s.addText(f[0],{x:.75,y,w:.65,h:.5,fontSize:14,bold:true,color:C.green,margin:0});s.addText(f[1],{x:1.55,y,w:2.5,h:.5,fontSize:14,bold:true,color:C.white,margin:0});s.addText(f[2],{x:4.15,y,w:8.0,h:.5,fontSize:12,color:C.text,margin:0,fit:'shrink'});});
 note(s,'Pour la démonstration, préparer une session déjà connectée et une boutique de test. Montrer un scénario court, fiable et mesurable.');
}
// 13
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Bilan','Résultats, limites et perspectives');
 panel(s,.8,2.0,3.7,3.8,'Résultats','• Plateforme multi-boutiques\n• Conversations et actions réelles\n• Handoff humain\n• Gestion SaaS et paiements\n• Audio, campagnes et notifications',C.green);
 panel(s,4.85,2.0,3.7,3.8,'Limites','• Qualité variable des modèles\n• Dépendance aux API externes\n• Règles WhatsApp et coûts audio\n• Tests réels nécessaires à grande échelle',C.amber);
 panel(s,8.9,2.0,3.7,3.8,'Perspectives','• RAG sur le catalogue et politiques\n• Observabilité avancée\n• Courriers et transporteurs\n• Analyse de sentiment\n• Application mobile agent',C.blue);
 note(s,'Le projet atteint son objectif principal, mais une mise en production nécessite surtout des tests de charge, une observabilité complète et une gestion stricte des fournisseurs externes.');
}
// 14
{
 const s=pptx.addSlide('MASTER'); addTitle(s,'Conclusion','SmartConfirm transforme une conversation en processus métier fiable');
 s.addText('Connecter',{x:1.0,y:2.3,w:3.2,h:.7,fontSize:26,bold:true,color:C.blue,align:'center',margin:0});
 s.addText('Comprendre',{x:5.05,y:2.3,w:3.2,h:.7,fontSize:26,bold:true,color:C.green,align:'center',margin:0});
 s.addText('Agir',{x:9.1,y:2.3,w:3.2,h:.7,fontSize:26,bold:true,color:C.amber,align:'center',margin:0});
 s.addText('Une plateforme pensée pour le client, l’agent humain et le commerçant.',{x:1.25,y:4.1,w:10.8,h:.8,fontSize:23,bold:true,color:C.white,align:'center',margin:0,fit:'shrink'});
 s.addText('Merci — Questions ?',{x:3.6,y:5.35,w:6.1,h:.65,fontSize:25,bold:true,color:C.mint,align:'center',margin:0});
 note(s,'Merci pour votre attention. Je suis prêt à répondre aux questions sur l’architecture, les outils IA, la sécurité ou la démonstration.');
}

fs.mkdirSync(path.resolve('artifacts'), {recursive:true});
pptx.writeFile({ fileName: path.resolve('artifacts/SmartConfirm_Presentation_PFA_FR_v2.pptx') });
