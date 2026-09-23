import { calculateLineNet, calculateVat, roundHalfUp } from "../money";

export type InvoiceLineInput = {
  description: string;
  quantityMilli: bigint;
  unitPriceMinor: bigint;
  discountBp?: bigint;
  vatRateBp: bigint;
  vatExempt?: boolean;
};

export type InvoiceDraftValidationInput = {
  customer: string;
  issueDate: string;
  dueDate: string;
  lines: Array<{ description: string; quantity: string; unitPrice: string }>;
};

export function validateInvoiceDraft(input: InvoiceDraftValidationInput): string[] {
  const errors: string[] = [];
  if (input.customer.trim() === "") errors.push("Un client est obligatoire.");
  if (input.issueDate === "") errors.push("La date d’émission est obligatoire.");
  if (input.dueDate !== "" && input.dueDate < input.issueDate) errors.push("L’échéance doit être postérieure à la date d’émission.");
  if (input.lines.length === 0) errors.push("Ajoutez au moins une ligne.");
  input.lines.forEach((line, index) => {
    if (line.description.trim() === "") errors.push(`La ligne ${index + 1} doit avoir une description.`);
    if (!/^\d+(?:[.,]\d+)?$/.test(line.quantity.trim()) || BigInt(Math.round(Number(line.quantity.replace(",", ".")) * 1000)) <= 0n) errors.push(`La quantité de la ligne ${index + 1} doit être positive.`);
    const normalizedUnitPrice = line.unitPrice.replace(/\s/g, "");
    if (!/^\d+$/.test(normalizedUnitPrice) || BigInt(normalizedUnitPrice || "0") <= 0n) errors.push(`Le prix de la ligne ${index + 1} doit être un entier positif.`);
  });
  return errors;
}

export type VatGroup = {
  key: string;
  rateBp: bigint;
  exempt: boolean;
  baseMinor: bigint;
  vatMinor: bigint;
};

export type InvoiceTotals = {
  subtotalMinor: bigint;
  discountMinor: bigint;
  totalHtMinor: bigint;
  totalVatMinor: bigint;
  totalTtcMinor: bigint;
  vatBreakdown: VatGroup[];
  lineTotalsMinor: bigint[];
};

export function computeInvoiceTotals(
  lines: InvoiceLineInput[],
  globalDiscountBp: bigint = 0n,
): InvoiceTotals {
  if (lines.length === 0) {
    throw new RangeError("an invoice must contain at least one line");
  }

  const lineTotalsMinor = lines.map((line) =>
    calculateLineNet(
      line.quantityMilli,
      line.unitPriceMinor,
      line.discountBp ?? 0n,
    ),
  );
  const groups = new Map<string, VatGroup>();

  lines.forEach((line, index) => {
    const exempt = line.vatExempt ?? false;
    const key = exempt ? "exempt" : line.vatRateBp.toString();
    const current = groups.get(key) ?? {
      key,
      rateBp: exempt ? 0n : line.vatRateBp,
      exempt,
      baseMinor: 0n,
      vatMinor: 0n,
    };
    current.baseMinor += lineTotalsMinor[index] ?? 0n;
    groups.set(key, current);
  });

  const vatBreakdown = [...groups.values()].map((group) => {
    const discountMinor = roundHalfUp(
      group.baseMinor * globalDiscountBp,
      10_000n,
    );
    group.baseMinor -= discountMinor;
    group.vatMinor = group.exempt
      ? 0n
      : calculateVat(group.baseMinor, group.rateBp);
    return group;
  });

  const subtotalMinor = lineTotalsMinor.reduce(
    (total, lineTotal) => total + lineTotal,
    0n,
  );
  const totalHtMinor = vatBreakdown.reduce(
    (total, group) => total + group.baseMinor,
    0n,
  );
  const totalVatMinor = vatBreakdown.reduce(
    (total, group) => total + group.vatMinor,
    0n,
  );

  return {
    subtotalMinor,
    discountMinor: subtotalMinor - totalHtMinor,
    totalHtMinor,
    totalVatMinor,
    totalTtcMinor: totalHtMinor + totalVatMinor,
    vatBreakdown,
    lineTotalsMinor,
  };
}

export type InvoiceStatusInput = {
  status: "draft" | "issued";
  totalTtcMinor: bigint;
  amountPaidMinor: bigint;
  amountCreditedMinor: bigint;
  dueDate?: string;
  today: string;
  firstSharedAt?: string;
};

export type InvoiceDisplayStatus =
  | "draft"
  | "cancelled"
  | "paid"
  | "overdue"
  | "partially_paid"
  | "issued"
  | "shared";

export function getInvoiceDisplayStatus(
  input: InvoiceStatusInput,
): InvoiceDisplayStatus {
  if (input.status === "draft") return "draft";
  if (input.amountCreditedMinor >= input.totalTtcMinor) return "cancelled";

  const balance =
    input.totalTtcMinor - input.amountPaidMinor - input.amountCreditedMinor;
  if (balance === 0n) return "paid";
  if (balance > 0n && input.dueDate !== undefined && input.dueDate < input.today) {
    return "overdue";
  }
  if (input.amountPaidMinor > 0n) return "partially_paid";
  return input.firstSharedAt === undefined ? "issued" : "shared";
}