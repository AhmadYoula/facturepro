"use client";

import { useState } from "react";

const faqs = [
  ["Comment créer une facture ?", "Ouvrez Nouvelle facture, choisissez un client, sélectionnez vos produits et vérifiez l’aperçu avant l’émission."],
  ["Comment partager une facture ?", "Depuis le détail d’une facture, utilisez Partager le PDF. Sur mobile, choisissez WhatsApp dans le menu de partage."],
  ["Mes données sont-elles en ligne ?", "Non. Ce prototype conserve les données sur cet appareil. La synchronisation Supabase sera ajoutée plus tard."],
  ["Comment récupérer mes données ?", "Allez dans Paramètres et utilisez Sauvegarder ou Restaurer un fichier JSON."],
];

export function LocalHelpView() {
  const [open, setOpen] = useState<number | undefined>();
  return <section className="help-page"><div className="help-hero"><div><p className="eyebrow">Centre d’aide</p><h2>Un coup de main, au bon moment.</h2><p>Retrouvez les réponses utiles pour facturer, encaisser et relancer vos clients.</p></div><span className="help-orb">?</span></div><div className="help-grid"><div className="help-card"><span className="help-card-icon blue">▤</span><h3>Facturation</h3><p>Créer, dupliquer, imprimer et partager vos factures.</p></div><div className="help-card"><span className="help-card-icon green">↔</span><h3>Encaissements</h3><p>Suivre les paiements partiels et vos soldes clients.</p></div><div className="help-card"><span className="help-card-icon amber">◒</span><h3>Rapports</h3><p>Lire votre activité et exporter vos données locales.</p></div></div><section className="faq-card"><div className="dashboard-card-heading"><div><span className="section-kicker">Questions fréquentes</span><h3>Les réponses essentielles</h3></div><span className="draft-badge">Mode local</span></div>{faqs.map(([question, answer], index) => <div className="faq-row" key={question}><button type="button" onClick={() => setOpen(open === index ? undefined : index)}><strong>{question}</strong><span>{open === index ? "−" : "+"}</span></button>{open === index && <p>{answer}</p>}</div>)}</section><div className="help-contact"><strong>Besoin d’aide personnalisée ?</strong><span>Préparez votre question et contactez l’équipe FacturePro lors de la prochaine phase de support.</span></div></section>;
}
