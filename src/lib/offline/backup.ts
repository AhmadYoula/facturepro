import { offlineDb, type InvoiceDraft, type LocalCompany, type LocalCustomer, type LocalInvoice, type LocalPayment, type LocalProduct } from "./db";

export type LocalBackup = {
  version: 1;
  exportedAt: string;
  drafts: InvoiceDraft[];
  invoices: LocalInvoice[];
  payments: LocalPayment[];
  customers: LocalCustomer[];
  products: LocalProduct[];
  company: LocalCompany[];
};

export async function exportLocalBackup(): Promise<LocalBackup> {
  const [drafts, invoices, payments, customers, products, company] = await Promise.all([
    offlineDb.drafts.toArray(), offlineDb.invoices.toArray(), offlineDb.payments.toArray(), offlineDb.customers.toArray(), offlineDb.products.toArray(), offlineDb.company.toArray(),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), drafts, invoices, payments, customers, products, company };
}

export async function importLocalBackup(backup: LocalBackup): Promise<void> {
  if (backup.version !== 1) throw new Error("Version de sauvegarde non supportée.");
  await offlineDb.transaction("rw", [offlineDb.drafts, offlineDb.invoices, offlineDb.payments, offlineDb.customers, offlineDb.products, offlineDb.company], async () => {
    await Promise.all([offlineDb.drafts.clear(), offlineDb.invoices.clear(), offlineDb.payments.clear(), offlineDb.customers.clear(), offlineDb.products.clear(), offlineDb.company.clear()]);
    await offlineDb.drafts.bulkAdd(backup.drafts);
    await offlineDb.invoices.bulkAdd(backup.invoices);
    await offlineDb.payments.bulkAdd(backup.payments);
    await offlineDb.customers.bulkAdd(backup.customers);
    await offlineDb.products.bulkAdd(backup.products);
    await offlineDb.company.bulkAdd(backup.company);
  });
}
