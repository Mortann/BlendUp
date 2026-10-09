#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

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
use tauri::Manager;
mod blender_window;
mod project_paths;
mod showcases;

const EXPORT_SCRIPT: &str = include_str!("../../../blender-addon/blendup/scripts/export_asset.py");
const BLENDER_EXPORT_SCRIPT: &str = include_str!("../../../blender-addon/blendup/blender_export.py");
const UV_QUALITY_SCRIPT: &str = include_str!("../../../blender-addon/blendup/core/uv_quality.py");
const ASSET_POLICY_SCRIPT: &str =
    include_str!("../../../blender-addon/blendup/core/asset_policy.py");
const UV_BLENDER_SCRIPT: &str = include_str!("../../../blender-addon/blendup/blender_uv.py");
const UV_CHECK_SCRIPT: &str = include_str!("../../../blender-addon/blendup/scripts/check_uvs.py");

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

const GENERATE_LOD_SCRIPT: &str =
    include_str!("../../../blender-addon/blendup/scripts/generate_lods.py");

const GODOT_LOD_GROUP_SCRIPT: &str = r#"@tool
extends Node3D

@export var lod_scenes: Array[PackedScene] = []
@export var lod_distances: PackedFloat32Array = PackedFloat32Array([20.0, 45.0, 90.0])

var _current_lod := -1
var _instance: Node

func _ready() -> void:
    _show_lod(0)

func _process(_delta: float) -> void:
    if Engine.is_editor_hint() or lod_scenes.is_empty():
        return
    var camera := get_viewport().get_camera_3d()
    if camera == null:
        return
    var distance := global_position.distance_to(camera.global_position)
    var index := 0
    while index < lod_distances.size() and distance > lod_distances[index]:
        index += 1
    _show_lod(min(index, lod_scenes.size() - 1))

func _show_lod(index: int) -> void:
    if index == _current_lod or index < 0 or index >= lod_scenes.size():
        return
    if is_instance_valid(_instance):
        _instance.queue_free()
    _instance = lod_scenes[index].instantiate()
    add_child(_instance)
    _current_lod = index
"#;

