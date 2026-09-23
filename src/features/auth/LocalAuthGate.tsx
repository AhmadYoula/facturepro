"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useAppFeedback } from "@/components/AppFeedback";
import { getSupabaseClient } from "@/lib/supabase/client";
import { clearLocalBusinessCache } from "@/lib/supabase/migrateLocalData";
type LocalAccount = { email: string; passwordHash: string; name: string };
type AuthContextValue = { name: string; email: string; updateProfile: (name: string, email: string) => void; logout: () => void };
type AccountSegment = "freelancer" | "business" | "nonprofit" | "accounting_firm";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ACCOUNT_KEY = "facturepro-local-account";
const SESSION_KEY = "facturepro-local-session";

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function useLocalAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useLocalAuth must be used inside LocalAuthGate");
  return context;
}

export function LocalAuthGate({ children }: { children: React.ReactNode }) {
  const feedback = useAppFeedback();
  const supabase = getSupabaseClient();
  const [sessionName, setSessionName] = useState<string>();
  const [sessionEmail, setSessionEmail] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [segment, setSegment] = useState<AccountSegment>("business");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (supabase !== undefined) {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (session !== null) {
          setSessionName(typeof session.user.user_metadata.display_name === "string" ? session.user.user_metadata.display_name : session.user.email ?? "Utilisateur");
          setSessionEmail(session.user.email ?? "");
        }
        setReady(true);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSessionName(session === null ? undefined : typeof session.user.user_metadata.display_name === "string" ? session.user.user_metadata.display_name : session.user.email ?? "Utilisateur");
        setSessionEmail(session?.user.email ?? "");
        if (session === null) void clearLocalBusinessCache();
      });
      return () => subscription.unsubscribe();
    }
    const session = localStorage.getItem(SESSION_KEY);
    if (session !== null) setSessionName(session);
    const stored = localStorage.getItem(ACCOUNT_KEY);
    if (stored !== null) setSessionEmail((JSON.parse(stored) as LocalAccount).email);
    setReady(true);
  }, [supabase]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!email.includes("@") || password.length < 6) {
      setMessage("Saisissez un email valide et un mot de passe d’au moins 6 caractères.");
      return;
    }
    if (supabase !== undefined) {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { display_name: name.trim() || email.split("@")[0] || "Utilisateur", target_segment: segment } } });
        if (error !== null) { setMessage(error.message); feedback.notify(error.message, "error"); return; }
        if (data.session === null) { setMessage("Compte créé. Vérifiez votre email pour confirmer votre accès."); feedback.notify("Confirmez votre adresse email pour vous connecter.", "info"); return; }
        const organizationName = name.trim() || email.split("@")[0] || "Mon entreprise";
        const { error: organizationError } = await supabase.rpc("create_organization_with_owner_v2", { organization_name: organizationName, segment });
        if (organizationError !== null) { setMessage("Compte créé, mais l’entreprise n’a pas pu être initialisée."); feedback.notify(organizationError.message, "error"); return; }
        feedback.notify("Compte et entreprise créés.", "success");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error !== null) { setMessage(error.message); feedback.notify(error.message, "error"); return; }
      const { data: memberships, error: membershipError } = await supabase.from("organization_members").select("organization_id").limit(1);
      if (membershipError === null && memberships.length === 0) {
        const organizationName = name.trim() || email.split("@")[0] || "Mon entreprise";
        const { error: organizationError } = await supabase.rpc("create_organization_with_owner_v2", { organization_name: organizationName, segment: "business" });
        if (organizationError !== null) feedback.notify("Connexion établie, mais l’entreprise doit être créée depuis Supabase.", "error");
      }
      return;
    }
    const passwordHash = await hashPassword(password);
    const stored = localStorage.getItem(ACCOUNT_KEY);
    if (mode === "signup") {
      if (stored !== null) { setMessage("Un compte local existe déjà sur cet appareil."); return; }
      const account: LocalAccount = { email: email.trim().toLowerCase(), passwordHash, name: name.trim() || email.split("@")[0] || "Utilisateur" };
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
      localStorage.setItem(SESSION_KEY, account.name);
      setSessionName(account.name);
      return;
    }
    if (stored === null) { setMessage("Aucun compte local. Créez d’abord votre compte."); return; }
    const account = JSON.parse(stored) as LocalAccount;
    if (account.email !== email.trim().toLowerCase() || account.passwordHash !== passwordHash) { setMessage("Email ou mot de passe incorrect."); return; }
    localStorage.setItem(SESSION_KEY, account.name);
    setSessionName(account.name);
  };

  const resetLocalAccess = async () => {
    const accepted = await feedback.confirm({ title: "Réinitialiser l’accès local", message: "Vos factures, clients et paramètres restent conservés sur cet appareil.", confirmLabel: "Réinitialiser", tone: "error" });
    if (!accepted) return;
    localStorage.removeItem(ACCOUNT_KEY);
    localStorage.removeItem(SESSION_KEY);
    setEmail("");
    setPassword("");
    setName("");
    setMode("signup");
    setMessage("Accès local réinitialisé. Créez un nouveau compte pour continuer.");
    feedback.notify("Accès local réinitialisé.", "success");
  };

  const requestPasswordReset = async () => {
    if (supabase === undefined) return;
    if (!email.includes("@")) { setMessage("Saisissez votre email avant de demander une réinitialisation."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin });
    if (error !== null) { setMessage(error.message); feedback.notify(error.message, "error"); return; }
    setMessage("Email de réinitialisation envoyé. Consultez votre messagerie.");
    feedback.notify("Email de réinitialisation envoyé.", "success");
  };

  const value = useMemo(() => ({ name: sessionName ?? "", email: sessionEmail, updateProfile: (nextName: string, nextEmail: string) => { if (supabase !== undefined) { void supabase.auth.updateUser({ email: nextEmail.toLowerCase(), data: { display_name: nextName } }); setSessionName(nextName); setSessionEmail(nextEmail.toLowerCase()); return; } const stored = localStorage.getItem(ACCOUNT_KEY); if (stored === null) return; const account = JSON.parse(stored) as LocalAccount; const nextAccount = { ...account, name: nextName, email: nextEmail.toLowerCase() }; localStorage.setItem(ACCOUNT_KEY, JSON.stringify(nextAccount)); localStorage.setItem(SESSION_KEY, nextName); setSessionName(nextName); setSessionEmail(nextEmail.toLowerCase()); }, logout: () => { if (supabase !== undefined) { void supabase.auth.signOut(); return; } localStorage.removeItem(SESSION_KEY); setSessionName(undefined); } }), [sessionEmail, sessionName, supabase]);
  if (!ready) return null;
  if (sessionName !== undefined) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

  return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">F</span><strong>Facture<span className="brand-accent">Pro</span></strong></div><p className="eyebrow">{supabase === undefined ? "Espace local sécurisé" : "Espace sécurisé"}</p><h1>{mode === "login" ? "Bon retour" : "Créer votre espace"}</h1><p className="auth-copy">{mode === "login" ? "Connectez-vous pour accéder à vos factures." : supabase === undefined ? "Vos données restent sur cet appareil pour le moment." : "Choisissez votre profil pour préparer votre espace de facturation."}</p><form onSubmit={(event) => void submit(event)}>{mode === "signup" && <><label>Nom complet<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Amadou Keita" /></label><label>Votre profil<select value={segment} onChange={(event) => setSegment(event.target.value as AccountSegment)}><option value="freelancer">Indépendant / Freelance</option><option value="business">PME / Entreprise</option><option value="nonprofit">Association / ONG</option><option value="accounting_firm">Cabinet comptable</option></select></label></>}<label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@example.com" /></label><label>Mot de passe<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum" /></label><button className="primary-button auth-submit" type="submit">{mode === "login" ? "Se connecter" : "Créer mon compte"}</button></form>{message !== "" && <p className="auth-message" role="alert">{message}</p>}<button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Créer un compte" : "J’ai déjà un compte"}</button>{supabase !== undefined && mode === "login" && <button className="auth-reset" type="button" onClick={() => void requestPasswordReset()}>Mot de passe oublié</button>}{supabase === undefined && mode === "login" && <button className="auth-reset" type="button" onClick={() => void resetLocalAccess()}>Réinitialiser l’accès local</button>}<small className="auth-note">{supabase === undefined ? "Prototype local : l’authentification serveur sera activée après configuration Supabase." : "Authentification sécurisée par Supabase."}</small></section></main>;
}
