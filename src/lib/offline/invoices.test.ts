import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { createLocalCreditNote, nextLocalInvoiceNumber, recordLocalPayment, updateLocalInvoiceStatus } from "./invoices";
import { offlineDb, type LocalInvoice } from "./db";

const invoice: LocalInvoice = {
  id: "invoice-test",
  number: "FAC-LOCAL-TEST",
  customer: "Client test",
  issueDate: "2026-09-22",
  dueDate: "2026-10-22",
  description: "Service",
  quantity: "1",
  unitPriceMinor: "1000000",
  totalTtcMinor: "1180000",
  amountPaidMinor: "0",
  amountCreditedMinor: "0",
  issuedAt: Date.now(),
};

beforeEach(async () => {
  await offlineDb.invoices.clear();
  await offlineDb.payments.clear();
  await offlineDb.invoices.add({ ...invoice });
});

describe("local financial operations", () => {
  it("records a payment and updates the invoice balance", async () => {
    const payment = await recordLocalPayment(invoice, 300000n, "orange_money");
    const stored = await offlineDb.invoices.get(invoice.id);
    expect(payment.amountMinor).toBe("300000");
    expect(stored?.amountPaidMinor).toBe("300000");
  });

  it("rejects overpayment", async () => {
    await expect(recordLocalPayment(invoice, 1180001n, "cash")).rejects.toThrow("ne peut pas dépasser");
  });

  it("records a credit note up to the invoice total", async () => {
    await createLocalCreditNote(invoice, 1180000n);
    const stored = await offlineDb.invoices.get(invoice.id);
    expect(stored?.amountCreditedMinor).toBe("1180000");
    await expect(createLocalCreditNote(stored as LocalInvoice, 1n)).rejects.toThrow("ne peut pas dépasser");
  });

  it("does not accept a payment beyond the balance after a credit note", async () => {
    await createLocalCreditNote(invoice, 400000n);
    const creditedInvoice = await offlineDb.invoices.get(invoice.id);
    await expect(recordLocalPayment(creditedInvoice as LocalInvoice, 780001n, "cash")).rejects.toThrow("ne peut pas dépasser");
  });

  it("does not accept a credit note beyond the balance after a payment", async () => {
    await recordLocalPayment(invoice, 300000n, "cash");
    const paidInvoice = await offlineDb.invoices.get(invoice.id);
    await expect(createLocalCreditNote(paidInvoice as LocalInvoice, 880001n)).rejects.toThrow("ne peut pas dépasser");
  });

  it("rejects a stale payment that would exceed the current balance", async () => {
    await recordLocalPayment(invoice, 300000n, "cash");
    await expect(recordLocalPayment(invoice, 1000000n, "cash")).rejects.toThrow("ne peut pas dépasser");
  });

  it("keeps invoice numbers increasing after a deletion", async () => {
    await offlineDb.invoices.add({ ...invoice, id: "invoice-12", number: "FAC-LOCAL-0012" });
    await offlineDb.invoices.delete(invoice.id);
    await expect(nextLocalInvoiceNumber()).resolves.toBe("FAC-LOCAL-0013");
  });

  it("updates the workflow to sent and then records a full payment", async () => {
    await updateLocalInvoiceStatus(invoice, "sent");
    const sentInvoice = await offlineDb.invoices.get(invoice.id);
    expect(sentInvoice?.workflowStatus).toBe("sent");
    expect(sentInvoice?.sentAt).toBeTruthy();
    await updateLocalInvoiceStatus(sentInvoice as LocalInvoice, "paid");
    expect(await offlineDb.invoices.get(invoice.id)).toMatchObject({ amountPaidMinor: "1180000", workflowStatus: "sent" });
    expect(await offlineDb.payments.where("invoiceId").equals(invoice.id).count()).toBe(1);
  });

  it("does not move a paid invoice back to draft", async () => {
    await recordLocalPayment(invoice, 100000n, "cash");
    const paidInvoice = await offlineDb.invoices.get(invoice.id);
    await expect(updateLocalInvoiceStatus(paidInvoice as LocalInvoice, "draft")).rejects.toThrow("ne peut pas redevenir");
  });
});
