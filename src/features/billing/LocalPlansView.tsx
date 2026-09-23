"use client";

import { useEffect, useState } from "react";

type PlanId = "starter" | "pro" | "business";
type Plan = { id: PlanId; name: string; price: string; description: string; features: string[] };

const plans: Plan[] = [
  { id: "starter", name: "Starter", price: "0 GNF", description: "Pour commencer simplement.", features: ["Factures locales", "Clients et produits", "Export PDF et CSV"] },
  { id: "pro", name: "Pro", price: "À définir", description: "Pour les entrepreneurs actifs.", features: ["Tout Starter", "Relances WhatsApp", "Rapports avancés", "Support prioritaire"] },
  { id: "business", name: "Business", price: "À définir", description: "Pour les équipes et PME.", features: ["Tout Pro", "Plusieurs utilisateurs", "Permissions d’équipe", "Synchronisation cloud"] },
];

export function LocalPlansView() {
  const [activePlan, setActivePlan] = useState<PlanId>("starter");
  const [message, setMessage] = useState("");
  useEffect(() => { const stored = localStorage.getItem("facturepro-local-plan") as PlanId | null; if (stored !== null) setActivePlan(stored); }, []);
  const choose = (plan: Plan) => { localStorage.setItem("facturepro-local-plan", plan.id); setActivePlan(plan.id); setMessage(`${plan.name} est maintenant votre offre locale.`); };
  return <section className="plans-page"><div className="plans-intro"><div><p className="eyebrow">Offres FacturePro</p><h2>Choisissez votre rythme</h2><p>Prototype local : aucune carte bancaire ni aucun paiement réel n’est demandé.</p></div><span className="draft-badge">Offre active : {plans.find((plan) => plan.id === activePlan)?.name}</span></div>{message !== "" && <p className="editor-message" role="status">{message}</p>}<div className="plans-grid">{plans.map((plan) => <article className={`plan-card ${plan.id === "pro" ? "featured" : ""} ${activePlan === plan.id ? "current" : ""}`} key={plan.id}><div className="plan-card-top"><span className="plan-label">{plan.name}</span>{plan.id === "pro" && <span className="plan-recommended">Recommandé</span>}</div><strong className="plan-price">{plan.price}</strong><p>{plan.description}</p><ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><button className={activePlan === plan.id ? "secondary-button" : "primary-button"} type="button" onClick={() => choose(plan)}>{activePlan === plan.id ? "Offre active" : `Choisir ${plan.name}`}</button></article>)}</div><div className="plans-note"><strong>Paiement des abonnements</strong><span>Les moyens d’encaissement FacturePro seront définis après validation du modèle commercial et de l’intégration Supabase.</span></div></section>;
}
