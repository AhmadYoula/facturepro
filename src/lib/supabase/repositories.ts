import { getSupabaseClient } from "./client";
import type { InvoiceDraft, LocalCompany, LocalCustomer, LocalInvoice, LocalPayment, LocalProduct } from "../offline/db";

type OrganizationContext = { id: string; name: string };
type SupabaseError = { message: string; code?: string; details?: string; hint?: string };
type RemoteInvoiceLine = { description: string; quantity_milli: number | string; unit_price_minor: number | string; vat_rate_bp: number | string };

function requireClient() {
  const client = getSupabaseClient();
  if (client === undefined) throw new Error("Supabase n’est pas configuré.");
  return client;
}

async function requireOrganization(): Promise<OrganizationContext> {
  const client = requireClient();
  const { data, error } = await client.from("organization_members").select("organization_id, organizations(name)").limit(1).maybeSingle();
  if (error !== null) throw error;
  if (data === null) throw new Error("Aucune organisation Supabase associée à ce compte.");
  const organization = data.organizations;
  return { id: data.organization_id, name: typeof organization === "object" && organization !== null && "name" in organization && typeof organization.name === "string" ? organization.name : "Votre entreprise" };
}

function throwIfError(error: SupabaseError | null): void {
  if (error !== null) throw new Error(`${error.code ?? "SUPABASE"} : ${error.message}`);
}

export async function getRemoteCompany(): Promise<LocalCompany | undefined> {
  const client = requireClient();
  const organization = await requireOrganization();
  const { data, error } = await client.from("companies").select("*").eq("organization_id", organization.id).maybeSingle();
  throwIfError(error);
  if (data === null) return undefined;
  return { id: "current", name: data.name, legalName: data.legal_name, legalForm: data.legal_form ?? undefined, registrationCountry: data.registration_country ?? undefined, nif: data.nif, rccm: data.rccm, address: data.address, city: data.city ?? undefined, region: data.region ?? undefined, postalCode: data.postal_code ?? undefined, phone: data.phone, billingPhone: data.billing_phone ?? undefined, email: data.email, billingEmail: data.billing_email ?? undefined, website: data.website ?? undefined, countryCode: data.country_code ?? undefined, currencyCode: data.currency_code, locale: data.locale, invoiceTemplate: data.invoice_template, defaultVatRateBp: String(data.default_vat_rate_bp), paymentInstructions: data.payment_instructions ?? undefined, updatedAt: new Date(data.updated_at).getTime() };
}

export async function saveRemoteCompany(company: LocalCompany): Promise<void> {
  const client = requireClient();
  const organization = await requireOrganization();
  const { error } = await client.from("companies").upsert({ organization_id: organization.id, name: company.name, legal_name: company.legalName, legal_form: company.legalForm ?? null, registration_country: company.registrationCountry ?? null, nif: company.nif, rccm: company.rccm, address: company.address, city: company.city ?? null, region: company.region ?? null, postal_code: company.postalCode ?? null, phone: company.phone, billing_phone: company.billingPhone ?? null, email: company.email, billing_email: company.billingEmail ?? null, website: company.website ?? null, country_code: company.countryCode ?? null, currency_code: company.currencyCode ?? "GNF", locale: company.locale ?? "fr-GN", invoice_template: company.invoiceTemplate ?? "modern", default_vat_rate_bp: Number(company.defaultVatRateBp), payment_instructions: company.paymentInstructions ?? null, updated_at: new Date().toISOString() });
  throwIfError(error);
}

export async function listRemoteCustomers(): Promise<LocalCustomer[]> {
  const client = requireClient();
  const organization = await requireOrganization();
  const { data, error } = await client.from("customers").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []).map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, kind: customer.kind, createdAt: new Date(customer.created_at).getTime() }));
}

