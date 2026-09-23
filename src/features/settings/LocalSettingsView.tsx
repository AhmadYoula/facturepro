"use client";

import { useEffect, useRef, useState } from "react";

import { exportLocalBackup, importLocalBackup, type LocalBackup } from "@/lib/offline/backup";
import { offlineDb, type LocalCompany } from "@/lib/offline/db";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { migrateLocalDataToSupabase } from "@/lib/supabase/migrateLocalData";
import { requestRemoteSync } from "@/lib/supabase/migrateLocalData";

type SettingsSection = "profile" | "regional" | "templates" | "team";
type TeamRole = "Administrateur" | "Facturation" | "Lecture seule";
type TeamMember = { id: string; name: string; email: string; role: TeamRole };

const TEAM_KEY = "facturepro-local-team";
const initialCompany: LocalCompany = { id: "current", name: "Atelier Keita", legalName: "Atelier Keita SARL", legalForm: "SARL", registrationCountry: "Guinée", nif: "", rccm: "", address: "Conakry, Guinée", city: "Conakry", region: "Conakry", postalCode: "", phone: "+224 620 00 00 00", billingPhone: "+224 620 00 00 00", email: "", billingEmail: "", website: "", countryCode: "GN", currencyCode: "GNF", locale: "fr-GN", invoiceTemplate: "modern", defaultVatRateBp: "1800", paymentInstructions: "Orange Money : +224 620 00 00 00\nMTN MoMo : à compléter", updatedAt: Date.now() };
const templates: Array<{ id: NonNullable<LocalCompany["invoiceTemplate"]>; name: string; caption: string }> = [{ id: "classic", name: "Classique", caption: "Structuré et intemporel" }, { id: "modern", name: "Moderne", caption: "Clair et professionnel" }, { id: "minimal", name: "Minimal", caption: "Sobre, centré sur le contenu" }, { id: "bold", name: "Impact", caption: "Identité visuelle affirmée" }, { id: "elegant", name: "Élégant", caption: "Finition premium" }];

export function LocalSettingsView() {
  const [company, setCompany] = useState<LocalCompany>(initialCompany);
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [saved, setSaved] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [migrationMessage, setMigrationMessage] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<TeamRole>("Facturation");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void offlineDb.company.get("current").then((stored) => { if (stored !== undefined) setCompany({ ...initialCompany, ...stored }); });
    const storedTeam = localStorage.getItem(TEAM_KEY);
    if (storedTeam !== null) { try { setTeam(JSON.parse(storedTeam) as TeamMember[]); } catch { localStorage.removeItem(TEAM_KEY); } }
  }, []);

  const update = (field: keyof LocalCompany, value: string) => { setSaved(false); setCompany((current) => ({ ...current, [field]: value })); };
  const saveCompany = async () => { await offlineDb.company.put({ ...company, updatedAt: Date.now() }); requestRemoteSync(); setSaved(true); };
  const saveTeam = (nextTeam: TeamMember[]) => { setTeam(nextTeam); localStorage.setItem(TEAM_KEY, JSON.stringify(nextTeam)); };
  const addMember = () => {
    if (memberName.trim() === "" || !memberEmail.includes("@")) return;
    saveTeam([...team, { id: crypto.randomUUID(), name: memberName.trim(), email: memberEmail.trim().toLowerCase(), role: memberRole }]);
    setMemberName(""); setMemberEmail(""); setMemberRole("Facturation");
  };
  const downloadBackup = async () => {
    const backup = await exportLocalBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `facturepro-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
    setBackupMessage("Sauvegarde exportée.");
  };
  const restoreBackup = async (file: File) => {
    try { const backup = JSON.parse(await file.text()) as LocalBackup; await importLocalBackup(backup); setBackupMessage("Sauvegarde restaurée. Rechargez les écrans pour voir les données."); } catch { setBackupMessage("Fichier de sauvegarde invalide."); }
  };
  const migrateToSupabase = async () => {
    setMigrating(true);
    setMigrationMessage("");
    try {
      const result = await migrateLocalDataToSupabase();
      setMigrationMessage(`${result.organizationName} synchronisée : ${result.customers} client(s), ${result.products} produit(s), ${result.invoices} facture(s), ${result.payments} paiement(s) et ${result.drafts} brouillon(s).${result.skippedPayments > 0 ? ` ${result.skippedPayments} paiement(s) historique(s) ignoré(s) car sans facture valide.` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Erreur Supabase inconnue.";
      setMigrationMessage(`Migration Supabase impossible. ${message}`);
    } finally {
      setMigrating(false);
    }
  };

  return <section className="settings-workspace">
    <div className="settings-hero"><div><p className="eyebrow">Configuration de l’entreprise</p><h2>Paramètres de votre espace</h2><p>Personnalisez votre identité, vos documents et les accès de votre équipe.</p></div><div className="settings-completeness"><strong>{company.currencyCode || "GNF"}</strong><span>devise active</span></div></div>
    <div className="settings-tabs" role="tablist" aria-label="Sections des paramètres">{([{ id: "profile", label: "Profil de l’entreprise", icon: "▣" }, { id: "regional", label: "Région et devise", icon: "◎" }, { id: "templates", label: "Modèles de facture", icon: "▤" }, { id: "team", label: "Équipe et accès", icon: "♙" }] as const).map((item) => <button key={item.id} type="button" role="tab" aria-selected={activeSection === item.id} className={activeSection === item.id ? "active" : ""} onClick={() => setActiveSection(item.id)}><span>{item.icon}</span>{item.label}</button>)}</div>
    {activeSection === "profile" && <ProfileSection company={company} update={update} saved={saved} onSave={() => void saveCompany()} />}
    {activeSection === "regional" && <RegionalSection company={company} update={update} saved={saved} onSave={() => void saveCompany()} />}
    {activeSection === "templates" && <TemplateSection company={company} update={update} saved={saved} onSave={() => void saveCompany()} />}
    {activeSection === "team" && <TeamSection team={team} memberName={memberName} memberEmail={memberEmail} memberRole={memberRole} setMemberName={setMemberName} setMemberEmail={setMemberEmail} setMemberRole={setMemberRole} onAdd={addMember} onRemove={(id) => saveTeam(team.filter((member) => member.id !== id))} onBackup={() => void downloadBackup()} onRestore={() => fileInput.current?.click()} backupMessage={backupMessage} supabaseConfigured={isSupabaseConfigured()} migrating={migrating} migrationMessage={migrationMessage} onMigrate={() => void migrateToSupabase()} />}
    <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) void restoreBackup(file); event.target.value = ""; }} />
  </section>;
}

