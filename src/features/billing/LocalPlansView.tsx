"use client";

import { useEffect, useState } from "react";

type PlanId = "starter" | "pro" | "business";
type Plan = { id: PlanId; name: string; price: string; description: string; features: string[] };

const plans: Plan[] = [
  { id: "starter", name: "Plan Gratuit", price: "0", description: "Idéal pour tester l’application et facturer vos premières missions occasionnelles.", features: ["5 factures par mois", "1 utilisateur unique", "Calcul automatique TVA 18%", "Export PDF standard"] },
  { id: "pro", name: "Plan Pro", price: "60.000", description: "La solution complète pour les consultants, PME et commerçants actifs.", features: ["Factures et devis illimités", "1 utilisateur avec accès mobile", "TVA 18% et multi-taux", "Relances WhatsApp", "Personnalisation complète"] },
  { id: "business", name: "Plan Business", price: "180.000", description: "Pour les entreprises en pleine expansion nécessitant des accès multi-postes.", features: ["Factures et devis illimités", "Multi-utilisateurs jusqu’à 10", "Gestion des rôles", "Exports comptables avancés", "Support prioritaire"] },
];

export function LocalPlansView() {
  const [activePlan, setActivePlan] = useState<PlanId>("starter");
  const [message, setMessage] = useState("");
  useEffect(() => { const stored = localStorage.getItem("facturepro-local-plan") as PlanId | null; if (stored !== null) setActivePlan(stored); }, []);
  const choose = (plan: Plan) => { localStorage.setItem("facturepro-local-plan", plan.id); setActivePlan(plan.id); setMessage(`${plan.name} est maintenant votre offre locale.`); };
  return <section className="plans-page plans-pricing-scope"><div className="landing-section-intro plans-intro-centered"><span className="landing-eyebrow">Tarifs transparents</span><h2>Des forfaits adaptés au rythme de votre <span>entreprise.</span></h2><p>Tous les montants sont en GNF. Commencez gratuitement et changez de formule à tout moment.</p><span className="draft-badge">Offre active : {plans.find((plan) => plan.id === activePlan)?.name}</span></div>{message !== "" && <p className="editor-message" role="status">{message}</p>}<div className="landing-pricing-grid">{plans.map((plan) => <article className={`landing-plan ${plan.id === "pro" ? "featured" : ""} ${activePlan === plan.id ? "current" : ""}`} key={plan.id}>{plan.id === "pro" && <span className="landing-plan-badge">Le plus populaire</span>}<h3>{plan.name}</h3><p>{plan.description}</p><strong>{plan.price} <small>GNF / mois</small></strong><ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><button className={activePlan === plan.id ? "secondary-button" : "landing-primary"} type="button" onClick={() => choose(plan)}>{activePlan === plan.id ? "Offre active" : `Choisir ${plan.name.replace("Plan ", "")}`}</button></article>)}</div><div className="plans-note"><strong>Paiement des abonnements</strong><span>Les moyens d’encaissement FacturePro seront définis après validation du modèle commercial et de l’intégration Supabase.</span></div></section>;
}
