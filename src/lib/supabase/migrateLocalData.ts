import { getSupabaseClient } from "@/lib/supabase/client";
import { offlineDb } from "@/lib/offline/db";
import { getRemoteCompany, listRemoteCustomers, listRemoteDrafts, listRemoteInvoices, listRemotePayments, listRemoteProducts } from "@/lib/supabase/repositories";

const toQuantityMilli = (quantity: string) => BigInt(Math.round(Number(quantity.replace(",", ".")) * 1000));

function supabaseFailure(step: string, error: { message?: string; code?: string; details?: string; hint?: string }): Error {
  const details = [error.code, error.message, error.details, error.hint].filter((value): value is string => value !== undefined && value !== "").join(" · ");
  return new Error(`${step} : ${details || "erreur Supabase inconnue"}`);
}

export type LocalMigrationResult = {
  organizationName: string;
  customers: number;
  products: number;
  invoices: number;
  payments: number;
  skippedPayments: number;
  drafts: number;
};

export const REMOTE_SYNC_EVENT = "facturepro:remote-sync";

export function requestRemoteSync(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REMOTE_SYNC_EVENT));
}

export async function clearLocalBusinessCache(): Promise<void> {
  await offlineDb.transaction("rw", [offlineDb.company, offlineDb.customers, offlineDb.products, offlineDb.invoices, offlineDb.payments, offlineDb.drafts], async () => {
    await Promise.all([offlineDb.company.clear(), offlineDb.customers.clear(), offlineDb.products.clear(), offlineDb.invoices.clear(), offlineDb.payments.clear(), offlineDb.drafts.clear()]);
  });
}

export async function hydrateLocalDataFromSupabase(): Promise<void> {
  if (getSupabaseClient() === undefined) return;
  const [company, customers, products, invoices, payments, drafts] = await Promise.all([getRemoteCompany(), listRemoteCustomers(), listRemoteProducts(), listRemoteInvoices(), listRemotePayments(), listRemoteDrafts()]);
  await offlineDb.transaction("rw", [offlineDb.company, offlineDb.customers, offlineDb.products, offlineDb.invoices, offlineDb.payments, offlineDb.drafts], async () => {
    await Promise.all([offlineDb.company.clear(), offlineDb.customers.clear(), offlineDb.products.clear(), offlineDb.invoices.clear(), offlineDb.payments.clear(), offlineDb.drafts.clear()]);
    if (company !== undefined) await offlineDb.company.put(company);
    await offlineDb.customers.bulkPut(customers);
    await offlineDb.products.bulkPut(products);
    await offlineDb.invoices.bulkPut(invoices);
    await offlineDb.payments.bulkPut(payments);
    await offlineDb.drafts.bulkPut(drafts);
  });
}

