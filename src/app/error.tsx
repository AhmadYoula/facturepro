"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-state route-error" role="alert"><div className="loading-mark">!</div><strong>Une erreur est survenue</strong><span>Vos données locales ne sont pas supprimées. Rechargez l’espace ou réessayez.</span><button className="primary-button" type="button" onClick={() => reset()}>Réessayer</button></main>;
}
