# GEMINI.md — Contexte du projet FacturePro

> Ce fichier documente l'état **réel** du dépôt (vérifié dans le code au 22/09/2026), pas les intentions. Pour la vision complète et les phases à venir, voir [`docs/PLAN.md`](docs/PLAN.md). En cas de contradiction entre les deux, ce fichier reflète ce qui est codé ; `docs/PLAN.md` reflète ce qui est prévu.

## 1. Ce que l'application fait

FacturePro est un **prototype de facturation** pour les entrepreneurs, freelances et PME de Guinée (Conakry), pensé pour être étendu à l'Afrique francophone. Il permet de créer des clients et des produits, de rédiger des factures multi-lignes avec calcul automatique de la TVA, de les émettre avec une numérotation séquentielle, d'enregistrer des paiements (partiels ou totaux), de générer un PDF et de le partager (WhatsApp via partage natif ou lien `wa.me`), de suivre un tableau de bord et des rapports, et d'exporter/sauvegarder toutes ses données.

**État actuel : 100 % local, sans back-end.** Il n'y a ni serveur, ni compte utilisateur réel, ni base de données partagée. Tout vit dans le navigateur :
- les données métier (factures, clients, produits, paiements, paramètres d'entreprise) sont stockées dans **IndexedDB** via Dexie ;
- l'authentification est un **compte unique par appareil**, stocké dans `localStorage`, sans serveur ni vérification d'identité réelle ;
- rien n'est synchronisé entre appareils ; vider les données du navigateur efface tout (d'où la fonction de sauvegarde/restauration JSON).

Ceci correspond aux **Phases 1 et 2** du plan en six phases décrit dans `docs/PLAN.md` (pages connectées → interactivité avec données locales). Les phases suivantes — Supabase, RLS multi-tenant, authentification réelle, landing page, durcissement et déploiement — **n'ont pas commencé**.

Le dépôt n'a pas encore de premier commit git (`git log` est vide) : tout le code présent est non versionné à ce stade.

## 2. Fonctionnalités implémentées

Chaque fonctionnalité ci-dessous est vérifiée dans le code (fichier entre parenthèses). Le qualificatif **[démo]** signale un raccourci qui ne serait pas acceptable en production et qui devra être remplacé en Phase 3+.

### Authentification locale **[démo]**
- Compte unique par appareil (email + mot de passe hashé en SHA-256 côté client), pas de vérification d'email, pas de récupération de mot de passe (`src/features/auth/LocalAuthGate.tsx`).
- Bascule connexion / inscription, message d'erreur générique, bouton « Réinitialiser l'accès local » (efface le compte mais conserve les données métier).
- Modification du profil (nom, email) sans re-validation (`src/features/settings/LocalProfileView.tsx`).

### Coquille applicative
- Layout à une seule page (`src/app/page.tsx`) : pas de routes Next.js par section — la navigation change un état React (`activeView`), il n'y a **pas** de groupes de routes `(app)/(auth)/(public)` comme prévu dans `docs/PLAN.md`.
- Sidebar desktop + barre de navigation mobile basse (Accueil / Ventes / **+** / Clients / Plus), en-tête avec recherche globale et cloche de notifications.
- Recherche globale `⌘K` / `Ctrl+K` sur factures, clients et produits (`src/components/GlobalSearch.tsx`).
- Système de notifications applicatives (toasts + boîtes de dialogue confirmer/prompt) qui remplace `window.alert`/`confirm` (`src/components/AppFeedback.tsx`).
- Bannière hors-ligne basée sur `navigator.onLine` (`src/components/OfflineBanner.tsx`) — **note** : elle affiche un message mais aucune action de l'application n'est réellement bloquée par cet état pour l'instant (l'émission n'a pas de garde `navigator.onLine`).
- Carte d'essai « 7/11 jours » et page « Offres » cosmétiques, sans logique d'abonnement réelle.

