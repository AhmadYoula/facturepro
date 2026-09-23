"use client";

import { useState } from "react";

import { useLocalAuth } from "@/features/auth/LocalAuthGate";

export function LocalProfileView() {
  const auth = useLocalAuth();
  const [name, setName] = useState(auth.name);
  const [email, setEmail] = useState(auth.email);
  const [saved, setSaved] = useState(false);
  return <section className="panel profile-settings"><div className="panel-heading"><div><h2>Profil local</h2><p>Compte connecté sur cet appareil.</p></div><span className="draft-badge">Local</span></div><div className="form-grid"><label>Nom affiché<input value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} /></label><label>Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setSaved(false); }} /></label></div><div className="settings-actions"><button className="secondary-button" type="button" onClick={() => { auth.updateProfile(name.trim() || auth.name, email.trim() || auth.email); setSaved(true); }}>Enregistrer le profil</button>{saved && <span className="editor-message" role="status">Profil enregistré localement.</span>}</div></section>;
}
