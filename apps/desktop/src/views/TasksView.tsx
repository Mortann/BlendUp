import { Boxes, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { BlendUpAsset, BlendUpTask, ProjectSnapshot, TaskPriority, TaskStatus } from "../blendup/types";
import { EmptyState, StatusPill } from "../app/ui";
import { formatTaskPriority, formatTaskStatus } from "../ui/format";

type BoardTask = BlendUpTask & {
  subtasks: { id: string; label: string; done: boolean }[];
};

const columns: { label: string; status: TaskStatus }[] = [
  { label: "A faire", status: "todo" },
  { label: "En cours", status: "in_progress" },
  { label: "Review", status: "review" },
  { label: "Termine", status: "done" },
  { label: "Bloque", status: "blocked" }
];

const priorities: TaskPriority[] = ["low", "medium", "high", "critical"];

export function TasksView({
  onOpenAsset,
  snapshot
}: {
  onOpenAsset: (assetId?: string) => void;
  snapshot: ProjectSnapshot;
}) {
  const [taskQuery, setTaskQuery] = useState("");
  const [tasks, setTasks] = useState<BoardTask[]>(() => snapshot.tasks.map(toBoardTask));
  const [selectedTaskId, setSelectedTaskId] = useState(snapshot.tasks[0]?.id ?? "");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftOwner, setDraftOwner] = useState("");
  const assetsById = useMemo(() => new Map(snapshot.assets.map((asset) => [asset.id, asset])), [snapshot.assets]);
  const people = useMemo(() => {
    return Array.from(new Set(tasks.map((task) => task.owner).filter(Boolean) as string[]));
  }, [tasks]);
  const filteredTasks = useMemo(() => {
    const normalizedQuery = taskQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return tasks;
    }

    return tasks.filter((task) => {
      const linkedAssetNames = task.assetIds
        .map((assetId) => assetsById.get(assetId)?.displayName)
        .filter(Boolean)
        .join(" ");
      const searchable = [task.title, task.description, task.status, task.priority, task.owner, linkedAssetNames]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [assetsById, taskQuery, tasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);

  const addTask = () => {
    const title = draftTitle.trim();

    if (!title) {
      return;
    }

    const now = new Date().toISOString();
    const task: BoardTask = {
      schemaVersion: 1,
      kind: "task",
      id: `task_${Date.now().toString(36)}`,
      title,
      status: "todo",
      priority: "medium",
      owner: draftOwner.trim() || null,
      assetIds: [],
      description: "",
      createdAt: now,
      updatedAt: now,
      subtasks: []
    };

    setTasks((current) => [task, ...current]);
    setSelectedTaskId(task.id);
    setDraftTitle("");
  };

  return (
    <section className="tasks-page role-page" aria-label="Taches">
      <div className="tasks-header">
        <div>
          <span className="eyebrow">Production</span>
          <h2>Tableau des taches</h2>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            value={taskQuery}
            onChange={(event) => setTaskQuery(event.target.value)}
            placeholder="Rechercher une tache"
            type="search"
          />
        </label>
      </div>

      <div className="task-create-bar">
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              addTask();
            }
          }}
          placeholder="Nouvelle tache"
        />
        <input value={draftOwner} onChange={(event) => setDraftOwner(event.target.value)} placeholder="Assignee" />
        <button onClick={addTask} type="button">
          <Plus size={16} />
          Ajouter
        </button>
      </div>

      <div className="kanban-layout">
        <section className="kanban-board" aria-label="Colonnes de taches">
          {columns.map((column) => {
            const columnTasks = filteredTasks.filter((task) => task.status === column.status);

            return (
              <div className={`kanban-column ${column.status}`} key={column.status}>
                <div className="kanban-column-header">
                  <strong>{column.label}</strong>
                  <span>{columnTasks.length}</span>
                </div>
                <div className="kanban-card-list">
                  {columnTasks.length > 0 ? (
                    columnTasks.map((task) => (
                      <TaskCard
                        assetsById={assetsById}
                        key={task.id}
                        onDelete={() => {
                          setTasks((current) => current.filter((item) => item.id !== task.id));
                          if (selectedTaskId === task.id) {
                            setSelectedTaskId("");
                          }
                        }}
                        onMove={(direction) => {
                          setTasks((current) =>
                            current.map((item) =>
                              item.id === task.id ? { ...item, status: nextStatus(item.status, direction) } : item
                            )
                          );
                        }}
                        onSelect={() => setSelectedTaskId(task.id)}
                        selected={task.id === selectedTaskId}
                        task={task}
                      />
                    ))
                  ) : (
                    <EmptyState icon={<CheckCircle2 size={22} />} label="Vide" />
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <TaskEditor
          assetsById={assetsById}
          onOpenAsset={onOpenAsset}
          onUpdateTask={(nextTask) => {
            setTasks((current) => current.map((task) => (task.id === nextTask.id ? nextTask : task)));
          }}
          people={people}
          task={selectedTask}
        />
      </div>
    </section>
  );
}

function TaskCard({
  assetsById,
  onDelete,
  onMove,
  onSelect,
  selected,
  task
}: {
  assetsById: Map<string, BlendUpAsset>;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onSelect: () => void;
  selected: boolean;
  task: BoardTask;
}) {
  const doneSubtasks = task.subtasks.filter((subtask) => subtask.done).length;

  return (
    <article className={`kanban-card ${task.priority} ${selected ? "selected" : ""}`}>
      <button className="kanban-card-main" onClick={onSelect} type="button">
        <div className="task-card-topline">
          <StatusPill label={formatTaskPriority(task.priority)} tone={task.priority === "critical" ? "orange" : "blue"} />
          {task.owner ? <span>{task.owner}</span> : null}
        </div>
        <strong>{task.title}</strong>
        <small>
          {task.assetIds
            .map((assetId) => assetsById.get(assetId)?.displayName ?? assetId)
            .slice(0, 2)
            .join(", ") || "Aucun asset lie"}
        </small>
        {task.subtasks.length > 0 ? <span>{doneSubtasks}/{task.subtasks.length} sous-taches</span> : null}
      </button>
      <div className="kanban-card-actions">
        <button onClick={() => onMove(-1)} title="Deplacer a gauche" type="button">
          <ChevronLeft size={15} />
        </button>
        <button onClick={() => onMove(1)} title="Deplacer a droite" type="button">
          <ChevronRight size={15} />
        </button>
        <button onClick={onDelete} title="Supprimer" type="button">
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function TaskEditor({
  assetsById,
  onOpenAsset,
  onUpdateTask,
  people,
  task
}: {
  assetsById: Map<string, BlendUpAsset>;
  onOpenAsset: (assetId?: string) => void;
  onUpdateTask: (task: BoardTask) => void;
  people: string[];
  task?: BoardTask;
}) {
  if (!task) {
    return (
      <aside className="task-detail-panel empty-state">
        <ClipboardList size={32} />
        <span>Selectionne une tache</span>
      </aside>
    );
  }

  const addSubtask = () => {
    onUpdateTask({
      ...task,
      subtasks: [...task.subtasks, { id: `sub_${Date.now().toString(36)}`, label: "Nouvelle sous-tache", done: false }]
    });
  };

  return (
    <aside className="task-detail-panel task-editor-panel" aria-label="Detail tache">
      <div className="task-detail-heading">
        <span className={`task-priority-dot ${task.priority}`} />
        <div>
          <span className="eyebrow">{formatTaskStatus(task.status)}</span>
          <h2>{task.title}</h2>
        </div>
      </div>

      <label className="settings-field">
        <span>Titre</span>
        <input value={task.title} onChange={(event) => onUpdateTask({ ...task, title: event.target.value })} />
      </label>
      <label className="settings-field">
        <span>Description</span>
        <input
          value={task.description}
          onChange={(event) => onUpdateTask({ ...task, description: event.target.value })}
        />
      </label>
      <div className="task-editor-grid">
        <label className="settings-field">
          <span>Priorite</span>
          <select value={task.priority} onChange={(event) => onUpdateTask({ ...task, priority: event.target.value as TaskPriority })}>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {formatTaskPriority(priority)}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span>Assignee</span>
          <input
            list="team-members"
            value={task.owner ?? ""}
            onChange={(event) => onUpdateTask({ ...task, owner: event.target.value || null })}
          />
          <datalist id="team-members">
            {people.map((person) => (
              <option key={person} value={person} />
            ))}
          </datalist>
        </label>
      </div>

      <section className="subtask-panel">
        <div className="section-heading-row">
          <h3>Sous-taches</h3>
          <button className="compact-action" onClick={addSubtask} type="button">
            <Plus size={15} />
          </button>
        </div>
        {task.subtasks.map((subtask) => (
          <label className="subtask-row" key={subtask.id}>
            <input
              checked={subtask.done}
              onChange={() =>
                onUpdateTask({
                  ...task,
                  subtasks: task.subtasks.map((item) =>
                    item.id === subtask.id ? { ...item, done: !item.done } : item
                  )
                })
              }
              type="checkbox"
            />
            <input
              value={subtask.label}
              onChange={(event) =>
                onUpdateTask({
                  ...task,
                  subtasks: task.subtasks.map((item) =>
                    item.id === subtask.id ? { ...item, label: event.target.value } : item
                  )
                })
              }
            />
          </label>
        ))}
      </section>

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

function toBoardTask(task: BlendUpTask): BoardTask {
  return {
    ...task,
    subtasks: []
  };
}

function nextStatus(status: TaskStatus, direction: -1 | 1): TaskStatus {
  const index = columns.findIndex((column) => column.status === status);
  const nextIndex = Math.min(columns.length - 1, Math.max(0, index + direction));

  return columns[nextIndex]?.status ?? status;
}