export async function migrateLocalDataToSupabase(): Promise<LocalMigrationResult> {
  const supabase = getSupabaseClient();
  if (supabase === undefined) throw new Error("Supabase n’est pas configuré. Ajoutez les variables dans .env.local.");
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) throw new Error("Connectez-vous avec Supabase avant de migrer vos données.");
  const [company, customers, products, invoices, payments, drafts] = await Promise.all([
    offlineDb.company.get("current"),
    offlineDb.customers.toArray(),
    offlineDb.products.toArray(),
    offlineDb.invoices.toArray(),
    offlineDb.payments.toArray(),
    offlineDb.drafts.toArray(),
  ]);
  const membershipResponse = await supabase.from("organization_members").select("organization_id, organizations(name)").limit(1);
  let memberships = membershipResponse.data ?? [];
  let membershipError = membershipResponse.error;
  if (membershipError !== null) throw supabaseFailure("Lecture de l’organisation", membershipError);
  if (memberships.length === 0) {
    const organizationName = company?.name?.trim() || user.user_metadata.display_name || user.email?.split("@")[0] || "Mon entreprise";
    const { error: creationError } = await supabase.rpc("create_organization_with_owner", { organization_name: organizationName });
    if (creationError !== null) throw supabaseFailure("Création de l’entreprise Supabase", creationError);
    const refreshedMemberships = await supabase.from("organization_members").select("organization_id, organizations(name)").limit(1);
    memberships = refreshedMemberships.data ?? [];
    membershipError = refreshedMemberships.error;
    if (membershipError !== null) throw supabaseFailure("Relecture de l’organisation", membershipError);
  }
  const membership = memberships[0];
  if (membership === undefined) throw new Error("Aucune entreprise Supabase n’est associée à votre compte.");
  const organizationId = membership.organization_id;
  const organizationName = typeof membership.organizations === "object" && membership.organizations !== null && "name" in membership.organizations && typeof membership.organizations.name === "string" ? membership.organizations.name : "Votre entreprise";
  const remoteInvoiceIdByLocalId = new Map<string, string>();

  if (company !== undefined) {
    const { error } = await supabase.from("companies").upsert({ organization_id: organizationId, name: company.name, legal_name: company.legalName, legal_form: company.legalForm ?? null, registration_country: company.registrationCountry ?? null, nif: company.nif, rccm: company.rccm, address: company.address, city: company.city ?? null, region: company.region ?? null, postal_code: company.postalCode ?? null, phone: company.phone, billing_phone: company.billingPhone ?? null, email: company.email, billing_email: company.billingEmail ?? null, website: company.website ?? null, country_code: company.countryCode ?? null, currency_code: company.currencyCode ?? "GNF", locale: company.locale ?? "fr-GN", invoice_template: company.invoiceTemplate ?? "modern", default_vat_rate_bp: Number(company.defaultVatRateBp), payment_instructions: company.paymentInstructions ?? null, updated_at: new Date().toISOString() });
    if (error !== null) throw supabaseFailure("Synchronisation de l’entreprise", error);
  }

  if (customers.length > 0) {
    const { error } = await supabase.from("customers").upsert(customers.map((customer) => ({ id: customer.id, organization_id: organizationId, name: customer.name ?? "Client sans nom", phone: customer.phone ?? "", email: customer.email ?? "", address: customer.address ?? "", kind: customer.kind ?? "business", created_at: new Date(customer.createdAt).toISOString() })));
    if (error !== null) throw supabaseFailure("Synchronisation des clients", error);
  }
  if (products.length > 0) {
    const { error } = await supabase.from("products").upsert(products.map((product) => ({ id: product.id, organization_id: organizationId, name: product.name ?? "Produit sans nom", description: product.description ?? "", unit_price_minor: product.unitPriceMinor ?? "0", vat_rate_bp: Number(product.vatRateBp ?? "0"), unit: product.unit ?? "unité", created_at: new Date(product.createdAt).toISOString() })));
    if (error !== null) throw supabaseFailure("Synchronisation des produits", error);
  }
  if (drafts.length > 0) {
    const { error } = await supabase.from("invoice_drafts").upsert(drafts.map((draft) => ({ id: draft.id, organization_id: organizationId, owner_id: user.id, payload: draft, updated_at: new Date(draft.updatedAt).toISOString() })));
    if (error !== null) throw supabaseFailure("Synchronisation des brouillons", error);
  }
  if (invoices.length > 0) {
    const customerIds = new Map(customers.map((customer) => [customer.name, customer.id]));
    const existingInvoiceResponse = await supabase.from("invoices").select("id, number").eq("organization_id", organizationId);
    if (existingInvoiceResponse.error !== null) throw supabaseFailure("Lecture des factures existantes", existingInvoiceResponse.error);
    const existingInvoiceIds = new Map((existingInvoiceResponse.data ?? []).map((invoice) => [invoice.number, invoice.id]));
    const canonicalInvoices = new Map<string, (typeof invoices)[number]>();
    for (const invoice of invoices) {
      const number = invoice.number ?? `FAC-LOCAL-${invoice.id.slice(0, 8)}`;
      const remoteId = existingInvoiceIds.get(number) ?? invoice.id;
      remoteInvoiceIdByLocalId.set(invoice.id, remoteId);
      if (!canonicalInvoices.has(number)) canonicalInvoices.set(number, invoice);
    }
    const invoiceRows = [...canonicalInvoices.entries()].map(([number, invoice]) => ({ id: existingInvoiceIds.get(number) ?? invoice.id, organization_id: organizationId, number, workflow_status: invoice.workflowStatus ?? "issued", sent_at: invoice.sentAt ?? null, customer_id: customerIds.get(invoice.customer) ?? null, customer_name: invoice.customer ?? "Client sans nom", customer_phone: invoice.customerPhone ?? null, customer_email: invoice.customerEmail ?? null, customer_address: invoice.customerAddress ?? null, issue_date: invoice.issueDate, due_date: invoice.dueDate, notes: invoice.notes ?? null, total_ttc_minor: invoice.totalTtcMinor ?? "0", amount_paid_minor: invoice.amountPaidMinor ?? "0", amount_credited_minor: invoice.amountCreditedMinor ?? "0", issued_at: new Date(invoice.issuedAt).toISOString() }));
    const { error: invoiceError } = await supabase.from("invoices").upsert(invoiceRows);
    if (invoiceError !== null) throw supabaseFailure("Synchronisation des factures", invoiceError);
    const invoiceLines = [...canonicalInvoices.values()].flatMap((invoice) => (invoice.lines ?? [{ description: invoice.description, quantity: invoice.quantity, unitPrice: invoice.unitPriceMinor }]).map((line, position) => ({ invoice_id: remoteInvoiceIdByLocalId.get(invoice.id) ?? invoice.id, position, description: line.description ?? "Prestation", quantity_milli: toQuantityMilli(line.quantity ?? "1").toString(), unit_price_minor: line.unitPrice ?? "0", vat_rate_bp: Number(line.vatRateBp ?? company?.defaultVatRateBp ?? "1800") })));
    if (invoiceLines.length > 0) {
      const { error: lineError } = await supabase.from("invoice_lines").upsert(invoiceLines, { onConflict: "invoice_id,position" });
      if (lineError !== null) throw supabaseFailure("Synchronisation des lignes de facture", lineError);
    }
  }
  const validPayments = payments.filter((payment) => remoteInvoiceIdByLocalId.has(payment.invoiceId) && /^\d+$/.test(payment.amountMinor ?? "") && BigInt(payment.amountMinor ?? "0") > 0n);
  if (validPayments.length > 0) {
    const { error } = await supabase.from("payments").upsert(validPayments.map((payment) => ({ id: payment.id, invoice_id: remoteInvoiceIdByLocalId.get(payment.invoiceId) as string, organization_id: organizationId, amount_minor: payment.amountMinor, method: payment.method ?? "cash", paid_on: payment.paidOn ?? new Date().toISOString().slice(0, 10), created_at: new Date(payment.createdAt).toISOString() })));
    if (error !== null) throw supabaseFailure("Synchronisation des paiements", error);
  }
  return { organizationName, customers: customers.length, products: products.length, invoices: invoices.length, payments: validPayments.length, skippedPayments: payments.length - validPayments.length, drafts: drafts.length };
}
