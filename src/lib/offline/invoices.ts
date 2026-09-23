import { offlineDb, type InvoiceDraft, type LocalInvoice, type LocalPayment } from "./db";
import { validateInvoiceDraft } from "../../domain/documents";
import { isSupabaseConfigured } from "../supabase/client";
import { createRemoteCreditNote, recordRemotePayment, updateRemoteInvoiceWorkflow } from "../supabase/repositories";

export type LocalInvoiceStatusAction = "draft" | "sent" | "paid" | "overdue";

export async function nextLocalInvoiceNumber(): Promise<string> {
  const invoices = await offlineDb.invoices.toArray();
  const highestNumber = invoices.reduce((highest, invoice) => {
    const match = /^FAC-LOCAL-(\d+)$/.exec(invoice.number);
    return match === null ? highest : Math.max(highest, Number(match[1]));
  }, 0);
  return `FAC-LOCAL-${String(highestNumber + 1).padStart(4, "0")}`;
}

export async function issueLocalInvoice(
  draft: InvoiceDraft,
  totalTtcMinor: bigint,
): Promise<LocalInvoice> {
  const validationErrors = validateInvoiceDraft({ customer: draft.customer, issueDate: draft.issueDate, dueDate: draft.dueDate, lines: draft.lines ?? [{ description: draft.description, quantity: draft.quantity, unitPrice: draft.unitPrice }] });
  if (validationErrors.length > 0) throw new Error(validationErrors[0] ?? "La facture doit être complétée.");
  const customer = await offlineDb.customers.where("name").equals(draft.customer).first();
  const invoice: LocalInvoice = {
    id: crypto.randomUUID(),
    number: await nextLocalInvoiceNumber(),
    workflowStatus: "issued",
    customer: draft.customer,
    ...(customer?.phone ? { customerPhone: customer.phone } : {}),
    ...(customer?.email ? { customerEmail: customer.email } : {}),
    ...(customer?.address ? { customerAddress: customer.address } : {}),
    issueDate: draft.issueDate,
    dueDate: draft.dueDate,
    description: draft.description,
    quantity: draft.quantity,
    unitPriceMinor: draft.unitPrice,
    ...(draft.notes.trim() === "" ? {} : { notes: draft.notes.trim() }),
    totalTtcMinor: totalTtcMinor.toString(),
    amountPaidMinor: "0",
    amountCreditedMinor: "0",
    issuedAt: Date.now(),
    ...(draft.lines === undefined ? {} : { lines: draft.lines }),
  };
  await offlineDb.invoices.add(invoice);
  await offlineDb.drafts.delete(draft.id);
  return invoice;
}

export async function createLocalCreditNote(invoice: LocalInvoice, amountMinor: bigint): Promise<void> {
  await offlineDb.transaction("rw", offlineDb.invoices, async () => {
    const currentInvoice = await offlineDb.invoices.get(invoice.id);
    if (currentInvoice === undefined) throw new Error("Facture introuvable.");
    const credited = BigInt(currentInvoice.amountCreditedMinor ?? "0");
    const remaining = BigInt(currentInvoice.totalTtcMinor) - BigInt(currentInvoice.amountPaidMinor) - credited;
    if (amountMinor <= 0n || amountMinor > remaining) throw new Error("L’avoir doit être positif et ne peut pas dépasser le montant restant.");
    await offlineDb.invoices.update(currentInvoice.id, { amountCreditedMinor: (credited + amountMinor).toString() });
  });
  if (isSupabaseConfigured()) void createRemoteCreditNote(invoice.id, amountMinor.toString()).catch(() => undefined);
}

