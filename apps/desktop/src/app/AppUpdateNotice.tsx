import { Download, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import type { AppUpdates } from "./useAppUpdates";

export function AppUpdateAction({ updates, busy }: { updates: AppUpdates; busy: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!updates.available) return null;
  if (!updates.available.canInstall) return <button onClick={() => void updates.openRelease()} type="button">Télécharger la nouvelle version</button>;
  return <>
    <button className="primary" disabled={busy || updates.installing || updates.checking} onClick={() => setConfirming(true)} type="button">
      {updates.installing ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
      {updates.installing ? "Téléchargement et vérification…" : "Mettre à jour"}
    </button>
    {busy ? <p>La mise à jour sera disponible après l’opération en cours.</p> : null}
    {confirming ? <div className="update-confirm-overlay" onKeyDown={(event) => { if (event.key === "Escape") setConfirming(false); }}><section className="content-panel update-confirm" role="dialog" aria-modal="true" aria-labelledby="update-confirm-title">
      <h2 id="update-confirm-title">Installer BlendUp {updates.available.version}</h2>
      <p>Enregistre ton travail et ferme Blender et Godot avant de continuer.</p>
      <p>BlendUp téléchargera la mise à jour, puis se fermera pour ouvrir l’assistant. Tu pourras y choisir les extensions Blender et les projets Godot à mettre à jour. Les réglages sont conservés et les extensions remplacées sont sauvegardées.</p>
      <div className="button-row"><button className="primary" disabled={busy} onClick={() => { setConfirming(false); void updates.install(); }} type="button">Télécharger et continuer</button><button autoFocus onClick={() => setConfirming(false)} type="button">Annuler</button></div>
    </section></div> : null}
  </>;
}

export function AppUpdateNotice({ updates, busy }: { updates: AppUpdates; busy: boolean }) {
  if (!updates.noticeVisible || !updates.available) return null;
  return <aside className="app-update-notice content-panel" aria-label="Mise à jour de BlendUp" aria-live="polite">
    <button className="update-notice-close" disabled={updates.installing} onClick={updates.dismiss} aria-label="Plus tard" type="button"><X size={17} /></button>
    <h3>BlendUp {updates.available.version} est disponible</h3>
    <p>Une nouvelle version de l’application et des extensions est prête.</p>
    <AppUpdateAction updates={updates} busy={busy} />
    {updates.error ? <p className="field-error" role="alert">{updates.error}</p> : null}
  </aside>;
}

export function AppUpdateSettings({ updates, busy }: { updates: AppUpdates; busy: boolean }) {
  return <section className="settings-section content-panel">
    <div className="section-heading"><RefreshCw size={20} /><div><h2>Mises à jour</h2><p>BlendUp vérifie les nouvelles versions au démarrage, puis toutes les six heures. L’installation démarre lorsque tu la choisis.</p></div></div>
    <p role="status">{updates.installing ? "Téléchargement et vérification de la mise à jour…" : updates.checking ? "Recherche d’une nouvelle version…" : updates.available ? `La version ${updates.available.version} est disponible.` : updates.checked && !updates.error ? "Tu utilises la dernière version publiée." : "Vérifie si une nouvelle version est disponible."}</p>
    <div className="button-row"><button disabled={updates.checking || updates.installing} onClick={() => void updates.check()} type="button">{updates.checking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} Vérifier les mises à jour</button><AppUpdateAction updates={updates} busy={busy} /></div>
    {updates.error ? <p className="field-error" role="alert">{updates.error}</p> : null}
  </section>;
}
