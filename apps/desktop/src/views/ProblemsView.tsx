import { AlertTriangle, CheckCircle2, CircleDot, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { BlendUpAsset, BlendUpProblem, ProjectSnapshot } from "../blendup/types";
import { severityFilters, sourceFilters } from "../app/filters";
import { sourceLabel } from "../app/metrics";
import type { SeverityFilter, SourceFilter } from "../app/types";
import { DetailMeta, EmptyState, SegmentedControl } from "../app/ui";
import { formatAssetType, formatStatus, severityLabel } from "../ui/format";

const severityColumns: { label: string; severity: BlendUpProblem["severity"] }[] = [
  { label: "Critiques", severity: "critical" },
  { label: "Erreurs", severity: "error" },
  { label: "Warnings", severity: "warning" },
  { label: "Infos", severity: "info" }
];

export function ProblemsView({
  exportAllowed,
  exportingAssetId,
  onExportAsset,
  onOpenAsset,
  snapshot
}: {
  exportAllowed: boolean;
  exportingAssetId: string | null;
  onExportAsset: (assetId: string) => void;
  onOpenAsset: (assetId?: string) => void;
  snapshot: ProjectSnapshot;
}) {
  const [problemQuery, setProblemQuery] = useState("");
  const [selectedProblemId, setSelectedProblemId] = useState(snapshot.problems[0]?.id ?? "");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const assetsById = useMemo(() => new Map(snapshot.assets.map((asset) => [asset.id, asset])), [snapshot.assets]);
  const filteredProblems = useMemo(() => {
    const normalizedQuery = problemQuery.trim().toLowerCase();

    return snapshot.problems.filter((problem) => {
      const asset = problem.assetId ? assetsById.get(problem.assetId) : undefined;
      const searchable = [problem.title, problem.detail, problem.severity, problem.source, asset?.displayName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSeverity = severityFilter === "all" || problem.severity === severityFilter;
      const matchesSource = sourceFilter === "all" || problem.source === sourceFilter;

      return matchesSeverity && matchesSource && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [assetsById, problemQuery, severityFilter, snapshot.problems, sourceFilter]);
  const selectedProblem = filteredProblems.find((problem) => problem.id === selectedProblemId) ?? filteredProblems[0];
  const selectedAsset = selectedProblem?.assetId ? assetsById.get(selectedProblem.assetId) : undefined;

  return (
    <section className="problems-page role-page" aria-label="Problemes">
      <div className="problem-summary-grid">
        {severityColumns.map((column) => (
          <ProblemSummaryCard key={column.severity} label={column.label} severity={column.severity} snapshot={snapshot} />
        ))}
      </div>

      <div className="problem-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={problemQuery}
            onChange={(event) => setProblemQuery(event.target.value)}
            placeholder="Rechercher un probleme"
            type="search"
          />
        </label>
        <SegmentedControl
          ariaLabel="Filtrer par severite"
          options={severityFilters}
          value={severityFilter}
          onChange={setSeverityFilter}
        />
        <SegmentedControl ariaLabel="Filtrer par source" options={sourceFilters} value={sourceFilter} onChange={setSourceFilter} />
      </div>

      <div className="problem-board-layout">
        <section className="problem-board" aria-label="Problemes par gravite">
          {severityColumns.map((column) => {
            const problems = filteredProblems.filter((problem) => problem.severity === column.severity);

            return (
              <div className={`problem-column ${column.severity}`} key={column.severity}>
                <div className="problem-column-header">
                  <strong>{column.label}</strong>
                  <span>{problems.length}</span>
                </div>
                <div className="problem-card-list">
                  {problems.length > 0 ? (
                    problems.map((problem) => {
                      const asset = problem.assetId ? assetsById.get(problem.assetId) : undefined;

                      return (
                        <button
                          className={`problem-card ${problem.id === selectedProblem?.id ? "selected" : ""}`}
                          key={problem.id}
                          onClick={() => setSelectedProblemId(problem.id)}
                          type="button"
                        >
                          <span className={`severity-dot ${problem.severity}`} />
                          <strong>{problem.title}</strong>
                          <small>{asset?.displayName ?? "Projet"} - {sourceLabel(problem.source)}</small>
                        </button>
                      );
                    })
                  ) : (
                    <EmptyState icon={<CheckCircle2 size={22} />} label="Rien ici" />
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <ProblemDetail
          asset={selectedAsset}
          exportAllowed={exportAllowed}
          isExporting={selectedAsset?.id === exportingAssetId}
          onExportAsset={onExportAsset}
          onOpenAsset={onOpenAsset}
          problem={selectedProblem}
        />
      </div>
    </section>
  );
}

function ProblemSummaryCard({
  label,
  severity,
  snapshot
}: {
  label: string;
  severity: BlendUpProblem["severity"];
  snapshot: ProjectSnapshot;
}) {
  const count = snapshot.problems.filter((problem) => problem.severity === severity).length;

  return (
    <div className={`problem-summary-card ${severity}`}>
      <CircleDot size={17} />
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

function ProblemDetail({
  asset,
  exportAllowed,
  isExporting,
  onExportAsset,
  onOpenAsset,
  problem
}: {
  asset?: BlendUpAsset;
  exportAllowed: boolean;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  onOpenAsset: (assetId?: string) => void;
  problem?: BlendUpProblem;
}) {
  if (!problem) {
    return (
      <aside className="problem-detail-panel empty-state">
        <CheckCircle2 size={32} />
        <span>Aucun probleme a afficher</span>
      </aside>
    );
  }

  return (
    <aside className={`problem-detail-panel severity-${problem.severity}`} aria-label="Detail probleme">
      <div className="problem-detail-heading">
        <span className={`severity-dot ${problem.severity}`} />
        <div>
          <span className="eyebrow">{severityLabel(problem.severity)}</span>
          <h2>{problem.title}</h2>
        </div>
      </div>
      <p>{problem.detail}</p>
      <div className="problem-detail-meta">
        <DetailMeta label="Source" value={sourceLabel(problem.source)} />
        <DetailMeta label="Asset" value={asset?.displayName ?? "Projet"} />
        <DetailMeta label="Type" value={asset ? formatAssetType(asset.type) : "Global"} />
        <DetailMeta label="Statut" value={asset ? formatStatus(asset.status) : "Projet"} />
      </div>
      <div className="problem-detail-actions">
        {problem.actionLabel ? (
          <ProblemActionButton
            asset={asset}
            exportAllowed={exportAllowed}
            isExporting={isExporting}
            onExportAsset={onExportAsset}
            problem={problem}
          />
        ) : null}
        {asset ? (
          <button className="secondary" onClick={() => onOpenAsset(asset.id)} type="button">
            Voir l'asset
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function ProblemActionButton({
  asset,
  exportAllowed,
  isExporting,
  onExportAsset,
  problem
}: {
  asset?: BlendUpAsset;
  exportAllowed: boolean;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problem: BlendUpProblem;
}) {
  const isExportAction = problem.actionLabel === "Exporter";
  const canExport = isExportAction && Boolean(asset) && exportAllowed;

  return (
    <button
      disabled={!canExport || isExporting}
      onClick={() => {
        if (asset && canExport) {
          onExportAsset(asset.id);
        }
      }}
      type="button"
    >
      {isExporting && canExport ? "Export" : problem.actionLabel}
    </button>
  );
}
