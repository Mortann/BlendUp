import { GitBranch, GitCommitHorizontal, Search, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import type { Role } from "../blendup/roles";
import type { ProjectSnapshot } from "../blendup/types";

export function GitView({ role, snapshot }: { role: Role; snapshot: ProjectSnapshot }) {
  const [query, setQuery] = useState("");
  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return snapshot.gitStatus.files.filter((file) => !normalizedQuery || file.path.toLowerCase().includes(normalizedQuery));
  }, [query, snapshot.gitStatus.files]);

  if (role === "artist") {
    return <ArtistGitView fileCount={snapshot.gitStatus.files.length} snapshot={snapshot} />;
  }

  return (
    <section className="git-page role-page" aria-label="Git">
      <div className="git-summary-grid">
        <GitSummaryCard label="Branche" value={snapshot.gitStatus.branch ?? "Non detectee"} />
        <GitSummaryCard label="Etat" value={snapshot.gitStatus.available ? "Disponible" : "Indisponible"} />
        <GitSummaryCard label="Fichiers modifies" value={String(snapshot.gitStatus.files.length)} />
      </div>
      <div className="git-message">
        <GitBranch size={17} />
        <strong>{snapshot.gitStatus.message}</strong>
        <span>Vue dev : lecture detaillee, actions completes a brancher ensuite.</span>
      </div>
      <div className="git-dev-actions">
        <button type="button">
          <GitCommitHorizontal size={16} />
          Preparer commit
        </button>
        <button type="button">
          <UploadCloud size={16} />
          Synchroniser
        </button>
      </div>
      <label className="search-box">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer les fichiers" />
      </label>
      <div className="git-file-list">
        {filteredFiles.map((file) => (
          <div className="git-file-row" key={`${file.status}-${file.path}`}>
            <span>{file.status}</span>
            <code>{file.path}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function ArtistGitView({ fileCount, snapshot }: { fileCount: number; snapshot: ProjectSnapshot }) {
  return (
    <section className="git-page role-page artist-git-page" aria-label="Git artiste">
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

function GitSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="git-summary-card">
      <GitBranch size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
