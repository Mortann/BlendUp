import { FileSearch, FolderOpen, Keyboard, RotateCcw, Save, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import type { LocalToolsSnapshot, ProjectSnapshot } from "../blendup/types";
import { ToolStatus } from "../app/ui";
import {
  comboFromEvent,
  formatCombo,
  SHORTCUT_LABELS,
  SHORTCUT_ORDER,
  type ShortcutAction,
  type ShortcutBindings
} from "../app/shortcuts";

export function SettingsView({
  blenderPathInput,
  isDetectingTools,
  isLoadingProject,
  onDetectTools,
  onForgetLastProject,
  onOpenDefaultProject,
  onOpenProject,
  onSaveSettings,
  onSelectProjectDirectory,
  project,
  projectPathInput,
  pureRefPathInput,
  recentProjects,
  setBlenderPathInput,
  setProjectPathInput,
  setPureRefPathInput,
  setShowBlenderCommandPrompt,
  setUnityPathInput,
  showBlenderCommandPrompt,
  shortcutBindings,
  onUpdateShortcut,
  onResetShortcuts,
  toolsSnapshot,
  unityPathInput
}: {
  blenderPathInput: string;
  isDetectingTools: boolean;
  isLoadingProject: boolean;
  onDetectTools: () => void;
  onForgetLastProject: () => void;
  onOpenDefaultProject: () => void;
  onOpenProject: (projectRoot: string) => Promise<boolean>;
  onSaveSettings: () => void;
  onSelectProjectDirectory: () => void;
  project: ProjectSnapshot;
  projectPathInput: string;
  pureRefPathInput: string;
  recentProjects: string[];
  setBlenderPathInput: (blenderPath: string) => void;
  setProjectPathInput: (projectRoot: string) => void;
  setPureRefPathInput: (pureRefPath: string) => void;
  setShowBlenderCommandPrompt: (show: boolean) => void;
  setUnityPathInput: (unityPath: string) => void;
  showBlenderCommandPrompt: boolean;
  shortcutBindings: ShortcutBindings;
  onUpdateShortcut: (action: ShortcutAction, combo: string) => void;
  onResetShortcuts: () => void;
  toolsSnapshot: LocalToolsSnapshot | null;
  unityPathInput: string;
}) {
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!capturing) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }

      const combo = comboFromEvent(event);
      if (combo) {
        onUpdateShortcut(capturing, combo);
        setCapturing(null);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, onUpdateShortcut]);

  return (
    <section className="settings-page role-page" aria-label="Settings">
      <div className="settings-layout">
        <section className="settings-panel">
          <div className="settings-heading">
            <span className="eyebrow">Projet ouvert</span>
            <h2>{project.project.name}</h2>
          </div>
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onOpenProject(projectPathInput);
            }}
          >
            <label className="settings-field">
              <span>Dossier projet</span>
              <input onChange={(event) => setProjectPathInput(event.target.value)} value={projectPathInput} />
            </label>
            <div className="settings-actions">
              <button disabled={isLoadingProject} onClick={onSelectProjectDirectory} type="button">
                <FolderOpen size={16} />
                {isLoadingProject ? "Ouverture" : "Choisir"}
              </button>
              <button className="secondary" disabled={isLoadingProject} type="submit">
                Ouvrir ce chemin
              </button>
              <button className="secondary" onClick={onOpenDefaultProject} type="button">
                <RotateCcw size={16} />
                Projet test
              </button>
              <button className="secondary danger" onClick={onForgetLastProject} type="button">
                Fermer
              </button>
            </div>
          </form>
        </section>

        <section className="settings-panel">
          <div className="settings-heading">
            <span className="eyebrow">Machine</span>
            <h2>Chemins locaux</h2>
          </div>
          <div className="settings-form">
            <label className="settings-field">
              <span>Blender</span>
              <input
                onChange={(event) => setBlenderPathInput(event.target.value)}
                placeholder="Auto ou chemin blender.exe"
                value={blenderPathInput}
              />
            </label>
            <ToolStatus label="Blender" status={toolsSnapshot?.blender} />
            <label className="settings-toggle">
              <input
                checked={showBlenderCommandPrompt}
                onChange={(event) => setShowBlenderCommandPrompt(event.target.checked)}
                type="checkbox"
              />
              <span>Afficher l'invite de commande au lancement de Blender</span>
            </label>
            <label className="settings-field">
              <span>Unity</span>
              <input
                onChange={(event) => setUnityPathInput(event.target.value)}
                placeholder="Chemin Unity Editor"
                value={unityPathInput}
              />
            </label>
            <ToolStatus label="Unity" status={toolsSnapshot?.unity} />
            <label className="settings-field">
              <span>PureRef</span>
              <input
                onChange={(event) => setPureRefPathInput(event.target.value)}
                placeholder="Chemin PureRef"
                value={pureRefPathInput}
              />
            </label>
            <ToolStatus label="PureRef" status={toolsSnapshot?.pureRef} />
            <div className="settings-actions">
              <button className="secondary" disabled={isDetectingTools} onClick={onDetectTools} type="button">
                <Wrench size={16} />
                {isDetectingTools ? "Detection" : "Detecter"}
              </button>
              <button onClick={onSaveSettings} type="button">
                <Save size={16} />
                Enregistrer
              </button>
            </div>
          </div>
        </section>

        <section className="settings-panel wide">
          <div className="settings-heading">
            <span className="eyebrow">Historique</span>
            <h2>Projets recents</h2>
          </div>
          <div className="recent-projects inline">
            {recentProjects.length > 0 ? (
              recentProjects.map((projectRoot) => (
                <button key={projectRoot} onClick={() => void onOpenProject(projectRoot)} type="button">
                  <FolderOpen size={16} />
                  <span>{projectRoot}</span>
                </button>
              ))
            ) : (
              <div className="empty-state compact">
                <FileSearch size={28} />
                <span>Aucun projet recent</span>
              </div>
            )}
          </div>
        </section>

        <section className="settings-panel wide">
          <div className="settings-heading">
            <span className="eyebrow">Raccourcis clavier</span>
            <h2>Personnaliser</h2>
          </div>
          <div className="shortcut-list">
            {SHORTCUT_ORDER.map((action) => (
              <div className="shortcut-row" key={action}>
                <span className="shortcut-label">
                  <Keyboard size={15} />
                  {SHORTCUT_LABELS[action]}
                </span>
                <button
                  className={capturing === action ? "shortcut-combo capturing" : "shortcut-combo"}
                  onClick={() => setCapturing(action)}
                  type="button"
                >
                  {capturing === action ? "Appuyez sur une touche..." : formatCombo(shortcutBindings[action])}
                </button>
              </div>
            ))}
          </div>
          <div className="settings-actions">
            <button className="secondary" onClick={onResetShortcuts} type="button">
              <RotateCcw size={16} />
              Reinitialiser
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
