import type { Metadata } from "next";
import "./globals.css";
import "./landing.css";
import { AppFeedbackProvider } from "@/components/AppFeedback";
import { OfflineBanner } from "@/components/OfflineBanner";

export const metadata: Metadata = {
  title: "FacturePro | Facturation simple pour la Guinée",
  description: "Facturez en GNF, suivez vos encaissements et relancez vos clients.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body><AppFeedbackProvider><OfflineBanner />{children}</AppFeedbackProvider></body>
    </html>
  );
}