const ASSET_SUPPORT_DIRECTORIES: [&str; 3] = ["textures", "references", "renders"];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPaths {
    art_root: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    engine_root: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
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
    #[serde(default)]
    blender: BlenderProjectSettings,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
struct BlenderProjectSettings {
    apply_transforms_on_save: bool,
    unwrap_on_save: bool,
    validate_uvs: bool,
    minimum_uv_score: f64,
    allow_uv_overlap: bool,
}

impl Default for BlenderProjectSettings {
    fn default() -> Self {
        Self {
            apply_transforms_on_save: false,
            unwrap_on_save: false,
            validate_uvs: false,
            minimum_uv_score: 70.0,
            allow_uv_overlap: false,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UvObjectMetrics {
    object_name: String,
    score: f64,
    triangle_count: usize,
    missing_uv_triangles: usize,
    degenerate_triangles: usize,
    valid_uv_percent: f64,
    stretch_score: f64,
    density_score: f64,
    overlap_percent: f64,
    #[serde(default)]
    marked_seams: usize,
    #[serde(default)]
    uv_cuts: usize,
    #[serde(default)]
    unused_seams: usize,
    #[serde(default)]
    unmarked_cuts: usize,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UvQualityReport {
    algorithm_version: u32,
    score: f64,
    complete: bool,
    allow_uv_overlap: bool,
    source_path: String,
    source_size: u64,
    source_modified_ns: String,
    checked_at: String,
    #[serde(default)]
    unsaved_changes: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    objects: Vec<UvObjectMetrics>,
    issues: Vec<String>,
    #[serde(default)]
    preparation_warnings: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UvQualitySummary {
    #[serde(flatten)]
    report: UvQualityReport,
    stale: bool,
    blocked: bool,
    minimum_score: f64,
    #[serde(default)]
    ignored: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSnapshot {
    project_root: String,
    project: ProjectConfig,
    asset_folders: Vec<String>,
    assets: Vec<BlendUpAsset>,
    problems: Vec<BlendUpProblem>,
    showcases: Vec<showcases::ShowcaseView>,
    integrations: showcases::Integrations,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    uv_quality: Option<UvQualitySummary>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetMetadataView {
    #[serde(default)]
    ignore_uv_validation: bool,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source_modified_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output_modified_at: Option<String>,
    #[serde(default)]
    notes: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    uv_quality: Option<UvQualitySummary>,
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
    generated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source_modified_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output_modified_at: Option<String>,
    #[serde(default)]
    notes: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    uv_quality: Option<UvQualitySummary>,
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
    #[serde(default)]
    process_id: Option<u32>,
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
    category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    minimum_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    technical_details: Option<String>,
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
    #[serde(default)]
    open_asset_after_creation: bool,
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
            open_asset_after_creation: false,
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
    for asset in &assets {
        let _ = cleanup_legacy_version_outputs(&root, asset);
    }
    let asset_folders = collect_asset_folders(&root, &project)?;
    let mut problems = collect_problems(&root, &project, &assets);
    let (showcases, integrations) = showcases::snapshot(&root, &project, &assets);
    for (index, scene) in showcases.iter().enumerate() {
        if let Some(error) = scene.error.as_ref().filter(|_| scene.status == "error") {
            problems.push(BlendUpProblem {
                id: format!("showcase-{index}"),
                severity: "warning".into(),
                source: "blendup".into(),
                asset_id: None,
                title: "Showcase incomplet".into(),
                detail: error.clone(),
                action_label: None,
                category: "project".into(),
                version_label: None,
                score: None,
                minimum_score: None,
                technical_details: None,
            });
        }
    }

    Ok(ProjectSnapshot {
        project_root: root.to_string_lossy().to_string(),
        project,
        asset_folders,
        assets,
        problems,
        showcases,
        integrations,
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
    if project.engine != "none" {
        fs::create_dir_all(root.join(&project.paths.engine_assets_root))
            .map_err(|error| format!("Impossible de creer le dossier Assets: {error}"))?;
        write_json(&export_state_file(&root), &ExportState::default())?;
    }
    write_json(&project_file(&root), &project)?;

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
            message: "Ce type de projet est deja actif.".to_string(),
        });
    }

    project.engine = engine.clone();
    let defaults = new_project_config(&project.name, &engine);
    project.paths.engine_root = defaults.paths.engine_root;
    project.paths.engine_assets_root = defaults.paths.engine_assets_root;

    if engine != "none" {
        fs::create_dir_all(root.join(&project.paths.engine_assets_root))
            .map_err(|error| format!("Impossible de creer la nouvelle destination: {error}"))?;
        write_json(&export_state_file(&root), &ExportState::default())?;
    }
    write_json(&project_file(&root), &project)?;

    Ok(UpdateProjectEngineResult {
        message: if engine == "none" {
            "Projet 3D actif, sans moteur lie. Les fichiers existants sont conserves.".to_string()
        } else {
            format!(
                "Les exports vont maintenant vers {}. Les fichiers existants sont conserves.",
                project.paths.engine_assets_root
            )
        },
        project,
    })
}

#[tauri::command]
fn update_project_paths(
    project_root: String,
    paths: ProjectPaths,
) -> Result<ProjectConfig, String> {
    project_paths::update(&project_root, paths)
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
    require_project_engine(&read_project_config(&root)?)?;
    export_asset_file(project_root, asset_id, blender_path)
}

#[tauri::command]
fn generate_asset_preview(
    project_root: String,
    asset_id: String,
    blender_path: Option<String>,
) -> Result<ExportAssetResult, String> {
    let root = validated_project_root(&project_root)?;
    if read_project_config(&root)?.engine != "none" {
        return Err("Les projets moteur utilisent leur export pour l'aperçu.".to_string());
    }
    let mut result = export_asset_file(project_root, asset_id, blender_path)?;
    result.message = if result.success {
        "Aperçu 3D genere.".to_string()
    } else {
        "Impossible de generer l'aperçu 3D.".to_string()
    };
    Ok(result)
}

fn export_asset_file(
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
    let script_path = prepare_uv_runtime(&root, "export_asset.py", EXPORT_SCRIPT)?;

    let mut command = Command::new(&blender_executable);
    command
        .env("BLENDUP_BACKGROUND_TASK", "1")
        .arg("--background")
        .arg("--factory-startup")
        .arg(&source)
        .arg("--python-exit-code")
        .arg("1")
        .arg("--python")
        .arg(&script_path)
        .arg("--")
        .arg(&output_path)
        .arg(&asset.format)
        .arg(&root)
        .arg(if project.engine == "none" { "0" } else { "1" });
    apply_command_window_preference(&mut command, false);
    let process_output = command.output();

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
fn export_asset_version(
    project_root: String,
    asset_id: String,
    version_id: String,
    version_kind: String,
    blender_path: Option<String>,
) -> Result<ExportAssetResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let (label, source_path, output_path) =
        asset_version_paths(&asset, &version_id, &version_kind)?;
    let (success, log, blender_display) = export_managed_file(
        &root,
        &source_path,
        &output_path,
        &asset.format,
        blender_path.as_deref(),
    )?;
    if success {
        cleanup_legacy_version_output(&root, &asset, &source_path, &output_path)?;
    }

    Ok(ExportAssetResult {
        success,
        asset_id,
        message: if project.engine == "none" && success {
            format!("Aperçu de {} généré.", label)
        } else if success {
            format!("{} a ete exporte.", label)
        } else {
            format!("L'export de {} a echoue.", label)
        },
        output_path: Some(root.join(&output_path).to_string_lossy().to_string()),
        blender_path: blender_display,
        log,
    })
}

#[tauri::command]
fn export_asset_versions(
    project_root: String,
    asset_id: String,
    blender_path: Option<String>,
) -> Result<ExportAssetResult, String> {
    let base_result = export_asset(project_root.clone(), asset_id.clone(), blender_path.clone())?;
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    require_project_engine(&project)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let mut versions = Vec::new();
    for variant in &asset.metadata.variants {
        if let (Some(source), Some(output)) = (&variant.source_path, &variant.output_path) {
            versions.push((variant.name.clone(), source.clone(), output.clone()));
        }
    }
    for lod in &asset.metadata.lods {
        if let (Some(source), Some(output)) = (&lod.source_path, &lod.output_path) {
            versions.push((lod.level.clone(), source.clone(), output.clone()));
        }
    }

    let total = versions.len() + 1;
    let mut success_count = usize::from(base_result.success);
    let mut logs = vec![format!("{}\n{}", asset.name, base_result.log)];
    let mut blender_display = base_result.blender_path.clone();
    for (label, source, output) in versions {
        let (success, log, detected_blender) = export_managed_file(
            &root,
            &source,
            &output,
            &asset.format,
            blender_path.as_deref(),
        )?;
        if success {
            success_count += 1;
            cleanup_legacy_version_output(&root, &asset, &source, &output)?;
        }
        if blender_display.is_none() {
            blender_display = detected_blender;
        }
        logs.push(format!("{label}\n{log}"));
    }

    let lod_scene = if project.engine == "godot" && success_count == total {
        write_godot_lod_support(&root, &project, &asset)?
    } else {
        None
    };
    let success = success_count == total;
    Ok(ExportAssetResult {
        success,
        asset_id,
        message: if success {
            format!("{} versions de {} ont ete exportees.", total, asset.name)
        } else {
            format!("{} version(s) sur {} exportee(s).", success_count, total)
        },
        output_path: lod_scene
            .or_else(|| Some(root.join(&asset.output_path).to_string_lossy().to_string())),
        blender_path: blender_display,
        log: logs.join("\n\n---\n\n"),
    })
}

#[tauri::command]
fn clear_asset_exports(project_root: String) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    require_project_engine(&project)?;
    let export_state = read_export_state(&root);
    let assets = scan_assets(&root, &project, &export_state)?;
    let export_root = root.join(safe_relative_path(&project.paths.engine_assets_root)?);
    let mut targets = HashSet::new();

    for asset in &assets {
        targets.insert(root.join(safe_relative_path(&asset.output_path)?));
        for variant in &asset.metadata.variants {
            if let Some(output) = &variant.output_path {
                targets.insert(root.join(safe_relative_path(output)?));
            }
            if let Some(source) = &variant.source_path {
                targets.insert(legacy_version_output_path(&root, asset, source)?);
            }
        }
        for lod in &asset.metadata.lods {
            if let Some(output) = &lod.output_path {
                targets.insert(root.join(safe_relative_path(output)?));
            }
            if let Some(source) = &lod.source_path {
                targets.insert(legacy_version_output_path(&root, asset, source)?);
            }
        }
        if project.engine == "godot" {
            let base_output = root.join(safe_relative_path(&asset.output_path)?);
            if let Some(parent) = base_output.parent() {
                targets.insert(parent.join(format!("{}_lod.tscn", asset.name)));
            }
        }
    }
    if project.engine == "godot" {
        targets.insert(export_root.join("BlendUp").join("blendup_lod_group.gd"));
    }

    let mut removed = 0;
    for target in targets {
        if !target.starts_with(&export_root) {
            return Err("Un export gere sort du dossier Assets du moteur.".to_string());
        }
        if target.is_file() {
            trash_path(&target)?;
            removed += 1;
        }
    }
    write_json(&export_state_file(&root), &ExportState::default())?;

    Ok(AssetMutationResult {
        message: format!("{removed} fichier(s) exporte(s) place(s) dans la corbeille."),
        asset_id: None,
    })
}

fn asset_version_paths(
    asset: &BlendUpAsset,
    version_id: &str,
    version_kind: &str,
) -> Result<(String, String, String), String> {
    if version_kind == "variant" {
        let version = asset
            .metadata
            .variants
            .iter()
            .find(|item| item.id == version_id)
            .ok_or_else(|| "Variante introuvable.".to_string())?;
        Ok((
            version.name.clone(),
            version
                .source_path
                .clone()
                .ok_or_else(|| "Cette variante n'a pas encore de fichier Blender.".to_string())?,
            version
                .output_path
                .clone()
                .ok_or_else(|| "Cette variante n'a pas de destination d'export.".to_string())?,
        ))
    } else if version_kind == "lod" {
        let version = asset
            .metadata
            .lods
            .iter()
            .find(|item| item.id == version_id)
            .ok_or_else(|| "LOD introuvable.".to_string())?;
        Ok((
            version.level.clone(),
            version
                .source_path
                .clone()
                .ok_or_else(|| "Ce LOD n'a pas encore de fichier Blender.".to_string())?,
            version
                .output_path
                .clone()
                .ok_or_else(|| "Ce LOD n'a pas de destination d'export.".to_string())?,
        ))
    } else {
        Err("Type de version invalide.".to_string())
    }
}

fn export_managed_file(
    root: &Path,
    source_path: &str,
    output_path: &str,
    format: &str,
    blender_path: Option<&str>,
) -> Result<(bool, String, Option<String>), String> {
    let source = root.join(safe_relative_path(source_path)?);
    let output = root.join(safe_relative_path(output_path)?);
    if !source.is_file() {
        return Ok((
            false,
            format!("Fichier Blender introuvable: {}", source.display()),
            None,
        ));
    }
    let Some(blender) = find_blender_executable(blender_path) else {
        return Ok((
            false,
            "Blender est introuvable. Configure son chemin dans Parametres.".to_string(),
            None,
        ));
    };
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }
    let temp_dir = root.join(".blendup").join("temp");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Impossible de preparer l'export: {error}"))?;
    let script = prepare_uv_runtime(root, "export_asset.py", EXPORT_SCRIPT)?;
    let mut command = Command::new(&blender);
    command
        .env("BLENDUP_BACKGROUND_TASK", "1")
        .arg("--background")
        .arg("--factory-startup")
        .arg(&source)
        .arg("--python-exit-code")
        .arg("1")
        .arg("--python")
        .arg(&script)
        .arg("--")
        .arg(&output)
        .arg(format)
        .arg(root)
        .arg(if read_project_config(root)?.engine == "none" {
            "0"
        } else {
            "1"
        });
    apply_command_window_preference(&mut command, false);
    let process = command.output();
    let blender_display = blender.to_string_lossy().to_string();
    let process = match process {
        Ok(process) => process,
        Err(error) => {
            return Ok((
                false,
                format!("Impossible de lancer Blender depuis {blender_display}: {error}"),
                Some(blender_display),
            ))
        }
    };
    let log = command_log(&process.stdout, &process.stderr);
    Ok((
        process.status.success() && output.is_file(),
        log,
        Some(blender_display),
    ))
}

fn prepare_uv_runtime(root: &Path, name: &str, script: &str) -> Result<PathBuf, String> {
    let directory = root.join(".blendup/temp");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    for (name, content) in [
        ("blendup_uv_quality.py", UV_QUALITY_SCRIPT),
        ("blendup_asset_policy.py", ASSET_POLICY_SCRIPT),
        ("blendup_blender_uv.py", UV_BLENDER_SCRIPT),
        ("blendup_blender_export.py", BLENDER_EXPORT_SCRIPT),
        (name, script),
    ] {
        fs::write(directory.join(name), content)
            .map_err(|error| format!("Impossible de préparer le contrôle UV: {error}"))?;
    }
    Ok(directory.join(name))
}

fn read_uv_quality(
    root: &Path,
    project: &ProjectConfig,
    source_path: &str,
) -> Option<UvQualitySummary> {
    let path = root
        .join(".blendup/uv-reports")
        .join(source_path)
        .with_extension("json");
    let report: UvQualityReport = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    if !report.score.is_finite() || !(0.0..=100.0).contains(&report.score) {
        return None;
    }
    let metadata = fs::metadata(root.join(source_path)).ok()?;
    let modified = metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_nanos()
        .to_string();
    let stale = report.algorithm_version != 2
        || report.unsaved_changes
        || report.source_path != source_path
        || report.source_size != metadata.len()
        || report.source_modified_ns != modified
        || report.allow_uv_overlap != project.blender.allow_uv_overlap;
    let blocked = project.blender.validate_uvs
        && !stale
        && (!report.complete
            || report.error.is_some()
            || report.score < project.blender.minimum_uv_score);
    Some(UvQualitySummary {
        report,
        stale,
        blocked,
        minimum_score: project.blender.minimum_uv_score,
        ignored: false,
    })
}

fn apply_uv_exemption(
    quality: Option<UvQualitySummary>,
    ignored: bool,
) -> Option<UvQualitySummary> {
    quality.map(|mut quality| {
        quality.ignored = ignored;
        quality.blocked &= !ignored;
        quality
    })
}

#[tauri::command]
fn update_project_blender_settings(
    project_root: String,
    settings: BlenderProjectSettings,
) -> Result<ProjectConfig, String> {
    let root = validated_project_root(&project_root)?;
    let mut project = read_project_config(&root)?;
    project.blender = settings;
    validate_project_paths(&project)?;
    write_json(&project_file(&root), &project)?;
    Ok(project)
}

#[tauri::command]
async fn check_asset_uvs(
    project_root: String,
    asset_id: String,
    blender_path: Option<String>,
) -> Result<AssetMutationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_asset_uvs_impl(project_root, asset_id, blender_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn check_asset_uvs_impl(
    project_root: String,
    asset_id: String,
    blender_path: Option<String>,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    if asset.metadata.ignore_uv_validation {
        return Ok(AssetMutationResult {
            asset_id: Some(asset_id),
            message: format!("{} est ignoré pour la vérification UV.", asset.name),
        });
    }
    let blender = find_blender_executable(blender_path.as_deref()).ok_or_else(|| {
        "Blender est introuvable. Configure son chemin dans Paramètres.".to_string()
    })?;
    let script = prepare_uv_runtime(&root, "check_uvs.py", UV_CHECK_SCRIPT)?;
    let mut sources = vec![asset.source_path.clone()];
    sources.extend(
        asset
            .metadata
            .variants
            .iter()
            .filter_map(|version| version.source_path.clone()),
    );
    sources.extend(
        asset
            .metadata
            .lods
            .iter()
            .filter_map(|version| version.source_path.clone()),
    );
    let mut scores = Vec::new();
    for source in sources {
        let mut command = Command::new(&blender);
        command
            .env("BLENDUP_BACKGROUND_TASK", "1")
            .arg("--background")
            .arg("--factory-startup")
            .arg(root.join(safe_relative_path(&source)?))
            .arg("--python-exit-code")
            .arg("1")
            .arg("--python")
            .arg(&script)
            .arg("--")
            .arg(&root);
        apply_command_window_preference(&mut command, false);
        let output = command.output().map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Err(format!(
                "Contrôle UV impossible pour {source}: {}",
                command_log(&output.stdout, &output.stderr)
            ));
        }
        let summary = read_uv_quality(&root, &project, &source)
            .ok_or_else(|| "Blender n'a pas produit de rapport UV valide.".to_string())?;
        scores.push(summary.report.score);
    }
    Ok(AssetMutationResult {
        asset_id: Some(asset_id),
        message: format!(
            "UV de {} vérifiés : {:.1}/100 pour l'original, {} fichier(s) contrôlé(s).",
            asset.name,
            scores[0],
            scores.len()
        ),
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
    if target.is_file() {
        reveal_with_system(&target)
    } else {
        open_with_system(&target)
    }
}

#[tauri::command]
async fn open_blend_file(
    project_root: String,
    relative_path: String,
    blender_path: Option<String>,
    show_command_prompt: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        open_blend_file_impl(
            project_root,
            relative_path,
            blender_path,
            show_command_prompt,
        )
    })
    .await
    .map_err(|error| format!("Impossible d'ouvrir Blender: {error}"))?
}

fn open_blend_file_impl(
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
    let mut command = blender_open_command(&blender, &target);
    apply_command_window_preference(&mut command, show_command_prompt);
    let child = command
        .spawn()
        .map_err(|error| format!("Impossible de lancer {}: {error}", blender.display()))?;
    let process_id = steam_blender_launcher(&blender)
        .is_none()
        .then_some(child.id());
    blender_window::focus_when_ready(process_id, target);
    Ok(())
}

fn blender_open_command(blender: &Path, target: &Path) -> Command {
    if let Some(steam) = steam_blender_launcher(blender) {
        let mut command = Command::new(steam);
        command.args(["-applaunch", "365670"]).arg(target);
        command
    } else {
        let mut command = Command::new(blender);
        command.arg(target);
        command
    }
}

fn steam_blender_launcher(blender: &Path) -> Option<PathBuf> {
    let installation = blender.parent()?;
    let common = installation.parent()?;
    let steamapps = common.parent()?;
    if !common.file_name()?.to_str()?.eq_ignore_ascii_case("common")
        || !steamapps
            .file_name()?
            .to_str()?
            .eq_ignore_ascii_case("steamapps")
    {
        return None;
    }
    let manifest = fs::read_to_string(steamapps.join("appmanifest_365670.acf")).ok()?;
    let installed_folder = manifest
        .lines()
        .find(|line| line.trim_start().starts_with("\"installdir\""))?
        .split('"')
        .nth(3)?;
    if !installation
        .file_name()?
        .to_str()?
        .eq_ignore_ascii_case(installed_folder)
    {
        return None;
    }
    let configured = manifest
        .lines()
        .find(|line| line.trim_start().starts_with("\"LauncherPath\""))
        .and_then(|line| line.split('"').nth(3))
        .map(|path| PathBuf::from(path.replace("\\\\", "\\")));
    configured.filter(|path| path.is_file()).or_else(|| {
        let candidate = steamapps.parent()?.join(if cfg!(target_os = "windows") {
            "steam.exe"
        } else {
            "steam"
        });
        candidate.is_file().then_some(candidate)
    })
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
            blender_window::focus_when_ready(
                acknowledgement.as_ref().and_then(|value| value.process_id),
                target.to_path_buf(),
            );
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
async fn create_asset(
    project_root: String,
    parent_dir: String,
    name: String,
    blender_path: Option<String>,
) -> Result<AssetMutationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_asset_impl(project_root, parent_dir, name, blender_path)
    })
    .await
    .map_err(|error| format!("Creation de l'asset impossible: {error}"))?
}

fn create_asset_impl(
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
    let mut command = Command::new(&blender);
    command
        .arg("--background")
        .arg("--python")
        .arg(&script)
        .arg("--")
        .arg(&target);
    apply_command_window_preference(&mut command, false);
    let output = command
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
fn create_asset_variant(
    project_root: String,
    asset_id: String,
    name: String,
) -> Result<AssetMutationResult, String> {
    validate_item_name(&name)?;
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    require_asset_workspace(&root, &project, &asset)?;
    let mut metadata = metadata_for_asset(&root, &asset);
    if metadata
        .details
        .variants
        .iter()
        .any(|variant| variant.name.eq_ignore_ascii_case(name.trim()))
    {
        return Err("Une variante porte deja ce nom.".to_string());
    }

    let key = version_key(&name);
    let source = root.join(&asset.source_path);
    let target = source
        .parent()
        .ok_or_else(|| "Dossier source invalide.".to_string())?
        .join(format!("{}.variant.{key}.blend", asset.name));
    if target.exists() {
        return Err(format!("{} existe deja.", target.display()));
    }
    copy_file(&source, &target)?;
    let source_path = relative_string(&root, &target)?;
    let output = version_output_path(&root, &asset, "variants", &key)?;
    let output_path = relative_string(&root, &output)?;
    let id = asset_id_for_path(&source_path);
    metadata.details.variants.push(AssetVariant {
        id,
        name: name.trim().to_string(),
        status: "ready".to_string(),
        source_path: Some(source_path),
        output_path: Some(output_path),
        source_modified_at: modified_time(&target).map(time_label),
        output_modified_at: None,
        notes: String::new(),
        uv_quality: None,
    });
    write_asset_metadata(&root, &metadata)?;

    Ok(AssetMutationResult {
        message: format!("La variante {} est prete dans Blender.", name.trim()),
        asset_id: Some(asset.id),
    })
}

#[tauri::command]
fn generate_asset_lods(
    project_root: String,
    asset_id: String,
    blender_path: Option<String>,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    require_asset_workspace(&root, &project, &asset)?;
    let blender = find_blender_executable(blender_path.as_deref()).ok_or_else(|| {
        "Blender est introuvable. Configure son chemin dans Parametres.".to_string()
    })?;
    let source = root.join(&asset.source_path);
    let workspace = source
        .parent()
        .ok_or_else(|| "Dossier source invalide.".to_string())?;
    let mut metadata = metadata_for_asset(&root, &asset);
    let presets = [("LOD1", 50.0), ("LOD2", 25.0), ("LOD3", 12.5)];
    let mut pending = Vec::new();

    for (level, ratio) in presets {
        if metadata
            .details
            .lods
            .iter()
            .any(|lod| lod.level.eq_ignore_ascii_case(level) && lod.source_path.is_some())
        {
            continue;
        }
        let key = version_key(level);
        let target = workspace.join(format!("{}.lod.{key}.blend", asset.name));
        if target.exists() {
            return Err(format!(
                "{} existe deja mais n'est pas lie a l'asset.",
                target.display()
            ));
        }
        pending.push((level.to_string(), ratio, key, target));
    }

    if pending.is_empty() {
        return Ok(AssetMutationResult {
            message: "Les trois LOD automatiques existent deja.".to_string(),
            asset_id: Some(asset.id),
        });
    }

    let temp_dir = root.join(".blendup").join("temp");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Impossible de preparer les LOD: {error}"))?;
    let script = temp_dir.join("generate_lods.py");
    fs::write(&script, GENERATE_LOD_SCRIPT)
        .map_err(|error| format!("Impossible de preparer Blender: {error}"))?;
    let mut command = Command::new(&blender);
    command
        .env("BLENDUP_LOD_GENERATION", "1")
        .arg("--background")
        .arg("--python")
        .arg(&script)
        .arg("--")
        .arg(&source);
    for (_, ratio, _, target) in &pending {
        command.arg(target).arg((ratio / 100.0).to_string());
    }
    let output = command
        .output()
        .map_err(|error| format!("Impossible de lancer Blender: {error}"))?;
    if !output.status.success() || pending.iter().any(|(_, _, _, target)| !target.is_file()) {
        for (_, _, _, target) in &pending {
            if target.is_file() {
                let _ = fs::remove_file(target);
            }
        }
        return Err(format!(
            "Blender n'a pas genere les LOD. {}",
            command_log(&output.stdout, &output.stderr)
        ));
    }

    for (level, ratio, key, target) in pending {
        let source_path = relative_string(&root, &target)?;
        let output_path =
            relative_string(&root, &version_output_path(&root, &asset, "lods", &key)?)?;
        metadata.details.lods.push(AssetLod {
            id: asset_id_for_path(&source_path),
            level,
            status: "ready".to_string(),
            target_ratio: Some(ratio),
            triangle_budget: None,
            generated: true,
            source_path: Some(source_path),
            output_path: Some(output_path),
            source_modified_at: modified_time(&target).map(time_label),
            output_modified_at: None,
            notes: "Genere automatiquement avec un modificateur Decimate editable.".to_string(),
            uv_quality: None,
        });
    }
    metadata.details.lods.sort_by(|left, right| {
        left.target_ratio
            .partial_cmp(&right.target_ratio)
            .unwrap_or(std::cmp::Ordering::Equal)
            .reverse()
    });
    write_asset_metadata(&root, &metadata)?;

    Ok(AssetMutationResult {
        message: "LOD1, LOD2 et LOD3 ont ete generes dans Blender.".to_string(),
        asset_id: Some(asset.id),
    })
}

#[tauri::command]
fn delete_asset_version(
    project_root: String,
    asset_id: String,
    version_id: String,
    version_kind: String,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let source = root.join(&asset.source_path);
    let workspace = source
        .parent()
        .ok_or_else(|| "Dossier source invalide.".to_string())?;
    let mut metadata = metadata_for_asset(&root, &asset);
    let (label, source_path, output_path) = if version_kind == "variant" {
        let index = metadata
            .details
            .variants
            .iter()
            .position(|item| item.id == version_id)
            .ok_or_else(|| "Variante introuvable.".to_string())?;
        let item = metadata.details.variants.remove(index);
        (item.name, item.source_path, item.output_path)
    } else if version_kind == "lod" {
        let index = metadata
            .details
            .lods
            .iter()
            .position(|item| item.id == version_id)
            .ok_or_else(|| "LOD introuvable.".to_string())?;
        let item = metadata.details.lods.remove(index);
        (item.level, item.source_path, item.output_path)
    } else {
        return Err("Type de version invalide.".to_string());
    };

    if let (Some(source), Some(output)) = (source_path.as_deref(), output_path.as_deref()) {
        cleanup_legacy_version_output(&root, &asset, source, output)?;
    }

    if let Some(relative) = source_path {
        let target = root.join(safe_relative_path(&relative)?);
        if target == source || target.parent() != Some(workspace) {
            return Err("Le fichier de version n'est pas dans le dossier de l'asset.".to_string());
        }
        if target.exists() {
            trash_path(&target)?;
        }
    }
    if let Some(relative) = output_path {
        let target = root.join(safe_relative_path(&relative)?);
        if !target.starts_with(root.join(asset_output_root(&project))) {
            return Err("L'export de version est hors du dossier Assets.".to_string());
        }
        if target.exists() {
            trash_path(&target)?;
        }
    }
    write_asset_metadata(&root, &metadata)?;

    Ok(AssetMutationResult {
        message: format!("{} a ete place dans la corbeille.", label),
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
    if project.engine != "none" {
        write_json(&export_state_file(&root), &state)?;
    }
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
    if project.engine != "none" {
        write_json(&export_state_file(&root), &state)?;
    }
    Ok(AssetMutationResult {
        message: "Le dossier a ete place dans la corbeille.".to_string(),
        asset_id: None,
    })
}

#[tauri::command]
fn set_asset_uv_ignored(
    project_root: String,
    asset_id: String,
    ignored: bool,
) -> Result<AssetMutationResult, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let asset = find_asset(&root, &project, &asset_id)?;
    let mut metadata = metadata_for_asset(&root, &asset);
    metadata.details.ignore_uv_validation = ignored;
    write_asset_metadata(&root, &metadata)?;
    Ok(AssetMutationResult {
        asset_id: Some(asset.id),
        message: if ignored {
            "Asset ignoré pour la vérification UV (variantes et LOD inclus)."
        } else {
            "Vérification UV réactivée pour cet asset."
        }
        .into(),
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
            item.status = normalize_version_status(&item.status);
            item
        })
        .collect();
    metadata.details.lods = lods
        .into_iter()
        .filter(|item| !item.level.trim().is_empty())
        .map(|mut item| {
            item.level = item.level.trim().to_string();
            item.status = normalize_version_status(&item.status);
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
    let mut metadata = read_asset_metadata(root)
        .remove(&normalize_relative_string(&asset.source_path))
        .unwrap_or_else(|| AssetMetadata {
            schema_version: 2,
            kind: "asset_metadata".to_string(),
            id: asset.id.clone(),
            source_path: asset.source_path.clone(),
            details: asset.metadata.clone(),
        });
    refresh_version_output_paths(&asset.output_path, &asset.format, &mut metadata.details);
    metadata
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
    let mut metadata = metadata_for_asset(root, asset);
    fs::rename(&source, target)
        .map_err(|error| format!("Impossible de deplacer {}: {error}", source.display()))?;
    rename_managed_version_sources(root, &source, target, &mut metadata.details)?;
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

    metadata.source_path = relative_string(root, target)?;
    relocate_version_output_paths(root, &old_output, &new_output, &mut metadata.details)?;
    write_asset_metadata(root, &metadata)?;
    let mut state = read_export_state(root);
    if let Some(record) = state.exports.get_mut(&asset.id) {
        record.output_path = relative_string(root, &new_output)?;
    }
    if project.engine == "none" {
        Ok(())
    } else {
        write_json(&export_state_file(root), &state)
    }
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

fn require_asset_workspace(
    root: &Path,
    project: &ProjectConfig,
    asset: &BlendUpAsset,
) -> Result<(), String> {
    if asset_owns_workspace(root, project, asset) {
        Ok(())
    } else {
        Err("Range d'abord cet asset dans son propre dossier.".to_string())
    }
}

fn version_key(value: &str) -> String {
    let key = slug(value);
    if key.is_empty() {
        "version".to_string()
    } else {
        key
    }
}

fn version_output_path(
    root: &Path,
    asset: &BlendUpAsset,
    directory: &str,
    key: &str,
) -> Result<PathBuf, String> {
    let base_output = root.join(safe_relative_path(&asset.output_path)?);
    let parent = base_output
        .parent()
        .ok_or_else(|| "Dossier d'export invalide.".to_string())?;
    Ok(parent
        .join(directory)
        .join(format!("{key}.{}", asset.format)))
}

fn legacy_version_output_path(
    root: &Path,
    asset: &BlendUpAsset,
    source_path: &str,
) -> Result<PathBuf, String> {
    let source = safe_relative_path(source_path)?;
    let source_stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nom de version invalide.".to_string())?;
    let base_output = root.join(safe_relative_path(&asset.output_path)?);
    let output_parent = base_output
        .parent()
        .ok_or_else(|| "Dossier d'export invalide.".to_string())?;
    Ok(output_parent.join(format!("{source_stem}.{}", asset.format)))
}

fn cleanup_legacy_version_output(
    root: &Path,
    asset: &BlendUpAsset,
    source_path: &str,
    output_path: &str,
) -> Result<bool, String> {
    let legacy_output = legacy_version_output_path(root, asset, source_path)?;
    let managed_output = root.join(safe_relative_path(output_path)?);
    if legacy_output != managed_output && legacy_output.is_file() {
        trash_path(&legacy_output)?;
        return Ok(true);
    }
    Ok(false)
}

fn cleanup_legacy_version_outputs(root: &Path, asset: &BlendUpAsset) -> Result<usize, String> {
    let mut cleaned = 0;
    for variant in &asset.metadata.variants {
        if let (Some(source), Some(output)) = (&variant.source_path, &variant.output_path) {
            cleaned += usize::from(cleanup_legacy_version_output(root, asset, source, output)?);
        }
    }
    for lod in &asset.metadata.lods {
        if let (Some(source), Some(output)) = (&lod.source_path, &lod.output_path) {
            cleaned += usize::from(cleanup_legacy_version_output(root, asset, source, output)?);
        }
    }
    Ok(cleaned)
}

fn rename_managed_version_sources(
    root: &Path,
    old_base: &Path,
    new_base: &Path,
    details: &mut AssetMetadataView,
) -> Result<(), String> {
    let old_parent = old_base
        .parent()
        .ok_or_else(|| "Dossier source invalide.".to_string())?;
    let new_parent = new_base
        .parent()
        .ok_or_else(|| "Dossier cible invalide.".to_string())?;
    let old_stem = old_base
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nom source invalide.".to_string())?;
    let new_stem = new_base
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nom cible invalide.".to_string())?;

    let relocate = |source_path: &mut Option<String>| -> Result<(), String> {
        let Some(relative) = source_path.clone() else {
            return Ok(());
        };
        let existing = root.join(safe_relative_path(&relative)?);
        if existing.parent() != Some(old_parent) {
            return Ok(());
        }
        let Some(file_name) = existing.file_name().and_then(|value| value.to_str()) else {
            return Ok(());
        };
        let Some(suffix) = file_name.strip_prefix(&format!("{old_stem}.")) else {
            return Ok(());
        };
        if !suffix.starts_with("variant.") && !suffix.starts_with("lod.") {
            return Ok(());
        }
        let target = new_parent.join(format!("{new_stem}.{suffix}"));
        if existing != target && existing.exists() {
            if target.exists() {
                return Err(format!("{} existe deja.", target.display()));
            }
            fs::rename(&existing, &target).map_err(|error| {
                format!("Impossible de deplacer {}: {error}", existing.display())
            })?;
        }
        *source_path = Some(relative_string(root, &target)?);
        Ok(())
    };

    for variant in &mut details.variants {
        relocate(&mut variant.source_path)?;
    }
    for lod in &mut details.lods {
        relocate(&mut lod.source_path)?;
    }
    Ok(())
}

fn relocate_version_output_paths(
    root: &Path,
    old_base_output: &Path,
    new_base_output: &Path,
    details: &mut AssetMetadataView,
) -> Result<(), String> {
    let Some(old_parent) = old_base_output.parent() else {
        return Ok(());
    };
    let Some(new_parent) = new_base_output.parent() else {
        return Ok(());
    };
    let old_relative = relative_string(root, old_parent)?;
    let new_relative = relative_string(root, new_parent)?;
    for output_path in details
        .variants
        .iter_mut()
        .map(|item| &mut item.output_path)
        .chain(details.lods.iter_mut().map(|item| &mut item.output_path))
    {
        if let Some(value) = output_path.as_mut() {
            if path_is_inside(value, &old_relative) {
                *value = replace_path_prefix(value, &old_relative, &new_relative);
            }
        }
    }
    Ok(())
}

fn prepare_copied_version_metadata(
    root: &Path,
    old_base: &Path,
    new_base: &Path,
    project: &ProjectConfig,
    details: &mut AssetMetadataView,
) -> Result<(), String> {
    let old_stem = old_base
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nom source invalide.".to_string())?;
    let new_stem = new_base
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nom de copie invalide.".to_string())?;
    let new_workspace = new_base
        .parent()
        .ok_or_else(|| "Dossier de copie invalide.".to_string())?;
    let new_base_output = output_path_for_source(root, project, new_base)?;
    let output_parent = new_base_output
        .parent()
        .ok_or_else(|| "Dossier d'export invalide.".to_string())?;
    let export_format = project_output_format(project);

    let prepare = |source_path: &mut Option<String>,
                   output_path: &mut Option<String>,
                   id: &mut String,
                   directory: &str,
                   key: &str|
     -> Result<(), String> {
        let Some(relative) = source_path.clone() else {
            *output_path = None;
            return Ok(());
        };
        let old_version = root.join(safe_relative_path(&relative)?);
        let Some(file_name) = old_version.file_name().and_then(|value| value.to_str()) else {
            return Ok(());
        };
        let copied = new_workspace.join(file_name);
        let suffix = file_name
            .strip_prefix(&format!("{old_stem}."))
            .unwrap_or(file_name);
        let renamed = new_workspace.join(format!("{new_stem}.{suffix}"));
        if copied != renamed && copied.exists() {
            fs::rename(&copied, &renamed)
                .map_err(|error| format!("Impossible de renommer {}: {error}", copied.display()))?;
        }
        let new_source = relative_string(root, &renamed)?;
        *id = asset_id_for_path(&new_source);
        *source_path = Some(new_source);
        *output_path = Some(relative_string(
            root,
            &output_parent
                .join(directory)
                .join(format!("{key}.{export_format}")),
        )?);
        Ok(())
    };

    for variant in &mut details.variants {
        prepare(
            &mut variant.source_path,
            &mut variant.output_path,
            &mut variant.id,
            "variants",
            &version_key(&variant.name),
        )?;
    }
    for lod in &mut details.lods {
        prepare(
            &mut lod.source_path,
            &mut lod.output_path,
            &mut lod.id,
            "lods",
            &version_key(&lod.level),
        )?;
    }
    Ok(())
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
    prepare_copied_version_metadata(root, &source, &target, project, &mut metadata.details)?;
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
    showcases::ensure_idle(root)?;
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
    let old_output_rel = relative_string(root, &old_output)?;
    let new_output_rel = relative_string(root, &new_output)?;

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
            for source_path in metadata
                .details
                .variants
                .iter_mut()
                .map(|item| &mut item.source_path)
                .chain(
                    metadata
                        .details
                        .lods
                        .iter_mut()
                        .map(|item| &mut item.source_path),
                )
            {
                if let Some(value) = source_path.as_mut() {
                    if path_is_inside(value, &old_rel) {
                        *value = replace_path_prefix(value, &old_rel, &new_rel);
                    }
                }
            }
            for output_path in metadata
                .details
                .variants
                .iter_mut()
                .map(|item| &mut item.output_path)
                .chain(
                    metadata
                        .details
                        .lods
                        .iter_mut()
                        .map(|item| &mut item.output_path),
                )
            {
                if let Some(value) = output_path.as_mut() {
                    if path_is_inside(value, &old_output_rel) {
                        *value = replace_path_prefix(value, &old_output_rel, &new_output_rel);
                    }
                }
            }
            if let Some(record) = state.exports.get_mut(&metadata.id) {
                let output =
                    output_path_for_source(root, project, &root.join(&metadata.source_path))?;
                record.output_path = relative_string(root, &output)?;
            }
            write_asset_metadata(root, &metadata)?;
        }
    }
    showcases::retarget(root, &old_rel, &new_rel)?;
    if project.engine == "none" {
        Ok(())
    } else {
        write_json(&export_state_file(root), &state)
    }
}

fn output_path_for_source(
    root: &Path,
    project: &ProjectConfig,
    source: &Path,
) -> Result<PathBuf, String> {
    let relative = source
        .strip_prefix(root.join(&project.paths.art_root))
        .map_err(|_| "La source doit rester dans Art.".to_string())?;
    let mut output = root.join(asset_output_root(project)).join(relative);
    output.set_extension(project_output_format(project));
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
    Ok(root.join(asset_output_root(project)).join(relative))
}

fn write_godot_lod_support(
    root: &Path,
    project: &ProjectConfig,
    asset: &BlendUpAsset,
) -> Result<Option<String>, String> {
    let base_output = root.join(safe_relative_path(&asset.output_path)?);
    if !base_output.is_file() {
        return Ok(None);
    }
    let mut lods = asset
        .metadata
        .lods
        .iter()
        .filter_map(|lod| {
            let output = root.join(safe_relative_path(lod.output_path.as_deref()?).ok()?);
            output
                .is_file()
                .then_some((lod.target_ratio.unwrap_or(0.0), output))
        })
        .collect::<Vec<_>>();
    lods.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    if lods.is_empty() {
        return Ok(None);
    }

    let engine_root = root.join(&project.paths.engine_root);
    let res_path = |path: &Path| -> Result<String, String> {
        let relative = path
            .strip_prefix(&engine_root)
            .map_err(|_| "Un export LOD est hors du projet Godot.".to_string())?;
        Ok(format!("res://{}", normalize_path(relative)))
    };
    let helper = root
        .join(&project.paths.engine_assets_root)
        .join("BlendUp")
        .join("blendup_lod_group.gd");
    fs::create_dir_all(
        helper
            .parent()
            .ok_or_else(|| "Dossier d'aide Godot invalide.".to_string())?,
    )
    .map_err(|error| format!("Impossible de preparer l'aide Godot: {error}"))?;
    fs::write(&helper, GODOT_LOD_GROUP_SCRIPT)
        .map_err(|error| format!("Impossible d'ecrire {}: {error}", helper.display()))?;

    let mut scenes = vec![base_output];
    scenes.extend(lods.into_iter().map(|(_, path)| path));
    let helper_resource = res_path(&helper)?;
    let mut content = format!(
        "[gd_scene load_steps={} format=3]\n\n[ext_resource type=\"Script\" path=\"{}\" id=\"1_script\"]\n",
        scenes.len() + 2,
        helper_resource
    );
    for (index, scene) in scenes.iter().enumerate() {
        content.push_str(&format!(
            "[ext_resource type=\"PackedScene\" path=\"{}\" id=\"{}_lod\"]\n",
            res_path(scene)?,
            index + 2
        ));
    }
    let resources = scenes
        .iter()
        .enumerate()
        .map(|(index, _)| format!("ExtResource(\"{}_lod\")", index + 2))
        .collect::<Vec<_>>()
        .join(", ");
    let distances = (0..scenes.len().saturating_sub(1))
        .map(|index| match index {
            0 => 20.0,
            1 => 45.0,
            2 => 90.0,
            _ => 90.0 * 2_f64.powi((index - 2) as i32),
        })
        .map(|distance| format!("{distance:.1}"))
        .collect::<Vec<_>>()
        .join(", ");
    content.push_str(&format!(
        "\n[node name=\"{}_LOD\" type=\"Node3D\"]\nscript = ExtResource(\"1_script\")\nlod_scenes = Array[PackedScene]([{}])\nlod_distances = PackedFloat32Array([{}])\n",
        asset.name, resources, distances
    ));
    let scene_path = scenes[0]
        .parent()
        .ok_or_else(|| "Dossier d'export LOD invalide.".to_string())?
        .join(format!("{}_lod.tscn", asset.name));
    fs::write(&scene_path, content)
        .map_err(|error| format!("Impossible d'ecrire {}: {error}", scene_path.display()))?;
    Ok(Some(scene_path.to_string_lossy().to_string()))
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
        if file_type.is_symlink() || is_blender_backup(&entry.path()) {
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

fn is_blender_backup(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension
                .to_ascii_lowercase()
                .strip_prefix("blend")
                .is_some_and(|suffix| {
                    !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
                })
        })
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
    let format = project_output_format(project);
    let mut assets = Vec::with_capacity(blend_files.len());

    for source in blend_files {
        let source_relative_to_art = source
            .strip_prefix(&art_root)
            .map_err(|error| format!("Chemin Art invalide: {error}"))?;
        let mut output = root
            .join(asset_output_root(project))
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
        let ignored = metadata
            .as_ref()
            .is_some_and(|m| m.details.ignore_uv_validation);
        let uv_quality = apply_uv_exemption(read_uv_quality(root, project, &source_path), ignored);
        let failed_record = export_state
            .exports
            .get(&id)
            .filter(|record| project.engine != "none" && !record.success)
            .filter(|record| {
                !is_uv_export_error(&record.message)
                    || (project.blender.validate_uvs
                        && !ignored
                        && !uv_quality.as_ref().is_some_and(|q| !q.stale && !q.blocked))
            });
        let status = if project.engine == "none" {
            "local"
        } else {
            match (source_time, output_time, failed_record) {
                (_, _, Some(_)) => "error",
                (Some(source_modified), Some(output_modified), _)
                    if output_modified >= source_modified =>
                {
                    "exported"
                }
                (_, Some(_), _) => "outdated",
                _ => "ready",
            }
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
        refresh_version_output_paths(&output_path, format, &mut details);
        refresh_version_statuses(&root, &mut details, project.engine == "none");
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

        for version in &mut details.variants {
            version.uv_quality = version
                .source_path
                .as_deref()
                .and_then(|path| apply_uv_exemption(read_uv_quality(root, project, path), ignored));
        }
        for version in &mut details.lods {
            version.uv_quality = version
                .source_path
                .as_deref()
                .and_then(|path| apply_uv_exemption(read_uv_quality(root, project, path), ignored));
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
            uv_quality,
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
                        status: normalize_version_status(
                            item.get("status")
                                .and_then(Value::as_str)
                                .unwrap_or("missing"),
                        ),
                        source_path: json_string(item, "sourcePath"),
                        output_path: json_string(item, "outputPath"),
                        source_modified_at: json_string(item, "sourceModifiedAt"),
                        output_modified_at: json_string(item, "outputModifiedAt"),
                        notes: json_string(item, "notes").unwrap_or_default(),
                        uv_quality: None,
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
                        status: normalize_version_status(
                            item.get("status")
                                .and_then(Value::as_str)
                                .unwrap_or("missing"),
                        ),
                        target_ratio: item.get("targetRatio").and_then(Value::as_f64),
                        triangle_budget: item.get("triangleBudget").and_then(Value::as_u64),
                        generated: item
                            .get("generated")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                        source_path: json_string(item, "sourcePath"),
                        output_path: json_string(item, "outputPath"),
                        source_modified_at: json_string(item, "sourceModifiedAt"),
                        output_modified_at: json_string(item, "outputModifiedAt"),
                        notes: json_string(item, "notes").unwrap_or_default(),
                        uv_quality: None,
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
            ignore_uv_validation: value
                .get("ignoreUvValidation")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            notes,
            tags,
            thumbnail_path,
            variants,
            lods,
        },
    })
}

fn normalize_version_status(value: &str) -> String {
    match value {
        "exported" => "exported",
        "outdated" => "outdated",
        "ready" => "ready",
        "error" => "error",
        _ => "missing",
    }
    .to_string()
}

fn refresh_version_output_paths(output_path: &str, format: &str, details: &mut AssetMetadataView) {
    let Some(parent) = Path::new(output_path).parent() else {
        return;
    };
    for variant in &mut details.variants {
        if let Some(source) = &variant.source_path {
            let key = managed_version_key(source, ".variant.", &variant.name);
            variant.output_path = Some(normalize_path(
                &parent.join("variants").join(format!("{key}.{format}")),
            ));
        }
    }
    for lod in &mut details.lods {
        if let Some(source) = &lod.source_path {
            let key = managed_version_key(source, ".lod.", &lod.level);
            lod.output_path = Some(normalize_path(
                &parent.join("lods").join(format!("{key}.{format}")),
            ));
        }
    }
}

fn refresh_version_statuses(root: &Path, details: &mut AssetMetadataView, standalone: bool) {
    fn refresh(
        root: &Path,
        source_path: &Option<String>,
        output_path: &Option<String>,
        standalone: bool,
    ) -> (String, Option<String>, Option<String>) {
        let Some(source_relative) = source_path else {
            return ("missing".to_string(), None, None);
        };
        let Ok(source_relative) = safe_relative_path(source_relative) else {
            return ("error".to_string(), None, None);
        };
        let source = root.join(source_relative);
        if !source.is_file() {
            return ("missing".to_string(), None, None);
        }
        let source_time = modified_time(&source);
        let output_time = output_path
            .as_ref()
            .and_then(|value| safe_relative_path(value).ok())
            .map(|value| root.join(value))
            .and_then(|path| modified_time(&path));
        let status = if standalone {
            "local"
        } else {
            match (source_time, output_time) {
                (Some(source_modified), Some(output_modified))
                    if output_modified >= source_modified =>
                {
                    "exported"
                }
                (_, Some(_)) => "outdated",
                _ => "ready",
            }
        };
        (
            status.to_string(),
            source_time.map(time_label),
            output_time.map(time_label),
        )
    }

    for variant in &mut details.variants {
        let (status, source_modified, output_modified) =
            refresh(root, &variant.source_path, &variant.output_path, standalone);
        variant.status = status;
        variant.source_modified_at = source_modified;
        variant.output_modified_at = output_modified;
    }
    for lod in &mut details.lods {
        let (status, source_modified, output_modified) =
            refresh(root, &lod.source_path, &lod.output_path, standalone);
        lod.status = status;
        lod.source_modified_at = source_modified;
        lod.output_modified_at = output_modified;
    }
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
            && !is_managed_version_file(&path)
        {
            files.push(path);
        }
    }
    Ok(())
}

fn is_managed_version_file(path: &Path) -> bool {
    let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
        return false;
    };
    let base = stem
        .split_once(".variant.")
        .or_else(|| stem.split_once(".lod."))
        .map(|(base, _)| base);
    let Some(base) = base else {
        return false;
    };
    path.parent()
        .is_some_and(|parent| parent.join(format!("{base}.blend")).is_file())
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
    if project.engine != "none" && !assets_path.is_dir() {
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
        let mut uv_blocked = false;
        let previous_uv_failure = asset.last_error.as_deref().is_some_and(is_uv_export_error);
        if project.blender.validate_uvs && !asset.metadata.ignore_uv_validation {
            let mut versions = vec![(asset.name.as_str(), asset.uv_quality.as_ref())];
            versions.extend(
                asset
                    .metadata
                    .variants
                    .iter()
                    .filter(|v| v.source_path.is_some())
                    .map(|v| (v.name.as_str(), v.uv_quality.as_ref())),
            );
            versions.extend(
                asset
                    .metadata
                    .lods
                    .iter()
                    .filter(|v| v.source_path.is_some())
                    .map(|v| (v.level.as_str(), v.uv_quality.as_ref())),
            );
            for (index, (label, quality)) in versions.into_iter().enumerate() {
                let (title, detail, severity, action) = match quality {
                    Some(quality) if quality.blocked => {
                        uv_blocked = true;
                        ("Qualité UV insuffisante", uv_problem_reason(quality), "error", "Ouvrir")
                    }
                    Some(quality) if !quality.stale => continue,
                    _ if index == 0 && previous_uv_failure => {
                        uv_blocked = true;
                        ("Dernier export bloqué par les UV", quality.map(|quality| format!("Dernier contrôle : {}", uv_problem_reason(quality))).unwrap_or_else(|| export_error_summary(asset.last_error.as_deref().unwrap_or_default())) + " Un nouveau contrôle est nécessaire.", "error", "Vérifier")
                    }
                    _ => ("UV à vérifier", format!("{} : aucun contrôle UV à jour. Le prochain export sera vérifié dans Blender.", label), "warning", "Vérifier"),
                };
                let mut issue = problem(
                    &format!("{}_uv_{index}", asset.id),
                    severity,
                    "blender",
                    Some(asset.id.clone()),
                    title,
                    &detail,
                    Some(action),
                );
                issue.category = "uv".into();
                issue.version_label = Some(if index == 0 {
                    "Asset principal".into()
                } else {
                    label.into()
                });
                issue.score = quality.filter(|q| !q.stale).map(|q| q.report.score);
                issue.minimum_score = Some(project.blender.minimum_uv_score);
                issue.technical_details = quality
                    .map(|q| {
                        let mut details = q.report.issues.clone();
                        details.extend(q.report.preparation_warnings.clone());
                        details.join("\n")
                    })
                    .filter(|text| !text.is_empty());
                if previous_uv_failure && index == 0 {
                    issue.technical_details = Some(format!(
                        "{}\n\nDernier export :\n{}",
                        issue.technical_details.unwrap_or_default(),
                        asset.last_error.as_deref().unwrap_or_default()
                    ));
                }
                problems.push(issue);
            }
        }
        if uv_blocked && (asset.status != "error" || previous_uv_failure) {
            continue;
        }
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
            "error" => {
                let raw = asset
                    .last_error
                    .as_deref()
                    .unwrap_or("Blender n'a pas terminé l'export.");
                let mut issue = problem(
                    &format!("{}_export_error", asset.id),
                    "error",
                    "blender",
                    Some(asset.id.clone()),
                    "Dernier export en erreur",
                    &export_error_summary(raw),
                    Some("Exporter"),
                );
                issue.technical_details = Some(raw.into());
                problems.push(issue);
            }
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
    let category = if asset_id.is_some() {
        "export"
    } else {
        "project"
    }
    .to_string();
    BlendUpProblem {
        id: id.to_string(),
        severity: severity.to_string(),
        source: source.to_string(),
        asset_id,
        title: title.to_string(),
        detail: detail.to_string(),
        action_label: action_label.map(str::to_string),
        category,
        version_label: None,
        score: None,
        minimum_score: None,
        technical_details: None,
    }
}

fn is_uv_export_error(message: &str) -> bool {
    message.contains("Export bloqué par le contrôle UV")
        || message.contains("Export bloque par le controle UV")
}

fn export_error_summary(message: &str) -> String {
    let cause = message
        .lines()
        .rev()
        .find(|line| {
            [
                "RuntimeError:",
                "ValueError:",
                "TypeError:",
                "OSError:",
                "FileNotFoundError:",
                "PermissionError:",
            ]
            .iter()
            .any(|prefix| line.trim().starts_with(prefix))
        })
        .or_else(|| message.lines().rev().find(|line| !line.trim().is_empty()))
        .unwrap_or("Blender n'a pas terminé l'export.")
        .trim();
    let cause = cause
        .split_once(": ")
        .map(|(_, reason)| reason)
        .unwrap_or(cause);
    cause.chars().take(400).collect()
}

fn uv_problem_reason(quality: &UvQualitySummary) -> String {
    if let Some(error) = &quality.report.error {
        return format!(
            "Le contrôle n'a pas abouti : {}",
            export_error_summary(error)
        );
    }
    let worst = quality
        .report
        .objects
        .iter()
        .min_by(|a, b| a.score.total_cmp(&b.score));
    if let Some(mesh) = worst {
        if mesh.missing_uv_triangles > 0 {
            return format!("{} : {} triangles n'ont pas de coordonnées UV. Crée une UV Map et déplie ce maillage dans Blender.", mesh.object_name, mesh.missing_uv_triangles);
        }
        if mesh.degenerate_triangles > 0 {
            return format!("{} : {} triangles ont des UV écrasées ou invalides. Vérifie les coutures, puis refais le dépliage UV.", mesh.object_name, mesh.degenerate_triangles);
        }
        if !quality.report.complete {
            return "L'analyse est incomplète. Consulte les mesures et relance le contrôle.".into();
        }
        return format!(
            "{} obtient {:.1}/100. {}",
            mesh.object_name,
            mesh.score,
            quality
                .report
                .issues
                .iter()
                .find(|issue| issue.starts_with(&mesh.object_name))
                .map(String::as_str)
                .unwrap_or(
                    "Vérifie l'étirement, la densité et les chevauchements UV dans sa fiche."
                )
        );
    }
    "Aucun maillage avec des UV utilisables n'a été détecté.".into()
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
    let default_root = if engine == "none" {
        String::new()
    } else {
        engine_display_name(&engine).to_string()
    };
    let art_root = json_string(paths, "artRoot").unwrap_or_else(|| "Art".to_string());
    let engine_root = if engine == "none" {
        String::new()
    } else {
        json_string(paths, "engineRoot")
            .or_else(|| {
                if engine == "unity" {
                    json_string(paths, "unityRoot")
                } else {
                    json_string(paths, "godotRoot")
                }
            })
            .unwrap_or(default_root)
    };
    let engine_assets_root = if engine == "none" {
        String::new()
    } else {
        json_string(paths, "engineAssetsRoot")
            .or_else(|| {
                if engine == "unity" {
                    json_string(paths, "unityAssetsRoot")
                } else {
                    json_string(paths, "godotAssetsRoot")
                }
            })
            .unwrap_or_else(|| format!("{engine_root}/Assets"))
    };

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
        blender: serde_json::from_value(
            value
                .get("blender")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({})),
        )
        .map_err(|error| format!("Paramètres Blender invalides: {error}"))?,
        paths: ProjectPaths {
            art_root: normalize_relative_string(&art_root),
            engine_root: normalize_relative_string(&engine_root),
            engine_assets_root: normalize_relative_string(&engine_assets_root),
        },
    })
}

fn new_project_config(name: &str, engine: &str) -> ProjectConfig {
    let engine_root = if engine == "none" {
        String::new()
    } else {
        engine_display_name(engine).to_string()
    };
    ProjectConfig {
        schema_version: 2,
        kind: "project".to_string(),
        project_id: format!("project_{}", slug(name)),
        name: name.trim().to_string(),
        engine: engine.to_string(),
        blender: BlenderProjectSettings::default(),
        paths: ProjectPaths {
            art_root: "Art".to_string(),
            engine_assets_root: if engine == "none" {
                String::new()
            } else {
                format!("{engine_root}/Assets")
            },
            engine_root,
        },
    }
}

fn validate_project_paths(project: &ProjectConfig) -> Result<(), String> {
    if !project.blender.minimum_uv_score.is_finite()
        || !(1.0..=100.0).contains(&project.blender.minimum_uv_score)
    {
        return Err("Le score UV minimum doit être compris entre 1 et 100.".to_string());
    }
    safe_relative_path(&project.paths.art_root)?;
    if project.engine != "none" {
        safe_relative_path(&project.paths.engine_root)?;
        safe_relative_path(&project.paths.engine_assets_root)?;
    }
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
    if asset.status == "local" {
        return Ok(());
    }
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
        "none" => Ok("none".to_string()),
        _ => Err("Le type de projet doit etre 3D, Godot ou Unity.".to_string()),
    }
}

fn engine_display_name(engine: &str) -> &'static str {
    match engine {
        "godot" => "Godot",
        "unity" => "Unity",
        _ => "un projet 3D",
    }
}

