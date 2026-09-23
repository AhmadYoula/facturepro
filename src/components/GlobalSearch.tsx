"use client";

import { useEffect, useRef, useState } from "react";

import { offlineDb, type LocalCustomer, type LocalInvoice, type LocalProduct } from "@/lib/offline/db";

type Result = { id: string; title: string; detail: string; kind: "Factures" | "Clients" | "Produits" };

export function GlobalSearch({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) { setResults([]); return; }
    void Promise.all([offlineDb.invoices.toArray(), offlineDb.customers.toArray(), offlineDb.products.toArray()]).then(([invoices, customers, products]) => {
      const invoiceResults = (invoices as LocalInvoice[]).filter((item) => `${item.number} ${item.customer}`.toLowerCase().includes(normalized)).slice(0, 4).map((item) => ({ id: item.id, title: item.number, detail: `${item.customer} · ${item.totalTtcMinor} GNF`, kind: "Factures" as const }));
      const customerResults = (customers as LocalCustomer[]).filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(normalized)).slice(0, 4).map((item) => ({ id: item.id, title: item.name, detail: item.phone || "Client", kind: "Clients" as const }));
      const productResults = (products as LocalProduct[]).filter((item) => item.name.toLowerCase().includes(normalized)).slice(0, 4).map((item) => ({ id: item.id, title: item.name, detail: `${item.unitPriceMinor} GNF`, kind: "Produits" as const }));
      setResults([...invoiceResults, ...customerResults, ...productResults].slice(0, 8));
    });
  }, [query]);

  return <div className="global-search"><span className="search-symbol">⌕</span><input ref={inputRef} aria-label="Recherche globale" placeholder="Rechercher une facture, un client..." value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} /><kbd>⌘ K</kbd>{open && query.trim().length >= 2 && <div className="search-results">{results.length === 0 ? <span className="search-empty">Aucun résultat local</span> : results.map((result) => <button key={`${result.kind}-${result.id}`} type="button" onClick={() => { onNavigate(result.kind); setQuery(""); setOpen(false); }}>{result.title}<small>{result.detail} · {result.kind}</small></button>)}</div>}</div>;
}
