use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    env, fs,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
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
    let problems = collect_problems(&root, &project, &assets);

    Ok(ProjectSnapshot {
        project_root: root.to_string_lossy().to_string(),
        project,
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
        let id = asset_id_for_path(&source_path);
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

        let folder = source_relative_to_art
            .parent()
            .map(normalize_path)
            .unwrap_or_default();
        let name = source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Asset")
            .to_string();

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
        });
    }

    assets.sort_by(|left, right| left.source_path.cmp(&right.source_path));
    Ok(assets)
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
            open_blend_file
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
}
