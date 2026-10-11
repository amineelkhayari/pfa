<p align="center">
  <img src="docs/logo/smartconfirm_logo.webp" alt="SmartConfirm Logo" width="180"/>
</p>

<h1 align="center">SmartConfirm</h1>

<p align="center">
  <strong>Plateforme SaaS d'Automatisation WhatsApp & Confirmation Intelligente de Commandes E-Commerce (COD)</strong>
</p>

<p align="center">
  <em>Intelligent WhatsApp Automation & COD Order Confirmation SaaS Platform for E-Commerce</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11.x-E0234E?style=flat-square&logo=nestjs&logoColor=white" alt="NestJS"/>
  <img src="https://img.shields.io/badge/React-19.x-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Vite-8.x-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16.x-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis"/>
  <img src="https://img.shields.io/badge/WhatsApp-Baileys-25D366?style=flat-square&logo=whatsapp&logoColor=white" alt="WhatsApp Baileys"/>
  <img src="https://img.shields.io/badge/Deployed%20on-Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white" alt="Railway"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License"/>
</p>

<p align="center">
  <a href="#-présentation--contexte">Contexte</a> •
  <a href="#-fonctionnalités-clés">Fonctionnalités</a> •
  <a href="#-architecture--stack-technique">Stack Technique</a> •
  <a href="#-arborescence-du-projet">Structure</a> •
  <a href="#-démarrage-rapide">Démarrage</a> •
  <a href="#-déploiement-cloud-railway">Déploiement</a> •
  <a href="#-à-propos">À Propos</a>
</p>

---

## 💡 Présentation & Contexte

**SmartConfirm** est une solution SaaS complète conçue pour résoudre l'une des problématiques majeures des marchands e-commerce en Afrique du Nord et au Moyen-Orient : **le taux élevé d'échec et de retour sur les commandes en paiement à la livraison (Cash on Delivery - COD)**.

Née d'un constat de terrain lors d'un salon e-commerce à Casablanca où la majorité des vendeurs traitaient encore leurs confirmations par des appels manuels chronophages et sans traçabilité, la plateforme automatise l'ensemble du cycle de confirmation et de suivi client via **WhatsApp**.

SmartConfirm permet aux e-commerçants de connecter leurs boutiques (**Shopify, WooCommerce, YouCan**), d'appairer leur propre numéro WhatsApp sans frais récurrents Meta Cloud, et d'offrir à leurs clients finaux une expérience interactive : confirmation instantanée par boutons, modification d'adresse, support conversationnel par IA (traitant même les notes vocales en **Darija**), relances automatiques et collecte d'avis de satisfaction après livraison.

---

## 🎯 Fonctionnalités Clés

### 🛒 1. Intégration E-Commerce Multi-Boutiques
- **Connecteurs natifs :** Connexion rapide avec **Shopify**, **WooCommerce** et **YouCan**.
- **Synchronisation en direct :** Écoute des Webhooks d'achat en temps réel avec validation cryptographique de signature (HMAC).
- **Mise à jour bidirectionnelle :** Dès que le client confirme ou annule sur WhatsApp, le statut de la commande est répercuté automatiquement sur le CMS e-commerce.

### 💬 2. Moteur WhatsApp Multi-Sessions (Baileys)
- **Appairage rapide par QR Code :** Scan direct depuis le tableau de bord avec synchronisation WebSocket en direct.
- **Zéro surcoût d'API :** Connexion basée sur le protocole WebSocket WhatsApp Web multi-appareils (bibliothèque **Baileys**), éliminant les frais élevés par message de l'API Meta Cloud.
- **Régulation intelligente (Anti-Ban) :** Files d'attente distribuées **BullMQ** adossées à **Redis** avec temporisation et délais aléatoires pour respecter les règles d'usage de WhatsApp.

### ⚡ 3. Workflows de Confirmation & Cycle de Commande
- **Boutons interactifs :** Les clients reçoivent un récapitulatif détaillé et confirment en un clic : `[✅ Confirmer]`, `[❌ Annuler]`, `[✏️ Modifier l'adresse]`.
- **Relances programmées :** Relance douce des clients n'ayant pas répondu après un intervalle paramétrable.
- **⭐ Avis après livraison (Post-Fulfillment Reviews) :** Envoi d'une invitation automatique à noter le produit (1 à 5 étoiles) et laisser un commentaire texte ou vocal une fois le colis livré.

### 🎙️ 4. Intelligence Artificielle & Traitement Vocal
- **Support des notes vocales (Speech-to-Text) :** Transcription des messages audios des clients (OpenAI Whisper) avec compréhension du dialecte marocain (**Darija**), de l'arabe et du français.
- **Agent conversationnel IA :** Réponses automatiques aux questions fréquentes (FAQ produit, délais, politique de retour).
- **Live Chat & Handoff humain :** Possibilité pour le commerçant de reprendre la main à tout moment sur la conversation depuis son tableau de bord.