fn asset_output_root(project: &ProjectConfig) -> &str {
    if project.engine == "none" {
        ".blendup/cache/previews"
    } else {
        &project.paths.engine_assets_root
    }
}

fn project_output_format(project: &ProjectConfig) -> &str {
    if project.engine == "unity" {
        "fbx"
    } else {
        "glb"
    }
}

fn require_project_engine(project: &ProjectConfig) -> Result<(), String> {
    if project.engine == "none" {
        Err("Ce projet 3D n'a pas de moteur lie. Utilise Generer l'aperçu pour visualiser un asset.".to_string())
    } else {
        Ok(())
    }
}

fn managed_version_key(source: &str, marker: &str, fallback: &str) -> String {
    Path::new(source)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .and_then(|stem| stem.rsplit_once(marker))
        .map(|(_, key)| key.to_string())
        .unwrap_or_else(|| version_key(fallback))
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
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::{
            System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED},
            UI::Shell::ShellExecuteW,
        };
        let name = windows_shell_path(path)?;
        let operation = "open\0".encode_utf16().collect::<Vec<_>>();
        unsafe {
            let initialized = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            let result = ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                name.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            ) as isize;
            if initialized >= 0 {
                CoUninitialize();
            }
            return if result > 32 {
                Ok(())
            } else {
                Err(format!(
                    "Impossible d'ouvrir {} dans l'explorateur Windows (code {result}).",
                    path.display()
                ))
            };
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let result = if cfg!(target_os = "macos") {
            Command::new("open").arg(path).spawn()
        } else {
            Command::new("xdg-open").arg(path).spawn()
        };
        result
            .map(|_| ())
            .map_err(|error| format!("Impossible d'ouvrir {}: {error}", path.display()))
    }
}

