import { OperationBanner } from "./app/ui";
import { useBlendUpController } from "./app/useBlendUpController";
import { WorkspaceShell } from "./app/WorkspaceShell";
import { AssetsView } from "./views/AssetsView";
import { ProblemsView } from "./views/ProblemsView";
import { SettingsView } from "./views/SettingsView";
import { WelcomePage } from "./views/WelcomePage";

function App() {
  const app = useBlendUpController();

  if (app.isBooting) {
    return <main className="loading-screen">Chargement de BlendUp…</main>;
  }

  if (!app.project) {
    return (
      <main className="welcome-shell">
        <WelcomePage
          createEngine={app.createEngine}
          createProjectName={app.createProjectName}
          createProjectRoot={app.createProjectRoot}
          isCreatingProject={app.isCreatingProject}
          isLoadingProject={app.isLoadingProject}
          onCreateProject={app.createProjectFromWelcome}
          onOpenDefaultProject={app.openDefaultProject}
          onOpenProject={app.openProject}
          onSelectCreateProjectDirectory={app.chooseCreateProjectDirectory}
          onSelectProjectDirectory={app.chooseProjectDirectory}
          projectPathInput={app.projectPathInput}
          recentProjects={app.userSettings.recentProjects}
          setCreateEngine={app.setCreateEngine}
          setCreateProjectName={app.setCreateProjectName}
          setCreateProjectRoot={app.setCreateProjectRoot}
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
    >
      {app.activeView === "assets" ? (
        <AssetsView
          exportingAssetIds={app.exportingAssetIds}
          onAddAssetImages={app.handleAddAssetImages}
          onCopyAsset={app.handleCopyAsset}
          onCreateAsset={app.handleCreateAsset}
          onCreateAssetVariant={app.handleCreateAssetVariant}
          onCreateFolder={app.handleCreateFolder}
          onDeleteAsset={app.handleDeleteAsset}
          onDeleteAssetVersion={app.handleDeleteAssetVersion}
          onDeleteFolder={app.handleDeleteFolder}
          onDuplicateAsset={app.handleDuplicateAsset}
          onExportAsset={app.handleExportAsset}
          onExportAssetVersion={app.handleExportAssetVersion}
          onExportAssetVersions={app.handleExportAssetVersions}
          onGenerateAssetLods={app.handleGenerateAssetLods}
          onMoveAsset={app.handleMoveAsset}
          onMoveFolder={app.handleMoveFolder}
          onOpenAsset={app.openAssetInBlender}
          onOpenAssetPath={app.openAssetPathInBlender}
          onOpenPath={app.openContentPath}
          onOrganizeAsset={app.handleOrganizeAsset}
          onRenameAsset={app.handleRenameAsset}
          onRenameFolder={app.handleRenameFolder}
          onSetAssetThumbnail={app.handleSetAssetThumbnail}
          onUpdateAssetMetadata={app.handleUpdateAssetMetadata}
          selectedAssetId={app.selectedAsset?.id ?? null}
          setSelectedAssetId={app.setSelectedAssetId}
          snapshot={app.project}
        />
      ) : app.activeView === "problems" ? (
        <ProblemsView
          exportingAssetIds={app.exportingAssetIds}
          onExportAsset={app.handleExportAsset}
          onOpenAsset={app.revealAsset}
          snapshot={app.project}
        />
      ) : (
        <SettingsView
          blenderDetection={app.blenderDetection}
          blenderPathInput={app.blenderPathInput}
          isDetectingBlender={app.isDetectingBlender}
          onChangeEngine={app.changeProjectEngine}
          onCloseProject={app.forgetLastProject}
          onDetectBlender={app.refreshBlenderDetection}
          onOpenPath={app.openContentPath}
          onSaveSettings={app.saveLocalSettings}
          project={app.project}
          setBlenderPathInput={app.setBlenderPathInput}
          setShowBlenderCommandPrompt={app.setShowBlenderCommandPrompt}
          showBlenderCommandPrompt={app.userSettings.showBlenderCommandPrompt}
        />
      )}
    </WorkspaceShell>
  );
}

export default App;
