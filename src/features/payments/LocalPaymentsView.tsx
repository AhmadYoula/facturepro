"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";

import { offlineDb, type LocalPayment } from "@/lib/offline/db";
import { recordLocalPayment } from "@/lib/offline/invoices";
import { requestRemoteSync } from "@/lib/supabase/migrateLocalData";

const formatMoney = (amount: bigint) =>
  `${new Intl.NumberFormat("fr-FR").format(Number(amount))} GNF`;
const methodLabels: Record<LocalPayment["method"], string> = { orange_money: "Orange Money", mtn_momo: "MTN MoMo", cash: "Espèces", bank_transfer: "Virement bancaire" };

export function LocalPaymentsView() {
  const invoices = useLiveQuery(() => offlineDb.invoices.orderBy("issuedAt").reverse().toArray(), [], []);
  const payments = useLiveQuery(() => offlineDb.payments.orderBy("createdAt").reverse().toArray(), [], []);
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "orange_money" | "mtn_momo" | "bank_transfer">("orange_money");
  const [message, setMessage] = useState("");

  useEffect(() => { setSelectedId((current) => current || invoices[0]?.id || ""); }, [invoices]);

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedId);
  const normalizedAmount = amount.replace(/[\s\u00a0\u202f]/g, "");
  const amountIsValid = /^\d+$/.test(normalizedAmount) && BigInt(normalizedAmount || "0") > 0n;
  const balance = useMemo(() => selectedInvoice === undefined
    ? 0n
    : BigInt(selectedInvoice.totalTtcMinor) - BigInt(selectedInvoice.amountPaidMinor) - BigInt(selectedInvoice.amountCreditedMinor ?? "0"), [selectedInvoice]);

  const savePayment = async () => {
    if (selectedInvoice === undefined) return;
    try {
      if (!amountIsValid) {
        setMessage("Saisissez un montant entier positif.");
        return;
      }
      await recordLocalPayment(selectedInvoice, BigInt(normalizedAmount), method);
      requestRemoteSync();
      setAmount("");
      setMessage("Paiement enregistré localement.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Paiement impossible.");
    }
  };

  const selectedPayments = payments.filter((payment) => selectedInvoice === undefined || payment.invoiceId === selectedInvoice.id);
  return <section className="payment-layout"><div className="panel payment-form"><div className="panel-heading"><div><h2>Enregistrer un paiement</h2><p>Les encaissements restent sur cet appareil.</p></div><span className="draft-badge">Mode local</span></div>{invoices.length === 0 ? <div className="empty-state"><strong>Aucune facture disponible</strong><span>Émettez d’abord une facture locale pour enregistrer un paiement.</span></div> : <><label>Facture<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.customer}</option>)}</select></label><div className="payment-balance"><span>Solde restant</span><strong>{formatMoney(balance)}</strong></div><label>Montant encaissé<input inputMode="numeric" placeholder="Ex. 1 000 000" value={amount} onChange={(event) => { setAmount(event.target.value); setMessage(""); }} /></label><label>Mode de paiement<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="orange_money">Orange Money</option><option value="mtn_momo">MTN MoMo</option><option value="cash">Espèces</option><option value="bank_transfer">Virement bancaire</option></select></label><button className="primary-button payment-submit" type="button" disabled={!amountIsValid} onClick={() => void savePayment()}>Enregistrer le paiement</button>{message !== "" && <p className="editor-message" role="status">{message}</p>}</>}</div><div className="panel payment-history"><div className="panel-heading"><div><h2>Historique des encaissements</h2><p>{selectedInvoice ? `Paiements de ${selectedInvoice.number}` : "Tous les paiements locaux"}</p></div></div>{selectedPayments.length === 0 ? <div className="empty-state"><strong>Aucun paiement</strong><span>Les encaissements apparaîtront ici après le premier règlement.</span></div> : <div className="payment-history-list">{selectedPayments.map((payment) => <div className="payment-history-row" key={payment.id}><div><strong>{formatMoney(BigInt(payment.amountMinor))}</strong><span>{methodLabels[payment.method]}</span></div><span>{payment.paidOn}</span></div>)}</div>}</div></section>;
}
