# FacturePro — Plan d'implémentation

> Version 0.1 · 21/09/2026 · Statut : **plan uniquement, aucun code écrit**.
> Nom de travail : « FacturePro ».
> Légende : ⚠️ = à valider (DGI / expert-comptable / juriste / product owner) · 🔒 = règle d'intégrité non négociable · 💡 = suggestion

## Sommaire

0. Principes directeurs et remises en question de tes hypothèses
1. Architecture globale et décisions clés
2. Arborescence du projet et carte des routes
3. Schéma de base de données (tables, index, RLS)
4. Règles de calcul monétaire
5. Composants, état, data fetching, server actions
6. Phases détaillées (tâches, critères d'acceptation, risques)
7. Stratégie de sécurité
8. Stratégie de tests
9. Checklist de déploiement Vercel + Supabase
10. Hypothèses à valider et questions ouvertes
- Annexe A — Direction design d'après les captures
- Annexe B — Registre des risques
- Annexe C — ADR à rédiger
- Annexe D — Points fiscaux / légaux à valider (DGI, expert-comptable)

---

## 0. Principes directeurs et remises en question

### 0.1 Sept principes non négociables

| # | Principe | Conséquence concrète |
|---|---|---|
| P1 | 🔒 **L'argent est un entier.** | `bigint` en base, `BigInt` dans le moteur de calcul, jamais de `float`, `toFixed`, `parseFloat` sur un montant (règle ESLint dédiée). |
| P2 | 🔒 **La base est le dernier rempart.** | RLS, contraintes CHECK, triggers d'immutabilité, RPC transactionnelles. Le code TS ne suffit jamais à protéger une invariante financière. |
| P3 | 🔒 **Un document émis est immuable.** | Trigger DB + snapshots émetteur/client figés. Correction = avoir, jamais modification. |
| P4 | 🔒 **Le client n'est jamais source de vérité.** | Le serveur recalcule tous les totaux à partir des lignes ; `company_id` vient toujours du contexte authentifié, jamais du payload. |
| P5 | **Le réseau est hostile.** | Brouillons locaux (IndexedDB), UI optimiste, retries idempotents. **Émission = en ligne uniquement** (cf. 0.2 #7). |
| P6 | **Le fiscal local est de la configuration, pas du code.** | Profils pays, champs configurables, checklist « à valider ». Aucune affirmation de conformité DGI tant qu'un expert n'a pas validé. |
| P7 | **Un seul cœur de calcul, deux implémentations vérifiées.** | Module TS pur + fonctions SQL, testés par les **mêmes vecteurs d'or** (fichier JSON exécuté par Vitest et pgTAP). |

### 0.2 Où je remets en question tes hypothèses

| # | Hypothèse / consigne | Problème | Recommandation |
|---|---|---|---|
| 1 | **Next.js 14** | Version en fin de cycle (sortie fin 2023). Le pilier « middleware d'auth » a déjà connu une faille critique de contournement (CVE-2025-29927, corrigée en 14.2.25). ⚠️ Vérifier la politique de support officielle au démarrage. | Recommandé : **Next 15 (ou 16 si stable dans ton écosystème)** — App Router quasi identique, seule différence notable : `cookies()`/`params` asynchrones (et `middleware` renommé `proxy` en 16). Si la contrainte « 14 » est dure : dernier patch 14.2.x + veille sécurité + ne **jamais** compter sur le middleware seul. |
| 2 | « Immuabilité après **envoi** » | On ne peut pas détecter un envoi WhatsApp (`wa.me` ouvre juste l'app, l'utilisateur peut ne pas appuyer sur « envoyer »). Lier l'immuabilité à l'envoi est invérifiable. | Immuabilité à l'**émission** (action explicite « Émettre »). Le bouton principal est « Émettre et envoyer » (émet puis ouvre le partage). « Envoyée » = `first_shared_at` renseigné. |
| 3 | Numérotation FAC-2026-0001 sans trou | Si le numéro est attribué à la création du brouillon, chaque brouillon supprimé fait un trou. | Le numéro est attribué **à l'émission**, dans la même transaction que le passage en « émise ». Les brouillons n'ont pas de numéro. Pas de `SEQUENCE` Postgres (non transactionnelles = trous). |
| 4 | Statut « modifiable » (le champ *Status* de la capture Monexa) et « Amount Due » éditable | Un statut ou un solde saisi à la main = faille d'intégrité. | Le statut n'est **jamais** un champ de formulaire. Il découle d'actions (Émettre, Enregistrer un paiement, Émettre un avoir) ; le montant dû est calculé, lecture seule. |
| 5 | Phases : Supabase (3) → Auth (4) → middleware/sécurité (6) | Sans identité, on ne peut pas tester la RLS ; le middleware/DAL en Phase 6 = sécurité bricolée à la fin. | Phase 3 inclut Supabase Auth **local** + helpers de test ; **DAL + middleware en Phase 4** ; Phase 6 = durcissement et audit, pas construction. Ajout d'une **Phase 0** (fondations + cœur de domaine) qui n'existe pas dans ton découpage. |
| 6 | Données locales en Phase 2 puis Supabase en Phase 3 | Risque de réécrire la logique métier deux fois. | **Ports & adapters** : la logique vit dans `domain/` (pur), les données derrière une interface `Repository` ; adapter local (Dexie) en Phase 2, adapter Supabase en Phase 3, **mêmes tests de contrat** sur les deux. |
| 7 | « Mobile-first + connexions instables » ⇒ offline complet ? | Une émission hors-ligne est incompatible avec une numérotation sans trou. | **Offline = brouillons uniquement** (création, édition, file d'attente de synchro). **Émettre, enregistrer un paiement, avoir = en ligne.** Alternatives rejetées : numéros provisoires (casse la loi du sans-trou), offline-first total type PowerSync/RxDB (complexité + conflits sur données financières). |
| 8 | « Paiements partiels **et acomptes** » | Deux sens différents : (a) paiement partiel sur facture existante, (b) *facture d'acompte* formelle avant la facture finale (impact TVA). | MVP = (a) avec un `kind = deposit` pour le reporting : émettre la facture complète puis encaisser l'acompte. (b) reporté ; ⚠️ à valider avec l'expert-comptable. Le schéma laisse la place (`related_document_id`). |
| 9 | Auth non précisée | Beaucoup d'utilisateurs guinéens vivent sur téléphone/WhatsApp ; l'OTP SMS vers la Guinée est coûteux et peu fiable ; les liens magiques s'ouvrent dans le navigateur intégré de Gmail et cassent le flux PKCE. | MVP : **email + mot de passe + Google OAuth**, vérification par **code à 6 chiffres** (pas par lien). SMS/WhatsApp OTP évalué plus tard. |
| 10 | Multi-devises | Additionner du GNF et de l'USD est une erreur comptable classique. | Une devise par document ; **aucune conversion automatique** ; tous les totaux/graphiques **groupés par devise**. ⚠️ Question §10 sur le besoin d'un « équivalent GNF au taux du jour » (forte dollarisation du commerce). |
| 11 | Vercel + Supabase « gratuits » | Vercel Hobby interdit l'usage commercial ; Supabase Free met en pause les projets inactifs et n'a pas de sauvegardes. | Budget prod : **Vercel Pro + Supabase Pro** (ordre de grandeur 45–60 USD/mois au départ, ⚠️ tarifs à vérifier), + SMTP transactionnel, + monitoring. |
| 12 | Captures : deux palettes (bleu Monexa / violet Invoicer) | Deux identités visuelles. | Choisir **une** couleur de marque ; tout passe par des design tokens (variables CSS). ⚠️ Question §10. |
| 13 | Landing inspirée d'Invoicer (logos « Trusted companies », témoignages) | Publier de faux logos/témoignages est trompeur (et potentiellement illégal). | Placeholders derrière un flag désactivé au lancement ; contenus réels ou absents. |
| 14 | Périmètre fonctionnel | La liste complète (devis, proforma, avoirs, BL, échéanciers, rôles, plans, agrégateur…) dépasse un MVP fiable. | MVP (Phases 0-6) vs MVP+ vs Plus tard, cf. 0.3. Le **schéma** est prêt pour tout ; l'**UI** est livrée par paliers. |
| 15 | Hébergement | Pas de région Supabase/Vercel en Afrique. | Supabase **Paris (eu-west-3)** ou Frankfurt + fonctions Vercel `cdg1` co-localisées. Mesurer la latence réelle depuis Conakry en Phase 6. Implications RGPD / loi locale sur les transferts : ⚠️ à documenter. |

### 0.3 Périmètre par paliers

| Palier | Contenu |
|---|---|
| **MVP** (Phases 0-6) | Auth, entreprise (onboarding), clients, produits/services, factures (brouillon → émise → partiellement payée → payée, retard calculé), duplication, PDF, lien public, partage WhatsApp/email/copie, paiements partiels + acomptes, **devis / proforma → facture**, **avoirs**, dashboard, recherche, filtres, export CSV, notifications in-app, paramètres, PWA + brouillons offline, modèles de relance, journal d'audit, suppressions logiques, landing. |
| **MVP+** (juste après) | Bons de livraison, paiements échelonnés (échéancier), reçus de paiement, rapports (balance âgée, TVA collectée), import CSV clients. |
| **Plus tard** | Agrégateur de paiement (Orange Money / MTN MoMo), WhatsApp Business API, SMS, UI équipe/rôles/invitations, facturation des plans, super-admin, API publique, EN, e-facturation certifiée si obligation. |

---

## 1. Architecture globale et décisions clés

### 1.1 Vue d'ensemble

```
Client (mobile/desktop, PWA)                       Vercel (fonctions en cdg1/Paris)                 Supabase (Paris)
┌─────────────────────────────┐   HTTPS   ┌───────────────────────────────────────┐   HTTPS   ┌────────────────────────────┐
│ React (RSC + îlots client)  │──────────▶│ Pages RSC · Server Actions            │──────────▶│ Auth (JWT, cookies SSR)    │
│ IndexedDB: brouillons+outbox│           │ Route Handlers: PDF, CSV, cron,       │  user JWT │ Postgres: RLS, triggers,   │
│ Service worker (Serwist)    │           │   webhooks, health                    │ (RLS on)  │   RPC SECURITY DEFINER     │
└─────────────────────────────┘           │ DAL (authn/authz) · Services · Repos  │           │ Storage: logos, PDF        │
                                          └───────────────────────────────────────┘           └────────────────────────────┘
Client final (WhatsApp) ──▶ /p/[token] (RSC, sans auth) ──▶ RPC anon get_public_document(token_hash)  (jamais de service role ici)
```

### 1.2 Couches (dépendances **descendantes uniquement**, imposées par ESLint)

```
app/ (routes minces) → features/ (UI par domaine) → server/ (actions, services, repos) → domain/ (pur)
                                                     components/ (UI génériques)
```
- `domain/` : TypeScript pur, **zéro** import React/Next/Supabase. Testable à 100 %, réutilisé par le serveur, le client et les tests.
- `server/` : `import 'server-only'`. Seul endroit qui parle à Supabase.
- `app/` : fichiers de route fins (parse params → appelle une feature ou une action).

### 1.3 Décisions clés, justifications, alternatives écartées

| # | Décision | Choix | Alternatives écartées | Pourquoi |
|---|---|---|---|---|
| D1 | Forme du système | **Monolithe modulaire** Next.js + Supabase | Backend séparé (NestJS), microservices | Une petite équipe ; moins de latence et d'ops ; Supabase fournit déjà Auth/DB/Storage. |
| D2 | Où vit la logique financière | **Hybride** : moteur TS pur (UX + validation serveur) **+** invariants et RPC transactionnelles en Postgres | Tout en TS (requêtes multiples non atomiques) ; tout en PL/pgSQL (UX temps réel impossible, tests plus lourds) | Atomicité et garanties en DB ; réactivité en TS ; dérive évitée par vecteurs d'or communs. |
| D3 | Représentation des montants | `bigint` en unités mineures + `BigInt` dans le moteur ; devise = table de référence avec exposant (GNF 0, XOF 0, EUR 2, USD 2) | `numeric(x,2)`, `float`, `decimal.js`, `dinero.js` | Zéro flottant ; BigInt évite les dépassements 2^53 sur qté×prix ; pas de dépendance ; portée limitée. |
| D4 | Multi-tenance | Schéma partagé + `company_id` partout + **RLS** | Schéma par tenant, base par tenant | Coût, migrations ingérables, incompatible Supabase standard. |
| D5 | Utilisateur ↔ entreprise | **N:N** via `memberships` (rôle par entreprise) | 1:1 | Un comptable gère plusieurs PME ; indispensable pour l'expansion et les équipes. |
| D6 | Numérotation | Table `document_sequences` verrouillée (`UPDATE … RETURNING`) dans la RPC d'émission | `SEQUENCE` Postgres, `max()+1`, UUID | Séquences = trous sur rollback ; `max()+1` = doublons en concurrence. |
| D7 | Statuts | **Cycle de vie stocké minimal** + **statut d'affichage dérivé** (vue SQL + fonction TS identique) | Stocker « en retard » via cron | Le retard dépend de la date : un cron = donnée périmée, jobs à surveiller, courses. |
| D8 | Immutabilité | Trigger DB (colonnes protégées) + snapshots émetteur/client + `content_hash` | Vérifs applicatives seules ; event sourcing | Le trigger s'applique même à un bug applicatif ou au service role ; event sourcing = surcoût injustifié. |
| D9 | PDF | `@react-pdf/renderer` **côté serveur** (runtime Node), généré et stocké à l'émission | Puppeteer/Chromium (poids, cold start sur Vercel), html2canvas/jsPDF (rasterisé, flou, lourd), `window.print()` (inutilisable sur mobile) | Vectoriel, léger, pas de navigateur headless. Coût : 2 rendus (aperçu HTML + PDF) alimentés par **un seul** `InvoiceViewModel` et **un seul** template paramétré en MVP. |
| D10 | Lecture/écriture des données | **RSC** pour les lectures, **Server Actions** pour les écritures, état des filtres dans l'**URL** | REST/tRPC/GraphQL en plus, TanStack Query partout | Moins de code et de JS client ; TanStack Query uniquement pour les combobox de recherche asynchrones et la file offline. |
| D11 | Écritures financières | **RPC SECURITY DEFINER** (lecture par RLS ; DML direct révoqué sur les tables financières) | DML direct via PostgREST | PostgREST n'a pas de transaction multi-tables (document + lignes) ; les RPC portent atomicité, idempotence, permissions, audit. |
| D12 | Offline | Brouillons IndexedDB (Dexie) + outbox idempotente ; **PWA via Serwist** | `next-pwa` (non maintenu), offline-first total | Cf. 0.2 #7. Background Sync absent d'iOS Safari → resynchronisation sur `online`/focus. |
| D13 | Auth | Supabase Auth : email + mot de passe + Google, **code OTP email** | SMS OTP d'abord, Auth0/Clerk | Coût, fiabilité SMS, dépendance externe supplémentaire. |
| D14 | Partage | **Lien public tokenisé** (hashé en base) + `wa.me` + **Web Share API avec fichier PDF** (Android/iOS) + email | WhatsApp Business API dès le jour 1 | Coût, validation Meta, gabarits approuvés, délais ; le lien `wa.me` couvre 90 % du besoin. |
| D15 | UI | **Tailwind + shadcn/ui (Radix)** | MUI, Chakra, Ant | Accessibilité Radix, poids, cohérence avec les captures. |
| D16 | i18n | **next-intl**, `fr` par défaut, clés dès le jour 1 | Textes en dur, react-i18next | Compatible RSC. |
| D17 | Graphiques | Recharts **chargé à la demande** derrière `<TrendChart/>` | Bibliothèque lourde en bundle initial | Budget JS mobile. Remplaçable par du SVG maison si besoin. |
| D18 | Validation | **Zod**, schémas partagés client/serveur dans `domain/validation` | Yup, valibot | Écosystème (RHF, next-safe-action). |
| D19 | Rate limiting | **Upstash Ratelimit** (ou Vercel Firewall si le plan le permet) | Limiteur en mémoire (inutile en serverless), table Postgres (latence) | Serverless = état partagé requis. |
| D20 | Paiement (futur) | Interface `PaymentProvider` + webhooks idempotents ; aucun fournisseur choisi | Coder un agrégateur précis maintenant | ⚠️ Disponibilité, frais, KYC à vérifier (pistes : Lengo Pay, CinetPay, Paycard, Djomy — non vérifiées). |
| D21 | Tests | Vitest + Testing Library + Playwright + **pgTAP** | Jest, Cypress | Rapidité ; pgTAP indispensable pour la RLS. |
| D22 | Gestion du repo | Une seule app, `pnpm`, pas de monorepo | Turborepo/Nx | Aucun besoin de partage inter-apps. |

### 1.4 Multi-tenance : deux pièges à connaître

1. **RLS ≠ sélecteur de tenant.** La RLS donne l'union de toutes les entreprises de l'utilisateur. La requête **doit** aussi filtrer `company_id = entreprise active` (cookie `active_company`, posé côté serveur, revalidé à chaque requête contre `memberships`). La RLS est le filet, pas le filtre.
2. **Références inter-tenant.** Sans précaution, un utilisateur pourrait rattacher le `customer_id` d'un autre tenant à sa facture. Contre-mesure : **clés étrangères composites** `(customer_id, company_id) → customers(id, company_id)` sur toute relation tenant-scopée.

### 1.5 Profils pays (prêt pour l'expansion)

Un objet de configuration `CountryProfile` (fichier TS + table de référence), sans logique pays dans le code métier :

- `code` (GN), devise par défaut, devises autorisées, taux TVA par défaut (1800 bp), région téléphonique, fuseau, locale (`fr-GN`, ⚠️ vérifier le rendu `Intl`).
- Identifiants légaux : `[{key:'nif', label:'NIF', required:true}, {key:'rccm', label:'RCCM'}]` — pour d'autres pays : IFU, NINEA, etc. via `company.extra_identifiers jsonb`.
- Régimes fiscaux **proposés** (liste modifiable, libellés ⚠️ à valider), mentions obligatoires (⚠️), modes de paiement disponibles, format de numérotation par défaut.
- Contrôles « prêt à émettre » : quels champs de l'entreprise doivent être remplis avant la première émission (⚠️ liste à valider avec la DGI).

### 1.6 Budgets de performance et de données (connexions lentes, data chère)

| Métrique | Budget |
|---|---|
| JS initial routes app (gzip) | ≤ 150 Ko (hors PDF/graphiques chargés à la demande) |
| JS initial landing | ≤ 90 Ko |
| LCP sur profil Lighthouse « mobile lent » (Moto G, Slow 4G) | ≤ 2,5 s (landing ≤ 2,0 s) |
| Poids landing | < 500 Ko |
| Police | 1 police variable, sous-ensemble latin (`next/font`) |
| Prefetch | `prefetch={false}` sur les longues listes ; respect de `navigator.connection.saveData` |
| Images | logo redimensionné côté client à l'upload (≤ 256 px, WebP) ; `next/image` |
| Skeletons | `loading.tsx` par segment ; `Suspense` pour streamer les blocs du dashboard |

---

## 2. Arborescence du projet et carte des routes

### 2.1 Arborescence

```
facturepro/
├─ docs/                      PLAN.md · adr/ · legal-checklist.md · design/
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/             0001_extensions · 0002_reference · 0003_core · 0004_documents ·
│  │                          0005_payments · 0006_sharing · 0007_audit · 0008_rls · 0009_rpc · 0010_views · 0011_storage
│  ├─ seed.sql                jeu de données guinéen réaliste (dev/staging uniquement)
│  └─ tests/                  pgTAP : rls/ · invariants/ · privileges/ · concurrency/
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/         / (landing) · tarifs · legal/{cgu,confidentialite,mentions-legales}
│  │  ├─ (auth)/              login · signup · verify · forgot-password · reset-password · auth/callback
│  │  ├─ (public)/            p/[token]/page.tsx · p/[token]/pdf/route.ts
│  │  ├─ (app)/               layout.tsx (shell + requireUser + entreprise active)
│  │  │  ├─ dashboard/  invoices/{page,new,[id],[id]/edit}  quotes/  credit-notes/  delivery-notes/
│  │  │  ├─ customers/{page,[id]}  products/  payments/  reports/  notifications/  onboarding/
│  │  │  └─ settings/{company,tax,payments,templates,team,billing,profile,security,data}
│  │  ├─ api/                 health · export/[resource] · documents/[id]/pdf · cron/reminders · webhooks/[provider]
│  │  └─ manifest.ts · sitemap.ts · robots.ts · error.tsx · global-error.tsx · not-found.tsx
│  ├─ domain/                 PUR — money/ tax/ documents/ payments/ reporting/ validation/ country/ permissions/ time/
│  ├─ server/                 auth/(dal) · db/ · repositories/(ports+adapters) · services/ · actions/ ·
│  │                          pdf/ · messaging/ · ratelimit/ · audit/ · storage/ · observability/
│  ├─ features/               UI par domaine : invoices/ customers/ products/ payments/ dashboard/ settings/ share/ …
│  ├─ components/             ui/ (shadcn) · layout/ · feedback/
│  ├─ lib/                    offline/ (Dexie, outbox) · pwa/ · i18n/ · utils
│  ├─ messages/               fr.json (en.json plus tard)
│  └─ middleware.ts           (proxy.ts si Next 16)
├─ tests/                     e2e/ · fixtures/ (golden-vectors.json, seed) · contract/
├─ public/                    icônes PWA
└─ .github/workflows/         ci.yml · db.yml · e2e.yml · lighthouse.yml
```

Routes en anglais (stables, simples), **interface en français**. Alternative écartée : slugs français localisés (complexité i18n sans gain SEO pour l'espace connecté).

### 2.2 Carte des routes

| Route | Groupe | Accès | Rendu | Notes |
|---|---|---|---|---|
| `/` | marketing | public | SSG | Landing |
| `/tarifs`, `/legal/*` | marketing | public | SSG | |
| `/login`, `/signup`, `/verify`, `/forgot-password`, `/reset-password` | auth | public (redirige si connecté) | SSR | Réponses génériques (anti-énumération) |
| `/auth/callback` | auth | public | Route Handler | OAuth + échange de code |
| `/p/[token]` | public | **token** | SSR dynamique `force-dynamic` | `noindex`, `no-store`, `Referrer-Policy: no-referrer`, rate limit |
| `/p/[token]/pdf` | public | **token** | Route Handler (Node) | |
| `/onboarding` | app | connecté sans entreprise | SSR | Assistant 3 étapes |
| `/dashboard` | app | membre | SSR + Suspense | |
| `/invoices`, `/quotes`, `/credit-notes`, `/delivery-notes` | app | membre | SSR | Filtres dans l'URL |
| `/invoices/new`, `/invoices/[id]/edit` | app | `documents:write` | SSR + client | Éditeur |
| `/invoices/[id]` | app | membre | SSR | Détail, timeline, paiements |
| `/customers`, `/customers/[id]`, `/products`, `/payments` | app | membre | SSR | |
| `/reports`, `/notifications` | app | membre | SSR | Rapports = MVP+ |
| `/settings/*` | app | selon permission | SSR | `team`/`billing` : UI plus tard |
| `/api/health` | api | public | Node | Vérifie la DB, sans données |
| `/api/export/[resource]` | api | `export:read` | Node stream | CSV |
| `/api/documents/[id]/pdf` | api | membre | Node | |
| `/api/cron/reminders` | api | `CRON_SECRET` | Node | |
| `/api/webhooks/[provider]` | api | signature | Node | Plus tard |

Toute route `(app)` : `export const dynamic = 'force-dynamic'` (jamais de cache d'une donnée financière ou d'une page à jeton) ; les mutations appellent `revalidatePath`/`revalidateTag`.

---

## 3. Schéma de base de données

### 3.1 Conventions

- PK `uuid` (`gen_random_uuid()` par défaut ; **le client peut fournir l'UUID** ⇒ création idempotente, indispensable en réseau instable).
- `company_id` sur **toute** table tenant-scopée, y compris les tables enfants (dénormalisé pour une RLS peu coûteuse).
- Horodatages `timestamptz` (UTC) ; **dates métier = type `date`** (`issue_date`, `due_date`), manipulées côté TS comme chaînes ISO `YYYY-MM-DD`, jamais via `new Date()`.
- Montants `bigint` `*_minor`, `CHECK (… BETWEEN 0 AND 10^13)` (garantit la sûreté IEEE-754 côté JS, PostgREST renvoyant du JSON number). Taux en **points de base** (`bp` : 1800 = 18,00 %). Quantités en **millièmes** (`quantity_milli` : 2500 = 2,5).
- Énumérations : `text` + `CHECK` (plus simple à migrer que les `ENUM`).
- Suppression logique : `deleted_at`, `deleted_by`. **Pas de `deleted_at IS NULL` dans les politiques SELECT** (sinon un `UPDATE … SET deleted_at` échoue : la nouvelle ligne doit satisfaire la politique SELECT) → filtrage dans les vues/requêtes.
- Concurrence optimiste : `version int` incrémenté par trigger ; toute mise à jour envoie `expected_version` (409 sinon).
- Schéma `private` (non exposé par PostgREST) pour les fonctions d'aide ; `SET search_path = ''` et noms qualifiés sur toute fonction `SECURITY DEFINER` ; `REVOKE EXECUTE … FROM PUBLIC, anon` puis `GRANT` explicite (Postgres accorde EXECUTE à PUBLIC par défaut).
- Vues avec `security_invoker = true` (sinon elles contournent la RLS).

### 3.2 Tables

**Référence (lecture seule)** : `currencies` (code, exposant, symbole, nom) · `countries` (profils) · `plans` · `role_permissions` (rôle, permission).

**Identité et accès**
- `profiles` — `id` = `auth.users.id`, nom, `phone_e164`, locale, avatar. Créé par trigger sur `auth.users`.
- `companies` — raison sociale, nom commercial, pays, devise par défaut, fuseau, adresse, contact, `logo_path`, `stamp_path`, `signature_path`, **`nif`, `rccm`**, `legal_form`, `tax_regime` (texte libre + suggestions du profil pays ⚠️), `vat_registered`, `default_vat_rate_bp`, `vat_exemption_mention`, `default_payment_terms_days`, `default_notes`, `default_footer`, `numbering_config jsonb` (préfixes, remise à zéro annuelle, padding), `invoice_theme jsonb` (couleur d'accent, position du logo), `extra_identifiers jsonb`, `plan_id`, `trial_ends_at`.
- `memberships` — PK `(company_id, user_id)`, `role` (`owner|admin|accountant|member|viewer`), `status`. Contrainte : un `owner` minimum (trigger).
- `invitations` — `company_id`, email, rôle, `token_hash`, `expires_at`, `accepted_at`.
- `company_payment_methods` — `method`, libellé, titulaire, `account_ref` (numéro mobile money E.164, RIB/IBAN), banque, instructions, `show_on_documents`, ordre.

**Ventes**
- `customers` — nom, `kind` (`individual|business`), contact, email, `phone_e164`, adresse, `nif`, notes, `search_text` (colonne générée, `unaccent` + minuscules, index trigramme). Solde = vue.
- `products` — `kind` (`product|service`), nom, description, unité, `unit_price_minor`, `currency_code`, `vat_exempt`, `vat_rate_bp`, `sku`, `is_active`.
- `document_sequences` — PK `(company_id, doc_type, period)`, `last_number`. `period` = année (ou 0 si pas de remise à zéro).
- `documents` (polymorphe : `quote | proforma | invoice | credit_note`) :
  - `number` (**NULL tant que brouillon**), `seq_year`, `seq_no`, `status` (`draft|issued` ; devis : + `accepted|declined|converted` ; l'expiration est **dérivée** de `valid_until`) ;
  - `customer_id` (FK composite) + `customer_snapshot jsonb` ; `issuer_snapshot jsonb` (figés à l'émission) ;
  - `currency_code`, `issue_date`, `due_date` (factures), `valid_until` (devis) ;
  - `subtotal_ht_minor`, `discount_bp`, `discount_minor`, `total_ht_minor`, `total_vat_minor`, `total_ttc_minor`, `vat_breakdown jsonb` (`[{rate_bp, exempt, base_minor, vat_minor}]`) ;
  - `amount_paid_minor`, `amount_credited_minor` (dénormalisés, maintenus par triggers, vérifiés par test d'invariant) ;
  - `payment_terms`, `notes` (visibles), `internal_notes` (**jamais exposées**), `footer`, `exemption_reason` ;
  - `related_document_id` (avoir → facture) et `converted_from_id` (facture ← devis) ;
  - `template_version`, `content_hash`, `pdf_path`, `pdf_sha256`, `issued_at`, `issued_by`, `first_shared_at`, `last_shared_at` ;
  - `version`, `created_by/at`, `updated_at`, `deleted_at/by`.
- `document_lines` — `company_id`, `document_id` (FK composite), `position`, `product_id` (FK composite, nullable), `description`, `unit`, `quantity_milli > 0`, `unit_price_minor ≥ 0`, `discount_bp` 0..10000, `vat_exempt`, `vat_rate_bp`, `line_total_ht_minor` (résultat du moteur, revérifié serveur).
- `document_installments` (MVP+) — échéancier : `due_date`, `amount_minor`, `label` ; somme = total (vérifiée à l'émission).
- `delivery_notes`, `delivery_note_lines` (MVP+) — sans montants, quantités livrées par ligne, livraisons partielles.

**Encaissements**
- `payments` — `document_id` (FK composite), `amount_minor > 0`, `currency_code` (= devise du document, trigger), `method` (`orange_money|mtn_momo|bank_transfer|cheque|cash|other`), `kind` (`payment|deposit`), `reference`, `paid_on date`, `note`, `recorded_by/at`, `request_id uuid` (idempotence, `UNIQUE(company_id, request_id)`), `voided_at/by`, `void_reason`. **Jamais de DELETE** : annulation = `voided_at`.
  - Index unique partiel `(company_id, method, lower(reference))` pour les modes mobile money, `WHERE reference IS NOT NULL AND voided_at IS NULL` : empêche d'enregistrer deux fois la même transaction Orange Money / MTN MoMo.

**Partage et communication**
- `share_links` — `document_id`, **`token_hash`** (SHA-256, unique ; le jeton en clair n'est jamais stocké), `expires_at`, `revoked_at`, `first_viewed_at`, `last_viewed_at`, `view_count`.
- `message_templates` — `company_id` NULL = modèle système ; `channel` (`whatsapp|sms|email`), `kind` (`send|reminder_before|reminder_due|reminder_late_1|reminder_late_2|…`), `locale`, `body` avec variables `{{client}} {{numero}} {{montant}} {{echeance}} {{lien}}`.
- `reminder_log` — document, canal, `kind`, ouvert par (le clic « Relancer » ouvre WhatsApp ; l'envoi effectif est invérifiable).
- `notifications` — in-app (destinataire, type, payload, `read_at`).

**Traçabilité**
- `activity_events` — timeline produit (créé, émis, partagé, consulté, paiement, avoir…) ; alimente « dernières activités ».
- `audit_logs` — **append-only** : table, `row_id`, action, acteur, `old`/`new` (diff jsonb), IP/UA/`request_id` pour les actions sensibles. Alimenté par trigger générique `SECURITY DEFINER`. Séparé de `activity_events` : finalités différentes (conformité vs produit).

**Abonnement (prévoir, non activé)** : `plans`, `subscriptions` (`company_id`, `plan_id`, statut, essai, période), `usage_counters`, couche d'**entitlements** `can(company, feature)` appelée dès la Phase 3 (plan « illimité » par défaut). Super-admin : `platform_admins` (Phase 7).

### 3.3 Contraintes et triggers clés

| Objet | Règle |
|---|---|
| `documents` | `CHECK ((status='draft') = (number IS NULL))` · `UNIQUE (company_id, doc_type, number) WHERE number IS NOT NULL` · `total_ttc = total_ht + total_vat` · `total_ht = subtotal − discount` · `0 ≤ paid` et `paid + credited ≤ total_ttc` · `due_date ≥ issue_date` (factures) · un avoir exige `related_document_id`. |
| **Immutabilité** 🔒 | Trigger `BEFORE UPDATE/DELETE` : si `OLD.status <> 'draft'`, seules les colonnes de la liste blanche (`amount_paid_minor`, `amount_credited_minor`, `first_shared_at`, `last_shared_at`, `pdf_path`, `pdf_sha256`, `internal_notes`, `updated_at`, `version`, statut de devis) peuvent changer ; **DELETE toujours refusé** ; modification des lignes/échéanciers d'un document non brouillon refusée. S'applique aussi au service role. |
| Soldes | Trigger sur `payments` (insert/void) et sur avoirs : met à jour `amount_paid/credited` après verrou `FOR UPDATE` de la facture. **Surpaiement refusé**. Devise du paiement = devise du document. |
| Audit | Trigger générique sur toutes les tables métier. |
| Rôles | Dernier `owner` non supprimable/rétrogradable. |

### 3.4 RPC (SECURITY DEFINER, permission vérifiée **explicitement** car ces fonctions contournent la RLS)

`create_company` · `save_draft(document, lines, expected_version)` (atomique doc + lignes) · **`issue_document(id, expected_version)`** (verrou, contrôles, recalcul SQL des lignes/totaux, attribution du numéro, snapshots, hash, événement ; **idempotente** : ré-émettre un document déjà émis renvoie le même numéro — double-tap sur réseau lent) · `record_payment(…, request_id)` · `void_payment` · `create_credit_note` · `convert_quote_to_invoice` · `create_share_link` / `revoke_share_link` · **`get_public_document(token_hash)`** (seule porte d'entrée `anon`, renvoie un JSON minimal) · `dashboard_summary(company, from, to)` · `list_reminders_due(company)` · `soft_delete_*` · `accept_invitation`.

`issue_document`, en substance : verrouille la ligne du document → vérifie statut `draft` et version → vérifie prérequis (client, ≥ 1 ligne, champs légaux de l'entreprise requis par le profil pays, date d'émission ≥ dernière émission de la séquence ⚠️) → recalcule via fonctions SQL `calc_line_ht()` / `calc_totals()` et compare aux valeurs stockées → `INSERT … ON CONFLICT DO UPDATE SET last_number = last_number + 1 RETURNING` sur `document_sequences` (le verrou de ligne sérialise les émissions concurrentes de la même séquence) → formate le numéro → fige les snapshots → calcule `content_hash` → passe en `issued` → écrit événement + audit. **Tout dans une seule transaction : un échec annule aussi l'incrément du compteur ⇒ pas de trou.**

### 3.5 Vues (toutes `security_invoker`)

- `v_documents` : ajoute `balance_minor = total_ttc − paid − credited`, `is_overdue`, **`display_status`** (voir §4.6), avec `today` calculé dans le fuseau de l'entreprise.
- `v_customer_balances` : encours par client et par devise.
- `v_dashboard_*` si nécessaire (sinon RPC).

### 3.6 Index

| Table | Index |
|---|---|
| `documents` | `(company_id, doc_type, status, issue_date DESC)` · `(company_id, customer_id, issue_date DESC)` · partiel `(company_id, due_date) WHERE status='issued' AND doc_type='invoice' AND (total_ttc_minor − amount_paid_minor − amount_credited_minor) > 0` (impayées ; `due_date < today` filtre dessus) · trigramme sur `customer_snapshot->>'name'` et `number` (`pg_trgm` + `unaccent`) |
| `document_lines` | `(document_id, position)` · `(company_id, product_id)` |
| `payments` | `(company_id, document_id)` · `(company_id, paid_on DESC)` · unique partiel de référence mobile money |
| `customers`, `products` | `(company_id, deleted_at)` · trigramme sur `search_text` |
| `memberships` | `(user_id, company_id)` (couvre la RLS) |
| `share_links` | unique `token_hash` · `(document_id)` |
| `audit_logs` | `(company_id, created_at DESC)` · `(company_id, table_name, row_id)` ; partitionnement mensuel plus tard |
| Toutes les FK | indexées |

Pagination **keyset** `(issue_date, id)` plutôt qu'`OFFSET` (stable, rapide, adaptée au « Voir plus » mobile).

### 3.7 Politiques RLS

Principe : **RLS activée sur toutes les tables du schéma `public`, refus par défaut** (⚠️ `FORCE ROW LEVEL SECURITY` à n'ajouter qu'après vérification que les fonctions `SECURITY DEFINER` fonctionnent toujours ; le rôle propriétaire de Supabase contourne la RLS). Deux familles :
- **Tables financières** (`documents`, `document_lines`, `document_installments`, `payments`, `share_links`, `document_sequences`, `delivery_notes*`) : **SELECT par RLS ; INSERT/UPDATE/DELETE révoqués pour `authenticated`** ; toute écriture passe par RPC.
- **Entités simples** (`customers`, `products`, `company_payment_methods`, `message_templates`, réglages) : CRUD direct par RLS avec permission.

Fonctions d'aide (`private`) : `is_member(company_id)` et `has_permission(company_id, perm)`, `STABLE SECURITY DEFINER`, avec `(select auth.uid())` pour permettre le cache d'initplan et éviter la récursion RLS sur `memberships`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | soi ; co-membres via vue limitée | trigger auth | soi | ✗ |
| `companies` | membre | RPC `create_company` | `settings:write` | ✗ (RPC owner, logique) |
| `memberships`, `invitations` | membre (owner/admin : tous ; sinon soi) | RPC | RPC | RPC (garde-fou dernier owner) |
| `customers`, `products`, `company_payment_methods`, `message_templates` | membre | permission `*:write` | permission `*:write` (inclut la suppression logique) | ✗ |
| `documents`, `document_lines`, `document_installments` | membre | ✗ (RPC `save_draft`) | ✗ (RPC) | ✗ |
| `payments` | membre | ✗ (RPC) | ✗ (RPC void) | ✗ |
| `share_links` | membre (le hash seul, jamais le jeton) | ✗ (RPC) | ✗ (RPC) | ✗ |
| `activity_events`, `notifications` | membre / destinataire | triggers, RPC | `notifications.read_at` par le destinataire | ✗ |
| `audit_logs` | `audit:read` (owner, admin, accountant) | ✗ (triggers) | ✗ | ✗ |
| Tables de référence | tous les authentifiés | ✗ | ✗ | ✗ |
| `anon` | **aucune table** ; uniquement `EXECUTE get_public_document` | | | |

**Rôles → permissions par défaut** (table `role_permissions`, extensible en rôles personnalisés) : `owner` tout + facturation/suppression de l'entreprise ; `admin` tout sauf facturation/propriété ; `accountant` lecture + paiements (enregistrer/annuler) + avoirs + exports + rapports ; `member` brouillons, clients, produits, émission, partage, enregistrement de paiement ; `viewer` lecture seule. ⚠️ Un caissier peut-il enregistrer un paiement ? (question §10). MVP : seul `owner` visible dans l'UI, mais les politiques utilisent déjà `has_permission`.

**Storage** : bucket `logos` (chemin `{company_id}/…`, écriture réservée aux membres avec `settings:write`, lecture publique du logo seulement) ; bucket `documents` **privé** (`{company_id}/{document_id}/…`), accès par URL signée courte générée côté serveur après vérification du jeton ou de l'appartenance ; cachet/signature privés.

### 3.8 Migrations

SQL versionné dans `supabase/migrations`, jamais de modification via le dashboard ; migrations **rétrocompatibles** (expand/contract) pour permettre le rollback applicatif sans rollback DB ; `squawk` en CI pour repérer les verrous dangereux ; types TS générés (`supabase gen types`) avec diff bloquant en CI.

---

## 4. Règles de calcul monétaire

### 4.1 Représentation

| Élément | Stockage | Exemple |
|---|---|---|
| Montant | entier en unités mineures + code devise | `1 250 000 GNF` → `1250000` (exposant 0) ; `19,99 EUR` → `1999` (exposant 2) |
| Quantité | entier en millièmes | `2,5` → `2500` |
| Taux TVA / remise | points de base | `18 %` → `1800` ; `5 %` → `500` |
| Date métier | `date` / chaîne ISO | `2026-09-21` |

Bornes : montant ≤ 10^13 unités mineures, quantité ≤ 10^9 millièmes (⇒ produit intermédiaire jusqu'à 10^22 : **BigInt obligatoire** dans le moteur). Entrées **positives uniquement** (prix ≥ 0, remise 0..100 %) : les corrections passent par les avoirs.

### 4.2 Algorithme (une seule implémentation logique, répliquée en SQL)

Arrondi : **demi-supérieur** (*half up*, « half away from zero » sur des valeurs positives), en arithmétique entière (`(2n + d) ÷ 2d`), **un seul arrondi par étape**.

1. **Ligne** : `net_i = round( qty_milli × prix_minor × (10000 − remise_bp) ÷ (1000 × 10000) )`. Un seul arrondi (jamais d'arrondi intermédiaire prix×qté puis remise).
2. **Groupes de TVA** : regrouper les lignes par `(exonéré | taux_bp)` ; `G_r = Σ net_i`.
3. **Remise globale** (pourcentage, MVP) : `D_r = round(G_r × remise_globale_bp ÷ 10000)` **par groupe** ; `G'_r = G_r − D_r` (la remise est ainsi répartie sur chaque taux, la TVA reste juste).
4. **TVA par groupe** : `TVA_r = round(G'_r × taux_bp ÷ 10000)` ; groupe exonéré : 0.
5. **Totaux** : `HT = Σ G'_r` ; `TVA = Σ TVA_r` ; `TTC = HT + TVA`. Remise affichée = `Σ D_r`.

**Règle retenue : TVA calculée par groupe de taux sur la somme des lignes (et non ligne par ligne).** Les lignes affichent des montants HT ; TVA et TTC n'apparaissent qu'aux totaux, ce qui est cohérent avec l'usage local. ⚠️ Confirmer avec l'expert-comptable/DGI. Exemple de l'écart : deux lignes de 275 GNF à 18 % → par ligne `50 + 50 = 100` ; par groupe `round(550 × 0,18) = 99`.

### 4.3 Exemples de référence (à intégrer aux vecteurs d'or)

**A — GNF, cas simple** : L1 3 × 125 000 (18 %) = 375 000 · L2 2,5 × 40 000, remise 10 % = 90 000 (18 %) · L3 1 × 1 000 000 (exonérée).
Groupe 18 % = 465 000 → TVA `465 000 × 0,18 = 83 700` · exonéré = 1 000 000.
**HT 1 465 000 · TVA 83 700 · TTC 1 548 700 GNF.**

**B — arrondi *half up*** : ligne 1 × 2 725 GNF à 18 % → `490,5` → **491** ; TTC 3 216.

**C — remise globale 5 %** appliquée au cas A (la remise s'applique à **chaque** groupe) :
groupe 18 % : `D = 23 250` → `G' = 441 750` → TVA `79 515` ; groupe exonéré : `D = 50 000` → `G' = 950 000` → TVA 0.
**HT 1 391 750 · TVA 79 515 · TTC 1 471 265 GNF.**

**D — EUR** : 3 × 19,99 € (1999 cts) à 18 % → HT `5997` ; TVA `round(5997 × 0,18) = 1079` (1079,46) ; TTC `7076` = **70,76 €**.

(Vérifier chaque vecteur à la main **et** par le code ; ils deviennent la source de vérité partagée TS/SQL.)

### 4.4 Paiements et soldes

- `solde = total_ttc − Σ paiements (non annulés, kind ∈ {payment, deposit}) − Σ avoirs émis`.
- Paiement : `0 < montant ≤ solde` (surpaiement refusé ; le trop-perçu sera géré comme « crédit client » plus tard) ; devise = celle du document ; date ≤ aujourd'hui (fuseau entreprise) ; référence recommandée pour le mobile money, **unique** par (mode, référence) tant que non annulé.
- **Acompte (MVP)** : paiement partiel avec `kind = deposit`, distinct des autres pour le reporting.
- Annulation d'un paiement : `voided_at` + motif + audit ; recalcule le solde.
- **Échéancier (MVP+)** : la somme des échéances = total ; les paiements sont imputés **FIFO** aux échéances, calcul à la lecture (pas de table d'allocation). Une facture est en retard si une échéance impayée est dépassée.
- Verrou `FOR UPDATE` sur la facture pendant `record_payment`/`create_credit_note` (pas de course entre deux paiements).

### 4.5 Avoirs

- Document `credit_note`, numérotation propre (`AV-2026-0001`), **montants positifs** avec `related_document_id`.
- Somme des avoirs d'une facture ≤ son total (moins ce qui est déjà avoiré, en quantités par ligne).
- Avoir total ⇒ statut d'affichage de la facture « **Annulée** (avoir AV-…) » ; la facture reste inchangée et consultable.
- Facture déjà payée puis avoirée : le solde devient négatif → signalé comme **crédit client** (remboursement suivi en MVP+). ⚠️ À valider avec l'expert-comptable (écritures, TVA).

### 4.6 Statut d'affichage (fonction TS = vue SQL, mêmes tests)

Cycle de vie **stocké** : `draft → issued`. Le reste est **dérivé** :

| Ordre de priorité | Condition | Libellé |
|---|---|---|
| 1 | `status = draft` | Brouillon |
| 2 | `amount_credited ≥ total` | Annulée (avoir) |
| 3 | `solde = 0` | Payée |
| 4 | `solde > 0` et échéance dépassée (`due_date < aujourd'hui` dans le fuseau de l'entreprise) | En retard (+ « x % payé » si partiel) |
| 5 | `solde > 0` et `paid > 0` | Partiellement payée |
| 6 | sinon | Envoyée si `first_shared_at`, sinon Émise |

Les **filtres** exposent aussi les axes séparément (`en retard` et `partiellement payée` ne s'excluent pas). Guinée = GMT sans heure d'été, mais le fuseau est stocké par entreprise (expansion). « Aujourd'hui » vient toujours d'une **Clock injectable** (jamais `Date.now()` dans `domain/`), ce qui rend les tests de retard déterministes.

### 4.7 Définitions du dashboard (à figer avant de coder)

| KPI | Définition |
|---|---|
| Total factures | Nombre de factures émises sur la période (par `issue_date`), hors avoirs |
| Montant facturé | Σ `total_ttc` des factures émises sur la période **− avoirs émis sur la période** |
| Encaissé | Σ paiements non annulés dont `paid_on` est dans la période |
| En attente | Σ soldes des factures émises **non échues** |
| En retard | Σ soldes des factures échues |
| Évolution | Facturé vs encaissé par mois (`date_trunc` dans le fuseau entreprise) |

Tout est **groupé par devise** ; jamais de somme inter-devises. ⚠️ HT ou TTC pour « facturé » : choix produit + avis comptable (§10).

### 4.8 Formatage, saisie, montant en lettres

- Format d'affichage **maison** : `1 250 000 GNF` (nombre formaté par `Intl.NumberFormat` avec décimales selon l'exposant, **+ code ISO**), car `style:'currency'` peut afficher un symbole local (« FG »). ⚠️ `Intl` en `fr` utilise l'espace fine insécable U+202F : remplacer par U+00A0 (ou espace normale) — de nombreuses polices PDF n'ont pas ce glyphe (carré « tofu »). Test de rendu PDF dédié.
- Saisie : `parseMoneyInput` accepte « 1 250 000 », « 1250000 », « 1.250.000 », virgule décimale ; refuse les décimales pour GNF/XOF ; clavier numérique (`inputmode="decimal"`).
- **Montant en toutes lettres** (usage courant sur les factures d'Afrique francophone : « Arrêtée la présente facture à la somme de … francs guinéens ») : `amountInWords()` avec cas français délicats (quatre-vingts/quatre-vingt-un, cent/cents, mille invariable, « un million **de** francs »). Bibliothèque (`n2words`) ou implémentation maison, avec tests exhaustifs. ⚠️ Confirmer le besoin auprès d'utilisateurs.
- Dates : `dd/MM/yyyy` (`Intl.DateTimeFormat` avec `timeZone`) ; téléphones : **libphonenumber-js** (métadonnées minimales), région `GN`, stockage **E.164**, **sans coder en dur les préfixes d'opérateurs** (ils changent) ; NIF/RCCM : validation souple (non vide, alphanumérique) + avertissement, **pas de format imposé** tant que non vérifié.

### 4.9 Devises et limites

- Une devise par document ; `currency_code` immuable après émission ; pas de conversion automatique.
- Option future : `fx_rate_to_base` figé à l'émission pour un « équivalent GNF » (⚠️ §10).
- Bornes de saisie en UI et en CHECK SQL (§4.1).

### 4.10 Tests propres au moteur

- **Vecteurs d'or** (`tests/fixtures/golden-vectors.json`) : ≥ 60 cas (0 %, 100 %, exonérations mixtes, remise ligne+globale, arrondis limites `.5`, EUR/USD/GNF, très grands montants, quantités décimales) exécutés par Vitest **et** pgTAP.
- **Tests de propriétés** (fast-check) : `TTC = HT + TVA` ; `Σ groupes = total` ; ordre des lignes sans effet ; monotonie ; pas de valeur négative ; idempotence du recalcul ; résultat identique client/serveur.
- Lint : interdire `parseFloat`, `toFixed`, `Number()` sur des montants dans `domain/money`, `domain/tax`.

---

## 5. Composants, état, data fetching, server actions

### 5.1 Découpage des composants

**Génériques (`components/`)** : `Button, Input, MoneyInput, MoneyText, PhoneInput, DateInput` (natif sur mobile), `Combobox, Select, Sheet` (bottom-sheet mobile) `, Dialog, ConfirmDialog, Tabs, Badge, StatusBadge` (couleur + icône + texte), `Card, DataList` (tableau ≥ md, cartes en dessous)`, EmptyState, Skeleton*, Toaster, OfflineBanner, SyncIndicator, PageHeader, KpiTile, TrendChart`.

**Shell** : `AppShell` = sidebar repliable (≥ 1024 px) **ou** barre haute + **barre d'onglets basse** avec action « + » (mobile) ; `WorkspaceSwitcher`, `GlobalSearch` (palette ⌘K), `NotificationsBell`, `TrialCard`.

**Factures (`features/invoices/`)**
- Liste (RSC) : `InvoiceFilters` (client, état dans l'URL), `InvoiceTable`/`InvoiceCardList`, pagination « Voir plus ».
- Détail (RSC) : `Timeline`, `PaymentsList`, `RecordPaymentSheet`, `ShareSheet` (WhatsApp / PDF / lien / email), `CreditNoteDialog`, `ActionsMenu`.
- Éditeur (client) : `InvoiceEditor` → `HeaderFields`, `CustomerCombobox` (création à la volée), `LineItemsEditor` / `LineItemRow`, `TotalsPanel` (`aria-live="polite"`, debouncé), `PaymentTermsFields`, `NotesField`, `InvoicePreview` (HTML), `MessagePreview` (WhatsApp/email), `StickyTotalsBar` (mobile), `EditorActions` (**Enregistrer le brouillon** / **Émettre et envoyer**).

### 5.2 Où vit chaque état

| Type d'état | Où | Outil |
|---|---|---|
| Données serveur (listes, détail, dashboard) | Serveur (RSC) | Repositories → Supabase ; `revalidateTag` après mutation |
| Filtres, tri, recherche, curseur | **URL** | `searchParams` parsés par Zod (ou `nuqs`) |
| Formulaires | Client | React Hook Form + Zod resolver + `useFieldArray` |
| Totaux du formulaire | Dérivé | `computeTotals()` (domain) via `useWatch`, mémoïsé |
| Brouillon local + file d'attente | IndexedDB | Dexie (`drafts`, `outbox`) |
| Recherche asynchrone (combobox) | Client | TanStack Query (seul usage) |
| Optimisme | Client | `useOptimistic` (paiement ajouté, statut) + retour arrière + toast |
| État UI transitoire | Local | `useState`/`useReducer` ; pas de store global |
| Préférences (sidebar repliée, entreprise active) | Cookie | lu côté serveur (pas de flash) |

### 5.3 Pipeline d'une écriture

```
Formulaire ─▶ Zod (client, retour immédiat)
          ─▶ Server Action « createAction({ input, permission, rateLimit?, handler }) » :
               1. requireUser() + requireCompany() + requirePermission()      ← DAL
               2. Zod (serveur, source de vérité)
               3. Rate limit (actions coûteuses/sensibles)
               4. Service (cas d'usage) → Repository → RPC Supabase (JWT utilisateur, RLS active)
               5. revalidateTag / revalidatePath
               6. return Result<T, AppError> ; ne jette jamais vers le client
```
Les Server Actions sont des **endpoints HTTP publics** : authentification, autorisation et validation à chaque appel, sans exception. `serverActions.allowedOrigins` configuré.

Modèle d'erreur : `AppError { code: VALIDATION | FORBIDDEN | NOT_FOUND | VERSION_CONFLICT | RATE_LIMITED | INVARIANT | UNAVAILABLE | UNKNOWN, message (FR), fieldErrors?, requestId }` ; `error.tsx` par segment ; **404 et non 403** sur une ressource d'un autre tenant (pas d'énumération).

### 5.4 Brouillons, hors-ligne, réseau instable

- **Autosave local** debouncé (~500 ms) à chaque frappe ; bannière « Brouillon récupéré » au retour.
- **Synchro serveur** throttlée (à la perte de focus, toutes ~10 s si modifié, une requête en vol à la fois) avec `expected_version` ; conflit 409 → écran de fusion simple (garder ma version / recharger).
- UUID généré côté client ⇒ la création est **idempotente** (un retry ne crée pas de doublon).
- **Outbox** : mutations « brouillon » rejouées au retour du réseau (`online`, `visibilitychange`) ; pas de Background Sync (indisponible sur iOS).
- Émission, paiement, avoir : **bouton désactivé hors ligne** avec explication claire ; retries protégés par `request_id`.
- ⚠️ Safari/iOS peut purger IndexedDB des sites non installés : le local est un **cache de confort**, la source de vérité est le serveur dès qu'il y a du réseau ; inviter à « Installer l'application ».
- Web Share API niveau 2 pour partager **le PDF** directement vers WhatsApp (repli : lien).

### 5.5 Repositories (ports & adapters)

Interfaces par agrégat (`DocumentsRepository`, `CustomersRepository`, `PaymentsRepository`, …). Adapters : **Fixture** (Phase 1), **Local/Dexie** (Phase 2), **Supabase** (Phase 3+). Une suite de **tests de contrat** unique s'exécute sur chaque adapter. Les cas d'usage (`issueDocument`, `recordPayment`, …) sont des fonctions du domaine qui prennent un état et renvoient un nouvel état ; l'adapter local les applique, la RPC SQL les reproduit, les vecteurs d'or garantissent l'équivalence.

### 5.6 Accessibilité (WCAG 2.1 AA visé)

Contrastes ≥ 4,5:1 ; focus visible ; cibles tactiles ≥ 44 px ; clavier complet dans l'éditeur de lignes (Entrée = nouvelle ligne, Suppr. avec confirmation) ; libellés sur tous les champs, résumé d'erreurs ; statuts jamais par la couleur seule ; `prefers-reduced-motion` ; zoom 200 % ; test manuel TalkBack (Android) en Phase 6 ; `axe` en CI.

---

## 6. Phases détaillées

> Estimations **indicatives** (1 dev + assistant IA, effort concentré) : P0 2-3 j · P1 4-6 j · P2 8-12 j · P3 6-9 j · P4 3-5 j · P5 3-4 j · P6 5-8 j ⇒ **~6-9 semaines** pour le MVP. Elles seront revues après tes réponses.
> **Définition de « fini » (toutes phases)** : types stricts, Zod, i18n (aucun texte en dur), états vide/chargement/erreur, mobile 360 px vérifié, a11y (axe), test unitaire ou e2e, audit/RLS testés si donnée métier.

### Phase 0 — Fondations et cœur de domaine (ajoutée)

**Objectif** : sol solide avant toute UI ; le cœur financier existe, est testé et documenté.

Tâches (ordre) :
1. Init : git, `pnpm`, Next (version validée §10), TypeScript **strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint (règles de frontières entre couches, ban `parseFloat/toFixed` sur l'argent), Prettier, Husky + lint-staged.
2. CI GitHub Actions : lint, typecheck, tests unitaires, build ; protections de branche.
3. `env.ts` validé par Zod + `.env.example` ; séparation stricte des variables serveur/`NEXT_PUBLIC_`.
4. Tailwind + tokens (couleur de marque, rayons, espacements, typo) + shadcn/ui + police ; `next-intl` + `fr.json`.
5. **`domain/`** en TDD : `money`, `parse/format`, `totals`, `status`, `numbering` (formateur), `phone`, `time/clock`, `words` ; vecteurs d'or + tests de propriétés.
6. Schémas Zod de toutes les entités ; profil pays `GN` ; matrice de permissions.
7. **Jeu de données de démonstration guinéen** (clients, produits, ~60 documents dans tous les états) : alimente Phases 1, 2 et le seed Phase 3.
8. ADR 0001-0010 (Annexe C) ; `docs/legal-checklist.md` (Annexe D).

Critères d'acceptation : `pnpm verify` vert en CI ; couverture `domain/` ≥ 95 % (lignes et branches) ; les 4 exemples §4.3 reproduits ; aucune dépendance de `domain/` vers React/Next/Supabase (lint).
Risques : sur-ingénierie du domaine → **timebox** ; choix de version Next tardif → trancher §10 en premier.

### Phase 1 — Pages connectées (coquille UI, données factices)

**Objectif** : toute l'application est navigable et fidèle au design ; aucune logique réelle.

Tâches :
1. Layouts : `(marketing)`, `(auth)`, `(public)`, `(app)` (sidebar desktop / barre basse mobile).
2. Bibliothèque de composants (§5.1) + page interne `/_kit` (galerie, exclue de la prod).
3. Pages : dashboard, factures (liste, détail, éditeur + aperçu), devis, avoirs, clients (liste/détail), produits, paiements, notifications, paramètres (onglets), onboarding, auth (visuel), page publique `/p/[token]` (visuel).
4. Adapter **Fixture** (données du jeu de démo) branché derrière les interfaces Repository.
5. `loading.tsx`, `error.tsx`, `not-found.tsx`, états vides.
6. Revue design avec toi contre les captures (checklist Annexe A).

Critères : tous les liens de navigation fonctionnent (crawl Playwright sans lien mort) ; rendu correct à 360/768/1280 px ; axe : 0 violation sérieuse ; Lighthouse mobile ≥ 90 (perf) sur liste et éditeur ; **ta validation visuelle**.
Risques : dérive du design → tokens + revue ; effet « pixel-perfect » chronophage → tolérance définie avec toi.

### Phase 2 — Interactivité avec données locales

**Objectif** : le produit fonctionne de bout en bout **localement**, avec les vraies règles métier.

Tâches :
1. Ports Repository + adapter **Dexie** ; cas d'usage du domaine (émission avec numérotation locale sans trou, immutabilité, paiements, avoirs, conversion devis→facture) — **mêmes règles** que celles à répliquer en SQL.
2. Éditeur de facture : RHF + `useFieldArray`, calculs temps réel (`domain`), combobox client/produit, création client à la volée, TVA par ligne/exonération, remises, échéance par défaut selon les conditions, aperçu HTML, bascule Édition/Aperçu sur mobile, barre de totaux collante.
3. Actions : brouillon (autosave), **émettre**, dupliquer, paiement partiel/acompte, annuler un paiement, avoir, devis → facture, **partage** (`wa.me` avec modèles de message, Web Share PDF, copie du lien factice), PDF (rendu client `react-pdf` chargé à la demande), export CSV (voir ci-dessous).
4. Listes : recherche, filtres, tri, « Voir plus ».
5. Dashboard calculé par les **mêmes définitions** (`domain/reporting`) ; widget « À relancer aujourd'hui » (1 tap → WhatsApp avec le bon message).
6. Paramètres entreprise persistés ; « prêt à émettre » selon le profil pays.
7. PWA de base (manifest, icônes, Serwist : précache du shell, page hors-ligne), récupération de brouillons.
8. Outil **dev** : horloge simulée (avancer la date pour tester les retards), import/export JSON des données locales, réinitialisation de la démo.
9. Tests : unitaires, composants, e2e Playwright (IndexedDB) sur les parcours clés.

CSV : UTF-8 **avec BOM**, séparateur `;`, dates `jj/mm/aaaa`, virgule décimale pour EUR/USD, **neutralisation de l'injection de formules** (préfixer `'` les cellules commençant par `= + - @`).

Critères : parcours complet *créer → émettre → payer partiellement → passer en retard (horloge) → avoir* ; totaux identiques aux vecteurs d'or ; deux onglets ne peuvent pas produire de numéro en double (Web Locks / `BroadcastChannel` pour la simulation locale) ; brouillon survivant à un rechargement et à un mode avion ; aucun `float` d'argent (lint) ; a11y et budgets §1.6 respectés.
Risques : divergence règles locales/SQL → cas d'usage dans `domain/` + tests de contrat ; IndexedDB volatile sur iOS → données Phase 2 = démo seulement ; complexité de l'éditeur → itérations courtes avec toi.

### Phase 3 — Base Supabase + tests

**Objectif** : le même comportement, garanti par la base et testé.

Tâches :
1. Supabase CLI local (`supabase start`), `config.toml`, projet **staging** (Paris).
2. Migrations dans l'ordre de l'arborescence (§2.1) : extensions (`pg_trgm`, `unaccent`), schéma `private`, référence, tables, contraintes, triggers (version, `updated_at`, **immutabilité**, soldes, audit), RPC + `GRANT/REVOKE`, vues `security_invoker`, RLS + politiques, Storage.
3. Auth **locale** minimale pour les tests (utilisateurs de test via `supabase_test_helpers`) — l'UI d'auth arrive en Phase 4.
4. Génération des types ; adapter **Supabase** ; bascule par variable d'environnement ; server actions branchées.
5. **Tests de contrat** (adapter local *et* Supabase) ; **pgTAP** : matrice RLS, immutabilité, numérotation, paiements, avoirs, suppression logique, privilèges de fonctions ; **test de concurrence** (30 émissions parallèles ⇒ numéros contigus, sans doublon) ; vecteurs d'or côté SQL.
6. Recherche (trigrammes), `dashboard_summary`, export CSV en streaming, route PDF + stockage à l'émission, RPC de lien public + page `/p/[token]`.
7. Performance : jeu de 50 000 documents ; `EXPLAIN ANALYZE` des requêtes clés.
8. CI : `supabase db reset` + `supabase test db` à chaque PR ; méta-test « aucune table `public` sans RLS » ; advisors/lints Supabase.

Critères : `supabase test db` vert ; **100 % des tables** couvertes par la matrice RLS ; `anon` ne lit aucune table ; p95 d'une liste < 100 ms à 50 k documents ; numéros sans trou sous concurrence ; types générés sans `any` ; advisors : 0 alerte critique.
Risques : coût des politiques RLS (→ helpers `STABLE`, `(select auth.uid())`, index `memberships`) ; erreurs de privilèges sur fonctions `SECURITY DEFINER` (→ tests de privilèges) ; dérive TS/SQL (→ vecteurs d'or) ; migrations bloquantes (→ `squawk`).

### Phase 4 — Authentification

**Objectif** : identité, session sûre, entreprise active, défense en profondeur côté serveur.

Tâches :
1. `@supabase/ssr` (clients serveur / navigateur / middleware) ; **`middleware`** : rafraîchit la session et redirige les non-connectés hors de `(app)` ; matcher restreint (pas sur les assets). Vérification locale du JWT dans le middleware (`getClaims()` si disponible dans la version du SDK) ; **`getUser()`** (validation serveur) dans le DAL pour les opérations sensibles.
2. **DAL** : `requireUser`, `requireCompany` (entreprise active revalidée), `requirePermission` — appelé par **chaque** page de `(app)`, action et route API (le middleware n'est pas un contrôle d'accès).
3. Pages : connexion, inscription, **saisie du code OTP email**, mot de passe oublié/réinitialisation, Google OAuth, déconnexion, profil, « se déconnecter partout ».
4. **SMTP transactionnel personnalisé** (Resend/Postmark/Brevo) + SPF/DKIM/DMARC + modèles d'email en français (le SMTP par défaut de Supabase n'est pas fait pour la production).
5. **Onboarding** : assistant 3 étapes (Entreprise → Fiscal → Paiement), `create_company`, valeurs par défaut du profil GN, NIF/RCCM « à compléter avant d'émettre ».
6. Sélecteur d'entreprise (si > 1) ; backend d'invitations + acceptation (UI minimale).
7. Sécurité : mot de passe fort + protection contre les mots de passe compromis (si offert par le plan), limites de débit, CAPTCHA activable, messages génériques.
8. Tests e2e : parcours d'auth ; **deux utilisateurs, tentatives inter-tenants** par URL (`/invoices/{id d'un autre tenant}` ⇒ 404).

Critères : un non-connecté n'atteint rien de `(app)` ; accès inter-tenant impossible (UI, actions, API) ; session rafraîchie entre onglets ; déconnexion effective ; le flux OTP fonctionne depuis l'application Gmail mobile ; délivrabilité email validée (Gmail, Yahoo, Orange) ; aucun message ne révèle l'existence d'un compte.
Risques : navigateur intégré de Gmail/WhatsApp (→ OTP, pas de lien) ; délivrabilité (→ domaine dédié) ; latence du middleware (→ matcher étroit + vérification locale) ; cookies volumineux/chunking.

### Phase 5 — Landing page

**Objectif** : page de conversion rapide, honnête, locale (structure inspirée de la capture Invoicer).

Tâches : messages (« Facturez en GNF, encaissez par Orange Money & MTN MoMo, relancez sur WhatsApp ») ; sections : nav, hero + maquette CSS/SVG, bandeau de confiance (**sans faux logos** ; icônes descriptives « compatible… » en respectant les chartes de marque), 4 bénéfices, « Comment ça marche » en 3 étapes, capture annotée du produit, témoignages (**derrière un flag, désactivés tant qu'ils ne sont pas réels**), tarifs en **GNF** (grille §10), FAQ (TVA, NIF, WhatsApp, données personnelles), pied de page, pages légales ; SEO (metadata, OG, sitemap, robots, JSON-LD) ; analytics sans cookie (Plausible/Umami ou Vercel Analytics) ; CTA d'inscription + lien WhatsApp d'assistance.

Critères : Lighthouse mobile ≥ 95 perf / 100 a11y / ≥ 95 SEO ; JS ≤ 90 Ko ; LCP ≤ 2,0 s (Slow 4G simulé) ; poids < 500 Ko ; contenu lisible sans JS.
Risques : **ne jamais écrire « conforme DGI »** sans validation ; usage de marques tierces ; promesses de fonctionnalités non livrées.

### Phase 6 — Passage de bout en bout, sécurité, déploiement

**Objectif** : mise en production maîtrisée.

Tâches :
1. Revue de sécurité (`/security-review`) + parcours de menaces (§7.1).
2. Déploiement du rate limiting, CSP à nonces, en-têtes, Sentry, logs corrélés par `request_id`.
3. Suite e2e complète sur préversion : mobile 360 px, **réseau bridé (Slow 3G)**, **hors-ligne**, deux tenants, lien public en contexte anonyme.
4. Tests de charge (k6) : lien public, émissions concurrentes ; mesure de la latence réelle depuis Conakry.
5. Sauvegardes/PITR et **exercice de restauration** sur staging.
6. Flux RGPD : export des données, clôture de compte, politique de conservation ; pages légales.
7. Runbook (incident, restauration, rotation des clés), README, ADR à jour.
8. Projet Supabase **prod**, Vercel prod, domaine, variables, migrations, smoke tests, **re-test complet en prod** avec deux comptes de test.
9. **Bêta fermée avec 5-10 vraies PME guinéennes** avant lancement public (recommandé).
10. **Validation par un expert-comptable** du PDF (mentions), des règles d'arrondi/TVA, de la numérotation et des avoirs **avant toute facture réelle**.

Critères : aucun défaut P0/P1 ouvert ; checklist §9 verte ; restauration testée ; rollback Vercel testé ; note de go/no-go signée.
Risques : découverte tardive d'exigences fiscales (→ item 10 lancé tôt, en parallèle dès la Phase 2) ; latence trans-continentale (→ budgets, mesure réelle) ; dette accumulée (→ revue à chaque phase).

### Phase 7+ (hors MVP)

Agrégateur de paiement (interface `PaymentProvider`, webhooks signés et idempotents, rapprochement) · WhatsApp Business API · SMS · UI équipe/rôles · facturation des plans (Stripe ne couvrant pas la Guinée : activation manuelle/agrégateur local pour le GNF) · BL, échéanciers, reçus, rapports · super-admin (support, abus, plans) · API publique · e-facturation certifiée si obligation (⚠️ à vérifier).

---

## 7. Stratégie de sécurité

### 7.1 Menaces principales → contre-mesures

| Menace | Contre-mesure |
|---|---|
| Fuite inter-tenant | RLS partout + FK composites + filtre `company_id` explicite + 404 (pas 403) + tests pgTAP + méta-test CI |
| Contournement du middleware (cf. CVE-2025-29927) | DAL dans chaque page/action/route ; RLS derrière ; version Next patchée |
| Falsification de montants côté client | Recalcul serveur + recalcul SQL à l'émission + CHECK |
| Modification d'une facture émise | Trigger d'immutabilité + hash de contenu + audit |
| Doublons / trous de numérotation | Compteur verrouillé transactionnel ; RPC idempotente |
| Double soumission (réseau lent) | UUID client, `request_id`, index uniques |
| Énumération/vol de liens publics | Jeton 256 bits, hashé en base, expirable, révocable, rate limit, réponse identique pour jeton inconnu |
| Abus de la plateforme (fausses factures, hameçonnage) | CGU, bouton « Signaler », désactivation de lien, journalisation, limites par plan |
| Injection (SQL/XSS/CSV) | PostgREST paramétré, React échappe, notes en texte brut, CSV neutralisé, CSP |
| Fuite de secrets | `server-only`, un seul module service-role, variables scopées, scan de secrets en CI |
| Force brute / bourrage d'identifiants | Limites Supabase + limiteur applicatif + CAPTCHA |
| Perte de données | PITR, sauvegardes quotidiennes, exercice de restauration |

### 7.2 Authentification et session

Email + mot de passe + Google ; vérification par code ; MFA TOTP optionnel (recommandé pour `owner`) ; rotation des refresh tokens ; JWT court ; révocation « partout » ; `getUser()` pour les opérations sensibles ; réponses d'auth **génériques** ; SMTP dédié. Les cookies de session `@supabase/ssr` ne sont pas `HttpOnly` par conception (lus par le client navigateur) : d'où la CSP stricte et l'absence de HTML utilisateur rendu.

### 7.3 Défense en profondeur d'accès

Middleware (confort/redirection) → **DAL** (authn + authz, par requête) → **RPC** (permission explicite) → **RLS** (filtre final) → **triggers/CHECK** (invariants). Chaque couche suppose que la précédente peut échouer.

### 7.4 Durcissement Postgres/Supabase

RLS activée sur toutes les tables ; seules les RPC nécessaires exposées ; `REVOKE` explicites ; schéma `private` ; `SECURITY DEFINER` avec `search_path=''` ; vues `security_invoker` ; schéma exposé = `public` uniquement ; limite de lignes API ; `statement_timeout` ; clé `service_role` jamais côté client ; option d'activation automatique de la RLS sur les nouvelles tables.

### 7.5 Liens publics

Jeton aléatoire 32 octets (base64url), **seul son SHA-256 est stocké** ; expiration par défaut configurable (⚠️ §10) ; révocation ; `X-Robots-Tag: noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` ; `force-dynamic` ; données **minimales** (jamais `internal_notes`, autres clients, membres) ; **filtrage des robots d'aperçu** (WhatsApp) pour ne pas compter de fausses « consultations » ; balises Open Graph génériques (option pour masquer le montant dans l'aperçu) ; « Signaler un abus » ; accès uniquement via la RPC `anon` (pas de service role sur ce chemin).

### 7.6 Validation et sorties

Zod client **et** serveur ; recalcul métier serveur ; logos : PNG/JPEG/WebP uniquement (**pas de SVG**), ≤ 1 Mo, type vérifié par contenu, redimensionné ; texte libre affiché en texte brut ; variables de modèles de message échappées ; CSV neutralisé ; `company_id` jamais lu du payload.

### 7.7 Limitation de débit (valeurs de départ, à ajuster)

| Cible | Limite | Clé |
|---|---|---|
| Connexion / OTP | 5/min | IP + email |
| Inscription | 5/h | IP |
| Lien public (HTML/PDF) | 60/min | IP + jeton |
| Génération PDF | 20/min | utilisateur |
| Envois (email/SMS futurs) | 30/h | entreprise |
| Server Actions d'écriture | 120/min | utilisateur |
| Export CSV | 10/h | utilisateur |

### 7.8 Secrets et environnements

Projets Supabase **séparés** staging/prod ; les **préversions Vercel pointent sur staging**, jamais sur la prod ; variables par environnement ; rotation documentée ; Renovate/Dependabot, `pnpm audit`, `gitleaks` en CI ; verrouillage du lockfile.

### 7.9 En-têtes / CSP

CSP stricte avec **nonces** (via middleware) ; `connect-src` limité à Supabase/Sentry ; HSTS ; `X-Content-Type-Options: nosniff` ; `frame-ancestors 'none'` ; `Permissions-Policy` minimale ; vérification `securityheaders.com` avant prod.

### 7.10 Audit et journaux

Audit append-only (qui, quoi, quand, avant/après, IP/UA pour les actions sensibles) ; événements produit séparés ; journaux applicatifs **sans données personnelles** (identifiants seulement) ; Sentry avec masquage ; alertes (§9).

### 7.11 Données personnelles (RGPD + loi guinéenne)

- Rôles : chaque entreprise cliente est **responsable de traitement** pour les données de ses propres clients ; FacturePro est **sous-traitant** ⇒ CGU + accord de traitement (DPA). Pour les comptes utilisateurs, FacturePro est responsable.
- Cartographie des données, minimisation, base légale, durées de conservation, registre des traitements.
- Droits : export (JSON/CSV), rectification, suppression. **Conflit à arbitrer** : l'obligation légale de conserver les factures (⚠️ durée, souvent 10 ans en zone OHADA) prime sur l'effacement → anonymisation des données non requises à la clôture, conservation du reste.
- Chiffrement au repos (Supabase) et en transit ; sauvegardes chiffrées ; procédure de violation (notification).
- ⚠️ Confronter aux exigences de la **loi guinéenne de 2016 sur la cybersécurité et la protection des données personnelles** (référence exacte et obligations de déclaration à confirmer par un juriste) et aux règles de transfert hors Guinée.
- Cookies : aucun cookie de suivi ⇒ pas de bandeau ; analytics sans cookie.

---

## 8. Stratégie de tests

| Niveau | Outil | Portée | Seuil |
|---|---|---|---|
| Unitaires | Vitest (+ fast-check) | `domain/` : monnaie, TVA, statuts, numérotation, montant en lettres, téléphone, CSV, Zod | **≥ 95 %** lignes+branches sur `domain/` |
| Composants | Testing Library + jest-axe | Éditeur (totaux en direct), filtres, sheets, états d'erreur | Parcours critiques |
| Contrat | Vitest | Mêmes tests sur adapter **Local** et **Supabase** | 100 % des méthodes de port |
| Base de données | **pgTAP** (`supabase test db`) | RLS, immutabilité, numérotation, soldes, privilèges, audit, suppression logique, vecteurs d'or SQL | 100 % des tables |
| Intégration | Vitest + Supabase local | Server actions, services, RPC, stockage | Chemins critiques |
| E2E | Playwright | Voir ci-dessous | Bloquant en CI |
| Non fonctionnel | Lighthouse CI, k6, axe, ZAP baseline | Budgets §1.6, charge, sécurité de base | Seuils CI |

**Tests RLS** : un **manifeste** (table × rôle × opération → autorisé/refusé) génère une boucle pgTAP unique. Rôles testés : `anon`, utilisateur du tenant A (owner, admin, accountant, member, viewer), utilisateur du tenant B, service role. Cas spécifiques : injection de `customer_id` d'un autre tenant (FK composite) ; UPDATE d'un document émis (trigger) ; DML direct sur tables financières (refusé) ; `anon` appelant une RPC privée (refusé) ; suppression logique sans erreur de politique ; méta-test « aucune table sans RLS ».

**Concurrence** : 30 appels parallèles à `issue_document` sur la même séquence ⇒ numéros 1..30 sans trou ni doublon ; 2 paiements simultanés dépassant le solde ⇒ un seul accepté.

**E2E critiques** :
1. inscription → onboarding → client → facture → émission → lien public ouvert en contexte anonyme → paiement partiel → paiement du solde ;
2. facture échue (horloge simulée) → statut « en retard » → relance WhatsApp (URL `wa.me` correcte) ;
3. avoir total → facture « Annulée » ;
4. devis → facture ; duplication ;
5. hors-ligne : créer un brouillon → reconnexion → synchronisation ; émission bloquée hors-ligne ;
6. deux tenants : accès croisé impossible ;
7. réseau bridé (Slow 3G via CDP) et mobile 360 px ;
8. export CSV (BOM, séparateur, neutralisation) ;
9. **régression visuelle du PDF** (PDF → PNG → comparaison), y compris glyphes des espaces et des accents.

**Données de test** : seed guinéen réaliste (numéros +224, GNF, noms locaux) ; horloge injectable ; graine fixe.
**CI** : lint + types + unitaires + `db reset` + pgTAP + intégration à chaque PR ; e2e sur préversion Vercel ; Lighthouse CI ; seuils bloquants.

---

## 9. Checklist de déploiement Vercel + Supabase

### Supabase (staging **et** prod, projets séparés)
- [ ] Région **Paris (eu-west-3)** ou Frankfurt ; plan **Pro** en prod ; sauvegardes quotidiennes + **PITR** ; restauration testée.
- [ ] RLS activée sur toutes les tables ; advisors/lints sans alerte critique ; schéma exposé = `public` seulement ; limite de lignes API ; `statement_timeout`.
- [ ] Auth : Site URL et **redirect URLs** (liste blanche stricte ; wildcard de préversion **uniquement sur staging**) ; providers inutiles désactivés ; OTP email (expiration courte) ; limites de débit ; **SMTP personnalisé** (SPF/DKIM/DMARC) ; modèles d'email FR ; mots de passe forts / protection contre les mots de passe compromis ; CAPTCHA prêt ; MFA TOTP activé.
- [ ] Storage : buckets `logos` (public en lecture) et `documents` (privé) + politiques ; limites de taille/type.
- [ ] Migrations : `supabase db push` staging automatique sur `main`, **prod avec approbation manuelle** ; diff de types générés vérifié ; jamais de modification via le dashboard.
- [ ] Connexions : accès via HTTP/PostgREST (pas de connexion Postgres directe depuis les fonctions ; sinon pooler).
- [ ] Clés : `service_role` uniquement dans les variables serveur Vercel ; rotation planifiée.

### Vercel
- [ ] Plan **Pro** (Hobby interdit en usage commercial) ; projet lié au dépôt ; environnements Production / Preview / Development séparés.
- [ ] Variables : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement), `APP_URL`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL/TOKEN`, `SENTRY_DSN/AUTH_TOKEN`, clés SMTP. **Preview → staging.**
- [ ] Région des fonctions `cdg1` (co-localisées avec Supabase) ; runtime **Node** pour PDF/CSV ; `maxDuration` défini.
- [ ] Domaine, DNS, HTTPS, redirections `www` ; ⚠️ disponibilité d'un `.gn` ou choix d'un `.com` (§10).
- [ ] Vercel Cron → `/api/cron/reminders` protégé par `CRON_SECRET`.
- [ ] Protection des préversions (mot de passe/SSO) ; en-têtes et CSP vérifiés.

### Monitoring et alertes
- [ ] **Sentry** (erreurs + performance, source maps, masquage des données personnelles).
- [ ] **Vercel Speed Insights / Web Vitals** (mesure réelle depuis la Guinée) ; Analytics sans cookie.
- [ ] **Uptime** (`/api/health` vérifiant la DB) avec alertes.
- [ ] Alertes : taux 5xx, pics d'échecs d'auth, refus RLS anormaux, CPU/connexions DB, stockage, quotas, budget mensuel.

### Processus de release
- [ ] PR → préversion → CI verte (unit + pgTAP + e2e + Lighthouse) → merge → staging → **smoke test** → promotion prod → smoke prod.
- [ ] Rollback : instant rollback Vercel ; migrations **rétrocompatibles** (expand/contract).
- [ ] **Re-test post-déploiement** : inscription réelle, émission, lien public depuis un téléphone en 3G, PDF, accès croisé entre deux comptes, en-têtes de sécurité, Lighthouse mobile, restauration de sauvegarde sur staging.
- [ ] Légal : CGU, confidentialité, mentions légales, DPA ; entité juridique de l'éditeur du SaaS.
- [ ] Runbook (incident, restauration, rotation des clés) et contacts d'astreinte.

---

## 10. Hypothèses à valider et questions ouvertes

Pour chaque question : **ma valeur par défaut** si tu ne réponds pas. 🚦 = à trancher avant la Phase 0.

### Produit / cible
1. 🚦 **Cible prioritaire** : freelances, commerçants, PME de services, ou PME avec stock/livraisons ? *(Défaut : freelances et petites PME de services/commerce.)*
2. **Tous les utilisateurs facturent-ils avec TVA ?** Beaucoup de petites structures ne sont pas assujetties. *(Défaut : réglage « assujetti à la TVA » ; si non, mention « TVA non applicable » configurable.)*
3. **Devises réelles d'usage** : facturation en USD/EUR avec **équivalent GNF au taux du jour** ? *(Défaut : non en MVP, champ prévu.)*
4. **Montant en toutes lettres** sur les factures : nécessaire ? *(Défaut : oui, activable.)*
5. **Cachet et signature** à téléverser sur le PDF ? *(Défaut : oui, optionnel.)*
6. **Reçu de paiement** (numéroté ou non) : nécessaire dès le MVP ? *(Défaut : MVP+.)*
7. Un **caissier/vendeur** peut-il enregistrer un paiement ? Annuler ? *(Défaut : enregistrer oui, annuler non.)*
8. **KPI « facturé »** : HT ou TTC ? *(Défaut : TTC, avec HT affiché.)*
9. Durée de validité par défaut du **lien public** : illimitée, 90 jours, jusqu'à paiement + 30 j ? *(Défaut : 90 jours renouvelables.)*
10. **Plans** : grille, limites (factures/mois, utilisateurs), **essai** (14 jours comme sur la capture ?), et **comment tu encaisses tes propres abonnements** (Orange Money manuel ? agrégateur ?). *(Défaut : essai 14 jours, tout illimité, activation manuelle.)*

### Fiscal / légal (⚠️ à confier à un expert)
11. 🚦 As-tu **un expert-comptable ou un contact DGI** pour valider : mentions obligatoires, arrondi/TVA, numérotation, avoirs, TVA sur acomptes, **retenue à la source**, **droit de timbre**, régimes fiscaux et libellés exacts ? Existe-t-il ou est-il prévu une obligation de **facturation normalisée / logiciel certifié** ? *(Défaut : tout configurable + `legal-checklist.md`.)*
12. **Entité juridique** qui édite FacturePro (CGU, DPA, facturation de tes clients) : déjà créée ? Où ?
13. **Données** : acceptes-tu un hébergement **UE (Paris/Frankfurt)** ? *(Défaut : oui.)*

### Technique / infra
14. 🚦 **Version de Next.js** : 14 strict, ou 15/16 ? *(Défaut : 15, ou 14.2.x dernier patch si tu tiens à 14.)*
15. 🚦 **Budget d'infra** acceptable (Vercel Pro + Supabase Pro + SMTP + monitoring ≈ 45-60 USD/mois au démarrage) ? Sinon, le lancement public devra attendre.
16. **Nom de domaine** : `.com`, `.gn`, autre ? Nom de marque définitif (FacturePro est-il libre) ?
17. **Auth** : as-tu la confirmation que tes utilisateurs ont un email et l'utilisent régulièrement ? Sinon on avance l'OTP WhatsApp/SMS. *(Défaut : email + Google.)*
18. **Agrégateur de paiement** : as-tu déjà un contact ou un compte marchand (Orange Money, MTN MoMo, ou un agrégateur) ? Cela conditionne la Phase 7.
19. **Outils de dev** : CLI Supabase et Docker installés localement ? *(Requis pour la Phase 3.)*

### Design
20. 🚦 **Couleur de marque** : bleu (Monexa), violet (Invoicer), ou autre ? Mode sombre : plus tard ? *(Défaut : bleu, clair uniquement.)*
21. Les **deux captures** reçues (Monexa pour l'application, Invoicer pour la landing) suffisent-elles, ou en as-tu d'autres (dashboard, liste de factures, mobile, page publique de facture) ?
22. **Modèles de facture** : un seul modèle paramétrable en MVP (couleur d'accent, logo, densité) ? *(Défaut : oui ; le sélecteur de modèles de la capture Monexa est reporté.)*
23. **Bêta** : peux-tu réunir 5-10 PME guinéennes prêtes à tester avant le lancement public ?

---

## Annexe A — Direction design d'après les captures

### A.1 Ce que je retiens de la capture 1 (Monexa — application)

| Élément | Observation | Adaptation FacturePro |
|---|---|---|
| Coque | Sidebar fixe claire : logo + repli, recherche avec raccourci, nav (Dashboard, Invoices + badge, Clients, Analytics, Reports, Payments, Guides, Settings), carte d'essai « 7 Days Left » + « Upgrade Plan », carte utilisateur | Desktop identique. **Mobile : barre basse** (Accueil · Ventes · **+** · Clients · Plus). Badge = factures **à relancer**. Carte d'essai liée au plan. |
| En-tête de page | Fil d'Ariane « Invoices / Create Invoice », actions « Save as Draft » (secondaire) + « Send Invoice » (primaire) | « Enregistrer le brouillon » + **« Émettre et envoyer »** |
| Éditeur | Deux volets : formulaire à gauche, **aperçu en direct** à droite (onglets Email / PDF) sur fond pointillé | ≥ 1280 px : 2 volets ; sinon **onglets Édition/Aperçu** + **barre de totaux collante**. Onglets d'aperçu : **PDF · Message (WhatsApp/email)**. |
| Formulaire | Labels gris avec astérisque rouge, champs à fond neutre et bordure fine, séparateurs en pointillés, lignes produit (Item / Quantité / Prix / corbeille rouge), bouton « Add Item » | Mêmes codes ; champs h-11 (44 px) ; sur mobile les lignes deviennent des **cartes empilées** avec total de ligne. |
| Aperçu | Document « papier » : émetteur/destinataire, dates, tableau, sous-total, remise, frais, total, notes, pied de page | + NIF/RCCM, régime, TVA par taux, montant en lettres, modes de paiement, cachet/signature. |
| Style | Bleu primaire, arrondis généreux (~12-16 px), cartes blanches sur fond gris-bleu, typographie sans-serif type Inter, espacement aéré | Tokens : primaire, neutres slate, rayon 12, ombres douces ; une police variable. |
| ⚠️ À **ne pas** copier | Champ *Status* modifiable, *Amount Due* éditable | Statut et solde **dérivés** (§0.2 #4). « Member Discount/New Member Fee » → **Remise / Frais** génériques. |

### A.2 Ce que je retiens de la capture 2 (Invoicer — landing et liste)

- **Structure** : nav (Product, Features, Pricing, Signup) → hero + maquette du produit → bandeau de logos → « Everything you gain » (4 cartes 2×2) → « How it works » en 3 étapes sur **fond sombre** → capture produit avec **puces d'annotation** flottantes (Monthly revenue summary, Reminders, Invoice status label, GST/Tax compliant) → témoignages → **3 offres** (Starter/Pro/Business) → pied de page sombre.
- **Style** : palette violette (bandes lavande, sections violet profond), titres de section en **serif** éditorial (⚠️ à confirmer en pleine résolution), cartes très arrondies, ombres légères.
- **Liste de factures (dans la capture)** : onglets *All / Paid / Draft / Pending / Overdue* avec compteurs, recherche + filtre, colonnes Facture · Client · Date d'émission · Échéance · Montant · Statut (pastille) · lien de téléchargement + actions ⇒ notre liste (tableau ≥ md, cartes sur mobile) : **Toutes / Payées / Brouillons / En attente / En retard**.
- **Dashboard (aperçu du hero)** : tuiles KPI (Total invoices, Outstanding, Paid) + courbe « Billing insights » ⇒ 4 tuiles (facturé, encaissé, en attente, en retard) + courbe facturé vs encaissé + « À relancer aujourd'hui » + dernières activités.
- **Adaptations** : `GST` → **TVA 18 %** ; prix en **GNF** ; « Trusted companies » et témoignages **non fictifs** (§0.2 #13) ; annotations : « Relances WhatsApp », « Paiement Orange Money / MTN MoMo », « TVA & NIF/RCCM ».

### A.3 Checklist de revue design (Phase 1)

Couleur de marque validée · contraste AA · rayons/ombres cohérents · éditeur 2 volets + version mobile · barre basse mobile · pastilles de statut (couleur + icône + texte) · états vide/chargement/erreur · densité des listes · rendu du document (aperçu et PDF) · page publique de facture · landing (structure ci-dessus).

---

## Annexe B — Registre des risques (top 15)

| # | Risque | Prob. | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Exigence fiscale locale découverte tardivement | Moy | Élevé | Expert dès la Phase 0-2 ; tout configurable ; pas de promesse de conformité |
| R2 | Erreur de calcul monétaire | Faible | **Critique** | Entiers, vecteurs d'or, propriétés, double implémentation vérifiée |
| R3 | Fuite inter-tenant | Faible | **Critique** | RLS + FK composites + tests + méta-test CI |
| R4 | Trou/doublon de numéro | Faible | Élevé | Compteur transactionnel + tests de concurrence |
| R5 | Dérive TS ↔ SQL | Moy | Élevé | Vecteurs d'or communs, tests de contrat |
| R6 | Middleware contourné / faille framework | Faible | Élevé | DAL + RLS ; version patchée ; veille sécurité |
| R7 | Latence Guinée ↔ Paris | Élevé | Moyen | Budgets, streaming, cache statique, RUM, région à revalider |
| R8 | Perte de brouillons (iOS purge) | Moy | Moyen | Serveur = vérité ; synchro fréquente ; installation PWA |
| R9 | Délivrabilité email (OTP) | Moy | Élevé | SMTP dédié, SPF/DKIM/DMARC, tests Gmail/Yahoo/Orange |
| R10 | Périmètre trop large | **Élevé** | Moyen | Paliers MVP/MVP+/Plus tard, revue par phase |
| R11 | Coûts d'infra sous-estimés | Moy | Moyen | Budget §10, alertes de coût |
| R12 | Abus (fausses factures) | Moy | Moyen | CGU, signalement, limites, désactivation de lien |
| R13 | Conformité données personnelles | Moy | Élevé | DPA, conservation, juriste (loi de 2016 + RGPD) |
| R14 | Rendu PDF (polices, U+202F) | Élevé | Moyen | Test visuel PDF, remplacement des espaces, polices intégrées |
| R15 | Adoption : friction du flux mobile | Moy | Élevé | Bêta réelle, parcours « Émettre et envoyer » en 3 taps |

---

## Annexe C — ADR à rédiger en Phase 0

0001 Monolithe modulaire · 0002 Montants entiers/BigInt · 0003 Multi-tenance RLS + FK composites · 0004 Numérotation transactionnelle · 0005 Statuts dérivés · 0006 Immutabilité et snapshots · 0007 Écritures financières par RPC · 0008 PDF `react-pdf` · 0009 Offline = brouillons · 0010 Auth OTP email + Google.

## Annexe D — Points fiscaux / légaux à valider (DGI, expert-comptable, juriste)

1. Liste exacte des **mentions obligatoires** d'une facture (raison sociale, forme, capital, NIF, RCCM, adresse, régime, conditions de paiement, pénalités…).
2. **Régimes fiscaux** et libellés officiels ; assujettissement à la TVA (seuils) ; mention « TVA non applicable ».
3. **Méthode d'arrondi** et TVA par groupe de taux vs par ligne.
4. **Numérotation** : continuité, remise à zéro annuelle, chronologie des dates, séries multiples.
5. **Avoirs** : traitement TVA/écritures ; facture payée puis avoirée.
6. **Acomptes** : facture d'acompte vs paiement partiel ; exigibilité de la TVA.
7. **Retenue à la source**, **droit de timbre** sur reçus/espèces, autres taxes applicables.
8. **Durée de conservation** des factures (⚠️ souvent 10 ans en zone OHADA) et format d'archivage.
9. Obligation éventuelle de **logiciel certifié / facturation électronique normalisée**.
10. **Protection des données** : loi guinéenne de 2016, déclarations éventuelles, transferts hors Guinée, RGPD (clients UE).
11. Usage des **marques** (Orange Money, MTN MoMo, WhatsApp) dans le produit et la landing.
12. Valeur probante du **PDF/lien public** et du hash de contenu.
