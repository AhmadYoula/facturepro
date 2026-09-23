import Dexie, { type EntityTable } from "dexie";

export type InvoiceDraft = {
  id: string;
  customer: string;
  issueDate: string;
  dueDate: string;
  description: string;
  quantity: string;
  unitPrice: string;
  notes: string;
  updatedAt: number;
  lines?: InvoiceLineDraft[];
};

export type InvoiceLineDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
  vatRateBp?: string;
};

export type LocalInvoice = {
  id: string;
  number: string;
  workflowStatus?: "draft" | "issued" | "sent";
  sentAt?: string;
  customer: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  issueDate: string;
  dueDate: string;
  description: string;
  quantity: string;
  unitPriceMinor: string;
  notes?: string;
  totalTtcMinor: string;
  amountPaidMinor: string;
  amountCreditedMinor?: string;
  issuedAt: number;
  lines?: InvoiceLineDraft[];
};

export type LocalPayment = {
  id: string;
  invoiceId: string;
  amountMinor: string;
  method: "cash" | "orange_money" | "mtn_momo" | "bank_transfer";
  paidOn: string;
  createdAt: number;
};

export type LocalCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  kind: "individual" | "business";
  createdAt: number;
};

export type LocalProduct = {
  id: string;
  name: string;
  description: string;
  unitPriceMinor: string;
  vatRateBp: string;
  unit: string;
  createdAt: number;
};

export type LocalCompany = {
  id: "current";
  name: string;
  legalName: string;
  legalForm?: string;
  registrationCountry?: string;
  nif: string;
  rccm: string;
  address: string;
  city?: string;
  region?: string;
  postalCode?: string;
  phone: string;
  billingPhone?: string;
  email: string;
  billingEmail?: string;
  website?: string;
  countryCode?: string;
  currencyCode?: string;
  locale?: string;
  invoiceTemplate?: "classic" | "modern" | "minimal" | "bold" | "elegant";
  defaultVatRateBp: string;
  paymentInstructions?: string;
  updatedAt: number;
};

export const offlineDb = new Dexie("facturepro-offline") as Dexie & {
  drafts: EntityTable<InvoiceDraft, "id">;
  invoices: EntityTable<LocalInvoice, "id">;
  payments: EntityTable<LocalPayment, "id">;
  customers: EntityTable<LocalCustomer, "id">;
  products: EntityTable<LocalProduct, "id">;
  company: EntityTable<LocalCompany, "id">;
};

offlineDb.version(6).stores({
  drafts: "id, updatedAt",
  invoices: "id, number, issueDate, dueDate, issuedAt",
  payments: "id, invoiceId, paidOn, createdAt",
  customers: "id, name, phone, email, createdAt",
  products: "id, name, createdAt",
  company: "id, updatedAt",
});

export const invoiceDraftId = "new-invoice";