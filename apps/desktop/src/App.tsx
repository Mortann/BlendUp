import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  FileSearch,
  GitBranch,
  Layers3,
  Search,
  Settings,
  UserRound
} from "lucide-react";
import type {
  BlendUpAsset,
  BlendUpProblem,
  BlendUpTask,
  ProjectSnapshot,
  TaskPriority,
  TaskStatus
} from "./blendup/types";
import { exportAssetToFbx } from "./blendup/actions";
import { loadProjectSnapshot } from "./blendup/projectLoader";
import {
  formatAssetType,
  formatExportStatus,
  formatStatus,
  formatTaskPriority,
  formatTaskStatus,
  severityLabel
} from "./ui/format";

const snapshot = await loadProjectSnapshot();

type ActiveView = "assets" | "git" | "problems" | "tasks";
type OperationMessage = {
  detail?: string;
  title: string;
  tone: "info" | "success" | "error";
};
type SeverityFilter = BlendUpProblem["severity"] | "all";
type SourceFilter = BlendUpProblem["source"] | "all";
type TaskPriorityFilter = TaskPriority | "all";
type TaskStatusFilter = TaskStatus | "all";

const severityFilters: Array<{ label: string; value: SeverityFilter }> = [
  { label: "Tout", value: "all" },
  { label: "Critiques", value: "critical" },
  { label: "Erreurs", value: "error" },
  { label: "Warnings", value: "warning" },
  { label: "Infos", value: "info" }
];

const sourceFilters: Array<{ label: string; value: SourceFilter }> = [
  { label: "Toutes", value: "all" },
  { label: "BlendUp", value: "blendup" },
  { label: "Blender", value: "blender" },
  { label: "Unity", value: "unity" },
  { label: "Git", value: "git" }
];

const taskStatusFilters: Array<{ label: string; value: TaskStatusFilter }> = [
  { label: "Tout", value: "all" },
  { label: "Todo", value: "todo" },
  { label: "En cours", value: "in_progress" },
  { label: "Review", value: "review" },
  { label: "Termine", value: "done" },
  { label: "Bloque", value: "blocked" }
];

