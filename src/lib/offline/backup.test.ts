import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { exportLocalBackup, importLocalBackup } from "./backup";
import { offlineDb } from "./db";

beforeEach(async () => {
  await Promise.all([offlineDb.drafts.clear(), offlineDb.invoices.clear(), offlineDb.payments.clear(), offlineDb.customers.clear(), offlineDb.products.clear(), offlineDb.company.clear()]);
});

describe("local backup", () => {
  it("exports and restores the complete local dataset", async () => {
    await offlineDb.customers.add({ id: "customer-1", name: "Kamsar Digital", phone: "+224 620 00 00 00", email: "contact@kamsar.test", address: "Kaloum", kind: "business", createdAt: 1 });
    await offlineDb.products.add({ id: "product-1", name: "Conseil", description: "Service", unitPriceMinor: "2500000", vatRateBp: "1800", unit: "unité", createdAt: 2 });
    await offlineDb.company.put({ id: "current", name: "Atelier Keita", legalName: "Atelier Keita SARL", nif: "NIF-1", rccm: "RCCM-1", address: "Conakry", phone: "+224 620 00 00 00", email: "test@example.com", defaultVatRateBp: "1800", updatedAt: 3 });

    const backup = await exportLocalBackup();
    await offlineDb.customers.clear();
    await offlineDb.products.clear();
    await offlineDb.company.clear();
    await importLocalBackup(backup);

    expect(await offlineDb.customers.get("customer-1")).toMatchObject({ name: "Kamsar Digital", address: "Kaloum" });
    expect(await offlineDb.products.get("product-1")).toMatchObject({ unitPriceMinor: "2500000" });
    expect(await offlineDb.company.get("current")).toMatchObject({ nif: "NIF-1" });
  });
});
