import { CheckCircle2, LoaderCircle, Wrench } from "lucide-react";
import type { ToolDetection } from "../blendup/types";
import type { OperationMessage } from "./types";

export function OperationBanner({ message, onClose }: { message: OperationMessage; onClose: () => void }) {
  return (
    <div className={`operation-banner ${message.tone}`} role="status">
      <div><strong>{message.title}</strong>{message.detail ? <span>{message.detail}</span> : null}</div>
      <button onClick={onClose} type="button">Fermer</button>
    </div>
  );
}

export function OpeningAssetOverlay({ path }: { path: string }) {
  return <div className="modal-backdrop opening-asset-overlay">
    <div className="opening-asset-card" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={30} />
      <strong>Ouverture dans Blender…</strong>
      <span>{path.split("/").pop()}</span>
      <p>Le fichier est en cours d’ouverture.</p>
    </div>
  </div>;
}

export function ToolStatus({ status }: { status: ToolDetection | null }) {
  const found = Boolean(status?.found);
  return (
    <div className={`tool-status ${found ? "ok" : "missing"}`}>
      {found ? <CheckCircle2 size={18} /> : <Wrench size={18} />}
      <div>
        <strong>{found ? "Blender detecte" : "Blender non detecte"}</strong>
        <span>{status?.path ?? status?.message ?? "Lance la detection pour verifier le chemin."}</span>
      </div>
    </div>
  );
}
