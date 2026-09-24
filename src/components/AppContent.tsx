"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { GlobalSearch } from "@/components/GlobalSearch";
import { LocalNotificationsView } from "@/features/notifications/LocalNotificationsView";
import { InvoiceEditor as PersistentInvoiceEditor } from "@/features/invoices/InvoiceEditor";
import { LocalInvoicesView } from "@/features/invoices/LocalInvoicesView";
import { LocalPaymentsView } from "@/features/payments/LocalPaymentsView";
import { LocalDirectoryView, type InvoiceDirectoryPreset } from "@/features/directory/LocalDirectoryView";
import { LocalDashboard } from "@/features/dashboard/LocalDashboard";
import { LocalSettingsView } from "@/features/settings/LocalSettingsView";
import { LocalReportsView } from "@/features/reports/LocalReportsView";
import { useLocalAuth } from "@/features/auth/LocalAuthGate";
import { LocalPlansView } from "@/features/billing/LocalPlansView";
import { LocalHelpView } from "@/features/help/LocalHelpView";
import { duplicateLocalInvoice } from "@/lib/offline/invoices";
import { invoiceDraftId, offlineDb, type InvoiceDraft } from "@/lib/offline/db";
import { hydrateLocalDataFromSupabase, migrateLocalDataToSupabase, REMOTE_SYNC_EVENT } from "@/lib/supabase/migrateLocalData";
import { getSupabaseClient } from "@/lib/supabase/client";

const navigationItems = ["Vue d’ensemble", "Factures", "Clients", "Produits", "Paiements", "Rapports", "Aide"];

