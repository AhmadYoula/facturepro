# FacturePro

FacturePro est un prototype local de facturation pour les entrepreneurs et PME de Guinée. Le produit utilise actuellement IndexedDB/Dexie comme stockage local. Supabase, l’authentification et la synchronisation serveur sont volontairement reportés.

## Démarrage

```bash
npx pnpm@10.15.1 install
npx pnpm@10.15.1 dev
```

Ouvrir <http://localhost:3000>.

## Vérification

```bash
npx pnpm@10.15.1 verify
NEXT_TELEMETRY_DISABLED=1 npx pnpm@10.15.1 build
```

## Fonctionnalités locales

- Brouillons persistants dans IndexedDB
- Émission locale avec numérotation `FAC-LOCAL-*`
- Calculs monétaires en `BigInt`
- TVA par groupes et arrondi half-up
- Plusieurs lignes par facture
- Clients et produits/services
- Paiements partiels et historique des encaissements
- Avoirs locaux préparés avec plafond d’intégrité
- Dashboard et rapports calculés depuis les données locales
- Recherche globale, filtres et notifications locales
- Export CSV sécurisé
- Export/restauration JSON de toutes les données locales
- Génération et partage/téléchargement PDF
- Navigation mobile et animations accessibles

## Limites connues

- Les données restent sur l’appareil et ne sont pas synchronisées.
- La numérotation `FAC-LOCAL-*` est une numérotation de démonstration, pas une numérotation fiscale de production.
- Le partage PDF utilise le partage natif sur les appareils compatibles ; sur desktop, le fichier est téléchargé pour être joint manuellement à WhatsApp.
- Les règles fiscales guinéennes et les mentions légales doivent être validées par un expert-comptable ou un juriste.
- Supabase, l’authentification, la RLS et la synchronisation seront ajoutés dans une phase dédiée.

## Structure principale

- `src/domain/` : calculs financiers purs et export
- `src/lib/offline/` : IndexedDB, sauvegardes et workflows locaux
- `src/features/` : écrans métier
- `src/app/` : shell et navigation
- `docs/PLAN.md` : plan d’implémentation complet