export async function duplicateLocalInvoice(invoice: LocalInvoice): Promise<InvoiceDraft> {
  const draft: InvoiceDraft = {
    id: "new-invoice",
    customer: invoice.customer,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: invoice.dueDate,
    description: invoice.description,
    quantity: invoice.quantity,
    unitPrice: invoice.unitPriceMinor,
    notes: "",
    updatedAt: Date.now(),
    ...(invoice.lines === undefined ? {} : { lines: invoice.lines.map((line) => ({ ...line })) }),
  };
  await offlineDb.drafts.put(draft);
  return draft;
}

export async function recordLocalPayment(
  invoice: LocalInvoice,
  amountMinor: bigint,
  method: LocalPayment["method"],
): Promise<LocalPayment> {
  const payment: LocalPayment = {
    id: crypto.randomUUID(),
    invoiceId: invoice.id,
    amountMinor: amountMinor.toString(),
    method,
    paidOn: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
  };
  await offlineDb.transaction("rw", offlineDb.invoices, offlineDb.payments, async () => {
    const currentInvoice = await offlineDb.invoices.get(invoice.id);
    if (currentInvoice === undefined) throw new Error("Facture introuvable.");
    const balance = BigInt(currentInvoice.totalTtcMinor) - BigInt(currentInvoice.amountPaidMinor) - BigInt(currentInvoice.amountCreditedMinor ?? "0");
    if (amountMinor <= 0n || amountMinor > balance) throw new Error("Le paiement doit être positif et ne peut pas dépasser le solde.");
    await offlineDb.payments.add(payment);
    await offlineDb.invoices.update(currentInvoice.id, {
      amountPaidMinor: (BigInt(currentInvoice.amountPaidMinor) + amountMinor).toString(),
    });
  });
  if (isSupabaseConfigured()) void recordRemotePayment(invoice.id, payment).catch(() => undefined);
  return payment;
}

export async function updateLocalInvoiceStatus(invoice: LocalInvoice, action: LocalInvoiceStatusAction): Promise<void> {
  await offlineDb.transaction("rw", offlineDb.invoices, offlineDb.payments, async () => {
    const currentInvoice = await offlineDb.invoices.get(invoice.id);
    if (currentInvoice === undefined) throw new Error("Facture introuvable.");
    const paid = BigInt(currentInvoice.amountPaidMinor);
    const credited = BigInt(currentInvoice.amountCreditedMinor ?? "0");
    const remaining = BigInt(currentInvoice.totalTtcMinor) - paid - credited;
    if (action === "draft") {
      if (paid > 0n || credited > 0n) throw new Error("Une facture avec paiement ou avoir ne peut pas redevenir un brouillon.");
      await offlineDb.invoices.update(currentInvoice.id, { workflowStatus: "draft" });
      return;
    }
    if (action === "sent") {
      await offlineDb.invoices.update(currentInvoice.id, { workflowStatus: "sent", sentAt: new Date().toISOString() });
      return;
    }
    if (action === "overdue") {
      if (remaining <= 0n) throw new Error("Une facture soldée ne peut pas être mise en retard.");
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      await offlineDb.invoices.update(currentInvoice.id, { workflowStatus: "sent", dueDate: yesterday, sentAt: currentInvoice.sentAt ?? new Date().toISOString() });
      return;
    }
    if (remaining <= 0n) throw new Error("Cette facture est déjà soldée.");
    await offlineDb.payments.add({ id: crypto.randomUUID(), invoiceId: currentInvoice.id, amountMinor: remaining.toString(), method: "bank_transfer", paidOn: new Date().toISOString().slice(0, 10), createdAt: Date.now() });
    await offlineDb.invoices.update(currentInvoice.id, { amountPaidMinor: (paid + remaining).toString(), workflowStatus: "sent", sentAt: currentInvoice.sentAt ?? new Date().toISOString() });
  });
  if (isSupabaseConfigured() && action !== "paid") {
    const workflowStatus = action === "draft" ? "draft" : "sent";
    const dueDate = action === "overdue" ? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) : undefined;
    void updateRemoteInvoiceWorkflow(invoice.id, workflowStatus, dueDate).catch(() => undefined);
  }
}