export default function AppContent() {
  const { name, logout } = useLocalAuth();
  const [activeView, setActiveView] = useState("Vue d’ensemble");
  const [showEditor, setShowEditor] = useState(false);
  const company = useLiveQuery(() => offlineDb.company.get("current"), [], undefined);
  const companyName = company?.name || "Votre entreprise";
  const companyInitials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "FP";
  const openView = (view: string) => { setShowEditor(false); setActiveView(view); };
  const createInvoiceFromDirectory = async (preset: InvoiceDirectoryPreset) => {
    const today = new Date();
    const dueDate = new Date(today); dueDate.setDate(dueDate.getDate() + 30);
    const stored = await offlineDb.drafts.get(invoiceDraftId);
    const base: InvoiceDraft = stored ?? { id: invoiceDraftId, customer: "", issueDate: today.toISOString().slice(0, 10), dueDate: dueDate.toISOString().slice(0, 10), description: "Prestation", quantity: "1", unitPrice: "0", notes: "", updatedAt: Date.now(), lines: [{ description: "Prestation", quantity: "1", unitPrice: "0" }] };
    const productLine = preset.product === undefined ? undefined : { description: preset.product.description || preset.product.name, quantity: "1", unitPrice: preset.product.unitPriceMinor, vatRateBp: preset.product.vatRateBp };
    await offlineDb.drafts.put({ ...base, ...(preset.customerName === undefined ? {} : { customer: preset.customerName }), ...(productLine === undefined ? {} : { description: productLine.description, quantity: productLine.quantity, unitPrice: productLine.unitPrice, lines: [productLine] }), updatedAt: Date.now() });
    setActiveView("Factures"); setShowEditor(true);
  };
  useEffect(() => { const handleNavigate = (event: Event) => { const detail = (event as CustomEvent<string>).detail; if (detail) openView(detail); }; window.addEventListener("facturepro:navigate", handleNavigate); return () => window.removeEventListener("facturepro:navigate", handleNavigate); }, []);
  useEffect(() => {
    void hydrateLocalDataFromSupabase().catch(() => undefined);
    const handleRemoteSync = () => { void migrateLocalDataToSupabase().catch(() => undefined); };
    window.addEventListener(REMOTE_SYNC_EVENT, handleRemoteSync);
    const supabase = getSupabaseClient();
    const channel = supabase?.channel("facturepro-realtime").on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () => { void hydrateLocalDataFromSupabase().catch(() => undefined); }).on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => { void hydrateLocalDataFromSupabase().catch(() => undefined); }).on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => { void hydrateLocalDataFromSupabase().catch(() => undefined); }).on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => { void hydrateLocalDataFromSupabase().catch(() => undefined); }).on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => { void hydrateLocalDataFromSupabase().catch(() => undefined); }).subscribe();
    return () => { window.removeEventListener(REMOTE_SYNC_EVENT, handleRemoteSync); if (channel !== undefined) void supabase?.removeChannel(channel); };
  }, []);
  const content = showEditor ? <PersistentInvoiceEditor onClose={() => setShowEditor(false)} /> : activeView === "Factures" ? <LocalInvoicesView /> : activeView === "Paiements" ? <LocalPaymentsView /> : activeView === "Clients" ? <LocalDirectoryView kind="customers" onCreateInvoice={(preset) => void createInvoiceFromDirectory(preset)} /> : activeView === "Produits" ? <LocalDirectoryView kind="products" onCreateInvoice={(preset) => void createInvoiceFromDirectory(preset)} /> : activeView === "Paramètres" ? <LocalSettingsView /> : activeView === "Rapports" ? <LocalReportsView /> : activeView === "Notifications" ? <LocalNotificationsView /> : activeView === "Aide" ? <LocalHelpView /> : activeView === "Offres" ? <LocalPlansView /> : <LocalDashboard onCreate={() => setShowEditor(true)} onNavigate={openView} onEdit={(invoice) => { void duplicateLocalInvoice(invoice).then(() => setShowEditor(true)); }} />;
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">F</span><span>Facture<span className="brand-accent">Pro</span></span></div><div className="workspace"><span className="workspace-avatar">{companyInitials}</span><span><strong>{companyName}</strong><small>Entreprise active</small></span><span className="chevron">⌄</span></div><nav className="nav" aria-label="Navigation principale">{navigationItems.map((item) => <button className={activeView === item ? "nav-item active" : "nav-item"} key={item} onClick={() => openView(item)}><span className="nav-icon" aria-hidden="true">{item === "Vue d’ensemble" ? "⌂" : item === "Factures" ? "▤" : item === "Clients" ? "♙" : item === "Produits" ? "◈" : item === "Paiements" ? "↔" : "◒"}</span>{item}{item === "Factures" && <span className="nav-count">12</span>}</button>)}</nav><div className="sidebar-bottom"><button className={activeView === "Paramètres" ? "nav-item active" : "nav-item"} onClick={() => openView("Paramètres")}><span className="nav-icon">⚙</span>Paramètres</button><div className="trial"><div className="trial-top"><span>Essai gratuit</span><strong>11 jours</strong></div><div className="progress"><span /></div><small>Passez à Pro pour retirer les limites.</small><button type="button" onClick={() => openView("Offres")}>Voir les offres</button></div><button className="profile profile-button" type="button" onClick={logout}><span className="profile-avatar">{name.slice(0, 2).toUpperCase()}</span><span><strong>{name || "Utilisateur"}</strong><small>Se déconnecter</small></span><span>↪</span></button></div></aside><section className="content"><header className="topbar"><button className="mobile-brand"><span className="brand-mark">F</span>Facture<span className="brand-accent">Pro</span></button><GlobalSearch onNavigate={openView} /><div className="topbar-actions"><button className="icon-button" aria-label="Notifications" onClick={() => openView("Notifications")}>♧<span className="notification-dot" /></button><button className="help-button">?</button><span className="top-avatar">{companyInitials}</span></div></header><div className="page-body"><div className="page-heading"><div><p className="eyebrow">Lundi 21 septembre 2026</p><h1>{showEditor ? "Nouvelle facture" : activeView}</h1><p className="heading-copy">{showEditor ? "Préparez une facture claire, prête à être envoyée." : "Votre activité en un coup d’œil."}</p></div>{!showEditor && activeView === "Factures" && <div className="heading-actions"><button className="primary-button" onClick={() => setShowEditor(true)}>＋ Nouvelle facture</button></div>}</div>{content}</div><nav className="mobile-nav" aria-label="Navigation mobile"><button className={activeView === "Vue d’ensemble" ? "active" : ""} type="button" onClick={() => openView("Vue d’ensemble")}><span>⌂</span>Accueil</button><button className={activeView === "Factures" ? "active" : ""} type="button" onClick={() => openView("Factures")}><span>▤</span>Ventes</button><button className="mobile-add" type="button" aria-label="Nouvelle facture" onClick={() => setShowEditor(true)}>＋</button><button className={activeView === "Clients" ? "active" : ""} type="button" onClick={() => openView("Clients")}><span>♙</span>Clients</button><button className={activeView === "Paramètres" ? "active" : ""} type="button" onClick={() => openView("Paramètres")}><span>•••</span>Plus</button></nav></section></main>;
}