fn reveal_with_system(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return reveal_in_windows_explorer(path);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let result = if cfg!(target_os = "macos") {
            Command::new("open").arg("-R").arg(path).spawn()
        } else {
            Command::new("xdg-open")
                .arg(path.parent().unwrap_or(path))
                .spawn()
        };
        result
            .map(|_| ())
            .map_err(|error| format!("Impossible d'afficher {}: {error}", path.display()))
    }
}

#[cfg(target_os = "windows")]
fn windows_shell_path(path: &Path) -> Result<Vec<u16>, String> {
    use std::os::windows::ffi::OsStrExt;
    let absolute = fs::canonicalize(path).map_err(|error| error.to_string())?;
    // Rust canonicalizes with the extended path prefix; Explorer expects its
    // regular display path, including UNC shares and Unicode names.
    let regular = match absolute.components().next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            std::path::Prefix::VerbatimDisk(drive) => {
                PathBuf::from(format!("{}:\\", drive as char))
                    .join(absolute.components().skip(2).collect::<PathBuf>())
            }
            std::path::Prefix::VerbatimUNC(server, share) => PathBuf::from("\\\\")
                .join(server)
                .join(share)
                .join(absolute.components().skip(2).collect::<PathBuf>()),
            _ => absolute,
        },
        _ => absolute,
    };
    Ok(regular.as_os_str().encode_wide().chain(Some(0)).collect())
}