export async function listRemoteProducts(): Promise<LocalProduct[]> {
  const client = requireClient();
  const organization = await requireOrganization();
  const { data, error } = await client.from("products").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []).map((product) => ({ id: product.id, name: product.name, description: product.description, unitPriceMinor: String(product.unit_price_minor), vatRateBp: String(product.vat_rate_bp), unit: product.unit, createdAt: new Date(product.created_at).getTime() }));
}

export async function listRemoteInvoices(): Promise<LocalInvoice[]> {
  const client = requireClient();
  const organization = await requireOrganization();
  const { data, error } = await client.from("invoices").select("*, invoice_lines(*)").eq("organization_id", organization.id).order("issued_at", { ascending: false });
  throwIfError(error);
  return (data ?? []).map((invoice) => { const lines = (invoice.invoice_lines ?? []) as RemoteInvoiceLine[]; return { id: invoice.id, number: invoice.number, workflowStatus: invoice.workflow_status, sentAt: invoice.sent_at ?? undefined, customer: invoice.customer_name, customerPhone: invoice.customer_phone ?? undefined, customerEmail: invoice.customer_email ?? undefined, customerAddress: invoice.customer_address ?? undefined, issueDate: invoice.issue_date, dueDate: invoice.due_date, description: lines[0]?.description ?? "Prestation", quantity: lines[0] === undefined ? "1" : String(Number(lines[0].quantity_milli) / 1000), unitPriceMinor: lines[0] === undefined ? "0" : String(lines[0].unit_price_minor), notes: invoice.notes ?? undefined, totalTtcMinor: String(invoice.total_ttc_minor), amountPaidMinor: String(invoice.amount_paid_minor), amountCreditedMinor: String(invoice.amount_credited_minor), issuedAt: new Date(invoice.issued_at).getTime(), lines: lines.map((line) => ({ description: line.description, quantity: String(Number(line.quantity_milli) / 1000), unitPrice: String(line.unit_price_minor), vatRateBp: String(line.vat_rate_bp) })) }; });
}

export async function listRemotePayments(): Promise<LocalPayment[]> {
  const client = requireClient();
  const organization = await requireOrganization();
  const { data, error } = await client.from("payments").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []).map((payment) => ({ id: payment.id, invoiceId: payment.invoice_id, amountMinor: String(payment.amount_minor), method: payment.method, paidOn: payment.paid_on, createdAt: new Date(payment.created_at).getTime() }));
}

export async function listRemoteDrafts(): Promise<InvoiceDraft[]> {
  const client = requireClient();
  const organization = await requireOrganization();
  const { data, error } = await client.from("invoice_drafts").select("id, payload, updated_at").eq("organization_id", organization.id).order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []).map((draft) => ({ ...(draft.payload as InvoiceDraft), id: draft.id, updatedAt: new Date(draft.updated_at).getTime() }));
}

export async function logRemoteActivity(action: string, entityType: string, entityId: string | undefined, metadata: Record<string, unknown> = {}): Promise<void> {
  const client = requireClient();
  const organization = await requireOrganization();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("activity_logs").insert({ organization_id: organization.id, user_id: user?.id ?? null, action, entity_type: entityType, entity_id: entityId ?? null, metadata });
  throwIfError(error);
}

export async function recordRemotePayment(invoiceId: string, payment: LocalPayment): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("record_invoice_payment", { target_invoice_id: invoiceId, payment_id: payment.id, payment_amount: payment.amountMinor, payment_method: payment.method, payment_date: payment.paidOn });
  throwIfError(error);
}

export async function createRemoteCreditNote(invoiceId: string, amountMinor: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("create_invoice_credit_note", { target_invoice_id: invoiceId, credit_amount: amountMinor });
  throwIfError(error);
}

export async function updateRemoteInvoiceWorkflow(invoiceId: string, status: "draft" | "issued" | "sent", dueDate?: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("update_invoice_workflow", { target_invoice_id: invoiceId, next_status: status, next_due_date: dueDate ?? null });
  throwIfError(error);
}