function ProfileSection({ company, update, saved, onSave }: { company: LocalCompany; update: (field: keyof LocalCompany, value: string) => void; saved: boolean; onSave: () => void }) {
  return <div className="settings-panel-grid"><div className="settings-sections"><section className="settings-section"><SectionHeading icon="▣" tone="identity" title="Identité de l’entreprise" detail="Ces informations apparaissent sur vos factures et documents." /><div className="settings-fields"><label>Nom commercial<input value={company.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex. Atelier Keita" /></label><label>Raison sociale<input value={company.legalName} onChange={(event) => update("legalName", event.target.value)} placeholder="Ex. Atelier Keita SARL" /></label><label>Forme juridique<select value={company.legalForm ?? ""} onChange={(event) => update("legalForm", event.target.value)}><option value="">À préciser</option><option>SARL</option><option>SA</option><option>Entreprise individuelle</option><option>Association</option><option>Autre</option></select></label><label>Pays d’immatriculation<input value={company.registrationCountry ?? ""} onChange={(event) => update("registrationCountry", event.target.value)} placeholder="Ex. Guinée" /></label><label>NIF<input value={company.nif} onChange={(event) => update("nif", event.target.value)} placeholder="À compléter" /></label><label>RCCM / registre du commerce<input value={company.rccm} onChange={(event) => update("rccm", event.target.value)} placeholder="À compléter" /></label></div></section><section className="settings-section"><SectionHeading icon="⌖" tone="contact" title="Coordonnées de contact et facturation" detail="Les canaux professionnels communiqués à vos clients." /><div className="settings-fields"><label className="wide-field">Adresse professionnelle<input value={company.address} onChange={(event) => update("address", event.target.value)} placeholder="Ex. Kaloum, Conakry" /></label><label>Ville<input value={company.city ?? ""} onChange={(event) => update("city", event.target.value)} placeholder="Ex. Conakry" /></label><label>Code postal<input value={company.postalCode ?? ""} onChange={(event) => update("postalCode", event.target.value)} placeholder="Optionnel" /></label><label>Téléphone professionnel<input type="tel" value={company.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+224 620 00 00 00" /></label><label>Téléphone facturation<input type="tel" value={company.billingPhone ?? ""} onChange={(event) => update("billingPhone", event.target.value)} placeholder="Optionnel" /></label><label>Email professionnel<input type="email" value={company.email} onChange={(event) => update("email", event.target.value)} placeholder="bonjour@entreprise.com" /></label><label>Email facturation<input type="email" value={company.billingEmail ?? ""} onChange={(event) => update("billingEmail", event.target.value)} placeholder="facturation@entreprise.com" /></label><label className="wide-field">Site internet<input type="url" value={company.website ?? ""} onChange={(event) => update("website", event.target.value)} placeholder="https://www.entreprise.com" /></label></div></section><SaveRow saved={saved} onSave={onSave} /></div><InvoiceIdentityCard company={company} /></div>;
}

function RegionalSection({ company, update, saved, onSave }: { company: LocalCompany; update: (field: keyof LocalCompany, value: string) => void; saved: boolean; onSave: () => void }) {
  return <div className="settings-panel-grid"><div className="settings-sections"><section className="settings-section"><SectionHeading icon="◎" tone="regional" title="Région, langue et devise" detail="Préparez votre espace pour les marchés locaux et internationaux." /><div className="settings-fields"><label>Pays / territoire<select value={company.countryCode ?? "GN"} onChange={(event) => update("countryCode", event.target.value)}><option value="GN">Guinée</option><option value="SN">Sénégal</option><option value="CI">Côte d’Ivoire</option><option value="FR">France</option><option value="US">États-Unis</option><option value="GB">Royaume-Uni</option><option value="OTHER">Autre pays</option></select></label><label>Région / État<input value={company.region ?? ""} onChange={(event) => update("region", event.target.value)} placeholder="Ex. Conakry" /></label><label>Langue et format<select value={company.locale ?? "fr-GN"} onChange={(event) => update("locale", event.target.value)}><option value="fr-GN">Français (Guinée)</option><option value="fr-FR">Français (France)</option><option value="en-US">English (United States)</option><option value="en-GB">English (United Kingdom)</option></select></label><label>Devise de facturation<select value={company.currencyCode ?? "GNF"} onChange={(event) => update("currencyCode", event.target.value)}><option value="GNF">GNF - Franc guinéen</option><option value="XOF">XOF - Franc CFA</option><option value="EUR">EUR - Euro</option><option value="USD">USD - Dollar américain</option><option value="GBP">GBP - Livre sterling</option></select></label><label>Taux de TVA par défaut<input inputMode="decimal" value={String(Number(company.defaultVatRateBp) / 100)} onChange={(event) => update("defaultVatRateBp", String(Math.round(Number(event.target.value.replace(",", ".") || 0) * 100)))} placeholder="18" /></label><label>Conditions de règlement<textarea value={company.paymentInstructions ?? ""} onChange={(event) => update("paymentInstructions", event.target.value)} placeholder="Coordonnées bancaires, Mobile Money, délai de règlement..." /></label></div></section><SaveRow saved={saved} onSave={onSave} /></div><section className="settings-side-card currency-card"><span className="side-kicker">Configuration active</span><strong>{company.currencyCode || "GNF"}</strong><p>La devise et le format régional seront utilisés dans les aperçus et les PDF des factures.</p><div><span>{company.countryCode || "GN"}</span><span>{company.locale || "fr-GN"}</span></div></section></div>;
}

function TemplateSection({ company, update, saved, onSave }: { company: LocalCompany; update: (field: keyof LocalCompany, value: string) => void; saved: boolean; onSave: () => void }) {
  return <div className="template-settings"><section className="settings-section"><SectionHeading icon="▤" tone="template" title="Choisissez votre modèle de facture" detail="Le style sélectionné sera appliqué aux aperçus et aux nouvelles factures." /><div className="template-grid">{templates.map((template) => <button key={template.id} type="button" className={`template-choice ${company.invoiceTemplate === template.id ? "selected" : ""}`} onClick={() => update("invoiceTemplate", template.id)}><span className={`template-paper ${template.id}`}><i /><i /><i /><b /></span><strong>{template.name}</strong><small>{template.caption}</small>{company.invoiceTemplate === template.id && <em>✓ Sélectionné</em>}</button>)}</div></section><SaveRow saved={saved} onSave={onSave} /></div>;
}

function TeamSection({ team, memberName, memberEmail, memberRole, setMemberName, setMemberEmail, setMemberRole, onAdd, onRemove, onBackup, onRestore, backupMessage, supabaseConfigured, migrating, migrationMessage, onMigrate }: { team: TeamMember[]; memberName: string; memberEmail: string; memberRole: TeamRole; setMemberName: (value: string) => void; setMemberEmail: (value: string) => void; setMemberRole: (value: TeamRole) => void; onAdd: () => void; onRemove: (id: string) => void; onBackup: () => void; onRestore: () => void; backupMessage: string; supabaseConfigured: boolean; migrating: boolean; migrationMessage: string; onMigrate: () => void }) {
  return <div className="settings-panel-grid"><div className="settings-sections"><section className="settings-side-card supabase-migration-card"><span className="side-kicker">Supabase</span><h3>Migration des données</h3><p>{supabaseConfigured ? "Envoyez vos données locales vers votre entreprise Supabase après vous être connecté." : "Ajoutez les variables Supabase dans .env.local puis redémarrez l’application."}</p><button className="primary-button" type="button" disabled={!supabaseConfigured || migrating} onClick={onMigrate}>{migrating ? "Migration en cours..." : "Migrer vers Supabase"}</button>{migrationMessage !== "" && <span className="editor-message" role="status">{migrationMessage}</span>}</section><section className="settings-section"><SectionHeading icon="♙" tone="team" title="Équipe et niveaux d’accès" detail="Ajoutez les personnes qui travaillent avec vous sur cet appareil." /><div className="team-add-form"><label>Nom<input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Ex. Mariama Diallo" /></label><label>Email professionnel<input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="mariama@entreprise.com" /></label><label>Accès<select value={memberRole} onChange={(event) => setMemberRole(event.target.value as TeamRole)}><option>Administrateur</option><option>Facturation</option><option>Lecture seule</option></select></label><button className="primary-button" type="button" onClick={onAdd}>Ajouter à l’équipe</button></div>{team.length === 0 ? <div className="team-empty">Votre équipe est prête. Ajoutez un premier collaborateur pour organiser les accès.</div> : <div className="team-list">{team.map((member) => <div key={member.id}><span className="team-avatar">{member.name.slice(0, 2).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.email}</small></div><span className={`role-badge ${member.role === "Administrateur" ? "admin" : ""}`}>{member.role}</span><button type="button" className="delete-button" aria-label={`Retirer ${member.name}`} onClick={() => onRemove(member.id)}>×</button></div>)}</div>}</section></div><aside className="settings-sidebar"><section className="settings-side-card safety-card"><span className="side-kicker">Données de l’entreprise</span><h3>Sauvegarde locale</h3><p>Exportez vos clients, factures et paiements avant de changer d’appareil.</p><button className="secondary-button" type="button" onClick={onBackup}>Télécharger la sauvegarde</button><button className="text-button" type="button" onClick={onRestore}>Restaurer un fichier JSON</button>{backupMessage !== "" && <span className="editor-message" role="status">{backupMessage}</span>}</section><section className="settings-side-card"><span className="side-kicker">Accès local</span><p>La gestion fine des invitations et des accès par appareil sera synchronisée avec l’authentification serveur.</p></section></aside></div>;
}

function SectionHeading({ icon, tone, title, detail }: { icon: string; tone: string; title: string; detail: string }) { return <div className="settings-section-heading"><span className={`settings-section-icon ${tone}`}>{icon}</span><div><h3>{title}</h3><p>{detail}</p></div></div>; }
function SaveRow({ saved, onSave }: { saved: boolean; onSave: () => void }) { return <div className="settings-save-row"><span>{saved && <span className="editor-message" role="status">Modifications enregistrées localement.</span>}</span><button className="primary-button" type="button" onClick={onSave}>Enregistrer les modifications</button></div>; }
function InvoiceIdentityCard({ company }: { company: LocalCompany }) { return <aside className="settings-sidebar"><section className="settings-side-card invoice-identity-card"><span className="side-kicker">Aperçu sur facture</span><strong>{company.name || "Votre entreprise"}</strong><span>{company.legalName || "Raison sociale"}</span><span>{company.address || "Adresse"}</span><span>{company.billingPhone || company.phone || "Téléphone"}</span><span>{company.billingEmail || company.email || "Email"}</span><div className="side-divider" /><small>{company.legalForm || "Forme juridique"} · {company.registrationCountry || "Pays"}</small><small>NIF : {company.nif || "À compléter"}</small><small>RCCM : {company.rccm || "À compléter"}</small></section></aside>; }
