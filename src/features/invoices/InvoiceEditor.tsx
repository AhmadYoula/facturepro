"use client";

import { useEffect, useMemo, useState } from "react";

import { computeInvoiceTotals } from "@/domain/documents";
import { validateInvoiceDraft } from "@/domain/documents";
import { buildCsv } from "@/domain/export/csv";
import { amountInWords } from "@/domain/money/words";
import { invoiceDraftId, offlineDb, type InvoiceDraft, type InvoiceLineDraft, type LocalCompany, type LocalCustomer, type LocalProduct } from "@/lib/offline/db";
import { issueLocalInvoice } from "@/lib/offline/invoices";
import { requestRemoteSync } from "@/lib/supabase/migrateLocalData";

const initialDraft: InvoiceDraft = {
  id: invoiceDraftId,
  customer: "",
  issueDate: "2026-09-21",
  dueDate: "2026-10-21",
  description: "Prestation de conseil",
  quantity: "1",
  unitPrice: "2500000",
  notes: "",
  updatedAt: Date.now(),
  lines: [{ description: "Prestation de conseil", quantity: "1", unitPrice: "2500000" }],
};

const defaultCompany: LocalCompany = { id: "current", name: "Atelier Keita", legalName: "Atelier Keita SARL", nif: "", rccm: "", address: "Conakry, Guinée", phone: "+224 620 00 00 00", email: "", defaultVatRateBp: "1800", paymentInstructions: "Orange Money : +224 620 00 00 00", updatedAt: Date.now() };

const parseInteger = (value: string) => {
  const digits = value.replace(/\s/g, "");
  return digits === "" ? 0n : BigInt(digits);
};

const formatMoney = (amount: bigint, company: LocalCompany) =>
  `${new Intl.NumberFormat(company.locale ?? "fr-GN").format(Number(amount))} ${company.currencyCode ?? "GNF"}`;

