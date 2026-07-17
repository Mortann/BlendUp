use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const EXPORT_SCRIPT: &str = r#"
import pathlib
import sys
import bpy

def main():
    marker = "--"
    if marker not in sys.argv:
        raise RuntimeError("BlendUp export arguments are missing.")

    args = sys.argv[sys.argv.index(marker) + 1:]
    output_path = pathlib.Path(args[0])
    export_format = args[1]
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if export_format == "glb":
        bpy.ops.export_scene.gltf(
            filepath=str(output_path),
            export_format='GLB',
            use_selection=False,
            export_apply=True,
        )
    elif export_format == "fbx":
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.fbx(
            filepath=str(output_path),
            use_selection=False,
            apply_unit_scale=True,
            bake_space_transform=False,
            object_types={'EMPTY', 'MESH', 'ARMATURE'},
            add_leaf_bones=False,
            mesh_smooth_type='FACE',
        )
    else:
        raise RuntimeError(f"Unsupported export format: {export_format}")

main()
"#;

const CREATE_BLEND_SCRIPT: &str = r#"
import pathlib
import sys
import bpy

marker = "--"
if marker not in sys.argv:
    raise RuntimeError("BlendUp target path is missing.")

target = pathlib.Path(sys.argv[sys.argv.index(marker) + 1])
target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=False)
bpy.ops.wm.save_as_mainfile(filepath=str(target))
"#;