### 💳 5. Modèle Économique SaaS & Monétisation
- **Abonnements & Forfaits :** Facturation récurrente intégrée via **Stripe** et **PayPal Subscriptions**.
- **Période d'essai (3-Day Free Trial) :** Possibilité d'activer 3 jours d'essai gratuit sur les forfaits payants avant facturation.
- **Gestion stricte des quotas :** Limitation dynamique du nombre de sessions WhatsApp actives et du volume mensuel de messages.
- **Workflow de remboursement (< 48h) :** Module permettant aux marchands de soumettre une demande de remboursement sous 48h, examinée et validée par le Super-Admin.

### 🛡️ 6. Console d'Administration Globale (Super-Admin)
- Supervision en temps réel des métriques système, des utilisateurs enregistrés et des volumes de messages.
- Gestion des utilisateurs (activation, blocage, modification des quotas).
- Suivi des revenus récurrents et métriques de santé des serveurs.

---

## 🛠 Architecture & Stack Technique

SmartConfirm est développé selon les principes de la **Clean Architecture** et d'un modèle découplé client-serveur :

```
┌────────────────────────────────────────────────────────┐
│             FRONTEND : React 19 SPA (Vite)             │
│        Tailwind CSS • TanStack Query • Recharts        │
└───────────────────────────▲────────────────────────────┘
                            │ REST API (JWT) & WebSockets
┌───────────────────────────▼────────────────────────────┐
│              BACKEND : NestJS 11 (TypeScript)          │
│       Clean Architecture • Modules • DTO Validation    │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
┌──────────────▼─────────────┐ ┌──────────▼──────────────┐
│       POSTGRESQL 16        │ │     REDIS + BULLMQ      │
│  TypeORM Relational Store  │ │ Distributed Queue Engine│
└────────────────────────────┘ └──────────┬──────────────┘
                                          │
                               ┌──────────▼──────────────┐
                               │  BAILEYS ENGINE (WS)    │
                               │  WhatsApp Automation    │
                               └─────────────────────────┘
```

| Composant | Technologie | Description |
| :--- | :--- | :--- |
| **Frontend** | **React 19**, **Vite**, **TypeScript** | Interface monopage (SPA) rapide, typée et réactive |
| **Design & UI** | **Tailwind CSS**, **Lucide Icons** | Design épuré, responsive et composants ergonomiques |
| **État & Visualisation** | **TanStack Query**, **Recharts** | Cache asynchrone des requêtes et graphiques statistiques |
| **Backend** | **NestJS 11**, **Node.js 22+** | Architecture modulaire d'entreprise, injection de dépendances |
| **Temps réel** | **Socket.io** (WebSockets) | Synchronisation instantanée du QR Code et des commandes |
| **Moteur WhatsApp** | **Baileys** (`@whiskeysockets/baileys`) | Passerelle WebSocket multi-appareils sans navigateur headless |
| **Base de données** | **PostgreSQL 16** + **TypeORM** | Persistance relationnelle ACID et migrations automatisées |
| **Files d'attente** | **BullMQ** + **Redis** | Traitement asynchrone des messages et limitation de débit |
| **Paiements** | **Stripe** & **PayPal** | Gestion des abonnements SaaS, quotas et périodes d'essai |
| **Déploiement Cloud**| **Railway** (PaaS) + **Docker** | Conteneurisation multi-étapes et pipeline CI/CD continu |

---

## 📁 Arborescence du Projet

```text
smartconfirm/
│
├── dashboard/                              # ─── FRONTEND (React 19 + TypeScript + Vite)
│   ├── public/                             # Fichiers statiques et logos
│   ├── src/
│   │   ├── components/                     # Composants UI modulaires (Sidebar, Modales, Tables)
│   │   ├── hooks/                          # Hooks TanStack Query et gestion du cache
│   │   ├── pages/                          # Écrans de l'application
│   │   │   ├── Dashboard.tsx               # Tableau de bord principal marchand
│   │   │   ├── Sessions.tsx                # Appairage QR Code WhatsApp
│   │   │   ├── Stores.tsx                  # Connexion Shopify / WooCommerce / YouCan
│   │   │   ├── Templates.tsx               # Éditeur de templates de confirmation
│   │   │   ├── Chats.tsx                   # Live Chat & intervention humaine
│   │   │   ├── PaymentSettings.tsx         # Gestion des forfaits & Quotas SaaS
│   │   │   ├── AdminDashboard.tsx          # Tableau de bord Super-Admin
│   │   │   └── AdminUsers.tsx              # Gestion des comptes marchands
│   │   ├── services/                       # Clients API REST (Axios) & Socket.io
│   │   ├── types/                          # Typages et interfaces TypeScript
│   │   └── App.tsx                         # Routage applicatif
│   ├── package.json                        # Dépendances frontend
│   └── vite.config.ts                      # Configuration de compilation Vite
│
├── src/                                    # ─── BACKEND (NestJS 11 + TypeScript)
│   ├── modules/                            # Domaines métier (Clean Architecture)
│   │   ├── auth/                           # Authentification JWT & rôles (Admin/Merchant)
│   │   ├── session/                        # Gestion du cycle de vie des sessions WhatsApp
│   │   ├── stores/                         # Intégrations CMS e-commerce
│   │   ├── commerce-automation/            # Workflows de confirmation et relance COD
│   │   ├── message/                        # Expédition des messages avec boutons
│   │   ├── billing/                        # Abonnements Stripe/PayPal, quotas & essai 3j
│   │   ├── queue/                          # Files d'attente BullMQ & Redis
│   │   ├── webhook/                        # Réception et validation HMAC des webhooks
│   │   └── stats/ & metrics/               # Statistiques analytiques & reporting
│   ├── database/                           # Configuration TypeORM & migrations PostgreSQL
│   ├── engine/                             # Moteur de connexion Baileys (WebSockets)
│   ├── app.module.ts                       # Module racine NestJS
│   └── main.ts                             # Démarrage et configuration globale du serveur
│
├── Dockerfile                              # Build multi-stage pour la production
├── docker-compose.yml                      # Orchestration locale (PostgreSQL, Redis, API)
└── package.json                            # Scripts globaux et dépendances backend
```

