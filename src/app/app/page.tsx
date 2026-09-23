"use client";

import { LocalAuthGate } from "@/features/auth/LocalAuthGate";
import AppContent from "@/components/AppContent";

export default function AppPage() {
  return <LocalAuthGate><AppContent /></LocalAuthGate>;
}