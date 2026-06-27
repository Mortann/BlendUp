import { OperationBanner } from "./app/ui";
import { useBlendUpController } from "./app/useBlendUpController";
import { WorkspaceShell } from "./app/WorkspaceShell";
import { AssetsView } from "./views/AssetsView";
import { DashboardView } from "./views/DashboardView";
import { GitView } from "./views/GitView";
import { ProblemsView } from "./views/ProblemsView";
import { ReferencesView } from "./views/ReferencesView";
import { SettingsView } from "./views/SettingsView";
import { TasksView } from "./views/TasksView";
import { WelcomePage } from "./views/WelcomePage";

function App() {
  const app = useBlendUpController();

  if (!app.project) {
    return (
      <main className="welcome-shell">
        <WelcomePage
          createGitignore={app.createGitignore}
          createProjectName={app.createProjectName}
          createProjectRoot={app.createProjectRoot}
          createUnityFolders={app.createUnityFolders}
          isCreateProjectOpen={app.isCreateProjectOpen}
          isCreatingProject={app.isCreatingProject}
          isLoadingProject={app.isLoadingProject}
          onCreateProject={app.createProjectFromWelcome}
          onOpenDefaultProject={app.openDefaultProject}
          onOpenProject={app.openProject}
          onSelectCreateProjectDirectory={app.chooseCreateProjectDirectory}
          onSelectProjectDirectory={app.chooseProjectDirectory}
          onToggleCreateProject={() => app.setIsCreateProjectOpen((current) => !current)}
          projectPathInput={app.projectPathInput}
          recentProjects={app.userSettings.recentProjects}
          setCreateGitignore={app.setCreateGitignore}
          setCreateProjectName={app.setCreateProjectName}
          setCreateProjectRoot={app.setCreateProjectRoot}
          setCreateUnityFolders={app.setCreateUnityFolders}
          setProjectPathInput={app.setProjectPathInput}
        />
        {app.operationMessage ? (
          <OperationBanner message={app.operationMessage} onClose={() => app.setOperationMessage(null)} />
        ) : null}
      </main>
    );
  }

  return (
    <WorkspaceShell
      activeView={app.activeView}
      onCloseMessage={() => app.setOperationMessage(null)}
      operationMessage={app.operationMessage}
      project={app.project}
      role={app.role}
      setActiveView={app.setActiveView}
      setRole={app.setRole}
      shellStyle={app.shellStyle}
    >
      {app.activeView === "dashboard" ? (
        <DashboardView
          onOpenAsset={app.openAsset}
          onOpenAssets={() => app.setActiveView("assets")}
          onOpenGit={() => app.setActiveView("git")}
          onOpenProblems={() => app.setActiveView("problems")}
          onOpenReferences={() => app.setActiveView("references")}
          onOpenTasks={() => app.setActiveView("tasks")}
          role={app.role}
          snapshot={app.project}
        />
      ) : app.activeView === "assets" ? (
        <AssetsView
          capabilities={app.capabilities}
          exportingAssetId={app.exportingAssetId}
          filteredAssets={app.filteredAssets}
          onExportAsset={app.handleExportAsset}
          problems={app.project.problems}
          query={app.query}
          role={app.role}
          selectedAsset={app.selectedAsset}
          selectedProblems={app.selectedProblems}
          setQuery={app.setQuery}
          setSelectedAssetId={app.setSelectedAssetId}
        />
      ) : app.activeView === "references" ? (
        <ReferencesView onOpenAsset={app.openAsset} role={app.role} snapshot={app.project} />
      ) : app.activeView === "problems" ? (
        <ProblemsView
          exportAllowed={app.capabilities.canExport}
          exportingAssetId={app.exportingAssetId}
          onExportAsset={app.handleExportAsset}
          onOpenAsset={app.openAsset}
          snapshot={app.project}
        />
      ) : app.activeView === "tasks" ? (
        <TasksView onOpenAsset={app.openAsset} snapshot={app.project} />
      ) : app.activeView === "settings" ? (
        <SettingsView
          blenderPathInput={app.blenderPathInput}
          isDetectingTools={app.isDetectingTools}
          isLoadingProject={app.isLoadingProject}
          onDetectTools={() => app.refreshToolDetection(false)}
          onForgetLastProject={app.forgetLastProject}
          onOpenDefaultProject={app.openDefaultProject}
          onOpenProject={app.openProject}
          onSaveSettings={app.saveLocalSettings}
          onSelectProjectDirectory={app.chooseProjectDirectory}
          project={app.project}
          projectPathInput={app.projectPathInput}
          pureRefPathInput={app.pureRefPathInput}
          recentProjects={app.userSettings.recentProjects}
          setBlenderPathInput={app.setBlenderPathInput}
          setProjectPathInput={app.setProjectPathInput}
          setPureRefPathInput={app.setPureRefPathInput}
          setUnityPathInput={app.setUnityPathInput}
          toolsSnapshot={app.toolsSnapshot}
          unityPathInput={app.unityPathInput}
        />
      ) : (
        <GitView snapshot={app.project} />
      )}
    </WorkspaceShell>
  );
}

export default App;
