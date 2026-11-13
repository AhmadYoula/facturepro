<h1 align="center">FacturePro</h1>

<p align="center">
  <b>Facturation simple et professionnelle pour les entrepreneurs et PME de Guinée</b><br>
  Factures, TVA, paiements partiels et PDF, depuis un téléphone, même hors connexion.
</p>

<p align="center">
  <a href="https://facturepro-qnaj.vercel.app/"><img src="https://img.shields.io/badge/D%C3%A9mo-en%20ligne-E39B2D?style=for-the-badge&logo=vercel&logoColor=white" alt="Démo en ligne"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15">
  <img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/Tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest">
</p>

---

## Le projet

Beaucoup de petites entreprises guinéennes font encore leurs factures à la main ou sur un tableur : TVA calculée à la main,
paiements partiels difficiles à suivre, factures peu professionnelles. **FacturePro** répond à ce besoin avec une application
pensée d'abord pour le mobile, en francs guinéens (GNF), qui fonctionne même sans connexion.

Le produit est actuellement un **prototype local** : les données sont stockées sur l'appareil (IndexedDB/Dexie).
Supabase, l'authentification et la synchronisation serveur sont volontairement reportés à une phase dédiée.

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

## Auteur

**Amadou « Ahmad » Youla** — Développeur web & designer, Conakry<br>
[LinkedIn](https://www.linkedin.com/in/ahmad-youla-a54359210/) · [ahramdigit.com](https://ahramdigit.com) · [GitHub](https://github.com/AhmadYoula)
