import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { computeInvoiceTotals } from "@/domain/documents";
import { amountInWords } from "@/domain/money/words";
import { offlineDb, type LocalCompany, type LocalInvoice } from "@/lib/offline/db";

const toMoney = (value: string, company?: LocalCompany) => `${new Intl.NumberFormat(company?.locale ?? "fr-GN").format(Number(value)).replace(/[\u202f\u00a0]/g, " ")} ${company?.currencyCode ?? "GNF"}`;
const lineTotal = (quantity: string, unitPrice: string, company?: LocalCompany) => {
  try {
    return computeInvoiceTotals([{ description: "", quantityMilli: BigInt(Math.round(Number(quantity.replace(",", ".")) * 1000)), unitPriceMinor: BigInt(unitPrice.replace(/\s/g, "")), vatRateBp: BigInt(company?.defaultVatRateBp ?? "1800") }]).lineTotalsMinor[0] ?? BigInt(unitPrice);
  } catch {
    return BigInt(unitPrice);
  }
};

export async function buildLocalInvoicePdf(invoice: LocalInvoice, company?: LocalCompany): Promise<Blob> {
  const customer = invoice.customerAddress === undefined && invoice.customerPhone === undefined && invoice.customerEmail === undefined
    ? await offlineDb.customers.where("name").equals(invoice.customer).first()
    : undefined;
  const customerAddress = invoice.customerAddress ?? customer?.address;
  const customerPhone = invoice.customerPhone ?? customer?.phone;
  const customerEmail = invoice.customerEmail ?? customer?.email;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const templateColors = { classic: rgb(0.15, 0.24, 0.41), modern: rgb(0.14, 0.42, 1), minimal: rgb(0.35, 0.4, 0.47), bold: rgb(0.07, 0.23, 0.42), elegant: rgb(0.62, 0.43, 0.18) };
  const blue = templateColors[company?.invoiceTemplate ?? "modern"];
  const ink = rgb(0.08, 0.14, 0.23);
  const muted = rgb(0.39, 0.45, 0.53);
  const light = rgb(0.94, 0.96, 0.99);
  let y = 790;
  const left = 48;
  const right = 547;
  const draw = (text: string, x: number, size = 9, font = regular, color = ink) => page.drawText(text, { x, y, size, font, color });
  const line = (yPosition: number, color = light, thickness = 1) => page.drawLine({ start: { x: left, y: yPosition }, end: { x: right, y: yPosition }, thickness, color });

  page.drawRectangle({ x: left, y: 775, width: 27, height: 27, color: blue });
  page.drawText("F", { x: 57, y: 781, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText((company?.name ?? "FACTUREPRO").toUpperCase(), { x: 84, y: 784, size: 14, font: bold, color: ink });
  page.drawText("FACTURE", { x: 452, y: 788, size: 10, font: bold, color: blue });
  page.drawText(invoice.number, { x: 430, y: 772, size: 10, font: bold, color: ink });
  line(750, blue, 2);

  y = 726;
  draw(company?.legalName ?? "Entreprise", left, 11, bold);
  y -= 14; draw(company?.address ?? "Conakry, Guinée", left, 9, regular, muted);
  y -= 13; draw(`${company?.phone ?? ""}${company?.email ? ` · ${company.email}` : ""}`, left, 9, regular, muted);
  y -= 13; draw(`NIF : ${company?.nif || "À compléter"} · RCCM : ${company?.rccm || "À compléter"}`, left, 9, regular, muted);
  y = 726;
  draw("FACTURÉ À", 350, 8, bold, muted);
  y -= 14; draw(invoice.customer, 350, 11, bold);
  if (customerAddress) { y -= 13; draw(customerAddress, 350, 9, regular, muted); }
  if (customerPhone) { y -= 13; draw(customerPhone, 350, 9, regular, muted); }
  if (customerEmail) { y -= 13; draw(customerEmail, 350, 9, regular, muted); }
  y -= 14; draw(`Date d’émission : ${invoice.issueDate}`, 350, 9, regular, muted);
  y -= 13; draw(`Échéance : ${invoice.dueDate}`, 350, 9, regular, muted);

  y = 625;
  page.drawRectangle({ x: left, y: y - 8, width: right - left, height: 25, color: light });
  page.drawText("DESCRIPTION", { x: left + 10, y, size: 8, font: bold, color: muted });
  page.drawText("QTÉ", { x: 330, y, size: 8, font: bold, color: muted });
  page.drawText("PRIX UNITAIRE", { x: 380, y, size: 8, font: bold, color: muted });
  page.drawText("TOTAL HT", { x: 490, y, size: 8, font: bold, color: muted });
  y -= 28;
  const lines = invoice.lines ?? [{ description: invoice.description, quantity: invoice.quantity, unitPrice: invoice.unitPriceMinor }];
  for (const invoiceLine of lines) {
    page.drawText(invoiceLine.description || "Prestation", { x: left + 10, y, size: 9, font: regular, color: ink });
    page.drawText(invoiceLine.quantity, { x: 333, y, size: 9, font: regular, color: ink });
    page.drawText(toMoney(invoiceLine.unitPrice, company), { x: 380, y, size: 9, font: regular, color: ink });
    page.drawText(toMoney(lineTotal(invoiceLine.quantity, invoiceLine.unitPrice, company).toString(), company), { x: 490, y, size: 9, font: regular, color: ink });
    y -= 25;
    line(y + 10);
  }

  const total = BigInt(invoice.totalTtcMinor);
  const paid = BigInt(invoice.amountPaidMinor);
  const balance = total - paid;
  y -= 20;
  page.drawText("Total TTC", { x: 390, y, size: 10, font: bold, color: ink });
  page.drawText(toMoney(invoice.totalTtcMinor, company), { x: 490, y, size: 11, font: bold, color: blue });
  y -= 20;
  page.drawText("Déjà encaissé", { x: 390, y, size: 9, font: regular, color: muted });
  page.drawText(toMoney(invoice.amountPaidMinor, company), { x: 490, y, size: 9, font: regular, color: ink });
  y -= 20;
  page.drawText("Solde", { x: 390, y, size: 10, font: bold, color: ink });
  page.drawText(toMoney(balance.toString(), company), { x: 490, y, size: 10, font: bold, color: ink });

  y -= 45;
  page.drawRectangle({ x: left, y: y - 25, width: right - left, height: 40, color: light });
  page.drawText("MONTANT EN LETTRES", { x: left + 10, y, size: 8, font: bold, color: muted });
  page.drawText(amountInWords(invoice.totalTtcMinor ? total : 0n), { x: left + 10, y: y - 15, size: 9, font: regular, color: ink, maxWidth: right - left - 20 });

  y -= 80;
  page.drawText("CONDITIONS DE PAIEMENT", { x: left, y, size: 8, font: bold, color: muted });
  page.drawText(invoice.notes || company?.paymentInstructions || "Paiement à l’échéance indiquée ci-dessus. Merci pour votre confiance.", { x: left, y: y - 15, size: 9, font: regular, color: ink, maxWidth: 310 });
  page.drawText("SIGNATURE / CACHET", { x: 400, y, size: 8, font: bold, color: muted });
  page.drawLine({ start: { x: 400, y: y - 55 }, end: { x: 535, y: y - 55 }, thickness: 1, color: muted });
  page.drawText("Document généré localement par FacturePro", { x: left, y: 42, size: 8, font: regular, color: muted });

  const bytes = await pdf.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/pdf" });
}
