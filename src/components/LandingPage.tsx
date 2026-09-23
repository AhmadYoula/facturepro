"use client";

import Link from "next/link";

const features = [
  ["01", "Factures professionnelles", "Créez des documents élégants en quelques clics, avec TVA, coordonnées et PDF prêt à envoyer."],
  ["02", "TVA calculée automatiquement", "Les montants HT, TVA et TTC restent cohérents, même avec plusieurs lignes et plusieurs taux."],
  ["03", "Paiements suivis", "Visualisez les factures payées, en attente ou en retard et relancez vos clients au bon moment."],
  ["04", "Clients et équipe", "Gardez vos fiches clients, vos produits et vos accès d’équipe dans un seul espace."],
];

export function LandingPage() {
  return <main className="landing-page">
    <LandingHeader />
    <section className="landing-hero"><div className="landing-dots" /><div className="landing-container landing-hero-inner"><div className="landing-pill"><i /> Pensé pour les entrepreneurs africains</div><div className="landing-hero-copy"><h1>Facturez comme un pro.<br /><span>Développez votre activité.</span></h1><p>FacturePro aide les indépendants et les PME à créer des factures professionnelles, suivre leurs encaissements et garder une trésorerie claire.</p><div className="landing-actions"><Link className="landing-primary" href="/login">Commencer gratuitement <b>→</b></Link><Link className="landing-secondary" href="#fonctionnalites"><span>▶</span> Découvrir la plateforme</Link></div></div><LandingMockup /></div></section>
    <section className="landing-proof"><div className="landing-container landing-proof-grid"><span><b>✓</b> Conforme à votre activité</span><span><b>◉</b> GNF et devises internationales</span><span><b>⌁</b> Données sécurisées avec Supabase</span></div></section>
    <section className="landing-section" id="fonctionnalites"><div className="landing-container"><div className="landing-section-intro"><span className="landing-eyebrow">Une gestion plus simple</span><h2>Tout ce qu’il faut pour<br /><span>faire avancer votre activité.</span></h2><p>Une expérience claire, rapide et adaptée aux réalités des entrepreneurs qui veulent travailler sérieusement depuis leur téléphone ou leur ordinateur.</p></div><div className="landing-feature-grid">{features.map(([number, title, text]) => <article className="landing-feature" key={number}><div className="landing-feature-top"><span className="landing-feature-icon">{number === "01" ? "↗" : number === "02" ? "%" : number === "03" ? "◷" : "♙"}</span><b>{number}</b></div><h3>{title}</h3><p>{text}</p><Link href="/login">En savoir plus <span>→</span></Link></article>)}</div></div></section>
    <section className="landing-section landing-workflow" id="fonctionnement"><div className="landing-container"><div className="landing-section-intro centered"><span className="landing-eyebrow">Démarrage rapide</span><h2>De l’idée au paiement<br /><span>en trois mouvements.</span></h2></div><div className="landing-steps"><LandingStep number="1" title="Créez votre espace" text="Choisissez votre profil, renseignez votre entreprise et commencez sans carte bancaire." /><LandingStep number="2" title="Préparez votre facture" text="Sélectionnez un client, ajoutez vos services et laissez FacturePro calculer les montants." /><LandingStep number="3" title="Envoyez et encaissez" text="Partagez un PDF professionnel, suivez le statut et gardez la main sur votre trésorerie." /></div></div></section>
    <section className="landing-cta"><div className="landing-container"><div><span className="landing-eyebrow">Votre activité mérite mieux</span><h2>Prêt à facturer<br /><span>avec confiance ?</span></h2><p>Commencez simplement. Construisez une gestion qui grandit avec vous.</p></div><Link className="landing-primary landing-cta-button" href="/login">Créer mon espace <b>→</b></Link></div></section>
    <footer className="landing-footer"><div className="landing-container"><div className="landing-footer-top"><Link className="landing-brand" href="/"><span className="brand-mark">F</span><strong>Facture<span>Pro</span></strong></Link><p>La facturation moderne pour les entrepreneurs qui avancent.</p><div className="landing-footer-links"><Link href="#fonctionnalites">Fonctionnalités</Link><Link href="#fonctionnement">Fonctionnement</Link><Link href="/login">Connexion</Link></div></div><div className="landing-footer-bottom"><span>© 2026 FacturePro</span><span>Fait pour les entreprises qui avancent.</span></div></div></footer>
  </main>;
}

function LandingHeader() {
  return <header className="landing-header"><div className="landing-container landing-nav"><Link className="landing-brand" href="/"><span className="brand-mark">F</span><strong>Facture<span>Pro</span></strong></Link><nav><a href="#fonctionnalites">Fonctionnalités</a><a href="#fonctionnement">Comment ça marche</a><a href="#tarifs">Tarifs</a></nav><div className="landing-header-actions"><Link className="landing-login" href="/login">Se connecter</Link><Link className="landing-nav-cta" href="/login">Commencer gratuitement <span>→</span></Link></div><Link className="landing-mobile-login" href="/login" aria-label="Se connecter">↗</Link></div></header>;
}

function LandingMockup() {
  return <div className="landing-mockup"><div className="landing-mockup-bar"><span><i /><i /><i /></span><small>app.facturepro.com</small><b>AK</b></div><div className="landing-mockup-content"><aside><strong>Facture<span>Pro</span></strong><em>Vue d’ensemble</em><span>▤ Factures</span><span>♙ Clients</span><span>↔ Paiements</span></aside><div className="landing-mockup-main"><div className="landing-mockup-title"><small>VOTRE ESPACE DE PILOTAGE</small><h3>Bonjour, votre entreprise<span>.</span></h3><p>Une vue claire sur vos ventes et encaissements.</p></div><div className="landing-mockup-metrics"><div><small>Chiffre facturé</small><strong>12.508.000 <i>GNF</i></strong></div><div><small>Encaissé</small><strong>11.000.000 <i>GNF</i></strong></div><div><small>À recevoir</small><strong>1.508.000 <i>GNF</i></strong></div></div><div className="landing-mockup-table"><div><span>ACTIVITÉ RÉCENTE</span><span>EN DIRECT</span></div><div><b>Client professionnel</b><strong>FAC-LOCAL-0001</strong><em>Payée</em><strong>2.500.000 GNF</strong></div><div><b>Entreprise partenaire</b><strong>FAC-LOCAL-0002</strong><em>En attente</em><strong>1.800.000 GNF</strong></div></div></div></div></div>;
}

function LandingStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="landing-step"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>;
}