export function InvoiceEditor({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<InvoiceDraft>(initialDraft);
  const [restored, setRestored] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const selectedCustomer = customers.find((customer) => customer.name === draft.customer);
  const [company, setCompany] = useState<LocalCompany>(defaultCompany);
  const lines = useMemo(() => draft.lines ?? [{ description: draft.description, quantity: draft.quantity, unitPrice: draft.unitPrice }], [draft.description, draft.lines, draft.quantity, draft.unitPrice]);

  useEffect(() => {
    let active = true;
    void offlineDb.drafts.get(invoiceDraftId).then((savedDraft) => {
      if (active && savedDraft !== undefined) {
        setDraft({ ...savedDraft, lines: savedDraft.lines ?? [{ description: savedDraft.description, quantity: savedDraft.quantity, unitPrice: savedDraft.unitPrice }] });
        setRestored(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void Promise.all([
      offlineDb.customers.orderBy("name").toArray(),
      offlineDb.products.orderBy("name").toArray(),
      offlineDb.company.get("current"),
    ]).then(([localCustomers, localProducts, localCompany]) => {
      setCustomers(localCustomers);
      setProducts(localProducts);
      if (localCompany !== undefined) setCompany(localCompany);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void offlineDb.drafts.put({ ...draft, updatedAt: Date.now() });
      requestRemoteSync();
      setSaved(true);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const totals = useMemo(() => {
    try {
      return computeInvoiceTotals(lines.map((line) => ({ description: line.description, quantityMilli: parseInteger(line.quantity) * 1000n, unitPriceMinor: parseInteger(line.unitPrice), vatRateBp: BigInt(line.vatRateBp ?? company.defaultVatRateBp) })));
    } catch {
      return undefined;
    }
  }, [company.defaultVatRateBp, lines]);

  const update = (field: keyof InvoiceDraft, value: string) => {
    setSaved(false);
    setValidationErrors([]);
    setMessage("");
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateLine = (index: number, field: keyof InvoiceLineDraft, value: string) => {
    setSaved(false);
    setValidationErrors([]);
    setMessage("");
    setDraft((current) => {
      const nextLines = (current.lines ?? [{ description: current.description, quantity: current.quantity, unitPrice: current.unitPrice }]).map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line);
      const first = nextLines[0] ?? { description: "", quantity: "", unitPrice: "" };
      return { ...current, lines: nextLines, description: first.description, quantity: first.quantity, unitPrice: first.unitPrice };
    });
  };

  const addLine = () => setDraft((current) => ({ ...current, lines: [...(current.lines ?? []), { description: "", quantity: "1", unitPrice: "0" }] }));
  const removeLine = (index: number) => setDraft((current) => {
    const nextLines = (current.lines ?? []).filter((_, lineIndex) => lineIndex !== index);
    const safeLines = nextLines.length > 0 ? nextLines : [{ description: "", quantity: "1", unitPrice: "0" }];
    const first = safeLines[0] ?? { description: "", quantity: "1", unitPrice: "0" };
    return { ...current, lines: safeLines, description: first.description, quantity: first.quantity, unitPrice: first.unitPrice };
  });

  const exportDraft = () => {
    const csv = buildCsv(
      ["Client", "Date d’émission", "Échéance", "Description", "Montant GNF"],
      [[
        draft.customer || "Client à compléter",
        draft.issueDate,
        draft.dueDate,
        draft.description,
        totals?.totalTtcMinor.toString() ?? "0",
      ]],
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "facturepro-brouillon.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearDraft = async () => {
    await offlineDb.drafts.delete(invoiceDraftId);
    setDraft({ ...initialDraft, updatedAt: Date.now() });
    setRestored(false);
    setSaved(false);
  };

  const issueInvoice = async () => {
    const errors = validateInvoiceDraft({ customer: draft.customer, issueDate: draft.issueDate, dueDate: draft.dueDate, lines });
    if (errors.length > 0) {
      setValidationErrors(errors);
      setMessage(errors[0] ?? "La facture doit être complétée.");
      return;
    }
    if (totals === undefined) {
      setMessage("Vérifiez la quantité et le prix.");
      return;
    }
    try {
      const invoice = await issueLocalInvoice(draft, totals.totalTtcMinor);
      requestRemoteSync();
      setMessage(`${invoice.number} émise localement.`);
      setDraft({ ...initialDraft, updatedAt: Date.now() });
      setRestored(false);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Émission impossible.");
    }
  };

  return (
    <section className="editor-grid">
      <div className="panel editor-panel">
        <div className="editor-section-head">
          <h2>Informations générales</h2>
          <span className="draft-badge">
            {restored ? "Brouillon récupéré" : saved ? "Brouillon sauvegardé" : "Brouillon local"}
          </span>
        </div>
        <label>
          Client
          <select value={draft.customer} onChange={(event) => update("customer", event.target.value)}>
            <option value="">Sélectionner un client</option>
            {draft.customer !== "" && !customers.some((customer) => customer.name === draft.customer) && <option value={draft.customer}>{draft.customer} (historique)</option>}
            {customers.map((customer) => <option key={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <div className="form-grid">
          <label>Date d’émission<input type="date" value={draft.issueDate} onChange={(event) => update("issueDate", event.target.value)} /></label>
          <label>Échéance<input type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label>
        </div>
        <div className="line-head">
          <h2>Articles et services</h2>
          <button className="link-button" type="button" onClick={addLine}>＋ Ajouter une ligne</button>
        </div>
        {lines.map((line, index) => <div className="line-item" key={`${index}-${line.description}`}><select className="line-product-select" aria-label={`Produit ou service ligne ${index + 1}`} defaultValue="" onChange={(event) => { const product = products.find((item) => item.id === event.target.value); if (product !== undefined) { updateLine(index, "description", product.description || product.name); updateLine(index, "unitPrice", product.unitPriceMinor); updateLine(index, "vatRateBp", product.vatRateBp); } }}><option value="">Choisir un produit ou saisir manuellement</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input placeholder="Description du service" value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} /><input className="small-input" placeholder="Qté" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /><input className="price-input" placeholder="Prix" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} /><button className="delete-button" type="button" aria-label={`Supprimer la ligne ${index + 1}`} onClick={() => removeLine(index)}>×</button></div>)}
        <label>Notes visibles sur la facture<textarea placeholder="Conditions de paiement, merci..." value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label>
        <div className="editor-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Fermer</button>
          <button className="secondary-button" type="button" onClick={clearDraft}>Réinitialiser</button>
          <button className="secondary-button" type="button" onClick={exportDraft}>Exporter CSV</button>
          <button className="primary-button" type="button" onClick={() => void offlineDb.drafts.put({ ...draft, updatedAt: Date.now() }).then(() => setSaved(true))}>Enregistrer le brouillon</button>
        </div>
        <button className="issue-button" type="button" onClick={() => void issueInvoice()} disabled={validationErrors.length > 0}>Émettre localement</button>
        {validationErrors.length > 0 && <ul className="validation-list" role="alert">{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul>}
        {message !== "" && <p className="editor-message" role="status">{message}</p>}
        <p className="editor-help">Les brouillons sont stockés uniquement sur cet appareil jusqu’à la configuration de Supabase.</p>
      </div>
      <div className="panel preview-panel">
        <div className="preview-top"><span>Aperçu de la facture</span><button type="button" onClick={exportDraft}>CSV</button></div>
        <div className="paper">
          <div className={`paper-brand invoice-template-${company.invoiceTemplate ?? "modern"}`}><span className="brand-mark">F</span><strong>{company.name.toUpperCase()}</strong><small>FACTURE</small></div>
          <div className="paper-rule" />
          <div className="paper-meta"><div><small>ÉMETTEUR</small><strong>{company.legalName}</strong><span>{company.address} · {company.phone}</span><span>NIF {company.nif || "à compléter"} · RCCM {company.rccm || "à compléter"}</span></div><div><small>FACTURÉ À</small><strong>{draft.customer || "Votre client"}</strong><span>{selectedCustomer?.address ?? selectedCustomer?.phone ?? "Coordonnées du client"}</span><span>{selectedCustomer?.email ?? `N° BROUILLON · ${draft.issueDate}`}</span></div></div>
          <div className="paper-lines">{lines.map((line, index) => <div key={`${index}-${line.description}`}><span>{line.description || "Votre prestation"} · {line.quantity}</span><b>{formatMoney(parseInteger(line.unitPrice), company)}</b></div>)}<div><span>{lines.length} ligne(s)</span><span>TVA {Number(company.defaultVatRateBp) / 100} %</span></div></div>
          <div className="paper-total"><span>Total TTC</span><strong>{totals === undefined ? "-" : formatMoney(totals.totalTtcMinor, company)}</strong></div>
          <p className="paper-note">Arrêtée la présente facture à la somme de {totals === undefined ? "-" : amountInWords(totals.totalTtcMinor)}.</p>
        </div>
      </div>
    </section>
  );
}