const ASSET_SUPPORT_DIRECTORIES: [&str; 3] = ["textures", "references", "renders"];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPaths {
    art_root: String,
    engine_root: String,
    engine_assets_root: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectConfig {
    schema_version: u32,
    kind: String,
    project_id: String,
    name: String,
    engine: String,
    paths: ProjectPaths,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSnapshot {
    project_root: String,
    project: ProjectConfig,
    asset_folders: Vec<String>,
    assets: Vec<BlendUpAsset>,
    problems: Vec<BlendUpProblem>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlendUpAsset {
    id: String,
    name: String,
    folder: String,
    source_path: String,
    output_path: String,
    format: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_modified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_modified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_error: Option<String>,
    size_bytes: u64,
    metadata: AssetMetadataView,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetMetadataView {
    #[serde(default)]
    notes: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thumbnail_path: Option<String>,
    #[serde(default)]
    variants: Vec<AssetVariant>,
    #[serde(default)]
    lods: Vec<AssetLod>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetMetadata {
    schema_version: u32,
    kind: String,
    id: String,
    source_path: String,
    #[serde(flatten)]
    details: AssetMetadataView,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetVariant {
    id: String,
    name: String,
    status: String,
    #[serde(default)]
    notes: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetLod {
    id: String,
    level: String,
    status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    target_ratio: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    triangle_budget: Option<u64>,
    #[serde(default)]
    notes: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetMutationResult {
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    asset_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenBlendRequest {
    id: String,
    blend_path: String,
    expires_at_ms: u128,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenBlendAcknowledgement {
    id: String,
    opened: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectImageFile {
    path: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BlendUpProblem {
    id: String,
    severity: String,
    source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    asset_id: Option<String>,
    title: String,
    detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    action_label: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserSettings {
    #[serde(default = "settings_schema")]
    schema_version: u32,
    #[serde(default = "settings_kind")]
    kind: String,
    #[serde(default)]
    last_project_root: Option<String>,
    #[serde(default)]
    recent_projects: Vec<String>,
    #[serde(default)]
    blender_path: Option<String>,
    #[serde(default)]
    show_blender_command_prompt: bool,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            schema_version: 2,
            kind: settings_kind(),
            last_project_root: None,
            recent_projects: Vec::new(),
            blender_path: None,
            show_blender_command_prompt: false,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolDetection {
    found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectOptions {
    project_root: String,
    project_name: String,
    engine: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectResult {
    project_root: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProjectEngineResult {
    project: ProjectConfig,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportAssetResult {
    success: bool,
    asset_id: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blender_path: Option<String>,
    log: String,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportState {
    #[serde(default)]
    exports: HashMap<String, ExportRecord>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportRecord {
    success: bool,
    message: String,
    output_path: String,
}

#[tauri::command]
fn read_user_settings() -> Result<UserSettings, String> {
    let path = user_settings_path()?;
    if !path.exists() {
        return Ok(UserSettings::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Impossible de lire {}: {error}", path.display()))?;
    let settings: UserSettings = serde_json::from_str(&content)
        .map_err(|error| format!("Parametres invalides dans {}: {error}", path.display()))?;
    Ok(normalize_user_settings(settings))
}

#[tauri::command]
fn save_user_settings(settings: UserSettings) -> Result<UserSettings, String> {
    let normalized = normalize_user_settings(settings);
    write_json(&user_settings_path()?, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
fn read_default_project_snapshot() -> Result<ProjectSnapshot, String> {
    let repository_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..");
    let candidates = [
        repository_root.join("BlendUp_projet_Test"),
        repository_root.join("BlendUpTest"),
    ];
    let project_root = candidates
        .into_iter()
        .find(|candidate| project_file(candidate).exists())
        .ok_or_else(|| "Projet test introuvable.".to_string())?;

    read_project_snapshot(project_root.to_string_lossy().to_string())
}

#[tauri::command]
fn read_project_snapshot(project_root: String) -> Result<ProjectSnapshot, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    validate_project_paths(&project)?;
    let export_state = read_export_state(&root);
    let assets = scan_assets(&root, &project, &export_state)?;
    let asset_folders = collect_asset_folders(&root, &project)?;
    let problems = collect_problems(&root, &project, &assets);

    Ok(ProjectSnapshot {
        project_root: root.to_string_lossy().to_string(),
        project,
        asset_folders,
        assets,
        problems,
    })
}

#[tauri::command]
fn create_project(options: CreateProjectOptions) -> Result<CreateProjectResult, String> {
    let project_name = options.project_name.trim();
    let root_value = options.project_root.trim();
    let engine = validate_engine(&options.engine)?;

    if project_name.is_empty() {
        return Err("Donne un nom au projet.".to_string());
    }
    if root_value.is_empty() {
        return Err("Choisis le dossier du projet.".to_string());
    }

    let root = PathBuf::from(root_value);
    if root.exists() && !root.is_dir() {
        return Err(format!("{} n'est pas un dossier.", root.display()));
    }
    if project_file(&root).exists() {
        return Err(format!(
            "Un projet BlendUp existe deja dans {}.",
            root.display()
        ));
    }

    let project = new_project_config(project_name, &engine);
    fs::create_dir_all(root.join(&project.paths.art_root))
        .map_err(|error| format!("Impossible de creer le dossier Art: {error}"))?;
    fs::create_dir_all(root.join(&project.paths.engine_assets_root))
        .map_err(|error| format!("Impossible de creer le dossier Assets: {error}"))?;
    write_json(&project_file(&root), &project)?;
    write_json(&export_state_file(&root), &ExportState::default())?;

    Ok(CreateProjectResult {
        project_root: root.to_string_lossy().to_string(),
        message: format!(
            "{project_name} est pret pour {}.",
            engine_display_name(&engine)
        ),
    })
}

#[tauri::command]
fn update_project_engine(
    project_root: String,
    engine: String,
) -> Result<UpdateProjectEngineResult, String> {
    let root = validated_project_root(&project_root)?;
    let engine = validate_engine(&engine)?;
    let mut project = read_project_config(&root)?;

    if project.engine == engine {
        return Ok(UpdateProjectEngineResult {
            project,
            message: "Ce moteur est deja actif.".to_string(),
        });
    }

    let previous_root = project.paths.engine_root.clone();
    project.engine = engine.clone();
    project.paths.engine_root = engine_display_name(&engine).to_string();
    project.paths.engine_assets_root = format!("{}/Assets", project.paths.engine_root);

    fs::create_dir_all(root.join(&project.paths.engine_assets_root))
        .map_err(|error| format!("Impossible de creer la nouvelle destination: {error}"))?;
    write_json(&project_file(&root), &project)?;
    write_json(&export_state_file(&root), &ExportState::default())?;

    Ok(UpdateProjectEngineResult {
        message: format!(
            "Les exports vont maintenant vers {}. Le dossier {} a ete conserve.",
            project.paths.engine_assets_root, previous_root
        ),
        project,
    })
}

#[tauri::command]
fn detect_blender(blender_path: Option<String>) -> ToolDetection {
    match find_blender_executable(blender_path.as_deref()) {
        Some(path) => ToolDetection {
            found: true,
            message: "Blender est pret pour les exports.".to_string(),
            path: Some(path.to_string_lossy().to_string()),
        },
        None => ToolDetection {
            found: false,
            path: None,
            message: "Renseigne blender.exe ou installe Blender dans un emplacement standard."
                .to_string(),
        },
    }
}

#[tauri::command]
fn export_asset(
    project_root: String,
    asset_id: String,
    blender_path: Option<String>,
) -> Result<ExportAssetResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let mut export_state = read_export_state(&root);
    let assets = scan_assets(&root, &project, &export_state)?;
    let asset = assets
        .into_iter()
        .find(|candidate| candidate.id == asset_id)
        .ok_or_else(|| "Cet asset n'existe plus dans Art.".to_string())?;

    let source = root.join(Path::new(&asset.source_path));
    let output_path = root.join(Path::new(&asset.output_path));
    let output_display = output_path.to_string_lossy().to_string();
    let Some(blender_executable) = find_blender_executable(blender_path.as_deref()) else {
        let log = "Blender est introuvable. Configure son chemin dans Parametres.".to_string();
        record_export(&root, &mut export_state, &asset, false, &log)?;
        return Ok(ExportAssetResult {
            success: false,
            asset_id,
            message: "Blender n'a pas ete trouve.".to_string(),
            output_path: Some(output_display),
            blender_path: None,
            log,
        });
    };

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }

    let temp_dir = root.join(".blendup").join("temp");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Impossible de creer {}: {error}", temp_dir.display()))?;
    let script_path = temp_dir.join("export_asset.py");
    fs::write(&script_path, EXPORT_SCRIPT)
        .map_err(|error| format!("Impossible de preparer l'export Blender: {error}"))?;

    let process_output = Command::new(&blender_executable)
        .arg("--background")
        .arg(&source)
        .arg("--python")
        .arg(&script_path)
        .arg("--")
        .arg(&output_path)
        .arg(&asset.format)
        .output();

    let blender_display = blender_executable.to_string_lossy().to_string();
    let output = match process_output {
        Ok(output) => output,
        Err(error) => {
            let log = format!("Impossible de lancer Blender depuis {blender_display}: {error}");
            record_export(&root, &mut export_state, &asset, false, &log)?;
            return Ok(ExportAssetResult {
                success: false,
                asset_id,
                message: format!("L'export de {} a echoue.", asset.name),
                output_path: Some(output_display),
                blender_path: Some(blender_display),
                log,
            });
        }
    };

    let log = command_log(&output.stdout, &output.stderr);
    let success = output.status.success() && output_path.is_file();
    record_export(&root, &mut export_state, &asset, success, &log)?;

    Ok(ExportAssetResult {
        success,
        asset_id,
        message: if success {
            format!(
                "{} a ete exporte en {}.",
                asset.name,
                asset.format.to_uppercase()
            )
        } else {
            format!("L'export de {} a echoue.", asset.name)
        },
        output_path: Some(output_display),
        blender_path: Some(blender_display),
        log,
    })
}

#[tauri::command]
fn open_project_path(project_root: String, relative_path: String) -> Result<(), String> {
    let root = validated_project_root(&project_root)?;
    let relative = safe_relative_path(&relative_path)?;
    let target = root.join(relative);
    if !target.exists() {
        return Err(format!("{} n'existe pas.", target.display()));
    }
    open_with_system(&target)
}

#[tauri::command]
fn open_blend_file(
    project_root: String,
    relative_path: String,
    blender_path: Option<String>,
    show_command_prompt: bool,
) -> Result<(), String> {
    let root = validated_project_root(&project_root)?;
    let target = root.join(safe_relative_path(&relative_path)?);
    if !target.is_file() {
        return Err(format!("Fichier Blender introuvable: {}", target.display()));
    }

    if request_open_in_running_blender(&root, &target).unwrap_or(false) {
        return Ok(());
    }

    let blender = find_blender_executable(blender_path.as_deref()).ok_or_else(|| {
        "Blender est introuvable. Configure son chemin dans Parametres.".to_string()
    })?;
    let mut command = Command::new(&blender);
    command.arg(&target);
    apply_command_window_preference(&mut command, show_command_prompt);
    command
        .spawn()
        .map_err(|error| format!("Impossible de lancer {}: {error}", blender.display()))?;
    Ok(())
}

fn request_open_in_running_blender(root: &Path, target: &Path) -> Result<bool, String> {
    let bridge = root.join(".blendup").join("blender-bridge");
    let request_file = bridge.join("open-request.json");
    let acknowledgement_file = bridge.join("open-ack.json");
    let now = unix_time_ms();
    let request = OpenBlendRequest {
        id: format!("open_{}_{}", std::process::id(), now),
        blend_path: relative_string(root, target)?,
        expires_at_ms: now + 1_300,
    };
    write_json(&request_file, &request)?;

    for _ in 0..16 {
        thread::sleep(Duration::from_millis(80));
        let acknowledgement = fs::read_to_string(&acknowledgement_file)
            .ok()
            .and_then(|content| serde_json::from_str::<OpenBlendAcknowledgement>(&content).ok());
        if acknowledgement
            .as_ref()
            .is_some_and(|value| value.id == request.id && value.opened)
        {
            return Ok(true);
        }
    }

    let is_current_request = fs::read_to_string(&request_file)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .and_then(|value| value.get("id").and_then(Value::as_str).map(str::to_string))
        .is_some_and(|id| id == request.id);
    if is_current_request {
        let _ = fs::remove_file(request_file);
    }
    Ok(false)
}

fn unix_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[tauri::command]
fn read_project_file_data_url(
    project_root: String,
    relative_path: String,
) -> Result<String, String> {
    let root = validated_project_root(&project_root)?;
    let target = root.join(safe_relative_path(&relative_path)?);
    if !target.is_file() {
        return Err(format!("Fichier introuvable: {}", target.display()));
    }
    let bytes = fs::read(&target)
        .map_err(|error| format!("Impossible de lire {}: {error}", target.display()))?;
    let mime = file_mime(&target);
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn list_project_images(
    project_root: String,
    relative_dir: String,
) -> Result<Vec<ProjectImageFile>, String> {
    let root = validated_project_root(&project_root)?;
    let directory = root.join(safe_relative_path(&relative_dir)?);
    if !directory.is_dir() {
        return Ok(Vec::new());
    }

    fn visit(
        root: &Path,
        directory: &Path,
        depth: usize,
        images: &mut Vec<ProjectImageFile>,
    ) -> Result<(), String> {
        if depth > 3 {
            return Ok(());
        }
        for entry in fs::read_dir(directory)
            .map_err(|error| format!("Impossible de lire {}: {error}", directory.display()))?
        {
            let entry = entry.map_err(|error| format!("Image illisible: {error}"))?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Type de fichier illisible: {error}"))?;
            if file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            if file_type.is_dir() {
                visit(root, &path, depth + 1, images)?;
            } else if is_image_file(&path) {
                images.push(ProjectImageFile {
                    path: relative_string(root, &path)?,
                    name: path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("Image")
                        .to_string(),
                    modified_at: modified_time(&path).map(time_label),
                });
            }
        }
        Ok(())
    }

    let mut images = Vec::new();
    visit(&root, &directory, 0, &mut images)?;
    images.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(images)
}

#[tauri::command]
fn create_folder(
    project_root: String,
    parent_dir: String,
    name: String,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    validate_item_name(&name)?;
    let parent = validated_art_directory(&root, &project, &parent_dir, true)?;
    let target = parent.join(name.trim());
    if target.exists() {
        return Err(format!("{} existe deja.", target.display()));
    }
    fs::create_dir_all(&target)
        .map_err(|error| format!("Impossible de creer {}: {error}", target.display()))?;
    Ok(AssetMutationResult {
        message: format!("Le dossier {} a ete cree.", name.trim()),
        asset_id: None,
    })
}

#[tauri::command]
fn create_asset(
    project_root: String,
    parent_dir: String,
    name: String,
    blender_path: Option<String>,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    validate_item_name(&name)?;
    let parent = validated_art_directory(&root, &project, &parent_dir, true)?;
    let asset_directory = parent.join(name.trim());
    let target = asset_directory.join(format!("{}.blend", name.trim()));
    if asset_directory.exists() {
        return Err(format!("{} existe deja.", asset_directory.display()));
    }
    let blender = find_blender_executable(blender_path.as_deref()).ok_or_else(|| {
        "Blender est introuvable. Configure son chemin dans Parametres.".to_string()
    })?;
    prepare_asset_directories(&asset_directory)?;
    let temp_dir = root.join(".blendup").join("temp");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Impossible de preparer la creation: {error}"))?;
    let script = temp_dir.join("create_asset.py");
    fs::write(&script, CREATE_BLEND_SCRIPT)
        .map_err(|error| format!("Impossible de preparer Blender: {error}"))?;
    let output = Command::new(&blender)
        .arg("--background")
        .arg("--python")
        .arg(&script)
        .arg("--")
        .arg(&target)
        .output()
        .map_err(|error| format!("Impossible de lancer Blender: {error}"))?;
    if !output.status.success() || !target.is_file() {
        let _ = fs::remove_dir_all(&asset_directory);
        return Err(format!(
            "Blender n'a pas cree l'asset. {}",
            command_log(&output.stdout, &output.stderr)
        ));
    }

    let source_path = relative_string(&root, &target)?;
    let id = asset_id_for_path(&source_path);
    write_asset_metadata(
        &root,
        &AssetMetadata {
            schema_version: 2,
            kind: "asset_metadata".to_string(),
            id: id.clone(),
            source_path,
            details: AssetMetadataView::default(),
        },
    )?;
    Ok(AssetMutationResult {
        message: format!("L'asset {} a ete cree.", name.trim()),
        asset_id: Some(id),
    })
}

#[tauri::command]
fn organize_asset(project_root: String, asset_id: String) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let source = root.join(&asset.source_path);

    if asset_owns_workspace(&root, &project, &asset) {
        prepare_asset_directories(
            source
                .parent()
                .ok_or_else(|| "Dossier source invalide.".to_string())?,
        )?;
        return Ok(AssetMutationResult {
            message: format!("Le dossier de {} est deja pret.", asset.name),
            asset_id: Some(asset.id),
        });
    }

    let parent = source
        .parent()
        .ok_or_else(|| "Dossier source invalide.".to_string())?
        .to_path_buf();
    let workspace = parent.join(&asset.name);
    if workspace.exists() {
        return Err(format!("{} existe deja.", workspace.display()));
    }
    let direct_blend_count = fs::read_dir(&parent)
        .map_err(|error| format!("Impossible de lire {}: {error}", parent.display()))?
        .flatten()
        .filter(|entry| {
            entry.path().is_file()
                && entry
                    .path()
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("blend"))
        })
        .count();

    write_asset_metadata(&root, &metadata_for_asset(&root, &asset))?;
    relocate_asset(
        &root,
        &project,
        &asset,
        &workspace.join(format!("{}.blend", asset.name)),
    )?;

    if direct_blend_count == 1 {
        for directory_name in ASSET_SUPPORT_DIRECTORIES {
            let existing = parent.join(directory_name);
            let destination = workspace.join(directory_name);
            if existing.is_dir() && !destination.exists() {
                fs::rename(&existing, &destination).map_err(|error| {
                    format!("Impossible de ranger {}: {error}", existing.display())
                })?;
            }
        }
    }
    prepare_asset_directories(&workspace)?;

    Ok(AssetMutationResult {
        message: format!(
            "{} et ses fichiers sont maintenant ranges ensemble.",
            asset.name
        ),
        asset_id: Some(asset.id),
    })
}

#[tauri::command]
fn rename_asset(
    project_root: String,
    asset_id: String,
    new_name: String,
) -> Result<AssetMutationResult, String> {
    validate_item_name(&new_name)?;
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let source = root.join(&asset.source_path);
    if asset_owns_workspace(&root, &project, &asset) {
        let source_directory = source
            .parent()
            .ok_or_else(|| "Dossier source invalide.".to_string())?;
        let target_directory = source_directory
            .parent()
            .ok_or_else(|| "Dossier parent invalide.".to_string())?
            .join(new_name.trim());
        write_asset_metadata(&root, &metadata_for_asset(&root, &asset))?;
        relocate_folder(&root, &project, source_directory, &target_directory)?;
        let moved = find_asset(&root, &project, &asset.id)?;
        relocate_asset(
            &root,
            &project,
            &moved,
            &target_directory.join(format!("{}.blend", new_name.trim())),
        )?;
    } else {
        let target = source
            .parent()
            .ok_or_else(|| "Dossier source invalide.".to_string())?
            .join(format!("{}.blend", new_name.trim()));
        relocate_asset(&root, &project, &asset, &target)?;
    }
    Ok(AssetMutationResult {
        message: format!("L'asset s'appelle maintenant {}.", new_name.trim()),
        asset_id: Some(asset.id),
    })
}

#[tauri::command]
fn move_asset(
    project_root: String,
    asset_id: String,
    target_dir: String,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let target_directory = validated_art_directory(&root, &project, &target_dir, true)?;
    relocate_asset_to_directory(&root, &project, &asset, &target_directory)?;
    Ok(AssetMutationResult {
        message: format!("{} a ete deplace.", asset.name),
        asset_id: Some(asset.id),
    })
}

#[tauri::command]
fn duplicate_asset(project_root: String, asset_id: String) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let source = root.join(&asset.source_path);
    let source_parent = source
        .parent()
        .ok_or_else(|| "Dossier source invalide.".to_string())?;
    let parent = if asset_owns_workspace(&root, &project, &asset) {
        source_parent
            .parent()
            .ok_or_else(|| "Dossier parent invalide.".to_string())?
            .to_path_buf()
    } else {
        source_parent.to_path_buf()
    };
    copy_asset_into(&root, &project, &asset, &parent)
}

#[tauri::command]
fn copy_asset(
    project_root: String,
    asset_id: String,
    target_dir: String,
    move_asset_file: bool,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let target = validated_art_directory(&root, &project, &target_dir, true)?;
    if move_asset_file {
        relocate_asset_to_directory(&root, &project, &asset, &target)?;
        Ok(AssetMutationResult {
            message: format!("{} a ete deplace.", asset.name),
            asset_id: Some(asset.id),
        })
    } else {
        copy_asset_into(&root, &project, &asset, &target)
    }
}

#[tauri::command]
fn delete_asset(project_root: String, asset_id: String) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let owns_workspace = asset_owns_workspace(&root, &project, &asset);
    let source = root.join(&asset.source_path);
    let source_target = if owns_workspace {
        source
            .parent()
            .ok_or_else(|| "Dossier source invalide.".to_string())?
    } else {
        source.as_path()
    };
    trash_path(source_target)?;
    let output = root.join(&asset.output_path);
    if output.exists() {
        let output_target = if owns_workspace {
            output.parent().unwrap_or(output.as_path())
        } else {
            output.as_path()
        };
        trash_path(output_target)?;
    }
    let metadata = asset_metadata_file(&root, &asset.id);
    if metadata.exists() {
        trash_path(&metadata)?;
    }
    let mut state = read_export_state(&root);
    state.exports.remove(&asset.id);
    write_json(&export_state_file(&root), &state)?;
    Ok(AssetMutationResult {
        message: format!("{} a ete place dans la corbeille.", asset.name),
        asset_id: None,
    })
}

#[tauri::command]
fn rename_folder(
    project_root: String,
    folder: String,
    new_name: String,
) -> Result<AssetMutationResult, String> {
    validate_item_name(&new_name)?;
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let source = validated_art_directory(&root, &project, &folder, false)?;
    let target = source
        .parent()
        .ok_or_else(|| "Dossier parent invalide.".to_string())?
        .join(new_name.trim());
    relocate_folder(&root, &project, &source, &target)?;
    Ok(AssetMutationResult {
        message: format!("Le dossier s'appelle maintenant {}.", new_name.trim()),
        asset_id: None,
    })
}

#[tauri::command]
fn move_folder(
    project_root: String,
    folder: String,
    target_dir: String,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let source = validated_art_directory(&root, &project, &folder, false)?;
    let target_parent = validated_art_directory(&root, &project, &target_dir, true)?;
    let target = target_parent.join(
        source
            .file_name()
            .ok_or_else(|| "Nom de dossier invalide.".to_string())?,
    );
    relocate_folder(&root, &project, &source, &target)?;
    Ok(AssetMutationResult {
        message: "Le dossier a ete deplace.".to_string(),
        asset_id: None,
    })
}

#[tauri::command]
fn delete_folder(project_root: String, folder: String) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let directory = validated_art_directory(&root, &project, &folder, false)?;
    let folder_rel = relative_string(&root, &directory)?;
    let assets = scan_assets(&root, &project, &read_export_state(&root))?;
    trash_path(&directory)?;
    let output_folder = output_folder_for_art_path(&root, &project, Path::new(&folder_rel))?;
    if output_folder.exists() {
        trash_path(&output_folder)?;
    }
    let mut state = read_export_state(&root);
    for asset in assets
        .iter()
        .filter(|asset| path_is_inside(&asset.source_path, &folder_rel))
    {
        let metadata = asset_metadata_file(&root, &asset.id);
        if metadata.exists() {
            trash_path(&metadata)?;
        }
        state.exports.remove(&asset.id);
    }
    write_json(&export_state_file(&root), &state)?;
    Ok(AssetMutationResult {
        message: "Le dossier a ete place dans la corbeille.".to_string(),
        asset_id: None,
    })
}

#[tauri::command]
fn update_asset_metadata(
    project_root: String,
    asset_id: String,
    notes: String,
    tags: Vec<String>,
    variants: Vec<AssetVariant>,
    lods: Vec<AssetLod>,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let mut metadata = metadata_for_asset(&root, &asset);
    metadata.details.notes = notes.trim().to_string();
    metadata.details.tags = normalize_tags(tags);
    metadata.details.variants = variants
        .into_iter()
        .filter(|item| !item.name.trim().is_empty())
        .map(|mut item| {
            item.name = item.name.trim().to_string();
            item.status = normalize_item_status(&item.status);
            item
        })
        .collect();
    metadata.details.lods = lods
        .into_iter()
        .filter(|item| !item.level.trim().is_empty())
        .map(|mut item| {
            item.level = item.level.trim().to_string();
            item.status = normalize_item_status(&item.status);
            item
        })
        .collect();
    write_asset_metadata(&root, &metadata)?;
    Ok(AssetMutationResult {
        message: "Les informations de l'asset ont ete enregistrees.".to_string(),
        asset_id: Some(asset.id),
    })
}

#[tauri::command]
fn set_asset_thumbnail(
    project_root: String,
    asset_id: String,
    source_path: String,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let source = PathBuf::from(source_path);
    if !source.is_file() || !is_image_file(&source) {
        return Err("Choisis une image valide.".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png");
    let destination = root
        .join(".blendup")
        .join("previews")
        .join(&asset.id)
        .join(format!("thumbnail.{extension}"));
    copy_file(&source, &destination)?;
    let mut metadata = metadata_for_asset(&root, &asset);
    metadata.details.thumbnail_path = Some(relative_string(&root, &destination)?);
    write_asset_metadata(&root, &metadata)?;
    Ok(AssetMutationResult {
        message: "La miniature a ete mise a jour.".to_string(),
        asset_id: Some(asset.id),
    })
}

#[tauri::command]
fn add_asset_images(
    project_root: String,
    asset_id: String,
    kind: String,
    source_paths: Vec<String>,
) -> Result<AssetMutationResult, String> {
    if kind != "renders" && kind != "textures" {
        return Err("Le type d'image est invalide.".to_string());
    }
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let destination = root
        .join(&asset.source_path)
        .parent()
        .ok_or_else(|| "Dossier asset invalide.".to_string())?
        .join(&kind);
    fs::create_dir_all(&destination)
        .map_err(|error| format!("Impossible de creer {}: {error}", destination.display()))?;
    let mut copied = 0;
    for value in source_paths {
        let source = PathBuf::from(value);
        if !source.is_file() || !is_image_file(&source) {
            continue;
        }
        let file_name = source
            .file_name()
            .ok_or_else(|| "Nom d'image invalide.".to_string())?;
        let target = unique_file_path(&destination.join(file_name));
        copy_file(&source, &target)?;
        copied += 1;
    }
    Ok(AssetMutationResult {
        message: format!("{copied} image(s) ajoutee(s) dans {kind}."),
        asset_id: Some(asset.id),
    })
}

fn find_asset(
    root: &Path,
    project: &ProjectConfig,
    asset_id: &str,
) -> Result<BlendUpAsset, String> {
    scan_assets(root, project, &read_export_state(root))?
        .into_iter()
        .find(|asset| asset.id == asset_id)
        .ok_or_else(|| "Cet asset n'existe plus dans Art.".to_string())
}

fn metadata_for_asset(root: &Path, asset: &BlendUpAsset) -> AssetMetadata {
    read_asset_metadata(root)
        .remove(&normalize_relative_string(&asset.source_path))
        .unwrap_or_else(|| AssetMetadata {
            schema_version: 2,
            kind: "asset_metadata".to_string(),
            id: asset.id.clone(),
            source_path: asset.source_path.clone(),
            details: asset.metadata.clone(),
        })
}

fn write_asset_metadata(root: &Path, metadata: &AssetMetadata) -> Result<(), String> {
    write_json(&asset_metadata_file(root, &metadata.id), metadata)
}

fn asset_metadata_file(root: &Path, asset_id: &str) -> PathBuf {
    root.join(".blendup")
        .join("assets")
        .join(format!("{asset_id}.json"))
}

fn validated_art_directory(
    root: &Path,
    project: &ProjectConfig,
    value: &str,
    allow_art_root: bool,
) -> Result<PathBuf, String> {
    let relative = safe_relative_path(value)?;
    let art_relative = Path::new(&project.paths.art_root);
    if !relative.starts_with(art_relative) || (!allow_art_root && relative == art_relative) {
        return Err("Ce dossier ne peut pas etre modifie ici.".to_string());
    }
    let directory = root.join(&relative);
    if !directory.is_dir() {
        return Err(format!("Dossier introuvable: {}", directory.display()));
    }
    Ok(directory)
}

fn validate_item_name(value: &str) -> Result<(), String> {
    let name = value.trim();
    if name.is_empty() {
        return Err("Donne un nom.".to_string());
    }
    if name == "."
        || name == ".."
        || name.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
        })
    {
        return Err("Ce nom contient un caractere interdit.".to_string());
    }
    Ok(())
}

fn relocate_asset(
    root: &Path,
    project: &ProjectConfig,
    asset: &BlendUpAsset,
    target: &Path,
) -> Result<(), String> {
    let source = root.join(&asset.source_path);
    if source == target {
        return Ok(());
    }
    let art_root = root.join(&project.paths.art_root);
    if !target.starts_with(&art_root) {
        return Err("La destination doit rester dans Art.".to_string());
    }
    if target.exists() {
        return Err(format!("{} existe deja.", target.display()));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }
    let new_output = output_path_for_source(root, project, target)?;
    let old_output = root.join(&asset.output_path);
    fs::rename(&source, target)
        .map_err(|error| format!("Impossible de deplacer {}: {error}", source.display()))?;
    if old_output.is_file() {
        if let Some(parent) = new_output.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
        }
        if !new_output.exists() {
            fs::rename(&old_output, &new_output).map_err(|error| {
                format!("Impossible de deplacer {}: {error}", old_output.display())
            })?;
        }
    }

    let mut metadata = metadata_for_asset(root, asset);
    metadata.source_path = relative_string(root, target)?;
    write_asset_metadata(root, &metadata)?;
    let mut state = read_export_state(root);
    if let Some(record) = state.exports.get_mut(&asset.id) {
        record.output_path = relative_string(root, &new_output)?;
    }
    write_json(&export_state_file(root), &state)
}

fn asset_owns_workspace(root: &Path, project: &ProjectConfig, asset: &BlendUpAsset) -> bool {
    let source = root.join(&asset.source_path);
    let Some(directory) = source.parent() else {
        return false;
    };
    directory != root.join(&project.paths.art_root)
        && directory
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(&asset.name))
        && source
            .file_stem()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(&asset.name))
}

fn prepare_asset_directories(workspace: &Path) -> Result<(), String> {
    fs::create_dir_all(workspace)
        .map_err(|error| format!("Impossible de creer {}: {error}", workspace.display()))?;
    for name in ASSET_SUPPORT_DIRECTORIES {
        let directory = workspace.join(name);
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Impossible de creer {}: {error}", directory.display()))?;
    }
    Ok(())
}

fn relocate_asset_to_directory(
    root: &Path,
    project: &ProjectConfig,
    asset: &BlendUpAsset,
    target_directory: &Path,
) -> Result<(), String> {
    let source_file = root.join(&asset.source_path);
    let source_directory = source_file
        .parent()
        .ok_or_else(|| "Dossier source invalide.".to_string())?;
    let owns_directory = source_directory != root.join(&project.paths.art_root)
        && source_directory
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(&asset.name));

    if owns_directory {
        write_asset_metadata(root, &metadata_for_asset(root, asset))?;
        let target = target_directory.join(
            source_directory
                .file_name()
                .ok_or_else(|| "Nom de dossier invalide.".to_string())?,
        );
        relocate_folder(root, project, source_directory, &target)
    } else {
        let target = target_directory.join(
            source_file
                .file_name()
                .ok_or_else(|| "Nom de fichier invalide.".to_string())?,
        );
        relocate_asset(root, project, asset, &target)
    }
}

fn copy_asset_into(
    root: &Path,
    project: &ProjectConfig,
    asset: &BlendUpAsset,
    target_directory: &Path,
) -> Result<AssetMutationResult, String> {
    let source = root.join(&asset.source_path);
    let target = if asset_owns_workspace(root, project, asset) {
        let source_directory = source
            .parent()
            .ok_or_else(|| "Dossier source invalide.".to_string())?;
        let (copy_name, target_workspace) = unique_asset_workspace(target_directory, &asset.name);
        copy_directory_recursive(source_directory, &target_workspace)?;
        let copied_source = target_workspace.join(
            source
                .file_name()
                .ok_or_else(|| "Nom de fichier invalide.".to_string())?,
        );
        let renamed_source = target_workspace.join(format!("{copy_name}.blend"));
        if copied_source != renamed_source {
            fs::rename(&copied_source, &renamed_source).map_err(|error| {
                format!(
                    "Impossible de renommer {}: {error}",
                    copied_source.display()
                )
            })?;
        }
        renamed_source
    } else {
        let target = unique_copy_path(target_directory, &asset.name, "blend");
        fs::copy(&source, &target)
            .map_err(|error| format!("Impossible de copier {}: {error}", source.display()))?;
        target
    };
    let source_path = relative_string(root, &target)?;
    let id = asset_id_for_path(&source_path);
    let mut metadata = metadata_for_asset(root, asset);
    metadata.id = id.clone();
    metadata.source_path = source_path;
    metadata.details.thumbnail_path = None;
    write_asset_metadata(root, &metadata)?;
    Ok(AssetMutationResult {
        message: format!("Une copie de {} a ete creee.", asset.name),
        asset_id: Some(id),
    })
}

fn relocate_folder(
    root: &Path,
    project: &ProjectConfig,
    source: &Path,
    target: &Path,
) -> Result<(), String> {
    let art_root = root.join(&project.paths.art_root);
    if source == art_root || !target.starts_with(&art_root) || target.starts_with(source) {
        return Err("Ce deplacement de dossier n'est pas autorise.".to_string());
    }
    if target.exists() {
        return Err(format!("{} existe deja.", target.display()));
    }
    let old_rel = relative_string(root, source)?;
    let new_rel = relative_string(root, target)?;
    let old_output = output_folder_for_art_path(root, project, Path::new(&old_rel))?;
    let new_output = output_folder_for_art_path(root, project, Path::new(&new_rel))?;

    fs::rename(source, target)
        .map_err(|error| format!("Impossible de deplacer {}: {error}", source.display()))?;
    if old_output.is_dir() && !new_output.exists() {
        if let Some(parent) = new_output.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
        }
        fs::rename(&old_output, &new_output)
            .map_err(|error| format!("Impossible de deplacer {}: {error}", old_output.display()))?;
    }

    let mut state = read_export_state(root);
    for mut metadata in read_asset_metadata(root).into_values() {
        if path_is_inside(&metadata.source_path, &old_rel) {
            metadata.source_path = replace_path_prefix(&metadata.source_path, &old_rel, &new_rel);
            if let Some(record) = state.exports.get_mut(&metadata.id) {
                let output =
                    output_path_for_source(root, project, &root.join(&metadata.source_path))?;
                record.output_path = relative_string(root, &output)?;
            }
            write_asset_metadata(root, &metadata)?;
        }
    }
    write_json(&export_state_file(root), &state)
}

fn output_path_for_source(
    root: &Path,
    project: &ProjectConfig,
    source: &Path,
) -> Result<PathBuf, String> {
    let relative = source
        .strip_prefix(root.join(&project.paths.art_root))
        .map_err(|_| "La source doit rester dans Art.".to_string())?;
    let mut output = root.join(&project.paths.engine_assets_root).join(relative);
    output.set_extension(if project.engine == "godot" {
        "glb"
    } else {
        "fbx"
    });
    Ok(output)
}

fn output_folder_for_art_path(
    root: &Path,
    project: &ProjectConfig,
    art_path: &Path,
) -> Result<PathBuf, String> {
    let relative = art_path
        .strip_prefix(Path::new(&project.paths.art_root))
        .map_err(|_| "Le dossier doit rester dans Art.".to_string())?;
    Ok(root.join(&project.paths.engine_assets_root).join(relative))
}

fn path_is_inside(path: &str, directory: &str) -> bool {
    let path = normalize_relative_string(path);
    let directory = normalize_relative_string(directory);
    path == directory || path.starts_with(&format!("{directory}/"))
}

fn replace_path_prefix(path: &str, old_prefix: &str, new_prefix: &str) -> String {
    let path = normalize_relative_string(path);
    let old_prefix = normalize_relative_string(old_prefix);
    let new_prefix = normalize_relative_string(new_prefix);
    if path == old_prefix {
        new_prefix
    } else {
        format!(
            "{new_prefix}/{}",
            path.trim_start_matches(&format!("{old_prefix}/"))
        )
    }
}

fn unique_copy_path(directory: &Path, base_name: &str, extension: &str) -> PathBuf {
    let first = directory.join(format!("{base_name} Copy.{extension}"));
    if !first.exists() {
        return first;
    }
    for index in 2..10_000 {
        let candidate = directory.join(format!("{base_name} Copy {index}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(format!("{base_name} Copy unique.{extension}"))
}

fn unique_asset_workspace(directory: &Path, base_name: &str) -> (String, PathBuf) {
    let first_name = format!("{base_name} Copy");
    let first = directory.join(&first_name);
    if !first.exists() {
        return (first_name, first);
    }
    for index in 2..10_000 {
        let name = format!("{base_name} Copy {index}");
        let candidate = directory.join(&name);
        if !candidate.exists() {
            return (name, candidate);
        }
    }
    let name = format!("{base_name} Copy unique");
    (name.clone(), directory.join(name))
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("Impossible de creer {}: {error}", destination.display()))?;
    for entry in fs::read_dir(source)
        .map_err(|error| format!("Impossible de lire {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("Fichier illisible: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Type de fichier illisible: {error}"))?;
        if file_type.is_symlink() {
            continue;
        }
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory_recursive(&entry.path(), &target)?;
        } else {
            copy_file(&entry.path(), &target)?;
        }
    }
    Ok(())
}

fn unique_file_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png");
    for index in 2..10_000 {
        let candidate = parent.join(format!("{stem} {index}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    path.to_path_buf()
}

fn copy_file(source: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }
    fs::copy(source, destination)
        .map(|_| ())
        .map_err(|error| format!("Impossible de copier {}: {error}", source.display()))
}

fn trash_path(path: &Path) -> Result<(), String> {
    trash::delete(path).map_err(|error| {
        format!(
            "Impossible de placer {} dans la corbeille: {error}",
            path.display()
        )
    })
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    tags.into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty() && seen.insert(tag.to_lowercase()))
        .take(20)
        .collect()
}

fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tga"
            )
        })
}

fn file_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "fbx" => "application/octet-stream",
        _ => "application/octet-stream",
    }
}

fn scan_assets(
    root: &Path,
    project: &ProjectConfig,
    export_state: &ExportState,
) -> Result<Vec<BlendUpAsset>, String> {
    let art_root = root.join(&project.paths.art_root);
    if !art_root.exists() {
        return Ok(Vec::new());
    }

    let mut blend_files = Vec::new();
    collect_blend_files(&art_root, &mut blend_files)?;
    let metadata_by_source = read_asset_metadata(root);
    let format = if project.engine == "godot" {
        "glb"
    } else {
        "fbx"
    };
    let mut assets = Vec::with_capacity(blend_files.len());

    for source in blend_files {
        let source_relative_to_art = source
            .strip_prefix(&art_root)
            .map_err(|error| format!("Chemin Art invalide: {error}"))?;
        let mut output = root
            .join(&project.paths.engine_assets_root)
            .join(source_relative_to_art);
        output.set_extension(format);

        let source_path = relative_string(root, &source)?;
        let output_path = relative_string(root, &output)?;
        let metadata = metadata_by_source
            .get(&normalize_relative_string(&source_path))
            .cloned();
        let id = metadata
            .as_ref()
            .map(|item| item.id.clone())
            .unwrap_or_else(|| asset_id_for_path(&source_path));
        let source_time = modified_time(&source);
        let output_time = modified_time(&output);
        let failed_record = export_state
            .exports
            .get(&id)
            .filter(|record| !record.success);
        let status = match (source_time, output_time, failed_record) {
            (_, _, Some(_)) => "error",
            (Some(source_modified), Some(output_modified), _)
                if output_modified >= source_modified =>
            {
                "exported"
            }
            (_, Some(_), _) => "outdated",
            _ => "ready",
        };

        let folder = Path::new(&source_path)
            .parent()
            .map(normalize_path)
            .unwrap_or_default();
        let name = source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Asset")
            .to_string();

        let mut details = metadata.map(|item| item.details).unwrap_or_default();
        if details.thumbnail_path.is_none() {
            let legacy_thumbnail = root
                .join(".blendup")
                .join("thumbnails")
                .join(format!("{id}.png"));
            let sidecar_thumbnail = source.with_extension("png");
            details.thumbnail_path = if legacy_thumbnail.is_file() {
                relative_string(root, &legacy_thumbnail).ok()
            } else if sidecar_thumbnail.is_file() {
                relative_string(root, &sidecar_thumbnail).ok()
            } else {
                None
            };
        }

        assets.push(BlendUpAsset {
            id,
            name,
            folder,
            source_path,
            output_path,
            format: format.to_string(),
            status: status.to_string(),
            source_modified_at: source_time.map(time_label),
            output_modified_at: output_time.map(time_label),
            last_error: failed_record.map(|record| record.message.clone()),
            size_bytes: fs::metadata(&source).map(|item| item.len()).unwrap_or(0),
            metadata: details,
        });
    }

    assets.sort_by(|left, right| left.source_path.cmp(&right.source_path));
    Ok(assets)
}

fn collect_asset_folders(root: &Path, project: &ProjectConfig) -> Result<Vec<String>, String> {
    fn visit(root: &Path, directory: &Path, folders: &mut Vec<String>) -> Result<(), String> {
        folders.push(relative_string(root, directory)?);
        let entries = fs::read_dir(directory)
            .map_err(|error| format!("Impossible de lire {}: {error}", directory.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| format!("Dossier Art illisible: {error}"))?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Type de fichier illisible: {error}"))?;
            if file_type.is_dir() && !file_type.is_symlink() {
                visit(root, &entry.path(), folders)?;
            }
        }
        Ok(())
    }

    let art_root = root.join(&project.paths.art_root);
    if !art_root.is_dir() {
        return Ok(Vec::new());
    }
    let mut folders = Vec::new();
    visit(root, &art_root, &mut folders)?;
    folders.sort();
    Ok(folders)
}

fn read_asset_metadata(root: &Path) -> HashMap<String, AssetMetadata> {
    let directory = root.join(".blendup").join("assets");
    let mut items = HashMap::new();
    let Ok(entries) = fs::read_dir(directory) else {
        return items;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Some(metadata) = fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str::<Value>(&content).ok())
            .and_then(|value| normalize_asset_metadata(&value))
        else {
            continue;
        };
        items.insert(normalize_relative_string(&metadata.source_path), metadata);
    }
    items
}

fn normalize_asset_metadata(value: &Value) -> Option<AssetMetadata> {
    let source_path = json_string(value, "sourcePath").or_else(|| {
        value
            .get("paths")
            .and_then(|paths| json_string(paths, "blenderSource"))
    })?;
    let id = json_string(value, "id").unwrap_or_else(|| asset_id_for_path(&source_path));
    let notes = value
        .get("notes")
        .and_then(|notes| {
            notes
                .as_str()
                .map(str::to_string)
                .or_else(|| json_string(notes, "artist"))
        })
        .unwrap_or_default();
    let tags = value
        .get("tags")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let thumbnail_path = json_string(value, "thumbnailPath").or_else(|| {
        value
            .get("paths")
            .and_then(|paths| json_string(paths, "thumbnail"))
    });
    let variants = value
        .get("variants")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .enumerate()
                .filter_map(|(index, item)| {
                    Some(AssetVariant {
                        id: json_string(item, "id").unwrap_or_else(|| format!("variant_{index}")),
                        name: json_string(item, "name")?,
                        status: normalize_item_status(
                            item.get("status")
                                .and_then(Value::as_str)
                                .unwrap_or("planned"),
                        ),
                        notes: json_string(item, "notes").unwrap_or_default(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let lods = value
        .get("lods")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .enumerate()
                .filter_map(|(index, item)| {
                    Some(AssetLod {
                        id: json_string(item, "id").unwrap_or_else(|| format!("lod_{index}")),
                        level: json_string(item, "level")?,
                        status: normalize_item_status(
                            item.get("status")
                                .and_then(Value::as_str)
                                .unwrap_or("planned"),
                        ),
                        target_ratio: item.get("targetRatio").and_then(Value::as_f64),
                        triangle_budget: item.get("triangleBudget").and_then(Value::as_u64),
                        notes: json_string(item, "notes").unwrap_or_default(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Some(AssetMetadata {
        schema_version: 2,
        kind: "asset_metadata".to_string(),
        id,
        source_path: normalize_relative_string(&source_path),
        details: AssetMetadataView {
            notes,
            tags,
            thumbnail_path,
            variants,
            lods,
        },
    })
}

fn normalize_item_status(value: &str) -> String {
    match value {
        "working" | "in_blender" | "in_progress" => "working",
        "ready" | "exported" | "in_unity" | "validated" => "ready",
        _ => "planned",
    }
    .to_string()
}

fn collect_blend_files(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Impossible de lire {}: {error}", directory.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Dossier Art illisible: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Type de fichier illisible: {error}"))?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_blend_files(&path, files)?;
        } else if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("blend"))
        {
            files.push(path);
        }
    }
    Ok(())
}

fn collect_problems(
    root: &Path,
    project: &ProjectConfig,
    assets: &[BlendUpAsset],
) -> Vec<BlendUpProblem> {
    let mut problems = Vec::new();
    let art_path = root.join(&project.paths.art_root);
    let assets_path = root.join(&project.paths.engine_assets_root);

    if !art_path.is_dir() {
        problems.push(problem(
            "art_missing",
            "error",
            "blendup",
            None,
            "Dossier Art introuvable",
            &format!("Le dossier {} n'existe pas.", project.paths.art_root),
            None,
        ));
    }
    if !assets_path.is_dir() {
        problems.push(problem(
            "engine_assets_missing",
            "error",
            "blendup",
            None,
            "Dossier Assets introuvable",
            &format!(
                "Le dossier {} n'existe pas.",
                project.paths.engine_assets_root
            ),
            None,
        ));
    }
    if assets.is_empty() && art_path.is_dir() {
        problems.push(problem(
            "no_blend_files",
            "info",
            "blendup",
            None,
            "Aucun asset dans Art",
            "Ajoute un fichier .blend dans Art pour commencer.",
            None,
        ));
    }

    for asset in assets {
        match asset.status.as_str() {
            "ready" => problems.push(problem(
                &format!("{}_not_exported", asset.id),
                "warning",
                "blendup",
                Some(asset.id.clone()),
                "Asset pas encore exporte",
                &format!(
                    "{} attend son premier export {}.",
                    asset.name,
                    asset.format.to_uppercase()
                ),
                Some("Exporter"),
            )),
            "outdated" => problems.push(problem(
                &format!("{}_outdated", asset.id),
                "warning",
                "blendup",
                Some(asset.id.clone()),
                "Export plus ancien que le fichier Blender",
                &format!("{} a ete modifie depuis son dernier export.", asset.name),
                Some("Exporter"),
            )),
            "error" => problems.push(problem(
                &format!("{}_export_error", asset.id),
                "error",
                "blender",
                Some(asset.id.clone()),
                "Dernier export en erreur",
                asset
                    .last_error
                    .as_deref()
                    .unwrap_or("Blender n'a pas termine l'export."),
                Some("Exporter"),
            )),
            _ => {}
        }
    }
    problems
}

fn problem(
    id: &str,
    severity: &str,
    source: &str,
    asset_id: Option<String>,
    title: &str,
    detail: &str,
    action_label: Option<&str>,
) -> BlendUpProblem {
    BlendUpProblem {
        id: id.to_string(),
        severity: severity.to_string(),
        source: source.to_string(),
        asset_id,
        title: title.to_string(),
        detail: detail.to_string(),
        action_label: action_label.map(str::to_string),
    }
}

fn read_project_config(root: &Path) -> Result<ProjectConfig, String> {
    let path = project_file(root);
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Impossible de lire {}: {error}", path.display()))?;
    let value: Value = serde_json::from_str(&content)
        .map_err(|error| format!("Projet BlendUp invalide: {error}"))?;
    normalize_project_config(&value)
}

fn normalize_project_config(value: &Value) -> Result<ProjectConfig, String> {
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| "Le projet BlendUp n'a pas de nom.".to_string())?;
    let paths = value.get("paths").unwrap_or(&Value::Null);
    let explicit_engine = value.get("engine").and_then(Value::as_str);
    let inferred_engine = explicit_engine.unwrap_or_else(|| {
        if paths.get("godotRoot").and_then(Value::as_str).is_some() {
            "godot"
        } else {
            "unity"
        }
    });
    let engine = validate_engine(inferred_engine)?;
    let default_root = engine_display_name(&engine).to_string();
    let art_root = json_string(paths, "artRoot").unwrap_or_else(|| "Art".to_string());
    let engine_root = json_string(paths, "engineRoot")
        .or_else(|| {
            if engine == "unity" {
                json_string(paths, "unityRoot")
            } else {
                json_string(paths, "godotRoot")
            }
        })
        .unwrap_or(default_root);
    let engine_assets_root = json_string(paths, "engineAssetsRoot")
        .or_else(|| {
            if engine == "unity" {
                json_string(paths, "unityAssetsRoot")
            } else {
                json_string(paths, "godotAssetsRoot")
            }
        })
        .unwrap_or_else(|| format!("{engine_root}/Assets"));

    Ok(ProjectConfig {
        schema_version: 2,
        kind: "project".to_string(),
        project_id: value
            .get("projectId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("project_{}", slug(name))),
        name: name.to_string(),
        engine,
        paths: ProjectPaths {
            art_root: normalize_relative_string(&art_root),
            engine_root: normalize_relative_string(&engine_root),
            engine_assets_root: normalize_relative_string(&engine_assets_root),
        },
    })
}

fn new_project_config(name: &str, engine: &str) -> ProjectConfig {
    let engine_root = engine_display_name(engine).to_string();
    ProjectConfig {
        schema_version: 2,
        kind: "project".to_string(),
        project_id: format!("project_{}", slug(name)),
        name: name.trim().to_string(),
        engine: engine.to_string(),
        paths: ProjectPaths {
            art_root: "Art".to_string(),
            engine_assets_root: format!("{engine_root}/Assets"),
            engine_root,
        },
    }
}

fn validate_project_paths(project: &ProjectConfig) -> Result<(), String> {
    safe_relative_path(&project.paths.art_root)?;
    safe_relative_path(&project.paths.engine_root)?;
    safe_relative_path(&project.paths.engine_assets_root)?;
    Ok(())
}

fn read_export_state(root: &Path) -> ExportState {
    fs::read_to_string(export_state_file(root))
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn record_export(
    root: &Path,
    state: &mut ExportState,
    asset: &BlendUpAsset,
    success: bool,
    message: &str,
) -> Result<(), String> {
    state.exports.insert(
        asset.id.clone(),
        ExportRecord {
            success,
            message: if success {
                "Export termine.".to_string()
            } else if message.trim().is_empty() {
                "Blender n'a pas termine l'export.".to_string()
            } else {
                message.chars().take(4000).collect()
            },
            output_path: asset.output_path.clone(),
        },
    );
    write_json(&export_state_file(root), state)
}

fn project_file(root: &Path) -> PathBuf {
    root.join(".blendup").join("project.json")
}

fn export_state_file(root: &Path) -> PathBuf {
    root.join(".blendup").join("export-state.json")
}

fn validated_project_root(value: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(value.trim());
    if !root.is_dir() {
        return Err(format!("Dossier projet introuvable: {}", root.display()));
    }
    if !project_file(&root).is_file() {
        return Err(format!("{} n'est pas un projet BlendUp.", root.display()));
    }
    Ok(root)
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value.trim());
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err("Le chemin doit rester dans le projet BlendUp.".to_string());
    }
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("Le chemin sort du projet BlendUp.".to_string());
    }
    Ok(path.to_path_buf())
}

fn validate_engine(value: &str) -> Result<String, String> {
    match value.trim().to_lowercase().as_str() {
        "godot" => Ok("godot".to_string()),
        "unity" => Ok("unity".to_string()),
        _ => Err("Le moteur doit etre Godot ou Unity.".to_string()),
    }
}

fn engine_display_name(engine: &str) -> &'static str {
    if engine == "godot" {
        "Godot"
    } else {
        "Unity"
    }
}

fn relative_string(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root)
        .map(normalize_path)
        .map_err(|error| format!("Chemin hors projet: {error}"))
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalize_relative_string(value: &str) -> String {
    value
        .trim()
        .replace('\\', "/")
        .trim_matches('/')
        .to_string()
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

fn asset_id_for_path(path: &str) -> String {
    let mut hash = 14_695_981_039_346_656_037_u64;
    for byte in path.to_lowercase().bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    format!("asset_{hash:016x}")
}

fn slug(value: &str) -> String {
    let mut result = String::new();
    for character in value.to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            result.push(character);
        } else if !result.ends_with('_') {
            result.push('_');
        }
    }
    result.trim_matches('_').to_string()
}

fn modified_time(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).ok()?.modified().ok()
}

fn time_label(time: SystemTime) -> String {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_default()
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Impossible de preparer le fichier JSON: {error}"))?;
    fs::write(path, format!("{content}\n"))
        .map_err(|error| format!("Impossible d'ecrire {}: {error}", path.display()))
}

fn settings_schema() -> u32 {
    2
}
fn settings_kind() -> String {
    "user_settings".to_string()
}

fn normalize_user_settings(mut settings: UserSettings) -> UserSettings {
    settings.schema_version = 2;
    settings.kind = settings_kind();
    settings.blender_path = settings
        .blender_path
        .and_then(|value| non_empty_string(&value));
    settings.last_project_root = settings
        .last_project_root
        .and_then(|value| non_empty_string(&value));
    settings.recent_projects = settings
        .recent_projects
        .into_iter()
        .filter_map(|value| non_empty_string(&value))
        .fold(Vec::new(), |mut items, value| {
            if !items.contains(&value) && items.len() < 6 {
                items.push(value);
            }
            items
        });
    settings
}

fn non_empty_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn user_settings_path() -> Result<PathBuf, String> {
    if cfg!(target_os = "windows") {
        let base =
            env::var("APPDATA").map_err(|_| "Le dossier APPDATA est introuvable.".to_string())?;
        Ok(PathBuf::from(base)
            .join("BlendUp")
            .join("user-settings.json"))
    } else {
        let base = env::var("XDG_CONFIG_HOME")
            .or_else(|_| env::var("HOME").map(|home| format!("{home}/.config")))
            .map_err(|_| "Le dossier de configuration utilisateur est introuvable.".to_string())?;
        Ok(PathBuf::from(base)
            .join("blendup")
            .join("user-settings.json"))
    }
}

fn find_blender_executable(explicit_path: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = explicit_path.and_then(non_empty_string).map(PathBuf::from) {
        if path.is_file() {
            return Some(path);
        }
    }
    if let Ok(value) = env::var("BLENDER_PATH") {
        let path = PathBuf::from(value);
        if path.is_file() {
            return Some(path);
        }
    }
    if command_is_available("blender") {
        return Some(PathBuf::from("blender"));
    }

    common_blender_locations()
        .into_iter()
        .find(|path| path.is_file())
}

fn common_blender_locations() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if cfg!(target_os = "windows") {
        for base in [
            PathBuf::from(r"C:\Program Files\Blender Foundation"),
            PathBuf::from(r"C:\Program Files (x86)\Blender Foundation"),
        ] {
            if let Ok(entries) = fs::read_dir(base) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("blender.exe"));
                }
            }
        }
        candidates.reverse();
        candidates.insert(
            0,
            PathBuf::from(r"C:\Program Files\Steam\steamapps\common\Blender\blender.exe"),
        );
        candidates.insert(
            0,
            PathBuf::from(r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe"),
        );
    } else if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from(
            "/Applications/Blender.app/Contents/MacOS/Blender",
        ));
    } else {
        candidates.push(PathBuf::from("/usr/bin/blender"));
        candidates.push(PathBuf::from("/usr/local/bin/blender"));
    }
    candidates
}

fn command_is_available(command: &str) -> bool {
    Command::new(command)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn command_log(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = String::from_utf8_lossy(stdout);
    let stderr = String::from_utf8_lossy(stderr);
    let combined = format!(
        "{}{}{}",
        stdout,
        if stdout.is_empty() || stderr.is_empty() {
            ""
        } else {
            "\n"
        },
        stderr
    );
    combined
        .chars()
        .rev()
        .take(8000)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

fn open_with_system(path: &Path) -> Result<(), String> {
    let result = if cfg!(target_os = "windows") {
        Command::new("explorer").arg(path).spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(path).spawn()
    } else {
        Command::new("xdg-open").arg(path).spawn()
    };
    result
        .map(|_| ())
        .map_err(|error| format!("Impossible d'ouvrir {}: {error}", path.display()))
}

#[cfg(target_os = "windows")]
fn apply_command_window_preference(command: &mut Command, show_command_prompt: bool) {
    use std::os::windows::process::CommandExt;
    if !show_command_prompt {
        command.creation_flags(0x08000000);
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_command_window_preference(_command: &mut Command, _show_command_prompt: bool) {}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_user_settings,
            save_user_settings,
            read_default_project_snapshot,
            read_project_snapshot,
            create_project,
            update_project_engine,
            detect_blender,
            export_asset,
            open_project_path,
            open_blend_file,
            read_project_file_data_url,
            list_project_images,
            create_folder,
            create_asset,
            organize_asset,
            rename_asset,
            move_asset,
            copy_asset,
            duplicate_asset,
            delete_asset,
            rename_folder,
            move_folder,
            delete_folder,
            update_asset_metadata,
            set_asset_thumbnail,
            add_asset_images
        ])
        .run(tauri::generate_context!())
        .expect("error while running BlendUp");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "blendup_{label}_{}_{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn legacy_unity_project_is_normalized() {
        let legacy = serde_json::json!({
            "schemaVersion": 1,
            "kind": "project",
            "projectId": "project_legacy",
            "name": "Legacy",
            "paths": {
                "artRoot": "Art",
                "unityRoot": "Unity",
                "unityAssetsRoot": "Unity/Assets"
            }
        });

        let project = normalize_project_config(&legacy).unwrap();
        assert_eq!(project.schema_version, 2);
        assert_eq!(project.engine, "unity");
        assert_eq!(project.paths.engine_assets_root, "Unity/Assets");
    }

    #[test]
    fn assets_mirror_art_tree_for_godot() {
        let root = test_root("scan");
        let source = root.join("Art").join("Environment").join("Rock.blend");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, b"blend").unwrap();

        let project = new_project_config("Test", "godot");
        let assets = scan_assets(&root, &project, &ExportState::default()).unwrap();

        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].source_path, "Art/Environment/Rock.blend");
        assert_eq!(assets[0].output_path, "Godot/Assets/Environment/Rock.glb");
        assert_eq!(assets[0].status, "ready");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn changing_engine_preserves_the_previous_folder() {
        let root = test_root("engine");
        let project = new_project_config("Test", "unity");
        fs::create_dir_all(root.join("Unity").join("Assets")).unwrap();
        write_json(&project_file(&root), &project).unwrap();

        let result =
            update_project_engine(root.to_string_lossy().to_string(), "godot".to_string()).unwrap();

        assert_eq!(result.project.engine, "godot");
        assert!(root.join("Godot").join("Assets").is_dir());
        assert!(root.join("Unity").join("Assets").is_dir());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_asset_metadata_is_kept_in_the_advanced_explorer() {
        let root = test_root("metadata");
        let source = root.join("Art").join("Props").join("Crate.blend");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, b"blend").unwrap();
        let metadata_dir = root.join(".blendup").join("assets");
        fs::create_dir_all(&metadata_dir).unwrap();
        fs::write(
            metadata_dir.join("crate.json"),
            serde_json::to_vec(&serde_json::json!({
                "id": "asset_crate_legacy",
                "paths": { "blenderSource": "Art/Props/Crate.blend" },
                "notes": { "artist": "Garder les proportions." },
                "tags": ["prop", "wood"],
                "variants": [{ "id": "clean", "name": "Propre", "status": "in_progress" }],
                "lods": [{ "id": "lod0", "level": "LOD 0", "status": "validated", "targetRatio": 100 }]
            }))
            .unwrap(),
        )
        .unwrap();

        let project = new_project_config("Test", "godot");
        let assets = scan_assets(&root, &project, &ExportState::default()).unwrap();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].id, "asset_crate_legacy");
        assert_eq!(assets[0].metadata.notes, "Garder les proportions.");
        assert_eq!(assets[0].metadata.tags, vec!["prop", "wood"]);
        assert_eq!(assets[0].metadata.variants[0].status, "working");
        assert_eq!(assets[0].metadata.lods[0].status, "ready");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dragging_an_asset_moves_its_complete_working_folder() {
        let root = test_root("drag_asset_folder");
        let asset_folder = root
            .join("Art")
            .join("Blender")
            .join("Environment")
            .join("Rock");
        fs::create_dir_all(asset_folder.join("references")).unwrap();
        fs::write(asset_folder.join("Rock.blend"), b"blend").unwrap();
        fs::write(asset_folder.join("references").join("rock.png"), b"image").unwrap();
        let output_folder = root
            .join("Godot")
            .join("Assets")
            .join("Blender")
            .join("Environment")
            .join("Rock");
        fs::create_dir_all(&output_folder).unwrap();
        fs::write(output_folder.join("Rock.glb"), b"glb").unwrap();
        let target = root.join("Art").join("Blender").join("Props");
        fs::create_dir_all(&target).unwrap();

        let project = new_project_config("Test", "godot");
        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        let original_id = asset.id.clone();
        relocate_asset_to_directory(&root, &project, &asset, &target).unwrap();

        assert!(target.join("Rock").join("Rock.blend").is_file());
        assert!(target
            .join("Rock")
            .join("references")
            .join("rock.png")
            .is_file());
        assert!(root
            .join("Godot")
            .join("Assets")
            .join("Blender")
            .join("Props")
            .join("Rock")
            .join("Rock.glb")
            .is_file());
        let moved = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        assert_eq!(moved.id, original_id);
        assert_eq!(moved.folder, "Art/Blender/Props/Rock");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn organizing_a_loose_asset_groups_its_support_files() {
        let root = test_root("organize_loose_asset");
        let project = new_project_config("Test", "godot");
        fs::create_dir_all(root.join("Art").join("Characters").join("textures")).unwrap();
        fs::create_dir_all(root.join("Godot").join("Assets").join("Characters")).unwrap();
        fs::create_dir_all(root.join(".blendup")).unwrap();
        fs::write(
            root.join("Art").join("Characters").join("Bob.blend"),
            b"blend",
        )
        .unwrap();
        fs::write(
            root.join("Art")
                .join("Characters")
                .join("textures")
                .join("body.png"),
            b"image",
        )
        .unwrap();
        fs::write(
            root.join("Godot")
                .join("Assets")
                .join("Characters")
                .join("Bob.glb"),
            b"glb",
        )
        .unwrap();
        write_json(&project_file(&root), &project).unwrap();
        write_json(&export_state_file(&root), &ExportState::default()).unwrap();

        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        let result = organize_asset(root.to_string_lossy().to_string(), asset.id.clone()).unwrap();

        assert_eq!(result.asset_id.as_deref(), Some(asset.id.as_str()));
        assert!(root
            .join("Art")
            .join("Characters")
            .join("Bob")
            .join("Bob.blend")
            .is_file());
        assert!(root
            .join("Art")
            .join("Characters")
            .join("Bob")
            .join("textures")
            .join("body.png")
            .is_file());
        assert!(root
            .join("Art")
            .join("Characters")
            .join("Bob")
            .join("references")
            .is_dir());
        assert!(root
            .join("Godot")
            .join("Assets")
            .join("Characters")
            .join("Bob")
            .join("Bob.glb")
            .is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn duplicating_an_asset_workspace_copies_its_textures() {
        let root = test_root("duplicate_asset_workspace");
        let project = new_project_config("Test", "godot");
        let workspace = root.join("Art").join("Props").join("Crate");
        fs::create_dir_all(workspace.join("textures")).unwrap();
        fs::write(workspace.join("Crate.blend"), b"blend").unwrap();
        fs::write(workspace.join("textures").join("wood.png"), b"image").unwrap();
        fs::create_dir_all(root.join("Godot").join("Assets")).unwrap();

        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        let result =
            copy_asset_into(&root, &project, &asset, &root.join("Art").join("Props")).unwrap();

        assert!(root
            .join("Art")
            .join("Props")
            .join("Crate Copy")
            .join("Crate Copy.blend")
            .is_file());
        assert!(root
            .join("Art")
            .join("Props")
            .join("Crate Copy")
            .join("textures")
            .join("wood.png")
            .is_file());
        assert!(result.asset_id.is_some());
        fs::remove_dir_all(root).unwrap();
    }
}