#[cfg(target_os = "windows")]
fn reveal_in_windows_explorer(path: &Path) -> Result<(), String> {
    use windows_sys::Win32::{
        Foundation::RPC_E_CHANGED_MODE,
        System::Com::{CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED},
        UI::Shell::{SHOpenFolderAndSelectItems, SHParseDisplayName},
    };
    let name = windows_shell_path(path)?;
    unsafe {
        let initialized = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
        if initialized < 0 && initialized != RPC_E_CHANGED_MODE {
            return Err(format!(
                "Initialisation de l'explorateur impossible ({initialized:#x})."
            ));
        }
        let mut pidl = std::ptr::null_mut();
        let parsed = SHParseDisplayName(
            name.as_ptr(),
            std::ptr::null_mut(),
            &mut pidl,
            0,
            std::ptr::null_mut(),
        );
        let opened = if parsed >= 0 {
            SHOpenFolderAndSelectItems(pidl, 0, std::ptr::null(), 0)
        } else {
            parsed
        };
        if !pidl.is_null() {
            CoTaskMemFree(pidl.cast());
        }
        if initialized >= 0 {
            CoUninitialize();
        }
        if opened < 0 {
            return Err(format!(
                "Impossible d'afficher {} dans l'explorateur ({opened:#x}).",
                path.display()
            ));
        }
    }
    Ok(())
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

#[cfg(target_os = "windows")]
fn configure_platform_app_identity() {
    use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    let app_id = "com.blendup.desktop"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
    }
}

#[cfg(not(target_os = "windows"))]
fn configure_platform_app_identity() {}

