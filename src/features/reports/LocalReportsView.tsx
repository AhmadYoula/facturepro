"use client";

import { useEffect, useMemo, useState } from "react";

import { getInvoiceDisplayStatus, type InvoiceDisplayStatus } from "@/domain/documents";
import { buildCsv } from "@/domain/export/csv";
import { offlineDb, type LocalInvoice } from "@/lib/offline/db";

const money = (amount: bigint) => `${new Intl.NumberFormat("fr-FR").format(Number(amount))} GNF`;
const labels: Record<InvoiceDisplayStatus, string> = { draft: "Brouillon", cancelled: "Annulée", paid: "Payée", overdue: "En retard", partially_paid: "Partiellement payée", issued: "Émise", shared: "Envoyée" };

export function LocalReportsView() {
  const [invoices, setInvoices] = useState<LocalInvoice[]>([]);
  useEffect(() => { void offlineDb.invoices.toArray().then(setInvoices); }, []);
  const report = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = invoices.map((invoice) => {
      const total = BigInt(invoice.totalTtcMinor);
      const paid = BigInt(invoice.amountPaidMinor);
      const balance = total - paid;
      const status = getInvoiceDisplayStatus({ status: invoice.workflowStatus === "draft" ? "draft" : "issued", totalTtcMinor: total, amountPaidMinor: paid, amountCreditedMinor: BigInt(invoice.amountCreditedMinor ?? "0"), dueDate: invoice.dueDate, today, ...(invoice.workflowStatus === "sent" ? { firstSharedAt: invoice.sentAt ?? "sent" } : {}) });
      return { invoice, total, paid, balance, status };
    });
    return { rows, billed: rows.reduce((sum, row) => sum + row.total, 0n), paid: rows.reduce((sum, row) => sum + row.paid, 0n), overdue: rows.filter((row) => row.status === "overdue").reduce((sum, row) => sum + row.balance, 0n) };
  }, [invoices]);
  const download = () => {
    const csv = buildCsv(["Facture", "Client", "Statut", "Total GNF", "Encaissé GNF", "Solde GNF"], report.rows.map(({ invoice, total, paid, balance, status }) => [invoice.number, invoice.customer, labels[status], total.toString(), paid.toString(), balance.toString()]));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "facturepro-rapport.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const buckets = ["paid", "partially_paid", "issued", "overdue"] as const;
  return <section className="reports-layout"><div className="panel report-summary"><div className="panel-heading"><div><h2>Rapports locaux</h2><p>Calculés à partir des factures enregistrées sur cet appareil.</p></div><button className="secondary-button" type="button" onClick={download}>Exporter CSV</button></div><div className="report-kpis"><div><span>Facturé</span><strong>{money(report.billed)}</strong></div><div><span>Encaissé</span><strong>{money(report.paid)}</strong></div><div><span>En retard</span><strong>{money(report.overdue)}</strong></div></div></div><div className="panel status-report"><h2>Répartition par statut</h2>{buckets.map((bucket) => { const count = report.rows.filter((row) => row.status === bucket).length; return <div className="status-report-row" key={bucket}><span>{labels[bucket]}</span><strong>{count}</strong><div className="status-bar"><i style={{ width: `${report.rows.length === 0 ? 0 : (count / report.rows.length) * 100}%` }} /></div></div>; })}</div><div className="panel aging-report"><h2>Balance âgée</h2><p>Les montants sont regroupés selon le statut actuel de chaque facture.</p><div className="aging-row"><span>À recevoir</span><strong>{money(report.billed - report.paid - report.overdue)}</strong></div><div className="aging-row overdue-row"><span>En retard</span><strong>{money(report.overdue)}</strong></div></div></section>;
}
