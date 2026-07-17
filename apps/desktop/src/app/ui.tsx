import { CheckCircle2, Wrench } from "lucide-react";
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
