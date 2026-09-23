"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

import { useAppFeedback } from "@/components/AppFeedback";
import { computeInvoiceTotals, getInvoiceDisplayStatus, type InvoiceDisplayStatus } from "@/domain/documents";
import { amountInWords } from "@/domain/money/words";
import { offlineDb, type LocalCompany, type LocalCustomer, type LocalInvoice } from "@/lib/offline/db";
import { createLocalCreditNote, duplicateLocalInvoice, type LocalInvoiceStatusAction, updateLocalInvoiceStatus } from "@/lib/offline/invoices";
import { buildLocalInvoicePdf } from "@/lib/pdf/localInvoicePdf";
import { requestRemoteSync } from "@/lib/supabase/migrateLocalData";

const formatMoney = (amount: string) => `${new Intl.NumberFormat("fr-FR").format(Number(amount))} GNF`;
const labels: Record<InvoiceDisplayStatus, string> = { draft: "Brouillon", cancelled: "Annulée", paid: "Payée", overdue: "En retard", partially_paid: "Partiellement payée", issued: "Émise", shared: "Envoyée" };
type Filter = "all" | "paid" | "pending" | "overdue";

export function LocalInvoicesView() {
  const feedback = useAppFeedback();
  const invoices = useLiveQuery(() => offlineDb.invoices.orderBy("issuedAt").reverse().toArray(), [], []);
  const company = useLiveQuery(() => offlineDb.company.get("current"), [], undefined);
  const customers = useLiveQuery(() => offlineDb.customers.toArray(), [], []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<LocalInvoice | undefined>();
  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => invoices.map((invoice) => ({ invoice, status: getInvoiceDisplayStatus({ status: invoice.workflowStatus === "draft" ? "draft" : "issued", totalTtcMinor: BigInt(invoice.totalTtcMinor), amountPaidMinor: BigInt(invoice.amountPaidMinor), amountCreditedMinor: BigInt(invoice.amountCreditedMinor ?? "0"), dueDate: invoice.dueDate, today, ...(invoice.workflowStatus === "sent" ? { firstSharedAt: invoice.sentAt ?? "sent" } : {}) }) })).filter(({ invoice, status }) => {
    const matchesQuery = `${invoice.number} ${invoice.customer}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "paid" && status === "paid") || (filter === "overdue" && status === "overdue") || (filter === "pending" && ["issued", "partially_paid"].includes(status));
    return matchesQuery && matchesFilter;
  }), [filter, invoices, query, today]);

  const remind = (invoice: LocalInvoice) => {
    const text = `Bonjour ${invoice.customer}, votre facture ${invoice.number} de ${formatMoney(invoice.totalTtcMinor)} est disponible. Merci pour votre règlement.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setMessage(`Relance préparée pour ${invoice.customer}.`);
  };

  const share = async (invoice: LocalInvoice) => {
    try {
      const pdf = await buildLocalInvoicePdf(invoice, company);
      const file = new File([pdf], `${invoice.number}.pdf`, { type: "application/pdf" });
      const canUseNativeShare = navigator.share !== undefined && (navigator.canShare === undefined || navigator.canShare({ files: [file] }));
      if (canUseNativeShare) {
        setMessage("Choisissez WhatsApp dans le menu de partage du téléphone.");
        await navigator.share({ title: invoice.number, text: `Facture ${invoice.number} · ${invoice.customer}`, files: [file] });
        setMessage("Facture PDF prête à être partagée.");
        return;
      }
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Ce navigateur ne peut pas joindre automatiquement un fichier à WhatsApp. Le PDF a été téléchargé.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage("Partage annulé.");
        return;
      }
      setMessage("Impossible de générer le PDF. Réessayez.");
    }
  };

  const duplicate = async (invoice: LocalInvoice) => {
    await duplicateLocalInvoice(invoice);
    setSelected(undefined);
    setMessage(`Brouillon créé depuis ${invoice.number}. Ouvrez Nouvelle facture pour le modifier.`);
  };

  const changeStatus = async (invoice: LocalInvoice, action: LocalInvoiceStatusAction) => {
    try {
      await updateLocalInvoiceStatus(invoice, action);
      requestRemoteSync();
      const label = { draft: "Brouillon", sent: "Envoyée", paid: "Payée", overdue: "En retard" }[action];
      const message = `${invoice.number} est maintenant ${label.toLowerCase()}.`;
      setSelected(undefined);
      setMessage(message);
      feedback.notify(message, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Changement de statut impossible.";
      setMessage(message);
      feedback.notify(message, "error");
    }
  };

  return <section className="local-list panel">
    <div className="panel-heading"><div><h2>Factures locales</h2><p>Factures émises sur cet appareil, avant synchronisation.</p></div><span className="draft-badge">Mode local</span></div>
    <div className="invoice-tools"><input aria-label="Rechercher une facture" placeholder="Rechercher par numéro ou client" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="filter-tabs"><button className={filter === "all" ? "active" : ""} type="button" onClick={() => setFilter("all")}>Toutes</button><button className={filter === "paid" ? "active" : ""} type="button" onClick={() => setFilter("paid")}>Payées</button><button className={filter === "pending" ? "active" : ""} type="button" onClick={() => setFilter("pending")}>En attente</button><button className={filter === "overdue" ? "active" : ""} type="button" onClick={() => setFilter("overdue")}>En retard</button></div></div>
    {message !== "" && <p className="editor-message" role="status">{message}</p>}
    {invoices.length === 0 ? <div className="empty-state"><strong>Aucune facture émise</strong><span>Créez un brouillon puis émettez-le pour le retrouver ici.</span></div> : rows.length === 0 ? <div className="empty-state"><strong>Aucun résultat</strong><span>Modifiez votre recherche ou votre filtre.</span></div> : <div className="local-invoices">{rows.map(({ invoice, status }) => <div className="local-invoice-row" key={invoice.id}><div><strong>{invoice.number}</strong><span>{invoice.customer}</span></div><div><strong>{formatMoney(invoice.totalTtcMinor)}</strong><span>{invoice.issueDate}</span></div><span className={`status ${status}`}>{labels[status]}</span><button className="detail-button" type="button" onClick={() => setSelected(invoice)}>Détails</button><button className="remind-button" type="button" onClick={() => remind(invoice)}>Relancer</button></div>)}</div>}
    {selected !== undefined && <><InvoiceDetail invoice={selected} company={company} customer={customers.find((customer) => customer.name === selected.customer)} onClose={() => setSelected(undefined)} onShare={() => void share(selected)} onDuplicate={() => void duplicate(selected)} onStatus={(action) => void changeStatus(selected, action)} /><CreditNoteAction invoice={selected} onDone={(message) => { setSelected(undefined); setMessage(message); }} /></>}
  </section>;
}

function CreditNoteAction({ invoice, onDone }: { invoice: LocalInvoice; onDone: (message: string) => void }) {
  const feedback = useAppFeedback();
  const create = async () => {
    const input = await feedback.prompt({ title: "Créer un avoir", message: `Saisissez le montant de l’avoir à appliquer à ${invoice.number}.`, confirmLabel: "Créer l’avoir", tone: "info", input: { label: "Montant", initialValue: invoice.totalTtcMinor, placeholder: "Ex. 250000", inputMode: "numeric" } });
    if (input === null) return;
    const normalizedInput = input.replace(/[\s\u00a0\u202f]/g, "");
    if (!/^\d+$/.test(normalizedInput)) { feedback.notify("Saisissez un montant entier positif.", "error"); return; }
    try { await createLocalCreditNote(invoice, BigInt(normalizedInput)); requestRemoteSync(); const message = `Avoir enregistré sur ${invoice.number}.`; onDone(message); feedback.notify(message, "success"); } catch (error) { const message = error instanceof Error ? error.message : "Avoir impossible."; onDone(message); feedback.notify(message, "error"); }
  };
  return <button className="secondary-button credit-note-action" type="button" onClick={() => void create()}>Créer un avoir</button>;
}

function InvoiceDetail({ invoice, company, customer, onClose, onShare, onDuplicate, onStatus }: { invoice: LocalInvoice; company?: LocalCompany | undefined; customer: LocalCustomer | undefined; onClose: () => void; onShare: () => void; onDuplicate: () => void; onStatus: (action: LocalInvoiceStatusAction) => void }) {
  const balance = BigInt(invoice.totalTtcMinor) - BigInt(invoice.amountPaidMinor) - BigInt(invoice.amountCreditedMinor ?? "0");
  const localLines = invoice.lines ?? [{ description: invoice.description, quantity: invoice.quantity, unitPrice: invoice.unitPriceMinor }];
  const totals = (() => { try { return computeInvoiceTotals(localLines.map((line) => ({ description: line.description, quantityMilli: BigInt(Math.round(Number(line.quantity.replace(",", ".")) * 1000)), unitPriceMinor: BigInt(line.unitPrice.replace(/\s/g, "")), vatRateBp: BigInt(company?.defaultVatRateBp ?? "1800") }))); } catch { return undefined; } })();
  const customerAddress = invoice.customerAddress ?? customer?.address;
  const customerPhone = invoice.customerPhone ?? customer?.phone;
  const customerEmail = invoice.customerEmail ?? customer?.email;
  const [nextStatus, setNextStatus] = useState<LocalInvoiceStatusAction>("sent");
  const statusLabels: Record<LocalInvoiceStatusAction, string> = { draft: "Mettre en brouillon", sent: "Marquer comme envoyée", paid: "Marquer comme payée", overdue: "Marquer en retard" };
  return <div className="invoice-detail" role="dialog" aria-label={`Détail ${invoice.number}`}><div className="print-invoice"><div className="print-invoice-header"><div><div className="print-brand"><span className="brand-mark">F</span><strong>{(company?.name ?? "FACTUREPRO").toUpperCase()}</strong></div><strong>{company?.legalName ?? "Entreprise"}</strong><span>{company?.address ?? "Conakry, Guinée"}</span><span>{company?.phone ?? ""} {company?.email ? `· ${company.email}` : ""}</span><span>NIF : {company?.nif || "À compléter"} · RCCM : {company?.rccm || "À compléter"}</span></div><div className="print-title"><span>FACTURE</span><strong>{invoice.number}</strong><small>Émise le {invoice.issueDate}</small><small>Échéance : {invoice.dueDate}</small></div></div><div className="print-parties"><div><small>FACTURÉ À</small><strong>{invoice.customer}</strong>{customerAddress && <span>{customerAddress}</span>}{customerPhone && <span>{customerPhone}</span>}{customerEmail && <span>{customerEmail}</span>}</div><div><small>STATUT</small><strong>{balance === 0n ? "PAYÉE" : "À RÉGLER"}</strong><span>Devise : GNF</span></div></div><table className="print-lines"><thead><tr><th>Description</th><th>Qté</th><th>Prix unitaire</th><th>Total HT</th></tr></thead><tbody>{localLines.map((line, index) => <tr key={`${index}-${line.description}`}><td>{line.description || "Prestation"}</td><td>{line.quantity}</td><td>{formatMoney(line.unitPrice)}</td><td>{formatMoney(totals?.lineTotalsMinor[index]?.toString() ?? line.unitPrice)}</td></tr>)}</tbody></table><div className="print-totals"><div><span>Sous-total HT</span><strong>{formatMoney(totals?.totalHtMinor.toString() ?? invoice.totalTtcMinor)}</strong><span>TVA {Number(company?.defaultVatRateBp ?? "1800") / 100} %</span><strong>{formatMoney(totals?.totalVatMinor.toString() ?? "0")}</strong></div><div className="print-grand-total"><span>Total TTC</span><strong>{formatMoney(invoice.totalTtcMinor)}</strong></div></div><p className="print-words">Arrêtée la présente facture à la somme de <strong>{amountInWords(BigInt(invoice.totalTtcMinor))}</strong>.</p><div className="print-footer"><div><strong>Conditions de paiement</strong><span>Paiement à l’échéance indiquée ci-dessus.</span><span>Merci pour votre confiance.</span></div><div><strong>Signature / cachet</strong><span className="signature-space" /></div></div></div><div className="detail-screen-actions"><div className="detail-heading"><div><span className="eyebrow">Facture locale</span><h3>{invoice.number}</h3><p>{invoice.customer} · émise le {invoice.issueDate}</p></div><button className="close-detail" type="button" aria-label="Fermer" onClick={onClose}>×</button></div><div className="detail-values"><div><span>Total TTC</span><strong>{formatMoney(invoice.totalTtcMinor)}</strong></div><div><span>Déjà encaissé</span><strong>{formatMoney(invoice.amountPaidMinor)}</strong></div><div><span>Solde</span><strong>{formatMoney(balance.toString())}</strong></div></div><div className="invoice-status-control"><div><span>Cycle de vie</span><strong>{invoice.workflowStatus === "draft" ? "Brouillon" : invoice.workflowStatus === "sent" ? "Envoyée" : "Émise"}</strong></div><select aria-label="Nouveau statut de la facture" value={nextStatus} onChange={(event) => setNextStatus(event.target.value as LocalInvoiceStatusAction)}>{(Object.keys(statusLabels) as LocalInvoiceStatusAction[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><button className="secondary-button" type="button" onClick={() => onStatus(nextStatus)}>Appliquer</button></div><div className="detail-actions"><button className="secondary-button" type="button" onClick={() => window.print()}>Imprimer</button><button className="secondary-button" type="button" onClick={onDuplicate}>Dupliquer</button><button className="primary-button" type="button" onClick={onShare}>Partager le PDF</button></div><p className="editor-help">« Payée » enregistre le solde restant comme virement local. « En retard » place l’échéance à hier.</p></div></div>;
}