---

## 🚀 Démarrage Rapide

### Prérequis
* **Node.js** >= 22.13
* **npm** >= 10.x
* **Docker** & **Docker Compose** (recommandé pour la base de données et Redis)

### Option 1 : Développement Local

1. **Cloner le projet :**
   ```bash
   git clone https://github.com/amineelkhayari/pfa.git
   cd SmartConfirm
   ```

2. **Installer les dépendances :**
   ```bash
   npm install
   npm run dashboard:install
   ```

3. **Configurer les variables d'environnement :**
   Créer un fichier `.env` à la racine (s'inspirer de `.env.example`) :
   ```env
   PORT=2785
   NODE_ENV=development
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/smartconfirm
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=votre_cle_secrete_jwt
   STRIPE_SECRET_KEY=sk_test_...
   PAYPAL_CLIENT_ID=...
   ```

4. **Lancer PostgreSQL et Redis (via Docker) :**
   ```bash
   docker compose up -d postgres redis
   ```

5. **Exécuter l'application en mode développement (API + Frontend en parallèle) :**
   ```bash
   npm run dev
   ```

6. **Accéder aux interfaces :**
   * **Tableau de bord Marchand / Admin :** [http://localhost:2886](http://localhost:2886) (ou port de build [http://localhost:2785](http://localhost:2785))
   * **Documentation Swagger (API) :** [http://localhost:2785/api/docs](http://localhost:2785/api/docs)

---

### Option 2 : Exécution Complète avec Docker Compose

Pour démarrer l'ensemble des conteneurs d'une seule commande :
```bash
docker compose up -d --build
```

---

## ☁️ Déploiement Cloud (Railway)

L'application est configurée pour un déploiement continu fluide sur la plateforme cloud **Railway** (PaaS) :

1. **Liaison du dépôt GitHub :** Connecter le projet depuis la console Railway.
2. **Plugins managés :** Ajouter un service **PostgreSQL** et un service **Redis** en un clic.
3. **Variables d'environnement :** Définir les variables `DATABASE_URL` et `REDIS_URL` fournies par Railway.
4. **Déploiement automatique :** Railway détecte le `Dockerfile` multi-étapes, compile le frontend React et le backend NestJS, puis expose l'application sur un domaine sécurisé HTTPS (`*.up.railway.app`).

---

## 🛡️ Rôles & Sécurité

* **Super-Admin (`ApiKeyRole.ADMIN`) :** Accès à la console globale de supervision, gestion de tous les marchands, configuration des forfaits SaaS et approbation des remboursements.
* **Marchand (`ApiKeyRole.MERCHANT`) :** Cloisonnement strict des données : accès uniquement à ses propres boutiques, ses sessions WhatsApp, ses templates et son historique.
* **Sécurité applicative :** 
  * Chiffrement des mots de passe avec **bcrypt**.
  * Authentification sans état par **JWT** (*JSON Web Tokens*).
  * En-têtes HTTP sécurisés via **Helmet** et limitation de requêtes via **Throttler**.
  * Clés secrètes WhatsApp et sessions stockées de manière chiffrée.

---

## 👨‍💻 À Propos du Projet

Ce projet a été conçu et réalisé par **EL KHAYARI AMINE** dans le cadre du **Projet de Fin d'Études (PFE)** pour l'obtention du diplôme d'Ingénieur d'État en Génie Informatique à l'**ISGA (École d'Ingénieurs)**.

* **Auteur :** EL KHAYARI AMINE
* **Établissement :** ISGA (Institut Supérieur d'Ingénierie et des Affaires)
* **Formation :** 4ème Année — Cycle Ingénieur d'État en Génie Informatique
* **Nom du projet :** SmartConfirm

---

## 📄 Licence

Ce projet est distribué sous licence **MIT**. Consultez le fichier [LICENSE](./LICENSE) pour plus d'informations.
