"use client";

import { createContext, useContext, useRef, useState } from "react";

type NoticeTone = "success" | "error" | "info";
type DialogState = { title: string; message: string; confirmLabel: string; tone: NoticeTone; input?: { label: string; placeholder?: string; initialValue?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }; resolve: (value: string | null) => void };
type FeedbackContextValue = { confirm: (options: Omit<DialogState, "resolve" | "input">) => Promise<boolean>; prompt: (options: Omit<DialogState, "resolve"> & { input: NonNullable<DialogState["input"]> }) => Promise<string | null>; notify: (message: string, tone?: NoticeTone) => void };

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

export function useAppFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (context === undefined) throw new Error("useAppFeedback must be used inside AppFeedbackProvider");
  return context;
}

export function AppFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>();
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const clearNotice = () => window.setTimeout(() => setNotice(undefined), 4200);
  const notify = (message: string, tone: NoticeTone = "info") => { setNotice({ message, tone }); clearNotice(); };
  const confirm = (options: Omit<DialogState, "resolve" | "input">) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve: (value) => resolve(value !== null) }));
  const prompt = (options: Omit<DialogState, "resolve"> & { input: NonNullable<DialogState["input"]> }) => new Promise<string | null>((resolve) => setDialog({ ...options, resolve }));
  const closeDialog = (value: string | null) => { dialog?.resolve(value); setDialog(undefined); };

  return <FeedbackContext.Provider value={{ confirm, prompt, notify }}>{children}{notice !== undefined && <div className={`app-toast ${notice.tone}`} role="status"><span>{notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "i"}</span>{notice.message}<button type="button" aria-label="Fermer la notification" onClick={() => setNotice(undefined)}>×</button></div>}{dialog !== undefined && <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => closeDialog(null)}><section className={`app-dialog ${dialog.tone}`} role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" onMouseDown={(event) => event.stopPropagation()}><span className="app-dialog-icon">{dialog.tone === "error" ? "!" : dialog.input === undefined ? "?" : "₣"}</span><div><h2 id="app-dialog-title">{dialog.title}</h2><p>{dialog.message}</p></div>{dialog.input !== undefined && <label className="app-dialog-input">{dialog.input.label}<input ref={inputRef} autoFocus inputMode={dialog.input.inputMode} defaultValue={dialog.input.initialValue} placeholder={dialog.input.placeholder} onKeyDown={(event) => { if (event.key === "Enter") closeDialog(inputRef.current?.value.trim() || null); }} /></label>}<div className="app-dialog-actions"><button className="secondary-button" type="button" onClick={() => closeDialog(null)}>Annuler</button><button className={dialog.tone === "error" ? "danger-button" : "primary-button"} type="button" onClick={() => closeDialog(dialog.input === undefined ? "confirmed" : inputRef.current?.value.trim() || null)}>{dialog.confirmLabel}</button></div></section></div>}</FeedbackContext.Provider>;
}
