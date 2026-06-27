import { GitBranch, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectSnapshot } from "../blendup/types";

export function GitView({ snapshot }: { snapshot: ProjectSnapshot }) {
  const [query, setQuery] = useState("");
  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return snapshot.gitStatus.files.filter((file) => !normalizedQuery || file.path.toLowerCase().includes(normalizedQuery));
  }, [query, snapshot.gitStatus.files]);

  return (
    <section className="git-page role-page" aria-label="Git">
      <div className="git-summary-grid">
        <GitSummaryCard label="Branche" value={snapshot.gitStatus.branch ?? "Non detectee"} />
        <GitSummaryCard label="Etat" value={snapshot.gitStatus.available ? "Disponible" : "Indisponible"} />
        <GitSummaryCard label="Fichiers" value={String(snapshot.gitStatus.files.length)} />
      </div>
      <div className="git-message">
        <GitBranch size={17} />
        <strong>{snapshot.gitStatus.message}</strong>
        <span>Lecture seule pour la V1.</span>
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

function GitSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="git-summary-card">
      <GitBranch size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
