import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FacturePro",
    short_name: "FacturePro",
    description: "Facturation simple pour les entrepreneurs et PME de Guinée.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8fb",
    theme_color: "#246bfe",
    lang: "fr",
    icons: [],
  };
}
