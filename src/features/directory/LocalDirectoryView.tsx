"use client";

import { useEffect, useState } from "react";

import { offlineDb, type LocalCustomer, type LocalProduct } from "@/lib/offline/db";
import { requestRemoteSync } from "@/lib/supabase/migrateLocalData";

type DirectoryKind = "customers" | "products";
const money = (value: string) => `${new Intl.NumberFormat("fr-FR").format(Number(value))} GNF`;

export function LocalDirectoryView({ kind }: { kind: DirectoryKind }) {
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [vatRate, setVatRate] = useState("18");
  const [message, setMessage] = useState("");

  const refresh = () => {
    if (kind === "customers") void offlineDb.customers.orderBy("createdAt").reverse().toArray().then(setCustomers);
    else void offlineDb.products.orderBy("createdAt").reverse().toArray().then(setProducts);
  };
  useEffect(refresh, [kind]);

  const resetForm = () => { setEditingId(undefined); setName(""); setContact(""); setEmail(""); setAddress(""); setDescription(""); setVatRate("18"); };
  const editCustomer = (customer: LocalCustomer) => { setEditingId(customer.id); setName(customer.name); setContact(customer.phone); setEmail(customer.email); setAddress(customer.address ?? ""); setMessage(""); };

  const saveItem = async () => {
    if (name.trim() === "") { setMessage(kind === "customers" ? "Le nom du client est obligatoire." : "Le nom du produit est obligatoire."); return; }
    if (kind === "customers") {
      const customer = { name: name.trim(), phone: contact.trim(), email: email.trim(), address: address.trim(), kind: "business" as const };
      if (editingId !== undefined) await offlineDb.customers.update(editingId, customer);
      else await offlineDb.customers.add({ ...customer, id: crypto.randomUUID(), createdAt: Date.now() });
    } else {
      const unitPrice = contact.replace(/\s/g, "");
      if (!/^\d+$/.test(unitPrice)) { setMessage("Le prix doit être un montant entier en GNF."); return; }
      await offlineDb.products.add({ id: crypto.randomUUID(), name: name.trim(), description: description.trim(), unitPriceMinor: unitPrice, vatRateBp: String(Number(vatRate || 0) * 100), unit: "unité", createdAt: Date.now() });
    }
    resetForm(); requestRemoteSync(); setMessage(kind === "customers" ? "Client enregistré localement." : "Produit ajouté localement."); refresh();
  };

  const removeItem = async (id: string) => { if (kind === "customers") await offlineDb.customers.delete(id); else await offlineDb.products.delete(id); requestRemoteSync(); refresh(); };
  const isEditing = editingId !== undefined;

  return <section className="directory-layout">
    <div className="panel directory-form"><div className="panel-heading"><div><h2>{kind === "customers" ? (isEditing ? "Modifier le client" : "Nouveau client") : "Nouveau produit"}</h2><p>Enregistré uniquement sur cet appareil.</p></div><span className="draft-badge">Mode local</span></div>
      <label>Nom{name === "" && <span className="required-mark"> *</span>}<input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "customers" ? "Ex. Kamsar Digital" : "Ex. Conseil mensuel"} /></label>
      <label>{kind === "customers" ? "Téléphone" : "Prix unitaire GNF"}<input inputMode={kind === "customers" ? "tel" : "numeric"} value={contact} onChange={(event) => setContact(event.target.value)} placeholder={kind === "customers" ? "+224 620 00 00 00" : "Ex. 2500000"} /></label>
      {kind === "customers" ? <><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="client@example.com" /></label><label>Adresse<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ex. Kaloum, Conakry" /></label></> : <><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description du service" /></label><label>TVA par défaut<input inputMode="numeric" value={vatRate} onChange={(event) => setVatRate(event.target.value)} placeholder="18" /></label></>}
      <div className="directory-form-actions"><button className="primary-button directory-submit" type="button" onClick={() => void saveItem()}>{isEditing ? "Enregistrer les modifications" : "Ajouter localement"}</button>{isEditing && <button className="secondary-button" type="button" onClick={resetForm}>Annuler</button>}</div>{message !== "" && <p className="editor-message" role="status">{message}</p>}
    </div>
    <div className="panel directory-list"><div className="panel-heading"><div><h2>{kind === "customers" ? "Clients" : "Produits et services"}</h2><p>{kind === "customers" ? `${customers.length} client(s) enregistré(s)` : `${products.length} élément(s) enregistré(s)`}</p></div></div>
      {kind === "customers" ? customers.length === 0 ? <div className="empty-state"><strong>Aucun client</strong><span>Ajoutez votre premier client local.</span></div> : customers.map((customer) => <div className="directory-row" key={customer.id}><div><strong>{customer.name}</strong><span>{customer.phone || "Téléphone non renseigné"}{customer.address ? ` · ${customer.address}` : ""}{customer.email ? ` · ${customer.email}` : ""}</span></div><div className="directory-row-actions"><button className="detail-button" type="button" onClick={() => editCustomer(customer)}>Modifier</button><button className="delete-button" type="button" aria-label={`Supprimer ${customer.name}`} onClick={() => void removeItem(customer.id)}>×</button></div></div>) : products.length === 0 ? <div className="empty-state"><strong>Aucun produit</strong><span>Ajoutez votre premier produit ou service.</span></div> : products.map((product) => <div className="directory-row" key={product.id}><div><strong>{product.name}</strong><span>{money(product.unitPriceMinor)} · TVA {Number(product.vatRateBp) / 100} %</span></div><button className="delete-button" type="button" aria-label={`Supprimer ${product.name}`} onClick={() => void removeItem(product.id)}>×</button></div>)}
    </div>
  </section>;
}
