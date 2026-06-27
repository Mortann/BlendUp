import { Boxes, CheckCircle2, ClipboardList, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { BlendUpAsset, BlendUpTask, ProjectSnapshot, TaskStatus } from "../blendup/types";
import { taskPriorityFilters, taskStatusFilters } from "../app/filters";
import type { TaskPriorityFilter, TaskStatusFilter } from "../app/types";
import { EmptyState, SegmentedControl } from "../app/ui";
import { formatTaskPriority, formatTaskStatus } from "../ui/format";

export function TasksView({
  onOpenAsset,
  snapshot
}: {
  onOpenAsset: (assetId?: string) => void;
  snapshot: ProjectSnapshot;
}) {
  const [taskQuery, setTaskQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(snapshot.tasks[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>("all");
  const assetsById = useMemo(() => new Map(snapshot.assets.map((asset) => [asset.id, asset])), [snapshot.assets]);
  const filteredTasks = useMemo(() => {
    const normalizedQuery = taskQuery.trim().toLowerCase();

    return snapshot.tasks.filter((task) => {
      const linkedAssetNames = task.assetIds
        .map((assetId) => assetsById.get(assetId)?.displayName)
        .filter(Boolean)
        .join(" ");
      const searchable = [task.title, task.description, task.status, task.priority, task.owner, linkedAssetNames]
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
    <section className="tasks-page role-page" aria-label="Tasks">
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
        <SegmentedControl ariaLabel="Filtrer par statut" options={taskStatusFilters} value={statusFilter} onChange={setStatusFilter} />
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
            <EmptyState icon={<CheckCircle2 size={28} />} label="Aucune tache avec ces filtres" />
          )}
        </section>

        <TaskDetail assetsById={assetsById} onOpenAsset={onOpenAsset} task={selectedTask} />
      </div>
    </section>
  );
}

function TaskSummaryCard({ label, status, tasks }: { label: string; status: TaskStatus; tasks: BlendUpTask[] }) {
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
          <span className="eyebrow">{formatTaskPriority(task.priority)}</span>
          <h2>{task.title}</h2>
        </div>
      </div>
      <p>{task.description}</p>
      <div className="problem-detail-meta">
        <Detail label="Statut" value={formatTaskStatus(task.status)} />
        <Detail label="Owner" value={task.owner ?? "Non assigne"} />
        <Detail label="Cree" value={task.createdAt} />
        <Detail label="Modifie" value={task.updatedAt} />
      </div>
      <div className="linked-asset-list">
        {task.assetIds.map((assetId) => {
          const asset = assetsById.get(assetId);

          return (
            <button disabled={!asset} key={assetId} onClick={() => onOpenAsset(assetId)} type="button">
              <Boxes size={16} />
              <span>{asset?.displayName ?? assetId}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
