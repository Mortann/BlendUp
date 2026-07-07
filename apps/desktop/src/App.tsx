import { OperationBanner } from "./app/ui";
import { useBlendUpController } from "./app/useBlendUpController";
import { WorkspaceShell } from "./app/WorkspaceShell";
import { AssetsView } from "./views/AssetsView";
import { DashboardView } from "./views/DashboardView";
import { GitView } from "./views/GitView";
import { NomenclatureView } from "./views/NomenclatureView";
import { ProblemsView } from "./views/ProblemsView";
import { ReferencesView } from "./views/ReferencesView";
import { SettingsView } from "./views/SettingsView";
import { TasksView } from "./views/TasksView";
import { TeamView } from "./views/TeamView";
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
      onCloseProject={app.forgetLastProject}
      operationMessage={app.operationMessage}
      project={app.project}
      setActiveView={app.setActiveView}
      shellStyle={app.shellStyle}
    >
      {app.activeView === "dashboard" ? (
        <DashboardView
          onOpenAsset={app.openAsset}
          onOpenAssets={() => app.setActiveView("assets")}
          onOpenProblems={() => app.setActiveView("problems")}
          onOpenReferences={() => app.setActiveView("references")}
          onOpenTasks={() => app.setActiveView("tasks")}
          snapshot={app.project}
        />
      ) : app.activeView === "assets" ? (
        <AssetsView
          capabilities={app.capabilities}
          filteredAssets={app.filteredAssets}
          onChangeAssetStatus={app.changeAssetStatus}
          onRenameAsset={app.handleRenameAsset}
          onMoveAsset={app.handleMoveAsset}
          onMoveFolder={app.handleMoveFolder}
          onDeleteAsset={app.handleDeleteAsset}
          onSetAssetOwners={app.handleSetAssetOwners}
          onUpdateAssetNotes={app.handleUpdateAssetNotes}
          onCreateAsset={app.handleCreateAsset}
          onCreateFolder={app.handleCreateFolder}
          onDeleteFolder={app.handleDeleteFolder}
          onRenameFolder={app.handleRenameFolder}
          onDuplicateAsset={app.handleDuplicateAsset}
          onPasteAsset={app.handlePasteAsset}
          onSetLods={app.handleSetLods}
          onSetVariants={app.handleSetVariants}
          onSaveAssetConfiguration={app.handleSaveAssetConfiguration}
          shortcutBindings={app.shortcutBindings}
          onOpenInBlender={app.openAssetInBlender}
          onOpenContentPath={app.openProjectContentPath}
          problems={app.project.problems}
          selectedAsset={app.selectedAsset}
          selectedProblems={app.selectedProblems}
          showBlenderCommandPrompt={app.userSettings.showBlenderCommandPrompt}
          setShowBlenderCommandPrompt={app.setShowBlenderCommandPrompt}
          setSelectedAssetId={app.setSelectedAssetId}
          snapshot={app.project}
        />
      ) : app.activeView === "references" ? (
        <ReferencesView onOpenAsset={app.openAsset} snapshot={app.project} />
      ) : app.activeView === "nomenclature" ? (
        <NomenclatureView
          onSaveAssetConfiguration={app.handleSaveAssetConfiguration}
          snapshot={app.project}
        />
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
      ) : app.activeView === "team" ? (
        <TeamView project={app.project} />
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
          setShowBlenderCommandPrompt={app.setShowBlenderCommandPrompt}
          setUnityPathInput={app.setUnityPathInput}
          showBlenderCommandPrompt={app.userSettings.showBlenderCommandPrompt}
          shortcutBindings={app.shortcutBindings}
          onUpdateShortcut={app.updateShortcut}
          onResetShortcuts={app.resetShortcuts}
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