### Factures
- **Éditeur** (`src/features/invoices/InvoiceEditor.tsx`) : lignes multiples, sélection d'un client ou saisie libre, sélection d'un produit qui préremplit description/prix/TVA, calcul des totaux en temps réel via le moteur de domaine, brouillon auto-sauvegardé dans IndexedDB (debounce 500 ms), bandeau « Brouillon récupéré » au retour, export CSV du brouillon, réinitialisation.
- **Émission** (`issueLocalInvoice`, `src/lib/offline/invoices.ts`) : valide le brouillon, calcule les totaux, attribue un numéro `FAC-LOCAL-XXXX` (le plus haut numéro existant + 1, non transactionnel — acceptable en local, **pas** en concurrence multi-appareil), vide le brouillon.
- **Liste** (`src/features/invoices/LocalInvoicesView.tsx`) : recherche, filtres (Toutes / Payées / En attente / En retard), vue détail imprimable (mise en page facture via `window.print()`), duplication (recrée un brouillon), relance WhatsApp (`wa.me` avec message prérempli), partage du PDF via Web Share API niveau 2 (repli : téléchargement), changement manuel de statut de démonstration **[démo]** (Brouillon / Envoyée / Payée / En retard — utile pour tester l'affichage, pas un vrai cycle de vie métier), avoir plafonné au solde restant.
- **Statut affiché** dérivé (jamais stocké tel quel) : brouillon, annulée (avoir total), payée, en retard, partiellement payée, émise, envoyée (`getInvoiceDisplayStatus`, `src/domain/documents/index.ts`).
- **Génération PDF** vectorielle (`src/lib/pdf/localInvoicePdf.ts`, `pdf-lib`) : en-tête entreprise (NIF/RCCM), client, lignes, totaux, montant en toutes lettres, conditions de paiement, zone signature/cachet ; couleur d'accent selon le modèle choisi dans les paramètres.

### Paiements
- Enregistrement d'un paiement partiel ou total par facture, modes Orange Money / MTN MoMo / Espèces / Virement bancaire, contrôle que le montant ne dépasse pas le solde (`recordLocalPayment`, `src/lib/offline/invoices.ts` ; UI : `src/features/payments/LocalPaymentsView.tsx`).
- Historique des encaissements filtrable par facture.
- Avoirs : `createLocalCreditNote` plafonne le montant au solde restant (total − payé − déjà crédité).

### Clients et produits
- CRUD local partagé par un seul composant piloté par la prop `kind` (`src/features/directory/LocalDirectoryView.tsx`) : nom, téléphone, email, adresse pour les clients ; description, prix unitaire, TVA par défaut pour les produits.

### Paramètres d'entreprise
- Profil légal complet : raison sociale, forme juridique, pays d'immatriculation, **NIF**, **RCCM**, adresse, contacts pro/facturation (`src/features/settings/LocalSettingsView.tsx`).
- Région/devise : pays, région, langue/format (`fr-GN` par défaut), devise (GNF/XOF/EUR/USD/GBP), taux de TVA par défaut, instructions de paiement (texte libre — Orange Money / MTN MoMo).
- **5 modèles de facture** (Classique, Moderne, Minimal, Impact, Élégant) avec couleur d'accent dédiée, appliqués à l'aperçu et au PDF.
- Équipe **[démo]** : liste de membres avec rôle (Administrateur/Facturation/Lecture seule) stockée dans `localStorage`, purement déclarative — aucune permission n'est réellement appliquée.
- Sauvegarde / restauration : export et import JSON de toutes les tables Dexie (`src/lib/offline/backup.ts`).

### Tableau de bord, rapports, notifications
- Dashboard (`src/features/dashboard/LocalDashboard.tsx`) : facturé, encaissé, à recevoir, en retard, taux d'encaissement, actions rapides, activité récente avec menu contextuel (aperçu / modifier / supprimer).
- Rapports (`src/features/reports/LocalReportsView.tsx`) : mêmes KPI, répartition par statut, balance âgée simplifiée, export CSV.
- Notifications (`src/features/notifications/LocalNotificationsView.tsx`) : liste calculée à la volée (factures en retard, 5 derniers paiements) — non persistée, pas de « lu/non lu ».
- Page Aide / FAQ statique (`src/features/help/LocalHelpView.tsx`).

### Moteur financier (`src/domain/`, pur, sans dépendance React/Next/Supabase)
- `money/index.ts` : `roundHalfUp` (arrondi half-up), `calculateLineNet`, `calculateVat` — tout en **`BigInt`**, taux en points de base (10000 = 100 %), quantités en millièmes.
- `documents/index.ts` : `validateInvoiceDraft`, `computeInvoiceTotals` (regroupe la TVA par taux, applique la remise globale par groupe), `getInvoiceDisplayStatus`.
- `money/words.ts` : `amountInWords` — nombre en toutes lettres en français (accords quatre-vingts/cent, milliers/millions/milliards).
- `export/csv.ts` : `buildCsv`/`escapeCsvCell`/`neutralizeCsvCell` — BOM UTF-8, séparateur `;`, neutralisation de l'injection de formules (préfixe `'` sur les cellules commençant par `= + - @`).

### Couche locale (`src/lib/offline/`)
- `db.ts` : schéma Dexie v6 (`drafts`, `invoices`, `payments`, `customers`, `products`, `company`) et types associés.
- `invoices.ts` : `nextLocalInvoiceNumber`, `issueLocalInvoice`, `createLocalCreditNote`, `duplicateLocalInvoice`, `recordLocalPayment`, `updateLocalInvoiceStatus` — chaque opération qui touche un solde est enveloppée dans `offlineDb.transaction("rw", …)`.
- `backup.ts` : `exportLocalBackup` / `importLocalBackup`.

### Tests automatisés
Vitest (`pnpm test`), sans fichier de config dédié (options par défaut), avec `fake-indexeddb` pour tester Dexie hors navigateur :
- `domain/documents/index.test.ts`, `domain/money/index.test.ts`, `domain/money/words.test.ts`, `domain/export/csv.test.ts` : tests du moteur pur.
- `lib/offline/invoices.test.ts`, `lib/offline/backup.test.ts` : tests des opérations transactionnelles Dexie.

Le script `pnpm verify` = `typecheck && lint && test`.

## 3. Structure des fichiers

```
FacturePro/
├─ docs/
│  └─ PLAN.md                     Plan d'implémentation complet (6 phases), non encore réalisé au-delà de la Phase 2
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                Layout racine (lang="fr"), AppFeedbackProvider + OfflineBanner
│  │  ├─ page.tsx                  Point d'entrée unique : shell + navigation par état (pas de routes Next par section)
│  │  ├─ globals.css               Feuille de style unique, CSS écrit à la main (voir §5)
│  │  ├─ manifest.ts               Manifeste PWA (nom, couleurs, lang="fr")
│  │  ├─ icon.svg, loading.tsx, error.tsx
│  ├─ domain/                      Logique métier PURE — aucun import React/Next/Dexie
│  │  ├─ money/                    money/index.ts (arrondi, calculs BigInt) + words.ts (montant en lettres)
│  │  ├─ documents/                Totaux de facture, validation, statut affiché dérivé
│  │  └─ export/                   Construction CSV sécurisée
│  ├─ lib/
│  │  ├─ offline/                  db.ts (schéma Dexie), invoices.ts (cas d'usage), backup.ts (export/import JSON)
│  │  └─ pdf/                      localInvoicePdf.ts (génération PDF avec pdf-lib)
│  ├─ features/                    Un dossier par domaine d'écran, tous des Client Components "use client"
│  │  ├─ auth/LocalAuthGate.tsx
│  │  ├─ invoices/{InvoiceEditor,LocalInvoicesView}.tsx
│  │  ├─ payments/LocalPaymentsView.tsx
│  │  ├─ directory/LocalDirectoryView.tsx   (clients ET produits, piloté par prop `kind`)
│  │  ├─ dashboard/LocalDashboard.tsx
│  │  ├─ reports/LocalReportsView.tsx
│  │  ├─ notifications/LocalNotificationsView.tsx
│  │  ├─ settings/{LocalSettingsView,LocalProfileView}.tsx
│  │  ├─ billing/LocalPlansView.tsx        (cosmétique)
│  │  └─ help/LocalHelpView.tsx
│  └─ components/                  UI transverse : AppFeedback (toasts/dialogues), GlobalSearch (⌘K), OfflineBanner
├─ package.json, tsconfig.json, eslint.config.mjs, postcss.config.mjs, next.config.ts
└─ README.md                       Résumé court destiné à un humain qui clone le dépôt
```

Points notables de cette arborescence par rapport à `docs/PLAN.md` :
- Pas encore de `server/`, `supabase/`, `messages/` (i18n), ni de groupes de routes `(marketing)/(auth)/(public)/(app)`.
- Pas de séparation ports/adapters (`Repository` interfaces) : les composants `features/` appellent directement `offlineDb` et les fonctions de `src/lib/offline/`. Introduire cette séparation est un prérequis explicite du plan avant d'ajouter l'adapter Supabase (Phase 3), pour éviter de réécrire les écrans.
- Chaque `Local*View.tsx` mélange état, accès aux données et rendu dans un seul fichier assez dense (peu de sous-composants extraits, JSX écrit sur des lignes longues). C'est le style actuel du dépôt — voir §6 pour la consigne aux futurs modèles.

## 4. Technologies utilisées

| Domaine | Choix | Version (`package.json`) | Remarque |
|---|---|---|---|
| Framework | Next.js, App Router | `15.5.25` | Diffère du « Next.js 14 » mentionné dans la demande initiale ; `docs/PLAN.md` recommande explicitement 15. Une seule route réelle (`/`) est utilisée pour l'instant. |
| UI | React | `19.1.0` | |
| Langage | TypeScript, mode strict | `^5` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` activés (`tsconfig.json`) — ne pas les désactiver. |
| Style | Tailwind CSS | `^4` (`@tailwindcss/postcss`) | Importé (`@import "tailwindcss"`) mais **non utilisé comme utility-first** : tout le style vient de classes sémantiques écrites à la main dans `globals.css` (voir §5). |
| Stockage local | Dexie + dexie-react-hooks | `^4.4.6` / `^4.4.0` | IndexedDB ; `useLiveQuery` pour la réactivité dans les vues. |
| PDF | pdf-lib | `^1.17.1` | Génération vectorielle côté client, police Helvetica standard. |
| Tests | Vitest + fake-indexeddb | `^3` / `^6.2.5` | Pas de fichier de config Vitest ; imports explicites (`import { describe, it, expect } from "vitest"`). |
| Lint | ESLint + eslint-config-next | `^9` / `15.5.25` | `next/core-web-vitals` + `next/typescript`. |
| Gestionnaire de paquets | pnpm (via `npx pnpm@10.15.1`) | épinglé dans `README.md` | Toujours utiliser cette version épinglée pour rester reproductible. |

**Non présents dans le dépôt malgré `docs/PLAN.md`** : Supabase (Postgres/Auth/Storage/RLS), Zod, React Hook Form, shadcn/ui, next-intl, Recharts, Serwist/PWA runtime, Playwright, pgTAP, Vercel. Ne pas supposer leur présence.

## 5. Décisions de design

### Visuel
- **Palette** : bleu primaire `#246bfe`, encre `#15243b`, gris `#718096`, fond `#f6f8fb`, succès `#15956b`, alerte `#b87912`, erreur `#d54d59` (variables CSS `:root` dans `globals.css`). C'est la palette bleue inspirée de la capture « Monexa », pas la palette violette de « Invoicer ».
- **Typographie mixte assumée** : titres et montants en `Georgia, serif` (ton éditorial), texte d'interface et libellés en `Arial, sans-serif`. C'était une piste suggérée dans `docs/PLAN.md` (Annexe A) pour la landing ; ici elle a été étendue à toute l'application.
- **CSS écrit à la main plutôt qu'utilitaire** : `globals.css` est un fichier unique de classes sémantiques (`.dashboard-hero`, `.editor-grid`, `.status.overdue`, …), minifié sur quelques lignes très longues. Tailwind est installé mais sert uniquement de reset/pipeline PostCSS. **Décision implicite à respecter ou à trancher explicitement avec l'utilisateur avant de changer d'approche** — ne pas introduire des classes utilitaires Tailwind au milieu de ce fichier sans en discuter, cela créerait deux systèmes de style incohérents.
- **Mobile-first assumé dans les media queries** (`@media(max-width:700px|850px|900px|1050px)`) : sidebar masquée au profit d'une barre basse, grilles qui repassent en une colonne, `.mobile-nav`/`.mobile-brand` dédiés.
- **Accessibilité de base présente mais partielle** : `role="alert"`/`role="status"`/`aria-live` sur les messages et boîtes de dialogue, `aria-label` sur les boutons icône ; pas d'audit `axe` ni de tests clavier systématiques à ce stade.

### Architecture
- **Domaine pur isolé** (`src/domain/`) : aucune fonction de calcul ne dépend de React, Next.js ou Dexie. C'est la décision la plus structurante du dépôt — elle doit être préservée strictement (voir §6).
- **Argent en `BigInt`, jamais en `float`** : montants en unités mineures, taux en points de base (base 10 000), quantités en millièmes. Implémentée de bout en bout, y compris dans le PDF et le CSV.
- **TVA calculée par groupe de taux**, pas ligne par ligne (`computeInvoiceTotals` regroupe les lignes par taux/exonération avant d'appliquer la remise globale puis la TVA). Correspond à la règle documentée dans `docs/PLAN.md` §4.2, marquée ⚠️ à valider avec un expert-comptable — cette réserve reste valable ici.
- **Statut de facture toujours dérivé, jamais stocké tel quel** (`getInvoiceDisplayStatus`) : seul `workflowStatus` (`draft|issued|sent`) est persisté ; « payée », « en retard », « partiellement payée » sont recalculés à la lecture à partir des montants et de la date du jour.
- **Numérotation simple, non transactionnelle** (`FAC-LOCAL-XXXX` = max existant + 1) : acceptable pour un prototype mono-appareil, **insuffisant** pour la production (risque de doublon/trou en concurrence) — `docs/PLAN.md` prévoit un compteur verrouillé en base pour la Phase 3.
- **Pas de routing par écran** : la navigation change un état (`activeView`) dans `page.tsx` plutôt que d'utiliser des segments App Router. Fonctionnel pour un prototype local, mais il faudra migrer vers de vraies routes pour l'URL, le SEO, `revalidatePath`, et les liens publics (`/p/[token]`) prévus par le plan.
- **Feedback utilisateur centralisé** (`AppFeedbackProvider`) : un seul système de toasts et de boîtes de dialogue confirmer/prompt, appelé partout via `useAppFeedback()` plutôt que `window.alert/confirm`.
- **Un seul composant pour clients et produits** (`LocalDirectoryView` piloté par `kind`) plutôt que deux composants dupliqués — à garder en tête si de nouveaux champs spécifiques à un type apparaissent (préférer une prop ou une union discriminée à un fork du composant).

## 6. Instructions pour un futur modèle IA

Ces règles s'appliquent à toute modification future de ce dépôt, humaine ou par un agent IA (Gemini, Claude ou autre).

1. **Ne jamais manipuler l'argent en `number`/`float`.** Toute quantité, prix, taux ou montant doit rester en `BigInt` dans `src/domain/` et dans le code qui en dépend. Pas de `parseFloat`, `toFixed` ou `Number()` sur un montant. Si un nouveau calcul financier est nécessaire, l'ajouter dans `src/domain/money` ou `src/domain/documents`, jamais directement dans un composant `features/`.
2. **Respecter la frontière du domaine.** `src/domain/**` ne doit importer ni React, ni Next.js, ni Dexie, ni rien qui dépende du navigateur. C'est ce qui rend ce code testable et réutilisable côté serveur plus tard (Phase 3). Si une fonction a besoin de `Date.now()`, envisager de la rendre injectable (paramètre `today`) plutôt que de coder en dur l'horloge système, comme le fait déjà `getInvoiceDisplayStatus`.
3. **Tout ajout de calcul métier doit avoir un test Vitest** dans le fichier `*.test.ts` associé, avec au moins un cas limite (arrondi à `.5`, montant à 0, TVA exonérée, quantité décimale). Lancer `pnpm verify` avant de considérer une tâche terminée.
4. **Le statut d'une facture ne se stocke pas, il se calcule.** Ne jamais ajouter de champ `status: "overdue"` persistant : dériver via `getInvoiceDisplayStatus`, comme le fait déjà tout le code existant.
5. **Rester dans les limites du prototype local, sans le faire passer pour plus qu'il n'est.** Ne pas ajouter de texte qui affirme une sécurité, une conformité fiscale ou une synchronisation qui n'existent pas. Le README et ce fichier documentent explicitement les raccourcis `[démo]` (auth locale, équipe, plans) — les conserver visibles pour l'utilisateur, ne pas les faire disparaître silencieusement du discours produit.
6. **Interface en français, toujours.** Tous les libellés, messages d'erreur et textes visibles sont en français dans ce dépôt ; garder cette convention pour tout nouveau texte (l'i18n via `next-intl` n'est pas encore en place, donc pas de clés de traduction à créer pour l'instant — écrire le texte en dur en français comme le fait le code existant).
7. **Respecter le style existant plutôt que d'imposer un style « idéal ».** Le code actuel préfère des composants denses avec JSX sur des lignes longues et un CSS sémantique écrit à la main. Avant de refactoriser en profondeur (extraire des sous-composants, migrer vers des classes Tailwind utilitaires, ajouter une librairie de formulaires), consulter `docs/PLAN.md` (qui prévoit shadcn/ui, React Hook Form, Zod pour les phases suivantes) et **demander confirmation à l'utilisateur** avant de mélanger deux styles dans le même dépôt.
8. **Ne pas introduire Supabase, Zod, React Hook Form, shadcn/ui, Playwright, etc. sans que l'utilisateur ait validé le passage à la phase correspondante.** Ces dépendances font partie du plan (`docs/PLAN.md`, stack imposée) mais n'ont pas encore été introduites délibérément ; les ajouter prématurément romprait la progression par phases voulue par l'utilisateur (« Ne code pas encore » / validation phase par phase).
9. **Ne jamais présenter une conformité fiscale ou légale guinéenne comme acquise.** Les règles de TVA, d'arrondi, de mentions légales (NIF/RCCM) sont implémentées comme un point de départ raisonnable mais restent marquées ⚠️ à valider par un expert-comptable ou la DGI dans `docs/PLAN.md` (Annexe D). Ne pas supprimer ces réserves ni affirmer une conformité dans le code, les commentaires ou les réponses à l'utilisateur.
10. **Avant toute modification structurante** (changement de schéma Dexie, introduction d'un vrai routeur, remplacement de l'auth locale), relire `docs/PLAN.md` pour vérifier si une décision équivalente y est déjà prise et documentée — la réutiliser plutôt que d'en inventer une nouvelle, sauf si l'utilisateur exprime explicitement un changement d'avis.
11. **Le schéma Dexie est versionné (`offlineDb.version(6)`).** Toute évolution de la forme des tables locales doit passer par une nouvelle version Dexie avec une fonction de migration (`.upgrade()`), pas par une modification silencieuse du schéma existant qui casserait les données déjà stockées chez un utilisateur.
12. **Garder `pnpm verify` vert** (`typecheck`, `lint`, `test`) avant de terminer toute tâche de code. Utiliser la version de pnpm épinglée dans le README (`npx pnpm@10.15.1 …`).
