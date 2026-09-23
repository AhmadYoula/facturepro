import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.VERCEL === "1" ? ".next" : "node_modules/.cache/facturepro-next",
};

export default nextConfig;