const taskPriorityFilters: Array<{ label: string; value: TaskPriorityFilter }> = [
  { label: "Toutes", value: "all" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" }
];

function App() {
  const [project, setProject] = useState<ProjectSnapshot>(snapshot);
  const [activeView, setActiveView] = useState<ActiveView>("assets");
  const [blenderPathInput, setBlenderPathInput] = useState("");
  const [exportingAssetId, setExportingAssetId] = useState<string | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [operationMessage, setOperationMessage] = useState<OperationMessage | null>(null);
  const [projectPathInput, setProjectPathInput] = useState(snapshot.projectRoot ?? "");
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState(project.assets[0]?.id ?? "");
  const selectedAsset = project.assets.find((asset) => asset.id === selectedAssetId) ?? project.assets[0];

  const currentProjectRoot = project.projectRoot ?? "Snapshot local";

  const reloadProject = async () => {
    setIsLoadingProject(true);
    setLoadError("");

    try {
      const nextProject = await loadProjectSnapshot(projectPathInput);
      setProject(nextProject);
      setSelectedAssetId(nextProject.assets[0]?.id ?? "");
      setActiveView("assets");
      setProjectPathInput(nextProject.projectRoot ?? projectPathInput);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingProject(false);
    }
  };

  const openAsset = (assetId?: string) => {
    if (assetId) {
      setSelectedAssetId(assetId);
    }

    setActiveView("assets");
  };

  const handleExportAsset = async (assetId: string) => {
    if (!project.projectRoot) {
      setOperationMessage({
        tone: "error",
        title: "Export impossible",
        detail: "Le projet courant n'a pas de dossier source charge par Tauri."
      });
      return;
    }

    setExportingAssetId(assetId);
    setOperationMessage({
      tone: "info",
      title: "Export FBX en cours",
      detail: "BlendUp lance Blender en arriere-plan."
    });

    try {
      const result = await exportAssetToFbx({
        assetId,
        blenderPath: blenderPathInput,
        projectRoot: project.projectRoot
      });
      const refreshedProject = await loadProjectSnapshot(project.projectRoot);

      setProject(refreshedProject);
      setSelectedAssetId(assetId);
      setProjectPathInput(refreshedProject.projectRoot ?? project.projectRoot);
      setOperationMessage({
        tone: result.success ? "success" : "error",
        title: result.message,
        detail: result.outputPath ?? result.log
      });
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Export impossible",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setExportingAssetId(null);
    }
  };

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return project.assets;
    }

    return project.assets.filter((asset) => {
      const searchable = [
        asset.displayName,
        asset.type,
        asset.status,
        asset.paths.blenderSource,
        asset.paths.fbxExport,
        asset.paths.unityPrefab,
        asset.tags.join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [project.assets, query]);

  const selectedProblems = project.problems.filter(
    (problem) => !problem.assetId || problem.assetId === selectedAsset?.id
  );

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="brand">
          <div className="brand-mark">BU</div>
          <div>
            <strong>BlendUp</strong>
            <span>{project.project.name}</span>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={`nav-item ${activeView === "assets" ? "active" : ""}`}
            onClick={() => setActiveView("assets")}
            type="button"
          >
            <Boxes size={18} />
            Assets
          </button>
          <button
            className={`nav-item ${activeView === "problems" ? "active" : ""}`}
            onClick={() => setActiveView("problems")}
            type="button"
          >
            <AlertTriangle size={18} />
            Problems
            {project.problems.length > 0 ? <span className="nav-badge">{project.problems.length}</span> : null}
          </button>
          <button
            className={`nav-item ${activeView === "tasks" ? "active" : ""}`}
            onClick={() => setActiveView("tasks")}
            type="button"
          >
            <ClipboardList size={18} />
            Tasks
            {project.tasks.length > 0 ? <span className="nav-badge neutral">{project.tasks.length}</span> : null}
          </button>
          <button className="nav-item" type="button">
            <Layers3 size={18} />
            References
          </button>
          <button
            className={`nav-item ${activeView === "git" ? "active" : ""}`}
            onClick={() => setActiveView("git")}
            type="button"
          >
            <GitBranch size={18} />
            Git
          </button>
          <button className="nav-item" type="button">
            <Settings size={18} />
            Settings
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Projet test</span>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="topbar-side">
            <form
              className="project-loader"
              onSubmit={(event) => {
                event.preventDefault();
                void reloadProject();
              }}
            >
              <label>
                <span>Projet</span>
                <input
                  aria-label="Chemin du projet BlendUp"
                  onChange={(event) => setProjectPathInput(event.target.value)}
                  placeholder="Chemin du projet"
                  title={currentProjectRoot}
                  value={projectPathInput}
                />
              </label>
              <button disabled={isLoadingProject} type="submit">
                {isLoadingProject ? "Chargement" : "Charger"}
              </button>
            </form>
            <label className="tool-path-input">
              <span>Blender</span>
              <input
                aria-label="Chemin de Blender"
                onChange={(event) => setBlenderPathInput(event.target.value)}
                placeholder="Auto ou chemin blender.exe"
                value={blenderPathInput}
              />
            </label>
            {loadError ? <span className="project-load-error">{loadError}</span> : null}
            <div className="topbar-meta">
              <span>Blender {project.project.targets.blenderMinimumVersion}+</span>
              <span>Unity {project.project.targets.unityTestVersion}</span>
            </div>
          </div>
        </header>

        {operationMessage ? (
          <div className={`operation-banner ${operationMessage.tone}`}>
            <strong>{operationMessage.title}</strong>
            {operationMessage.detail ? <span>{operationMessage.detail}</span> : null}
            <button onClick={() => setOperationMessage(null)} type="button">
              Fermer
            </button>
          </div>
        ) : null}

        {activeView === "assets" ? (
          <AssetsView
            filteredAssets={filteredAssets}
            exportingAssetId={exportingAssetId}
            onExportAsset={handleExportAsset}
            problems={project.problems}
            query={query}
            selectedAsset={selectedAsset}
            selectedProblems={selectedProblems}
            setQuery={setQuery}
            setSelectedAssetId={setSelectedAssetId}
          />
        ) : activeView === "problems" ? (
          <ProblemsView
            exportingAssetId={exportingAssetId}
            onExportAsset={handleExportAsset}
            onOpenAsset={openAsset}
            snapshot={project}
          />
        ) : activeView === "tasks" ? (
          <TasksView onOpenAsset={openAsset} snapshot={project} />
        ) : (
          <GitView snapshot={project} />
        )}
      </section>
    </main>
  );
}

interface AssetsViewProps {
  exportingAssetId: string | null;
  filteredAssets: BlendUpAsset[];
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
  query: string;
  selectedAsset?: BlendUpAsset;
  selectedProblems: BlendUpProblem[];
  setQuery: (query: string) => void;
  setSelectedAssetId: (assetId: string) => void;
}

function AssetsView({
  exportingAssetId,
  filteredAssets,
  onExportAsset,
  problems,
  query,
  selectedAsset,
  selectedProblems,
  setQuery,
  setSelectedAssetId
}: AssetsViewProps) {
  return (
    <section className="content-grid">
      <section className="asset-panel" aria-label="Liste des assets">
        <div className="panel-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher"
              type="search"
            />
          </label>
          <span className="count-chip">{filteredAssets.length} assets</span>
        </div>

        <div className="asset-list">
          {filteredAssets.map((asset) => (
            <AssetRow
              asset={asset}
              isSelected={asset.id === selectedAsset?.id}
              key={asset.id}
              onSelect={() => setSelectedAssetId(asset.id)}
              problemCount={problems.filter((problem) => problem.assetId === asset.id).length}
            />
          ))}
        </div>
      </section>

      {selectedAsset ? (
        <AssetDetail
          asset={selectedAsset}
          isExporting={exportingAssetId === selectedAsset.id}
          onExportAsset={onExportAsset}
          problems={selectedProblems}
        />
      ) : (
        <section className="detail-panel empty-state">
          <FileSearch size={32} />
          <span>Aucun asset selectionne</span>
        </section>
      )}
    </section>
  );
}

interface TasksViewProps {
  onOpenAsset: (assetId?: string) => void;
  snapshot: ProjectSnapshot;
}

function TasksView({ onOpenAsset, snapshot }: TasksViewProps) {
  const [taskQuery, setTaskQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(snapshot.tasks[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>("all");

  const assetsById = useMemo(() => {
    return new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  }, [snapshot.assets]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = taskQuery.trim().toLowerCase();

    return snapshot.tasks.filter((task) => {
      const linkedAssetNames = task.assetIds
        .map((assetId) => assetsById.get(assetId)?.displayName)
        .filter(Boolean)
        .join(" ");
      const searchable = [
        task.title,
        task.description,
        task.status,
        task.priority,
        task.owner,
        linkedAssetNames
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;

      return matchesStatus && matchesPriority && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [assetsById, priorityFilter, snapshot.tasks, statusFilter, taskQuery]);

  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0];

  return (
    <section className="tasks-page" aria-label="Tasks">
      <div className="task-summary-grid">
        <TaskSummaryCard label="A faire" status="todo" tasks={snapshot.tasks} />
        <TaskSummaryCard label="En cours" status="in_progress" tasks={snapshot.tasks} />
        <TaskSummaryCard label="Review" status="review" tasks={snapshot.tasks} />
        <TaskSummaryCard label="Bloque" status="blocked" tasks={snapshot.tasks} />
      </div>

      <div className="problem-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={taskQuery}
            onChange={(event) => setTaskQuery(event.target.value)}
            placeholder="Rechercher une tache"
            type="search"
          />
        </label>

        <SegmentedControl
          ariaLabel="Filtrer par statut"
          options={taskStatusFilters}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        <SegmentedControl
          ariaLabel="Filtrer par priorite"
          options={taskPriorityFilters}
          value={priorityFilter}
          onChange={setPriorityFilter}
        />
      </div>

      <div className="task-layout">
        <section className="task-list" aria-label="Liste des taches">
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task) => (
              <button
                className={`task-row ${task.priority} ${task.id === selectedTask?.id ? "selected" : ""}`}
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                type="button"
              >
                <div className="task-row-main">
                  <strong>{task.title}</strong>
                  <span>
                    {formatTaskStatus(task.status)} - {formatTaskPriority(task.priority)}
                  </span>
                </div>
                <span className="task-asset-count">{task.assetIds.length}</span>
              </button>
            ))
          ) : (
            <div className="empty-state compact">
              <CheckCircle2 size={28} />
              <span>Aucune tache avec ces filtres</span>
            </div>
          )}
        </section>

        <TaskDetail assetsById={assetsById} onOpenAsset={onOpenAsset} task={selectedTask} />
      </div>
    </section>
  );
}

function TaskSummaryCard({
  label,
  status,
  tasks
}: {
  label: string;
  status: TaskStatus;
  tasks: BlendUpTask[];
}) {
  const count = tasks.filter((task) => task.status === status).length;

  return (
    <div className={`task-summary-card ${status}`}>
      <ClipboardList size={17} />
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

function TaskDetail({
  assetsById,
  onOpenAsset,
  task
}: {
  assetsById: Map<string, BlendUpAsset>;
  onOpenAsset: (assetId?: string) => void;
  task?: BlendUpTask;
}) {
  if (!task) {
    return (
      <aside className="task-detail-panel empty-state">
        <ClipboardList size={32} />
        <span>Aucune tache a afficher</span>
      </aside>
    );
  }

  return (
    <aside className="task-detail-panel" aria-label="Detail tache">
      <div className="task-detail-heading">
        <span className={`task-priority-dot ${task.priority}`} />
        <div>
          <span className="eyebrow">{formatTaskStatus(task.status)}</span>
          <h2>{task.title}</h2>
        </div>
      </div>

      <p>{task.description}</p>

      <div className="problem-detail-meta">
        <DetailMeta label="Priorite" value={formatTaskPriority(task.priority)} />
        <DetailMeta label="Owner" value={task.owner ?? "Non assigne"} />
        <DetailMeta label="Assets" value={String(task.assetIds.length)} />
        <DetailMeta label="MAJ" value={task.updatedAt} />
      </div>

      <div className="linked-asset-list">
        {task.assetIds.map((assetId) => {
          const asset = assetsById.get(assetId);

          return (
            <button
              disabled={!asset}
              key={assetId}
              onClick={() => onOpenAsset(assetId)}
              type="button"
            >
              <Boxes size={16} />
              <span>{asset?.displayName ?? assetId}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function GitView({ snapshot }: { snapshot: ProjectSnapshot }) {
  const [gitQuery, setGitQuery] = useState("");
  const normalizedQuery = gitQuery.trim().toLowerCase();
  const filteredFiles = snapshot.gitStatus.files.filter((file) => {
    const searchable = `${file.status} ${file.path}`.toLowerCase();

    return !normalizedQuery || searchable.includes(normalizedQuery);
  });

  return (
    <section className="git-page" aria-label="Git">
      <div className="git-summary-grid">
        <div className="git-summary-card">
          <GitBranch size={18} />
          <span>Branche</span>
          <strong>{snapshot.gitStatus.branch ?? "Non detectee"}</strong>
        </div>
        <div className="git-summary-card">
          <FileSearch size={18} />
          <span>Etat</span>
          <strong>{snapshot.gitStatus.available ? "Disponible" : "Indisponible"}</strong>
        </div>
        <div className="git-summary-card">
          <CircleDot size={18} />
          <span>Changements</span>
          <strong>{snapshot.gitStatus.files.length}</strong>
        </div>
      </div>

      <div className="git-message">
        <strong>{snapshot.gitStatus.message}</strong>
        <span>Lecture seule pour la V1 actuelle.</span>
      </div>

      <div className="panel-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={gitQuery}
            onChange={(event) => setGitQuery(event.target.value)}
            placeholder="Filtrer les fichiers"
            type="search"
          />
        </label>
        <span className="count-chip">{filteredFiles.length} fichiers</span>
      </div>

      <section className="git-file-list" aria-label="Fichiers Git">
        {filteredFiles.length > 0 ? (
          filteredFiles.map((file) => (
            <div className="git-file-row" key={`${file.status}-${file.path}`}>
              <span>{file.status || "?"}</span>
              <code>{file.path}</code>
            </div>
          ))
        ) : (
          <div className="empty-state compact">
            <CheckCircle2 size={28} />
            <span>Aucun fichier a afficher</span>
          </div>
        )}
      </section>
    </section>
  );
}

interface ProblemsViewProps {
  exportingAssetId: string | null;
  onExportAsset: (assetId: string) => void;
  onOpenAsset: (assetId?: string) => void;
  snapshot: ProjectSnapshot;
}

function ProblemsView({ exportingAssetId, onExportAsset, onOpenAsset, snapshot }: ProblemsViewProps) {
  const [problemQuery, setProblemQuery] = useState("");
  const [selectedProblemId, setSelectedProblemId] = useState(snapshot.problems[0]?.id ?? "");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const assetsById = useMemo(() => {
    return new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  }, [snapshot.assets]);

  const filteredProblems = useMemo(() => {
    const normalizedQuery = problemQuery.trim().toLowerCase();

    return snapshot.problems.filter((problem) => {
      const asset = problem.assetId ? assetsById.get(problem.assetId) : undefined;
      const matchesSeverity = severityFilter === "all" || problem.severity === severityFilter;
      const matchesSource = sourceFilter === "all" || problem.source === sourceFilter;
      const searchable = [
        problem.title,
        problem.detail,
        problem.severity,
        problem.source,
        asset?.displayName,
        asset?.type,
        asset?.status
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesSeverity && matchesSource && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [assetsById, problemQuery, severityFilter, snapshot.problems, sourceFilter]);

  const selectedProblem =
    filteredProblems.find((problem) => problem.id === selectedProblemId) ?? filteredProblems[0];
  const selectedAsset = selectedProblem?.assetId ? assetsById.get(selectedProblem.assetId) : undefined;

  return (
    <section className="problems-page" aria-label="Problems">
      <div className="problem-summary-grid">
        <ProblemSummaryCard label="Critiques" severity="critical" snapshot={snapshot} />
        <ProblemSummaryCard label="Erreurs" severity="error" snapshot={snapshot} />
        <ProblemSummaryCard label="Warnings" severity="warning" snapshot={snapshot} />
        <ProblemSummaryCard label="Infos" severity="info" snapshot={snapshot} />
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

        <SegmentedControl
          ariaLabel="Filtrer par source"
          options={sourceFilters}
          value={sourceFilter}
          onChange={setSourceFilter}
        />
      </div>

      <div className="problem-layout">
        <section className="problem-table" aria-label="Liste des problems">
          {filteredProblems.length > 0 ? (
            filteredProblems.map((problem) => {
              const asset = problem.assetId ? assetsById.get(problem.assetId) : undefined;

              return (
                <button
                  className={`problem-table-row ${problem.severity} ${
                    problem.id === selectedProblem?.id ? "selected" : ""
                  }`}
                  key={problem.id}
                  onClick={() => setSelectedProblemId(problem.id)}
                  type="button"
                >
                  <span className={`severity-dot ${problem.severity}`} />
                  <div className="problem-row-main">
                    <strong>{problem.title}</strong>
                    <span>{asset?.displayName ?? "Projet"}</span>
                  </div>
                  <span className="problem-source">{sourceLabel(problem.source)}</span>
                </button>
              );
            })
          ) : (
            <div className="empty-state compact">
              <CheckCircle2 size={28} />
              <span>Aucun probleme avec ces filtres</span>
            </div>
          )}
        </section>

        <ProblemDetail
          asset={selectedAsset}
          isExporting={selectedAsset?.id === exportingAssetId}
          onExportAsset={onExportAsset}
          onOpenAsset={onOpenAsset}
          problem={selectedProblem}
        />
      </div>
    </section>
  );
}

interface ProblemSummaryCardProps {
  label: string;
  severity: BlendUpProblem["severity"];
  snapshot: ProjectSnapshot;
}

function ProblemSummaryCard({ label, severity, snapshot }: ProblemSummaryCardProps) {
  const count = snapshot.problems.filter((problem) => problem.severity === severity).length;

  return (
    <div className={`problem-summary-card ${severity}`}>
      <CircleDot size={17} />
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

interface SegmentedControlProps<TValue extends string> {
  ariaLabel: string;
  onChange: (value: TValue) => void;
  options: Array<{ label: string; value: TValue }>;
  value: TValue;
}

function SegmentedControl<TValue extends string>({
  ariaLabel,
  onChange,
  options,
  value
}: SegmentedControlProps<TValue>) {
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

interface ProblemDetailProps {
  asset?: BlendUpAsset;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  onOpenAsset: (assetId?: string) => void;
  problem?: BlendUpProblem;
}

function ProblemDetail({ asset, isExporting, onExportAsset, onOpenAsset, problem }: ProblemDetailProps) {
  if (!problem) {
    return (
      <aside className="problem-detail-panel empty-state">
        <CheckCircle2 size={32} />
        <span>Aucun probleme a afficher</span>
      </aside>
    );
  }

  return (
    <aside className="problem-detail-panel" aria-label="Detail problem">
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

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface AssetRowProps {
  asset: BlendUpAsset;
  isSelected: boolean;
  onSelect: () => void;
  problemCount: number;
}

function AssetRow({ asset, isSelected, onSelect, problemCount }: AssetRowProps) {
  return (
    <button className={`asset-row ${isSelected ? "selected" : ""}`} onClick={onSelect} type="button">
      <div className="asset-thumbnail">
        <Boxes size={20} />
      </div>
      <div className="asset-row-main">
        <div className="asset-row-title">
          <strong>{asset.displayName}</strong>
          {problemCount > 0 ? <span className="mini-warning">{problemCount}</span> : null}
        </div>
        <div className="asset-row-subtitle">
          <span>{formatAssetType(asset.type)}</span>
          <span>{formatStatus(asset.status)}</span>
        </div>
      </div>
    </button>
  );
}

interface AssetDetailProps {
  asset: BlendUpAsset;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
}

function AssetDetail({ asset, isExporting, onExportAsset, problems }: AssetDetailProps) {
  return (
    <section className="detail-panel" aria-label="Detail asset">
      <div className="detail-header">
        <div className="detail-thumbnail">
          <Boxes size={30} />
        </div>
        <div>
          <span className="eyebrow">{formatAssetType(asset.type)}</span>
          <h2>{asset.displayName}</h2>
        </div>
      </div>

      <div className="status-strip">
        <StatusPill label={formatStatus(asset.status)} tone="blue" />
        <StatusPill label={asset.productionMode} tone="neutral" />
        <StatusPill label={asset.export.autoExport ? "Auto-export" : "Manual"} tone="green" />
        <StatusPill label={`Export: ${formatExportStatus(asset.export.lastExportStatus)}`} tone="neutral" />
        <StatusPill label={asset.unity.importStatus.replace("_", " ")} tone="orange" />
      </div>

      <div className="asset-action-bar">
        <button disabled={isExporting} onClick={() => onExportAsset(asset.id)} type="button">
          {isExporting ? "Export en cours" : "Exporter FBX"}
        </button>
        <span>
          {asset.export.lastExportAt
            ? `Dernier export: ${asset.export.lastExportAt}`
            : "Aucun export enregistre"}
        </span>
      </div>

      <div className="detail-sections">
        <section className="section-block">
          <h3>Fichiers</h3>
          <PathLine label="Blender" value={asset.paths.blenderSource} />
          <PathLine label="FBX" value={asset.paths.fbxExport} />
          <PathLine label="Prefab" value={asset.paths.unityPrefab} />
        </section>

        <section className="section-block">
          <h3>Equipe</h3>
          <div className="owner-grid">
            <Owner label="Artiste" value={asset.owners.artist} />
            <Owner label="Dev" value={asset.owners.developer} />
            <Owner label="Review" value={asset.owners.reviewer} />
          </div>
        </section>

        <section className="section-block">
          <h3>Unity</h3>
          <div className="component-list">
            {asset.unity.expectedComponents.map((component) => (
              <div className="component-row" key={component.name}>
                <CheckCircle2 size={16} />
                <span>{component.name}</span>
                <small>{component.requirement}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="section-block">
          <h3>Notes</h3>
          <div className="notes-grid">
            <p>{asset.notes.artist}</p>
            <p>{asset.notes.developer}</p>
          </div>
        </section>

        <section className="section-block">
          <h3>Problems</h3>
          <div className="problem-list">
            {problems.length > 0 ? (
              problems.map((problem) => (
                <div className={`problem-row ${problem.severity}`} key={problem.id}>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>{problem.title}</strong>
                    <span>
                      {severityLabel(problem.severity)} - {problem.detail}
                    </span>
                  </div>
                  {problem.actionLabel ? (
                    <ProblemActionButton
                      asset={asset}
                      isExporting={isExporting}
                      onExportAsset={onExportAsset}
                      problem={problem}
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <div className="empty-state compact">
                <CheckCircle2 size={24} />
                <span>Aucun probleme pour cet asset</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function ProblemActionButton({
  asset,
  isExporting,
  onExportAsset,
  problem
}: {
  asset?: BlendUpAsset;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problem: BlendUpProblem;
}) {
  const canExport = problem.actionLabel === "Exporter" && Boolean(asset);

  return (
    <button
      disabled={!canExport || isExporting}
      onClick={() => {
        if (asset && canExport) {
          onExportAsset(asset.id);
        }
      }}
      title={canExport ? "Exporter l'asset en FBX" : "Action pas encore disponible"}
      type="button"
    >
      {isExporting && canExport ? "Export" : problem.actionLabel}
    </button>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "blue" | "green" | "neutral" | "orange" }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function PathLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="path-line">
      <span>{label}</span>
      <code>{value ?? "Non defini"}</code>
    </div>
  );
}

function Owner({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="owner-card">
      <UserRound size={16} />
      <span>{label}</span>
      <strong>{value ?? "Non assigne"}</strong>
    </div>
  );
}

function sourceLabel(source: BlendUpProblem["source"]): string {
  const labels: Record<BlendUpProblem["source"], string> = {
    blendup: "BlendUp",
    blender: "Blender",
    unity: "Unity",
    git: "Git"
  };

  return labels[source];
}

function viewTitle(view: ActiveView): string {
  const labels: Record<ActiveView, string> = {
    assets: "Assets",
    git: "Git",
    problems: "Problems",
    tasks: "Tasks"
  };

  return labels[view];
}

export default App;
