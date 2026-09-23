import { describe, expect, it } from "vitest";

import { computeInvoiceTotals, getInvoiceDisplayStatus, validateInvoiceDraft } from "./index";

describe("invoice domain", () => {
  it("computes VAT by group and applies global discount per group", () => {
    const totals = computeInvoiceTotals(
      [
        {
          description: "Conseil",
          quantityMilli: 3_000n,
          unitPriceMinor: 125_000n,
          vatRateBp: 1_800n,
        },
        {
          description: "Support",
          quantityMilli: 2_500n,
          unitPriceMinor: 40_000n,
          discountBp: 1_000n,
          vatRateBp: 1_800n,
        },
        {
          description: "Formation exoneree",
          quantityMilli: 1_000n,
          unitPriceMinor: 1_000_000n,
          vatRateBp: 0n,
          vatExempt: true,
        },
      ],
      500n,
    );

    expect(totals.totalHtMinor).toBe(1_391_750n);
    expect(totals.totalVatMinor).toBe(79_515n);
    expect(totals.totalTtcMinor).toBe(1_471_265n);
  });

  it("derives overdue and paid statuses from facts", () => {
    expect(
      getInvoiceDisplayStatus({
        status: "issued",
        totalTtcMinor: 100n,
        amountPaidMinor: 20n,
        amountCreditedMinor: 0n,
        dueDate: "2026-09-20",
        today: "2026-09-21",
      }),
    ).toBe("overdue");
    expect(
      getInvoiceDisplayStatus({
        status: "issued",
        totalTtcMinor: 100n,
        amountPaidMinor: 100n,
        amountCreditedMinor: 0n,
        today: "2026-09-21",
      }),
    ).toBe("paid");
  });

  it("rejects incomplete drafts before local issuance", () => {
    expect(validateInvoiceDraft({ customer: "", issueDate: "2026-09-21", dueDate: "2026-09-20", lines: [{ description: "", quantity: "0", unitPrice: "" }] })).toEqual([
      "Un client est obligatoire.",
      "L’échéance doit être postérieure à la date d’émission.",
      "La ligne 1 doit avoir une description.",
      "La quantité de la ligne 1 doit être positive.",
      "Le prix de la ligne 1 doit être un entier positif.",
    ]);
  });
});