"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

import { getInvoiceDisplayStatus } from "@/domain/documents";
import { offlineDb } from "@/lib/offline/db";

export function LocalNotificationsView() {
  const invoices = useLiveQuery(() => offlineDb.invoices.toArray(), [], []);
  const payments = useLiveQuery(() => offlineDb.payments.toArray(), [], []);
  const notifications = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = invoices.filter((invoice) => getInvoiceDisplayStatus({ status: invoice.workflowStatus === "draft" ? "draft" : "issued", totalTtcMinor: BigInt(invoice.totalTtcMinor), amountPaidMinor: BigInt(invoice.amountPaidMinor), amountCreditedMinor: BigInt(invoice.amountCreditedMinor ?? "0"), dueDate: invoice.dueDate, today, ...(invoice.workflowStatus === "sent" ? { firstSharedAt: invoice.sentAt ?? "sent" } : {}) }) === "overdue").map((invoice) => ({ id: `overdue-${invoice.id}`, icon: "!", title: `Facture en retard : ${invoice.number}`, detail: `${invoice.customer} doit encore ${invoice.totalTtcMinor} GNF`, tone: "warning" }));
    const recentPayments = payments.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((payment) => ({ id: payment.id, icon: "✓", title: "Paiement enregistré", detail: `${payment.amountMinor} GNF · ${payment.method}`, tone: "success" }));
    return [...overdue, ...recentPayments];
  }, [invoices, payments]);
  return <section className="notifications-panel panel"><div className="panel-heading"><div><h2>Notifications</h2><p>Les événements de votre activité locale.</p></div><span className="draft-badge">Mode local</span></div>{notifications.length === 0 ? <div className="empty-state"><strong>Aucune notification</strong><span>Les paiements et retards apparaîtront ici.</span></div> : <div className="notification-list">{notifications.map((notification) => <div className="notification-row" key={notification.id}><span className={`notification-icon ${notification.tone}`}>{notification.icon}</span><div><strong>{notification.title}</strong><span>{notification.detail}</span></div></div>)}</div>}</section>;
}
