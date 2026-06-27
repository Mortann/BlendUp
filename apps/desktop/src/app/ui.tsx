import { CheckCircle2, FileSearch, UserRound, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import type { LocalToolsSnapshot } from "../blendup/types";
import type { OperationMessage, SelectOption } from "./types";

export function OperationBanner({
  message,
  onClose
}: {
  message: OperationMessage;
  onClose: () => void;
}) {
  return (
    <div className={`operation-banner ${message.tone}`}>
      <strong>{message.title}</strong>
      {message.detail ? <span>{message.detail}</span> : null}
      <button onClick={onClose} type="button">
        Fermer
      </button>
    </div>
  );
}

export function SegmentedControl<TValue extends string>({
  ariaLabel,
  onChange,
  options,
  value
}: {
  ariaLabel: string;
  onChange: (value: TValue) => void;
  options: Array<SelectOption<TValue>>;
  value: TValue;
}) {
  return (
    <div className="segmented-control" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          className={option.value === value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <div className="empty-state compact">
      {icon ?? <FileSearch size={28} />}
      <span>{label}</span>
    </div>
  );
}

export function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Owner({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="owner-card">
      <UserRound size={16} />
      <span>{label}</span>
      <strong>{value ?? "Non assigne"}</strong>
    </div>
  );
}

export function PathLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="path-line">
      <span>{label}</span>
      <code>{value ?? "Non defini"}</code>
    </div>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: "blue" | "green" | "neutral" | "orange" }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

export function ToolStatus({ label, status }: { label: string; status?: LocalToolsSnapshot["blender"] }) {
  const isFound = Boolean(status?.found);

  return (
    <div className={`tool-status ${isFound ? "ok" : "missing"}`}>
      {isFound ? <CheckCircle2 size={16} /> : <Wrench size={16} />}
      <div>
        <strong>{label}</strong>
        <span title={status?.message}>{status?.path ?? status?.message ?? "Detection en attente"}</span>
      </div>
    </div>
  );
}
