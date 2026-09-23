"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { useAppFeedback } from "@/components/AppFeedback";
import { getInvoiceDisplayStatus, type InvoiceDisplayStatus } from "@/domain/documents";
import { offlineDb, type LocalInvoice } from "@/lib/offline/db";

const money = (amount: bigint) => `${new Intl.NumberFormat("fr-FR").format(Number(amount))} GNF`;
const statusLabels: Record<InvoiceDisplayStatus, string> = { draft: "Brouillon", cancelled: "Annulée", paid: "Payée", overdue: "En retard", partially_paid: "Partiellement payée", issued: "Émise", shared: "Envoyée" };
type DashboardRow = { invoice: LocalInvoice; total: bigint; balance: bigint; status: InvoiceDisplayStatus };

export function LocalDashboard({ onCreate, onNavigate, onEdit }: { onCreate: () => void; onNavigate?: (view: string) => void; onEdit?: (invoice: LocalInvoice) => void }) {
  const feedback = useAppFeedback();
  const invoices = useLiveQuery(() => offlineDb.invoices.orderBy("issuedAt").reverse().toArray(), [], []);
  const company = useLiveQuery(() => offlineDb.company.get("current"), [], undefined);
  const customerCount = useLiveQuery(() => offlineDb.customers.count(), [], 0);
  const [menuInvoiceId, setMenuInvoiceId] = useState<string>();
  const [preview, setPreview] = useState<DashboardRow>();
  const summary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rows: DashboardRow[] = invoices.map((invoice) => {
      const total = BigInt(invoice.totalTtcMinor);
      const paid = BigInt(invoice.amountPaidMinor);
      const credited = BigInt(invoice.amountCreditedMinor ?? "0");
      return { invoice, total, balance: total - paid - credited, status: getInvoiceDisplayStatus({ status: invoice.workflowStatus === "draft" ? "draft" : "issued", totalTtcMinor: total, amountPaidMinor: paid, amountCreditedMinor: credited, dueDate: invoice.dueDate, today, ...(invoice.workflowStatus === "sent" ? { firstSharedAt: invoice.sentAt ?? "sent" } : {}) }) };
    });
    const billed = rows.reduce((sum, row) => sum + row.total, 0n);
    const paid = rows.reduce((sum, row) => sum + BigInt(row.invoice.amountPaidMinor), 0n);
    const outstanding = rows.reduce((sum, row) => sum + (row.balance > 0n ? row.balance : 0n), 0n);
    const overdue = rows.filter((row) => row.status === "overdue").reduce((sum, row) => sum + row.balance, 0n);
    return { rows, billed, paid, outstanding, overdue, paidRatio: billed > 0n ? Math.min(100, Number((paid * 100n) / billed)) : 0 };
  }, [invoices]);

  const remove = async (id: string) => {
    const accepted = await feedback.confirm({ title: "Supprimer cette facture", message: "Cette action supprimera la facture de cet appareil. Elle ne peut pas être annulée.", confirmLabel: "Supprimer", tone: "error" });
    if (!accepted) return;
    await offlineDb.invoices.delete(id);
    feedback.notify("Facture supprimée localement.", "success");
  };

  return <section className="dashboard-home">
    <div className="dashboard-hero"><div><p className="eyebrow">Votre espace de pilotage</p><h2>Bonjour, {company?.name || "votre entreprise"}<span>.</span></h2><p>Gardez une vue claire sur vos ventes, vos encaissements et vos relances.</p><div className="hero-actions"><button className="primary-button" type="button" onClick={onCreate}>＋ Créer une facture</button><span className="hero-local"><i /> Données locales synchronisées</span></div></div><div className="hero-orbit"><div className="orbit-ring" /><div className="orbit-core"><strong>{summary.paidRatio}%</strong><span>encaissé</span></div></div></div>
    <section className="metric-grid"><Metric label="Chiffre facturé" value={money(summary.billed)} detail={`${invoices.length} facture(s)`} tone="blue" icon="↗" /><Metric label="Encaissé" value={money(summary.paid)} detail="paiements reçus" tone="green" icon="✓" /><Metric label="À recevoir" value={money(summary.outstanding)} detail="solde ouvert" tone="amber" icon="◷" /><Metric label="En retard" value={money(summary.overdue)} detail="à relancer" tone="red" icon="!" /><Metric label="Clients" value={String(customerCount)} detail={customerCount === 1 ? "client enregistré" : "clients enregistrés"} tone="purple" icon="♙" /></section>
    <div className="dashboard-columns"><section className="dashboard-card quick-actions"><div className="dashboard-card-heading"><div><span className="section-kicker">Actions rapides</span><h3>Faire avancer l’activité</h3></div><span className="spark">✦</span></div><div className="quick-grid"><button type="button" onClick={onCreate}><span className="quick-icon blue">＋</span><strong>Nouvelle facture</strong><small>Créer et envoyer</small></button><button type="button" onClick={() => onNavigate?.("Clients")}><span className="quick-icon purple">♙</span><strong>Ajouter un client</strong><small>Enrichir votre carnet</small></button><button type="button" onClick={() => onNavigate?.("Paiements")}><span className="quick-icon green">↔</span><strong>Enregistrer un paiement</strong><small>Mettre à jour un solde</small></button><button type="button" onClick={() => onNavigate?.("Rapports")}><span className="quick-icon amber">◒</span><strong>Voir les rapports</strong><small>Comprendre les tendances</small></button></div></section><section className="dashboard-card health-card"><div className="dashboard-card-heading"><div><span className="section-kicker">Santé commerciale</span><h3>Vos encaissements</h3></div><span className="health-badge">{summary.paidRatio >= 70 ? "Très bien" : "À suivre"}</span></div><div className="health-bar"><i style={{ width: `${summary.paidRatio}%` }} /></div><div className="health-labels"><span>0 GNF encaissé</span><strong>{summary.paidRatio}% du facturé</strong><span>{money(summary.billed)}</span></div><p>Un suivi régulier des paiements vous aide à relancer au bon moment.</p></section></div>
    <section className="dashboard-card activity-card"><div className="dashboard-card-heading"><div><span className="section-kicker">Activité récente</span><h3>Vos dernières factures</h3></div><span className="live-dot">● En direct</span></div>{summary.rows.length === 0 ? <div className="dashboard-empty"><strong>Votre tableau de bord est prêt</strong><span>Créez une facture pour voir votre activité apparaître ici.</span><button className="secondary-button" type="button" onClick={onCreate}>Commencer maintenant</button></div> : <div className="activity-table-wrap"><table className="activity-table"><thead><tr><th>Client</th><th>N° facture</th><th>Date</th><th>Statut</th><th>Montant</th><th aria-label="Options" /></tr></thead><tbody>{summary.rows.slice(0, 20).map((row) => <tr key={row.invoice.id}><td><strong>{row.invoice.customer}</strong></td><td>{row.invoice.number}</td><td>{row.invoice.issueDate}</td><td><span className={`status ${row.status}`}>{statusLabels[row.status]}</span></td><td className="activity-amount">{money(row.total)}</td><td className="activity-menu-cell"><button className="invoice-menu-trigger" type="button" aria-label={`Options pour ${row.invoice.number}`} aria-expanded={menuInvoiceId === row.invoice.id} onClick={() => setMenuInvoiceId(menuInvoiceId === row.invoice.id ? undefined : row.invoice.id)}>⋯</button>{menuInvoiceId === row.invoice.id && <div className="invoice-context-menu"><button type="button" onClick={() => { setPreview(row); setMenuInvoiceId(undefined); }}>Voir l’aperçu</button><button type="button" onClick={() => { onEdit?.(row.invoice); setMenuInvoiceId(undefined); }}>Modifier</button><button className="danger-action" type="button" onClick={() => { setMenuInvoiceId(undefined); void remove(row.invoice.id); }}>Supprimer</button></div>}</td></tr>)}</tbody></table></div>}</section>
    {preview !== undefined && <InvoicePreview row={preview} onClose={() => setPreview(undefined)} />}
  </section>;
}