fn main() {
    configure_platform_app_identity();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon().cloned(),
            ) {
                window.set_icon(icon)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            showcases::configure_showcase,
            showcases::rebuild_showcase,
            showcases::setup_editor_integration,
            showcases::open_showcase_godot,
            read_user_settings,
            save_user_settings,
            read_default_project_snapshot,
            read_project_snapshot,
            create_project,
            update_project_engine,
            update_project_paths,
            detect_blender,
            export_asset,
            generate_asset_preview,
            export_asset_version,
            export_asset_versions,
            clear_asset_exports,
            open_project_path,
            open_blend_file,
            update_project_blender_settings,
            check_asset_uvs,
            read_project_file_data_url,
            list_project_images,
            create_folder,
            create_asset,
            organize_asset,
            create_asset_variant,
            generate_asset_lods,
            delete_asset_version,
            rename_asset,
            move_asset,
            copy_asset,
            duplicate_asset,
            delete_asset,
            rename_folder,
            move_folder,
            delete_folder,
            update_asset_metadata,
            set_asset_uv_ignored,
            set_asset_thumbnail,
            add_asset_images
        ])
        .run(tauri::generate_context!())
        .expect("error while running BlendUp");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uv_report_fixture(root: &Path, source: &str, score: f64) -> Value {
        let metadata = fs::metadata(root.join(source)).unwrap();
        serde_json::json!({
            "algorithmVersion": 2, "score": score, "complete": true, "allowUvOverlap": false,
            "sourcePath": source, "sourceSize": metadata.len(),
            "sourceModifiedNs": metadata.modified().unwrap().duration_since(UNIX_EPOCH).unwrap().as_nanos().to_string(),
            "checkedAt": "1", "objects": [], "issues": []
        })
    }

    #[test]
    fn blender_project_options_are_opt_in_and_invalid_thresholds_are_rejected() {
        let mut legacy = serde_json::to_value(new_project_config("Test", "none")).unwrap();
        legacy.as_object_mut().unwrap().remove("blender");
        let project = normalize_project_config(&legacy).unwrap();
        assert!(!project.blender.apply_transforms_on_save);
        assert!(!project.blender.unwrap_on_save);
        assert!(!project.blender.validate_uvs);
        assert_eq!(project.blender.minimum_uv_score, 70.0);
        let root = test_root("uv_settings");
        create_project(CreateProjectOptions {
            project_root: root.to_string_lossy().to_string(),
            project_name: "Test".into(),
            engine: "none".into(),
        })
        .unwrap();
        let original = fs::read(project_file(&root)).unwrap();
        for threshold in [0.0, 101.0, f64::NAN] {
            assert!(update_project_blender_settings(
                root.to_string_lossy().to_string(),
                BlenderProjectSettings {
                    minimum_uv_score: threshold,
                    ..Default::default()
                }
            )
            .is_err());
            assert_eq!(fs::read(project_file(&root)).unwrap(), original);
        }
        update_project_blender_settings(
            root.to_string_lossy().to_string(),
            BlenderProjectSettings {
                validate_uvs: true,
                unwrap_on_save: true,
                minimum_uv_score: 85.0,
                ..Default::default()
            },
        )
        .unwrap();
        let project = read_project_config(&root).unwrap();
        assert!(project.blender.validate_uvs && project.blender.unwrap_on_save);
        assert_eq!(project.blender.minimum_uv_score, 85.0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn uv_reports_follow_the_source_and_current_policy() {
        let root = test_root("uv_freshness");
        let source = "Art/Table/Table.blend";
        fs::create_dir_all(root.join("Art/Table")).unwrap();
        fs::write(root.join(source), b"blend").unwrap();
        let mut project = new_project_config("Test", "none");
        project.blender.validate_uvs = true;
        let mut report = uv_report_fixture(&root, source, 50.0);
        let path = root.join(".blendup/uv-reports/Art/Table/Table.json");
        write_json(&path, &report).unwrap();
        let summary = read_uv_quality(&root, &project, source).unwrap();
        assert!(!summary.stale && summary.blocked);
        project.blender.minimum_uv_score = 50.0;
        assert!(!read_uv_quality(&root, &project, source).unwrap().blocked);
        project.blender.allow_uv_overlap = true;
        assert!(read_uv_quality(&root, &project, source).unwrap().stale);
        project.blender.allow_uv_overlap = false;
        report["unsavedChanges"] = Value::Bool(true);
        write_json(&path, &report).unwrap();
        assert!(read_uv_quality(&root, &project, source).unwrap().stale);
        report["unsavedChanges"] = Value::Bool(false);
        report["complete"] = Value::Bool(false);
        write_json(&path, &report).unwrap();
        assert!(read_uv_quality(&root, &project, source).unwrap().blocked);
        fs::write(root.join(source), b"changed source").unwrap();
        let summary = read_uv_quality(&root, &project, source).unwrap();
        assert!(summary.stale && !summary.blocked);
        report["score"] = serde_json::json!(101);
        write_json(&path, &report).unwrap();
        assert!(read_uv_quality(&root, &project, source).is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn uv_problems_cover_originals_and_versions_in_standalone_projects() {
        let root = test_root("uv_problems");
        let project_root = root.to_string_lossy().to_string();
        create_project(CreateProjectOptions {
            project_root: project_root.clone(),
            project_name: "Test".into(),
            engine: "none".into(),
        })
        .unwrap();
        fs::create_dir_all(root.join("Art/Table")).unwrap();
        let source = "Art/Table/Table.blend";
        fs::write(root.join(source), b"blend").unwrap();
        let id = read_project_snapshot(project_root.clone()).unwrap().assets[0]
            .id
            .clone();
        create_asset_variant(project_root.clone(), id, "Red".into()).unwrap();
        update_project_blender_settings(
            project_root.clone(),
            BlenderProjectSettings {
                validate_uvs: true,
                ..Default::default()
            },
        )
        .unwrap();
        let snapshot = read_project_snapshot(project_root.clone()).unwrap();
        assert_eq!(
            snapshot
                .problems
                .iter()
                .filter(|p| p.title == "UV à vérifier")
                .count(),
            2
        );
        write_json(
            &root
                .join(".blendup/uv-reports")
                .join(source)
                .with_extension("json"),
            &uv_report_fixture(&root, source, 100.0),
        )
        .unwrap();
        let version_source = snapshot.assets[0].metadata.variants[0]
            .source_path
            .as_ref()
            .unwrap();
        write_json(
            &root
                .join(".blendup/uv-reports")
                .join(version_source)
                .with_extension("json"),
            &uv_report_fixture(&root, version_source, 0.0),
        )
        .unwrap();
        let snapshot = read_project_snapshot(project_root.clone()).unwrap();
        assert_eq!(snapshot.problems.len(), 1);
        assert_eq!(snapshot.problems[0].title, "Qualité UV insuffisante");
        assert_eq!(snapshot.problems[0].severity, "error");
        assert!(
            snapshot.assets[0].metadata.variants[0]
                .uv_quality
                .as_ref()
                .unwrap()
                .blocked
        );
        let id = snapshot.assets[0].id.clone();
        set_asset_uv_ignored(project_root.clone(), id.clone(), true).unwrap();
        let ignored = read_project_snapshot(project_root.clone()).unwrap();
        assert!(ignored.assets[0].metadata.ignore_uv_validation);
        assert!(ignored
            .problems
            .iter()
            .all(|problem| problem.category != "uv"));
        assert!(
            !ignored.assets[0].metadata.variants[0]
                .uv_quality
                .as_ref()
                .unwrap()
                .blocked
        );
        assert!(
            ignored.assets[0].metadata.variants[0]
                .uv_quality
                .as_ref()
                .unwrap()
                .ignored
        );
        // No Blender process is required for an excluded asset.
        assert!(check_asset_uvs_impl(
            project_root.clone(),
            id.clone(),
            Some("missing-blender".into())
        )
        .unwrap()
        .message
        .contains("ignoré"));
        set_asset_uv_ignored(project_root.clone(), id.clone(), false).unwrap();
        assert!(
            read_project_snapshot(project_root.clone()).unwrap().assets[0]
                .metadata
                .variants[0]
                .uv_quality
                .as_ref()
                .unwrap()
                .blocked
        );
        set_asset_uv_ignored(project_root.clone(), id.clone(), true).unwrap();
        rename_asset(project_root.clone(), id, "Desk".into()).unwrap();
        let renamed = read_project_snapshot(project_root).unwrap();
        assert!(renamed.assets[0].metadata.ignore_uv_validation);
        assert!(renamed
            .problems
            .iter()
            .all(|problem| problem.category != "uv"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "Requires BLENDUP_TEST_BLENDER pointing to a Blender executable"]
    fn desktop_uv_gate_preserves_exports_and_allows_local_previews() {
        let blender = env::var("BLENDUP_TEST_BLENDER").expect("BLENDUP_TEST_BLENDER is required");
        let root = test_root("uv_real_blender");
        let project_root = root.to_string_lossy().to_string();
        create_project(CreateProjectOptions {
            project_root: project_root.clone(),
            project_name: "Test".into(),
            engine: "godot".into(),
        })
        .unwrap();
        fs::create_dir_all(root.join("Art/Plane")).unwrap();
        let source = root.join("Art/Plane/Plane.blend");
        let script = root.join("fixture.py");
        fs::write(&script, "import bpy,sys\nfrom pathlib import Path\na=sys.argv[sys.argv.index('--')+1:]\nif a[1]=='good':\n bpy.ops.wm.read_factory_settings(use_empty=True)\n bpy.ops.mesh.primitive_plane_add()\nelse:\n for obj in bpy.context.scene.objects:\n  if obj.type=='MESH':\n   for loop in obj.data.uv_layers.active.data: loop.uv=(0,0)\nbpy.ops.wm.save_as_mainfile(filepath=a[0])\n").unwrap();
        let make_source = |bad: bool| {
            let mut command = Command::new(&blender);
            command
                .env("BLENDUP_BACKGROUND_TASK", "1")
                .args(["--background", "--factory-startup"]);
            if bad {
                command.arg(&source);
            }
            command
                .args(["--python-exit-code", "1", "--python"])
                .arg(&script)
                .arg("--")
                .arg(&source)
                .arg(if bad { "bad" } else { "good" });
            apply_command_window_preference(&mut command, false);
            let output = command.output().unwrap();
            assert!(
                output.status.success(),
                "{}",
                command_log(&output.stdout, &output.stderr)
            );
        };
        make_source(false);
        update_project_blender_settings(
            project_root.clone(),
            BlenderProjectSettings {
                validate_uvs: true,
                minimum_uv_score: 90.0,
                ..Default::default()
            },
        )
        .unwrap();
        let id = read_project_snapshot(project_root.clone()).unwrap().assets[0]
            .id
            .clone();
        assert!(
            export_asset(project_root.clone(), id.clone(), Some(blender.clone()))
                .unwrap()
                .success
        );
        let output = root.join("Godot/Assets/Plane/Plane.glb");
        let previous = fs::read(&output).unwrap();
        make_source(true);
        let source_bytes = fs::read(&source).unwrap();
        let rejected =
            export_asset(project_root.clone(), id.clone(), Some(blender.clone())).unwrap();
        assert!(!rejected.success && rejected.log.contains("Export bloqué"));
        assert_eq!(fs::read(&output).unwrap(), previous);
        create_asset_variant(project_root.clone(), id.clone(), "Bad".into()).unwrap();
        let snapshot = read_project_snapshot(project_root.clone()).unwrap();
        let variant = &snapshot.assets[0].metadata.variants[0];
        assert!(
            !export_asset_version(
                project_root.clone(),
                id.clone(),
                variant.id.clone(),
                "variant".into(),
                Some(blender.clone())
            )
            .unwrap()
            .success
        );
        assert!(!root.join(variant.output_path.as_ref().unwrap()).exists());
        check_asset_uvs_impl(project_root.clone(), id.clone(), Some(blender.clone())).unwrap();
        let snapshot = read_project_snapshot(project_root.clone()).unwrap();
        assert!(snapshot.assets[0].uv_quality.as_ref().unwrap().blocked);
        assert!(!snapshot.assets[0].uv_quality.as_ref().unwrap().stale);
        assert_eq!(
            snapshot
                .problems
                .iter()
                .filter(|p| p.title == "Qualité UV insuffisante")
                .count(),
            2
        );
        // A blocked original must not prevent a healthy variant from exporting.
        create_asset_variant(project_root.clone(), id.clone(), "Good".into()).unwrap();
        let versions = read_project_snapshot(project_root.clone()).unwrap();
        let good = &versions.assets[0].metadata.variants[1];
        let mut command = Command::new(&blender);
        command
            .env("BLENDUP_BACKGROUND_TASK", "1")
            .args([
                "--background",
                "--factory-startup",
                "--python-exit-code",
                "1",
                "--python",
            ])
            .arg(&script)
            .arg("--")
            .arg(root.join(good.source_path.as_ref().unwrap()))
            .arg("good");
        apply_command_window_preference(&mut command, false);
        let result = command.output().unwrap();
        assert!(
            result.status.success(),
            "{}",
            command_log(&result.stdout, &result.stderr)
        );
        let batch =
            export_asset_versions(project_root.clone(), id.clone(), Some(blender.clone())).unwrap();
        assert!(
            !batch.success && batch.message.contains("1 version(s) sur 3"),
            "{}\n{}",
            batch.message,
            batch.log
        );
        assert!(root.join(good.output_path.as_ref().unwrap()).is_file());
        assert_eq!(fs::read(&output).unwrap(), previous);
        assert_eq!(fs::read(&source).unwrap(), source_bytes);
        set_asset_uv_ignored(project_root.clone(), id.clone(), true).unwrap();
        assert!(
            export_asset(project_root.clone(), id.clone(), Some(blender.clone()))
                .unwrap()
                .success
        );
        assert!(
            export_asset_version(
                project_root.clone(),
                id.clone(),
                variant.id.clone(),
                "variant".into(),
                Some(blender.clone())
            )
            .unwrap()
            .success
        );
        assert_eq!(fs::read(&source).unwrap(), source_bytes);
        set_asset_uv_ignored(project_root.clone(), id.clone(), false).unwrap();
        update_project_engine(project_root.clone(), "unity".into()).unwrap();
        assert!(
            !export_asset(project_root.clone(), id.clone(), Some(blender.clone()))
                .unwrap()
                .success
        );
        assert!(!root.join("Unity/Assets/Plane/Plane.fbx").exists());
        update_project_engine(project_root.clone(), "none".into()).unwrap();
        assert!(
            generate_asset_preview(project_root.clone(), id, Some(blender))
                .unwrap()
                .success
        );
        let snapshot = read_project_snapshot(project_root).unwrap();
        assert_eq!(snapshot.assets[0].status, "local");
        assert!(root.join(&snapshot.assets[0].output_path).is_file());
        assert!(snapshot.assets[0].uv_quality.as_ref().unwrap().blocked);
        assert_eq!(fs::read(source).unwrap(), source_bytes);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn asset_opening_preference_is_backward_compatible_and_persists() {
        let legacy: UserSettings = serde_json::from_value(serde_json::json!({
            "schemaVersion": 2, "kind": "user_settings", "showBlenderCommandPrompt": true
        }))
        .unwrap();
        assert!(!legacy.open_asset_after_creation);
        assert!(legacy.show_blender_command_prompt);
        let settings = normalize_user_settings(UserSettings {
            open_asset_after_creation: true,
            ..legacy
        });
        let saved = serde_json::to_value(&settings).unwrap();
        assert_eq!(saved["openAssetAfterCreation"], true);
        let loaded: UserSettings = serde_json::from_value(saved).unwrap();
        assert!(loaded.open_asset_after_creation);
        assert!(loaded.show_blender_command_prompt);
    }

    #[test]
    fn changing_project_roots_preserves_assets_exports_reports_and_godot_references() {
        let root = test_root("custom_project_paths");
        create_project(CreateProjectOptions {
            project_root: root.to_string_lossy().into(),
            project_name: "Test".into(),
            engine: "godot".into(),
        })
        .unwrap();
        let project = read_project_config(&root).unwrap();
        fs::create_dir_all(root.join("Art/Rock/textures")).unwrap();
        fs::write(root.join("Art/Rock/Rock.blend"), b"source").unwrap();
        fs::write(root.join("Art/Rock/Rock.blend1"), b"backup").unwrap();
        fs::write(root.join("Art/Rock/textures/color.png"), b"texture").unwrap();
        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        let mut metadata = metadata_for_asset(&root, &asset);
        metadata.details.notes = "Keep my notes".into();
        metadata.details.thumbnail_path = Some("Art/Rock/textures/color.png".into());
        metadata.details.lods.push(AssetLod {
            id: "lod1".into(),
            level: "LOD1".into(),
            status: "exported".into(),
            target_ratio: Some(50.0),
            triangle_budget: None,
            generated: true,
            source_path: Some("Art/Rock/Rock.lod.lod1.blend".into()),
            output_path: None,
            source_modified_at: None,
            output_modified_at: None,
            notes: "LOD note".into(),
            uv_quality: None,
        });
        fs::write(root.join("Art/Rock/Rock.lod.lod1.blend"), b"lod-source").unwrap();
        metadata.details.variants.push(AssetVariant {
            id: "moss".into(),
            name: "Moss".into(),
            status: "ready".into(),
            source_path: Some("Art/Rock/Rock.variant.moss.blend".into()),
            output_path: None,
            source_modified_at: None,
            output_modified_at: None,
            notes: "Variant note".into(),
            uv_quality: None,
        });
        fs::write(root.join("Art/Rock/Rock.variant.moss.blend"), b"variant").unwrap();
        write_asset_metadata(&root, &metadata).unwrap();
        fs::create_dir_all(root.join("Godot/Assets/Rock/variants")).unwrap();
        fs::write(root.join("Godot/Assets/Rock/Rock.glb"), b"export").unwrap();
        fs::write(
            root.join("Godot/Assets/Rock/variants/moss.glb"),
            b"variant-export",
        )
        .unwrap();
        fs::write(
            root.join("Godot/main.tscn"),
            b"path=\"res://Assets/Rock/Rock.glb\"",
        )
        .unwrap();
        fs::write(
            root.join("Godot/Assets/Rock/Rock_lod.tscn"),
            b"path=\"res://Assets/Rock/variants/moss.glb\"",
        )
        .unwrap();
        let report = uv_report_fixture(&root, &asset.source_path, 100.0);
        let mut state = ExportState::default();
        state.exports.insert(
            asset.id.clone(),
            ExportRecord {
                output_path: asset.output_path.clone(),
                success: true,
                message: "Export completed".into(),
            },
        );
        write_json(&export_state_file(&root), &state).unwrap();
        write_json(
            &root
                .join(".blendup/uv-reports")
                .join(&asset.source_path)
                .with_extension("json"),
            &report,
        )
        .unwrap();
        let next = update_project_paths(
            root.to_string_lossy().into(),
            ProjectPaths {
                art_root: "Sources 3D".into(),
                engine_root: "Mon jeu".into(),
                engine_assets_root: "Mon jeu/Modeles".into(),
            },
        )
        .unwrap();
        let moved = scan_assets(&root, &next, &read_export_state(&root)).unwrap();
        assert_eq!(moved.len(), 1);
        assert_eq!(moved[0].id, asset.id);
        assert_eq!(moved[0].metadata.notes, "Keep my notes");
        assert_eq!(moved[0].source_path, "Sources 3D/Rock/Rock.blend");
        assert_eq!(
            moved[0].metadata.variants[0].source_path.as_deref(),
            Some("Sources 3D/Rock/Rock.variant.moss.blend")
        );
        assert_eq!(
            moved[0].metadata.variants[0].output_path.as_deref(),
            Some("Mon jeu/Modeles/Rock/variants/moss.glb")
        );
        assert_eq!(
            moved[0].metadata.thumbnail_path.as_deref(),
            Some("Sources 3D/Rock/textures/color.png")
        );
        assert!(!moved[0].uv_quality.as_ref().unwrap().stale);
        assert_eq!(
            moved[0].metadata.lods[0].source_path.as_deref(),
            Some("Sources 3D/Rock/Rock.lod.lod1.blend")
        );
        assert_eq!(
            moved[0].metadata.lods[0].output_path.as_deref(),
            Some("Mon jeu/Modeles/Rock/lods/lod1.glb")
        );
        assert_eq!(
            read_export_state(&root).exports[&asset.id].output_path,
            "Mon jeu/Modeles/Rock/Rock.glb"
        );
        assert_eq!(
            fs::read(root.join(&moved[0].source_path)).unwrap(),
            b"source"
        );
        assert_eq!(
            fs::read(root.join("Sources 3D/Rock/Rock.blend1")).unwrap(),
            b"backup"
        );
        assert_eq!(
            fs::read(root.join("Mon jeu/Modeles/Rock/variants/moss.glb")).unwrap(),
            b"variant-export"
        );
        assert!(fs::read_to_string(root.join("Mon jeu/main.tscn"))
            .unwrap()
            .contains("res://Modeles/"));
        assert!(
            fs::read_to_string(root.join("Mon jeu/Modeles/Rock/Rock_lod.tscn"))
                .unwrap()
                .contains("res://Modeles/")
        );
        assert!(!root.join("Art").exists() && !root.join("Godot").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn custom_paths_support_unity_nested_exports_and_standalone_sources() {
        for engine in ["unity", "none"] {
            let root = test_root("nested_custom_paths");
            create_project(CreateProjectOptions {
                project_root: root.to_string_lossy().into(),
                project_name: "Test".into(),
                engine: engine.into(),
            })
            .unwrap();
            fs::write(root.join("Art/Cube.blend"), b"source").unwrap();
            if engine == "unity" {
                fs::write(root.join("Unity/Assets/Cube.fbx"), b"export").unwrap();
                fs::write(root.join("Unity/Assets.meta"), b"guid: keep-folder-guid").unwrap();
                assert!(update_project_paths(
                    root.to_string_lossy().into(),
                    ProjectPaths {
                        art_root: "Art".into(),
                        engine_root: "Unity".into(),
                        engine_assets_root: "Unity/Models".into()
                    }
                )
                .is_err());
            }
            let next = update_project_paths(
                root.to_string_lossy().into(),
                ProjectPaths {
                    art_root: "Mes modeles".into(),
                    engine_root: "Unity".into(),
                    engine_assets_root: "Unity/Assets/Models".into(),
                },
            )
            .unwrap();
            assert_eq!(
                scan_assets(&root, &next, &ExportState::default())
                    .unwrap()
                    .len(),
                1
            );
            if engine == "unity" {
                assert!(root.join("Unity/Assets/Models/Cube.fbx").is_file());
                assert_eq!(
                    fs::read(root.join("Unity/Assets/Models.meta")).unwrap(),
                    b"guid: keep-folder-guid"
                );
            } else {
                assert!(next.paths.engine_root.is_empty());
                assert!(!root.join("Unity").exists());
            }
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn custom_path_collisions_and_invalid_paths_leave_project_untouched() {
        let root = test_root("path_collisions");
        create_project(CreateProjectOptions {
            project_root: root.to_string_lossy().into(),
            project_name: "Test".into(),
            engine: "godot".into(),
        })
        .unwrap();
        fs::write(root.join("Art/Cube.blend"), b"source").unwrap();
        fs::create_dir_all(root.join("Existing")).unwrap();
        fs::write(root.join("Existing/keep.txt"), b"keep").unwrap();
        let before = fs::read(project_file(&root)).unwrap();
        for art in [
            "../Outside",
            "C:/Outside",
            ".blendup/Art",
            "Existing",
            "Godot/Sources",
            "Art/Nested",
        ] {
            assert!(
                update_project_paths(
                    root.to_string_lossy().into(),
                    ProjectPaths {
                        art_root: art.into(),
                        engine_root: "Godot".into(),
                        engine_assets_root: "Godot/Assets".into()
                    }
                )
                .is_err(),
                "{art}"
            );
            assert_eq!(fs::read(project_file(&root)).unwrap(), before);
            assert_eq!(fs::read(root.join("Art/Cube.blend")).unwrap(), b"source");
            assert_eq!(fs::read(root.join("Existing/keep.txt")).unwrap(), b"keep");
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn path_migration_rolls_back_all_folder_moves_on_metadata_failure() {
        let root = test_root("path_rollback");
        create_project(CreateProjectOptions {
            project_root: root.to_string_lossy().into(),
            project_name: "Test".into(),
            engine: "unity".into(),
        })
        .unwrap();
        fs::write(root.join("Art/Cube.blend"), b"source").unwrap();
        fs::write(root.join("Unity/Assets/Cube.fbx"), b"export").unwrap();
        let project = read_project_config(&root).unwrap();
        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        // A directory where the metadata file belongs forces a failure after every move.
        fs::create_dir_all(asset_metadata_file(&root, &asset.id)).unwrap();
        let before = fs::read(project_file(&root)).unwrap();
        assert!(update_project_paths(
            root.to_string_lossy().into(),
            ProjectPaths {
                art_root: "Sources".into(),
                engine_root: "Jeu".into(),
                engine_assets_root: "Jeu/Assets/Models".into()
            }
        )
        .is_err());
        assert_eq!(fs::read(project_file(&root)).unwrap(), before);
        assert_eq!(fs::read(root.join("Art/Cube.blend")).unwrap(), b"source");
        assert_eq!(
            fs::read(root.join("Unity/Assets/Cube.fbx")).unwrap(),
            b"export"
        );
        assert!(!root.join("Sources").exists() && !root.join("Jeu").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn steam_launch_passes_the_blend_path_as_a_separate_argument() {
        let root = test_root("steam_launch");
        let blender = root.join("steamapps/common/Blender/blender.exe");
        fs::create_dir_all(blender.parent().unwrap()).unwrap();
        let steam = root.join("steam.exe");
        fs::write(&steam, b"placeholder").unwrap();
        fs::write(
            root.join("steamapps/appmanifest_365670.acf"),
            format!(
                "\"installdir\" \"Blender\"\n\"LauncherPath\" \"{}\"",
                steam.to_string_lossy().replace('\\', "\\\\")
            ),
        )
        .unwrap();
        let source = root.join("Models with spaces/Étagère.blend");
        let command = blender_open_command(&blender, &source);
        assert_eq!(command.get_program(), steam.as_os_str());
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            vec![
                std::ffi::OsStr::new("-applaunch"),
                std::ffi::OsStr::new("365670"),
                source.as_os_str()
            ]
        );
        let standalone = root.join("Standalone/blender.exe");
        assert_eq!(
            blender_open_command(&standalone, &source).get_program(),
            standalone.as_os_str()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn windows_explorer_can_resolve_unicode_files_and_space_containing_folders() {
        use windows_sys::Win32::{
            System::Com::{
                CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
            },
            UI::Shell::SHParseDisplayName,
        };
        let root = test_root("explorer_Étagère avec espaces");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("Étagère.blend"), b"blend").unwrap();
        unsafe {
            let initialized = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            assert!(initialized >= 0);
            for path in [&root, &root.join("Étagère.blend")] {
                let name = windows_shell_path(path).unwrap();
                let display = String::from_utf16(&name[..name.len() - 1]).unwrap();
                assert!(!display.starts_with("\\\\?\\"), "{display}");
                let mut pidl = std::ptr::null_mut();
                let result = SHParseDisplayName(
                    name.as_ptr(),
                    std::ptr::null_mut(),
                    &mut pidl,
                    0,
                    std::ptr::null_mut(),
                );
                assert!(result >= 0 && !pidl.is_null(), "{result:#x} {display}");
                CoTaskMemFree(pidl.cast());
            }
            CoUninitialize();
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn blender_backups_are_neither_scanned_as_assets_nor_copied() {
        let root = test_root("ignore_backups");
        fs::create_dir_all(root.join("Art/Rock/textures")).unwrap();
        for name in ["Rock.blend", "Rock.blend1", "Old.blend2", "Rock.BLEND12"] {
            fs::write(root.join("Art/Rock").join(name), name).unwrap();
        }
        fs::write(root.join("Art/Rock/textures/color.png"), b"texture").unwrap();
        let project = new_project_config("Test", "none");
        assert_eq!(
            scan_assets(&root, &project, &ExportState::default())
                .unwrap()
                .len(),
            1
        );
        copy_directory_recursive(&root.join("Art/Rock"), &root.join("Copy")).unwrap();
        assert!(
            root.join("Copy/Rock.blend").exists() && root.join("Copy/textures/color.png").exists()
        );
        assert!(
            !root.join("Copy/Rock.blend1").exists()
                && !root.join("Copy/Old.blend2").exists()
                && !root.join("Copy/Rock.BLEND12").exists()
        );
        assert!(root.join("Art/Rock/Rock.blend1").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn uv_failures_show_one_problem_and_expire_when_the_quality_passes() {
        let root = test_root("clear_uv_failure");
        create_project(CreateProjectOptions {
            project_root: root.to_string_lossy().into(),
            project_name: "Test".into(),
            engine: "godot".into(),
        })
        .unwrap();
        let mut project = read_project_config(&root).unwrap();
        project.blender.validate_uvs = true;
        fs::write(root.join("Art/Cube.blend"), b"source").unwrap();
        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        let mut state = ExportState::default();
        state.exports.insert(
            asset.id.clone(),
            ExportRecord {
                output_path: asset.output_path.clone(),
                success: false,
                message:
                    "Traceback...\nRuntimeError: Export bloqué par le contrôle UV : score 0.0/100"
                        .into(),
            },
        );
        let failed = scan_assets(&root, &project, &state).unwrap();
        let problems = collect_problems(&root, &project, &failed);
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].category, "uv");
        assert_eq!(problems[0].action_label.as_deref(), Some("Vérifier"));
        write_json(
            &root
                .join(".blendup/uv-reports")
                .join(&asset.source_path)
                .with_extension("json"),
            &uv_report_fixture(&root, &asset.source_path, 100.0),
        )
        .unwrap();
        let corrected = scan_assets(&root, &project, &state).unwrap();
        assert_eq!(corrected[0].status, "ready");
        assert!(corrected[0].last_error.is_none());
        project.blender.validate_uvs = false;
        assert_eq!(
            scan_assets(&root, &project, &state).unwrap()[0].status,
            "ready"
        );
        state.exports.get_mut(&asset.id).unwrap().message =
            "RuntimeError: Exporter unavailable".into();
        assert_eq!(
            scan_assets(&root, &project, &state).unwrap()[0].status,
            "error"
        );
        assert_eq!(export_error_summary("Blender startup\nTraceback (most recent call last):\n  File x\nValueError: Missing texture\n"), "Missing texture");
        fs::remove_dir_all(root).unwrap();
    }

    pub(super) fn test_root(label: &str) -> PathBuf {
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
    fn standalone_projects_are_asset_libraries_without_engine_directories() {
        let root = test_root("standalone_library");
        create_project(CreateProjectOptions {
            project_root: root.to_string_lossy().to_string(),
            project_name: "Sculptures".to_string(),
            engine: "none".to_string(),
        })
        .unwrap();
        let config: Value =
            serde_json::from_str(&fs::read_to_string(project_file(&root)).unwrap()).unwrap();
        assert_eq!(config["engine"], "none");
        assert_eq!(config["paths"], serde_json::json!({ "artRoot": "Art" }));
        assert!(!root.join("Godot").exists());
        assert!(!root.join("Unity").exists());
        assert!(!export_state_file(&root).exists());
        let workspace = root.join("Art/Statue");
        fs::create_dir_all(&workspace).unwrap();
        fs::write(workspace.join("Statue.blend"), b"source").unwrap();
        let snapshot = read_project_snapshot(root.to_string_lossy().to_string()).unwrap();
        assert!(snapshot.problems.is_empty());
        assert_eq!(snapshot.assets[0].status, "local");
        assert_eq!(
            snapshot.assets[0].output_path,
            ".blendup/cache/previews/Statue/Statue.glb"
        );
        assert_eq!(snapshot.assets[0].format, "glb");
        let mut stale = ExportState::default();
        stale.exports.insert(
            snapshot.assets[0].id.clone(),
            ExportRecord {
                success: false,
                message: "Old Unity error".to_string(),
                output_path: "Unity/Assets/Statue.fbx".to_string(),
            },
        );
        write_json(&export_state_file(&root), &stale).unwrap();
        let snapshot = read_project_snapshot(root.to_string_lossy().to_string()).unwrap();
        assert!(snapshot.problems.is_empty());
        assert_eq!(snapshot.assets[0].status, "local");
        assert!(snapshot.assets[0].last_error.is_none());
        let project_root = root.to_string_lossy().to_string();
        let id = snapshot.assets[0].id.clone();
        assert!(export_asset(project_root.clone(), id.clone(), None).is_err());
        assert!(export_asset_versions(project_root.clone(), id.clone(), None).is_err());
        assert!(export_asset_version(
            project_root.clone(),
            id,
            "none".to_string(),
            "variant".to_string(),
            None
        )
        .is_err());
        assert!(clear_asset_exports(project_root).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn project_type_changes_preserve_sources_and_retarget_all_versions() {
        let root = test_root("standalone_transitions");
        let project_root = root.to_string_lossy().to_string();
        create_project(CreateProjectOptions {
            project_root: project_root.clone(),
            project_name: "Studio".to_string(),
            engine: "godot".to_string(),
        })
        .unwrap();
        fs::create_dir_all(root.join("Art/Table")).unwrap();
        fs::write(root.join("Art/Table/Table.blend"), b"source").unwrap();
        let id = read_project_snapshot(project_root.clone()).unwrap().assets[0]
            .id
            .clone();
        create_asset_variant(project_root.clone(), id.clone(), "Red".to_string()).unwrap();
        let godot = read_project_snapshot(project_root.clone()).unwrap();
        let mut metadata = metadata_for_asset(&root, &godot.assets[0]);
        metadata.details.notes = "Keep these notes".to_string();
        metadata.details.tags = vec!["wood".to_string()];
        let lod_source = "Art/Table/Table.lod.lod1.blend";
        fs::write(root.join(lod_source), b"lod").unwrap();
        metadata.details.lods.push(AssetLod {
            id: asset_id_for_path(lod_source),
            level: "LOD1".to_string(),
            status: "ready".to_string(),
            target_ratio: Some(50.0),
            triangle_budget: None,
            generated: true,
            source_path: Some(lod_source.to_string()),
            output_path: Some("Godot/Assets/Table/lods/lod1.glb".to_string()),
            source_modified_at: None,
            output_modified_at: None,
            notes: "Keep LOD".to_string(),
            uv_quality: None,
        });
        write_asset_metadata(&root, &metadata).unwrap();
        fs::create_dir_all(root.join("Godot/Assets/Table/variants")).unwrap();
        let old_output = root.join("Godot/Assets/Table/variants/red.glb");
        fs::write(&old_output, b"previous engine export").unwrap();
        for (engine, destination, extension, status) in [
            ("none", ".blendup/cache/previews", "glb", "local"),
            ("unity", "Unity/Assets", "fbx", "ready"),
            ("godot", "Godot/Assets", "glb", "ready"),
            ("none", ".blendup/cache/previews", "glb", "local"),
        ] {
            update_project_engine(project_root.clone(), engine.to_string()).unwrap();
            let snapshot = read_project_snapshot(project_root.clone()).unwrap();
            let asset = &snapshot.assets[0];
            assert_eq!(asset.id, id);
            assert_eq!(asset.status, status);
            assert_eq!(asset.metadata.notes, "Keep these notes");
            assert_eq!(asset.metadata.tags, vec!["wood"]);
            assert_eq!(
                asset.metadata.variants[0].output_path.as_deref(),
                Some(format!("{destination}/Table/variants/red.{extension}").as_str())
            );
            assert_eq!(
                asset.metadata.lods[0].output_path.as_deref(),
                Some(format!("{destination}/Table/lods/lod1.{extension}").as_str())
            );
            assert_eq!(asset.metadata.lods[0].notes, "Keep LOD");
            assert!(root.join("Art/Table/Table.variant.red.blend").is_file());
            assert!(root.join(lod_source).is_file());
            assert_eq!(fs::read(&old_output).unwrap(), b"previous engine export");
        }
        // Renaming in standalone mode moves its cache, leaving detached engine exports alone.
        let asset = read_project_snapshot(project_root.clone())
            .unwrap()
            .assets
            .remove(0);
        let preview = root.join(&asset.output_path);
        fs::create_dir_all(preview.parent().unwrap()).unwrap();
        fs::write(&preview, b"preview").unwrap();
        rename_asset(project_root.clone(), id.clone(), "Desk".to_string()).unwrap();
        let snapshot = read_project_snapshot(project_root).unwrap();
        assert_eq!(snapshot.assets[0].id, id);
        assert_eq!(snapshot.assets[0].status, "local");
        assert!(root.join(&snapshot.assets[0].output_path).is_file());
        assert!(old_output.is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "Requires BLENDUP_TEST_BLENDER pointing to a Blender executable"]
    fn standalone_preview_and_lods_work_with_real_blender() {
        let blender = env::var("BLENDUP_TEST_BLENDER").expect("BLENDUP_TEST_BLENDER is required");
        let root = test_root("standalone_real_blender");
        let project_root = root.to_string_lossy().to_string();
        create_project(CreateProjectOptions {
            project_root: project_root.clone(),
            project_name: "Studio".to_string(),
            engine: "none".to_string(),
        })
        .unwrap();
        let result = create_asset_impl(
            project_root.clone(),
            "Art".to_string(),
            "Cube".to_string(),
            Some(blender.clone()),
        )
        .unwrap();
        let id = result.asset_id.unwrap();
        let snapshot = read_project_snapshot(project_root.clone()).unwrap();
        let source = root.join(&snapshot.assets[0].source_path);
        let original = fs::read(&source).unwrap();
        assert!(
            generate_asset_preview(project_root.clone(), id.clone(), Some(blender.clone()))
                .unwrap()
                .success
        );
        generate_asset_lods(project_root.clone(), id.clone(), Some(blender.clone())).unwrap();
        create_asset_variant(project_root.clone(), id.clone(), "Red".to_string()).unwrap();
        let versions = read_project_snapshot(project_root.clone()).unwrap();
        let variant = &versions.assets[0].metadata.variants[0];
        let preview = export_asset_version(
            project_root.clone(),
            id,
            variant.id.clone(),
            "variant".into(),
            Some(blender),
        )
        .unwrap();
        assert!(preview.success, "{}", preview.log);
        assert!(root
            .join(variant.output_path.as_ref().unwrap())
            .starts_with(root.join(".blendup/cache/previews")));
        assert_eq!(
            &fs::read(root.join(variant.output_path.as_ref().unwrap())).unwrap()[..4],
            b"glTF"
        );
        let snapshot = read_project_snapshot(project_root.clone()).unwrap();
        let asset = &snapshot.assets[0];
        assert_eq!(asset.status, "local");
        assert!(snapshot.problems.is_empty());
        assert_eq!(
            &fs::read(root.join(&asset.output_path)).unwrap()[..4],
            b"glTF"
        );
        assert_eq!(fs::read(source).unwrap(), original);
        assert_eq!(asset.metadata.variants[0].status, "local");
        assert_eq!(asset.metadata.lods.len(), 3);
        assert!(asset.metadata.lods.iter().all(|lod| lod.status == "local"));
        assert!(!root.join("Godot").exists());
        assert!(!root.join("Unity").exists());
        assert!(!export_state_file(&root).exists());
        let copy = duplicate_asset(project_root.clone(), asset.id.clone()).unwrap();
        let snapshot = read_project_snapshot(project_root.clone()).unwrap();
        let copied = snapshot
            .assets
            .iter()
            .find(|asset| Some(&asset.id) == copy.asset_id.as_ref())
            .unwrap();
        assert_eq!(copied.status, "local");
        assert_eq!(copied.metadata.variants.len(), 1);
        assert_eq!(copied.metadata.lods.len(), 3);
        for source in copied
            .metadata
            .variants
            .iter()
            .filter_map(|version| version.source_path.as_ref())
        {
            assert!(root.join(source).is_file());
        }
        assert!(copied.metadata.variants[0]
            .output_path
            .as_ref()
            .unwrap()
            .ends_with(".glb"));
        rename_folder(
            project_root.clone(),
            "Art/Cube".to_string(),
            "Renamed".to_string(),
        )
        .unwrap();
        let snapshot = read_project_snapshot(project_root).unwrap();
        let renamed = snapshot
            .assets
            .iter()
            .find(|asset| asset.folder == "Art/Renamed")
            .unwrap();
        assert!(root.join(&renamed.output_path).is_file());
        assert_eq!(renamed.metadata.lods.len(), 3);
        assert!(!export_state_file(&root).exists());
        fs::remove_dir_all(root).unwrap();
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
        assert_eq!(assets[0].metadata.variants[0].status, "missing");
        assert_eq!(assets[0].metadata.lods[0].status, "missing");
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
        fs::write(asset_folder.join("Rock.variant.moss.blend"), b"variant").unwrap();
        fs::create_dir_all(output_folder.join("variants")).unwrap();
        fs::write(
            output_folder.join("variants").join("moss.glb"),
            b"variant-glb",
        )
        .unwrap();
        let mut metadata = metadata_for_asset(&root, &asset);
        metadata.details.variants.push(AssetVariant {
            id: "variant_moss".to_string(),
            name: "Moss".to_string(),
            status: "exported".to_string(),
            source_path: Some("Art/Blender/Environment/Rock/Rock.variant.moss.blend".to_string()),
            output_path: Some(
                "Godot/Assets/Blender/Environment/Rock/variants/moss.glb".to_string(),
            ),
            source_modified_at: None,
            output_modified_at: None,
            notes: String::new(),
            uv_quality: None,
        });
        write_asset_metadata(&root, &metadata).unwrap();
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
        assert!(target
            .join("Rock")
            .join("Rock.variant.moss.blend")
            .is_file());
        assert!(root
            .join("Godot")
            .join("Assets")
            .join("Blender")
            .join("Props")
            .join("Rock")
            .join("variants")
            .join("moss.glb")
            .is_file());
        let moved = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        assert_eq!(moved.id, original_id);
        assert_eq!(moved.folder, "Art/Blender/Props/Rock");
        assert_eq!(
            moved.metadata.variants[0].source_path.as_deref(),
            Some("Art/Blender/Props/Rock/Rock.variant.moss.blend")
        );
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
        fs::write(workspace.join("Crate.variant.red.blend"), b"variant").unwrap();
        fs::write(workspace.join("textures").join("wood.png"), b"image").unwrap();
        fs::create_dir_all(root.join("Godot").join("Assets")).unwrap();

        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        let mut metadata = metadata_for_asset(&root, &asset);
        metadata.details.variants.push(AssetVariant {
            id: "variant_red".to_string(),
            name: "Red".to_string(),
            status: "ready".to_string(),
            source_path: Some("Art/Props/Crate/Crate.variant.red.blend".to_string()),
            output_path: Some("Godot/Assets/Props/Crate/variants/red.glb".to_string()),
            source_modified_at: None,
            output_modified_at: None,
            notes: String::new(),
            uv_quality: None,
        });
        write_asset_metadata(&root, &metadata).unwrap();
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
        assert!(root
            .join("Art")
            .join("Props")
            .join("Crate Copy")
            .join("Crate Copy.variant.red.blend")
            .is_file());
        let copied = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .into_iter()
            .find(|item| item.name == "Crate Copy")
            .unwrap();
        assert_eq!(
            copied.metadata.variants[0].source_path.as_deref(),
            Some("Art/Props/Crate Copy/Crate Copy.variant.red.blend")
        );
        assert_eq!(
            copied.metadata.variants[0].output_path.as_deref(),
            Some("Godot/Assets/Props/Crate Copy/variants/red.glb")
        );
        assert!(result.asset_id.is_some());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn renaming_an_asset_renames_its_managed_blend_versions() {
        let root = test_root("rename_versions");
        let project = new_project_config("Test", "godot");
        let workspace = root.join("Art").join("Props").join("Table");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(root.join("Godot").join("Assets")).unwrap();
        fs::create_dir_all(root.join(".blendup")).unwrap();
        fs::write(workspace.join("Table.blend"), b"blend").unwrap();
        fs::write(workspace.join("Table.variant.red.blend"), b"variant").unwrap();
        write_json(&project_file(&root), &project).unwrap();
        write_json(&export_state_file(&root), &ExportState::default()).unwrap();
        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        let mut metadata = metadata_for_asset(&root, &asset);
        metadata.details.variants.push(AssetVariant {
            id: "variant_red".to_string(),
            name: "Red".to_string(),
            status: "ready".to_string(),
            source_path: Some("Art/Props/Table/Table.variant.red.blend".to_string()),
            output_path: Some("Godot/Assets/Props/Table/variants/red.glb".to_string()),
            source_modified_at: None,
            output_modified_at: None,
            notes: String::new(),
            uv_quality: None,
        });
        write_asset_metadata(&root, &metadata).unwrap();

        rename_asset(
            root.to_string_lossy().to_string(),
            asset.id,
            "Chair".to_string(),
        )
        .unwrap();

        assert!(root.join("Art/Props/Chair/Chair.blend").is_file());
        assert!(root
            .join("Art/Props/Chair/Chair.variant.red.blend")
            .is_file());
        let assets = scan_assets(&root, &project, &ExportState::default()).unwrap();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].name, "Chair");
        assert_eq!(
            assets[0].metadata.variants[0].source_path.as_deref(),
            Some("Art/Props/Chair/Chair.variant.red.blend")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn variants_are_real_blend_copies_hidden_from_the_main_library() {
        let root = test_root("variant_copy");
        let project = new_project_config("Test", "godot");
        let workspace = root.join("Art").join("Props").join("Table");
        fs::create_dir_all(workspace.join("textures")).unwrap();
        fs::create_dir_all(root.join("Godot").join("Assets")).unwrap();
        fs::create_dir_all(root.join(".blendup")).unwrap();
        fs::write(workspace.join("Table.blend"), b"blend-data").unwrap();
        fs::write(workspace.join("textures").join("wood.png"), b"texture").unwrap();
        write_json(&project_file(&root), &project).unwrap();
        write_json(&export_state_file(&root), &ExportState::default()).unwrap();

        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        create_asset_variant(
            root.to_string_lossy().to_string(),
            asset.id,
            "Bois rouge".to_string(),
        )
        .unwrap();

        let copy = workspace.join("Table.variant.bois_rouge.blend");
        assert!(copy.is_file());
        assert_eq!(fs::read(copy).unwrap(), b"blend-data");
        let assets = scan_assets(&root, &project, &ExportState::default()).unwrap();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].metadata.variants.len(), 1);
        assert_eq!(
            assets[0].metadata.variants[0].output_path.as_deref(),
            Some("Godot/Assets/Props/Table/variants/bois_rouge.glb")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn clearing_exports_keeps_unmanaged_godot_files() {
        let root = test_root("clear_exports");
        let project = new_project_config("Test", "godot");
        let source = root.join("Art/Props/Lamp/Lamp.blend");
        let managed = root.join("Godot/Assets/Props/Lamp/Lamp.glb");
        let unmanaged = root.join("Godot/Assets/gameplay.gd");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(managed.parent().unwrap()).unwrap();
        fs::write(&source, b"blend").unwrap();
        fs::write(&managed, b"glb").unwrap();
        fs::write(&unmanaged, b"extends Node").unwrap();
        write_json(&project_file(&root), &project).unwrap();
        write_json(&export_state_file(&root), &ExportState::default()).unwrap();

        clear_asset_exports(root.to_string_lossy().to_string()).unwrap();

        assert!(!managed.exists());
        assert!(unmanaged.is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_version_exports_are_identified_next_to_the_base_export() {
        let root = test_root("legacy_version_output");
        let project = new_project_config("Test", "godot");
        let workspace = root.join("Art").join("Props").join("Lamp");
        fs::create_dir_all(&workspace).unwrap();
        fs::write(workspace.join("Lamp.blend"), b"blend").unwrap();
        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);

        assert_eq!(
            legacy_version_output_path(&root, &asset, "Art/Props/Lamp/Lamp.lod.lod2.blend")
                .unwrap(),
            root.join("Godot/Assets/Props/Lamp/Lamp.lod.lod2.glb")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn godot_lod_scene_references_the_base_and_generated_levels() {
        let root = test_root("godot_lod_scene");
        let project = new_project_config("Test", "godot");
        let source = root
            .join("Art")
            .join("Props")
            .join("Table")
            .join("Table.blend");
        let base_output = root
            .join("Godot")
            .join("Assets")
            .join("Props")
            .join("Table")
            .join("Table.glb");
        let lod_output = base_output.parent().unwrap().join("lods").join("lod1.glb");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(lod_output.parent().unwrap()).unwrap();
        fs::write(&source, b"blend").unwrap();
        fs::write(&base_output, b"glb").unwrap();
        fs::write(&lod_output, b"glb-lod").unwrap();

        let mut asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        asset.metadata.lods.push(AssetLod {
            id: "lod1".to_string(),
            level: "LOD1".to_string(),
            status: "exported".to_string(),
            target_ratio: Some(50.0),
            triangle_budget: None,
            generated: true,
            source_path: Some("Art/Props/Table/Table.lod.lod1.blend".to_string()),
            output_path: Some("Godot/Assets/Props/Table/lods/lod1.glb".to_string()),
            source_modified_at: None,
            output_modified_at: None,
            notes: String::new(),
            uv_quality: None,
        });

        let scene = write_godot_lod_support(&root, &project, &asset)
            .unwrap()
            .unwrap();
        let content = fs::read_to_string(&scene).unwrap();
        assert!(content.contains("[gd_scene load_steps=4 format=3]"));
        assert!(content.contains("res://Assets/Props/Table/Table.glb"));
        assert!(content.contains("res://Assets/Props/Table/lods/lod1.glb"));
        assert!(root
            .join("Godot")
            .join("Assets")
            .join("BlendUp")
            .join("blendup_lod_group.gd")
            .is_file());
        fs::remove_dir_all(root).unwrap();
    }
}
