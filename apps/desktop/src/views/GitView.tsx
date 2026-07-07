import { GitBranch, UploadCloud } from "lucide-react";
import type { ProjectSnapshot } from "../blendup/types";

export function GitView({ snapshot }: { snapshot: ProjectSnapshot }) {
  const fileCount = snapshot.gitStatus.files.length;

  return (
    <section className="git-page role-page artist-git-page" aria-label="Sauvegarde projet">
      <div className="artist-git-hero">
        <div>
          <span className="eyebrow">Sauvegarde projet</span>
          <h2>{fileCount > 0 ? "Des changements attendent" : "Projet propre"}</h2>
          <p>
            {fileCount > 0
              ? "Tu peux verifier ce qui a change avant de demander une synchronisation."
              : "Aucun changement local n'est detecte pour le moment."}
          </p>
        </div>
        <strong>{fileCount}</strong>
      </div>

      <div className="artist-git-actions">
        <button type="button">
          <GitBranch size={16} />
          Voir changements
        </button>
        <button type="button">
          <UploadCloud size={16} />
          Demander synchro
        </button>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Etat</span>
        <h2>{snapshot.gitStatus.branch ?? "Branche non detectee"}</h2>
        <p className="soft-text">{snapshot.gitStatus.message}</p>
      </div>
    </section>
  );
}