function InvoicePreview({ row, onClose }: { row: DashboardRow; onClose: () => void }) {
  const lines = row.invoice.lines ?? [{ description: row.invoice.description, quantity: row.invoice.quantity, unitPrice: row.invoice.unitPriceMinor }];
  return <div className="dashboard-preview-backdrop" role="presentation" onMouseDown={onClose}><section className="dashboard-invoice-preview" role="dialog" aria-modal="true" aria-label={`Aperçu ${row.invoice.number}`} onMouseDown={(event) => event.stopPropagation()}><button className="close-detail" type="button" aria-label="Fermer l’aperçu" onClick={onClose}>×</button><div className="preview-brand"><span className="brand-mark">F</span><strong>FACTUREPRO</strong><span>APERÇU DE FACTURE</span></div><div className="preview-title"><div><span>FACTURÉ À</span><strong>{row.invoice.customer}</strong></div><div><span>FACTURE</span><strong>{row.invoice.number}</strong><small>Émise le {row.invoice.issueDate}</small></div></div><div className="preview-lines">{lines.map((line, index) => <div key={`${line.description}-${index}`}><span>{line.description || "Prestation"}<small>Qté : {line.quantity}</small></span><strong>{money(BigInt(line.unitPrice))}</strong></div>)}</div><div className="preview-total"><span>Total TTC</span><strong>{money(row.total)}</strong></div><div className="preview-status"><span className={`status ${row.status}`}>{statusLabels[row.status]}</span><span>Échéance : {row.invoice.dueDate}</span></div></section></div>;
}

function Metric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: string }) {
  return <div className={`metric metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><div className="metric-bottom"><span>{detail}</span></div></div>;
}
