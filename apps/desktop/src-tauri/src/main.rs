use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

const FBX_EXPORT_SCRIPT: &str = r#"
import pathlib
import sys
import bpy

def main():
    marker = "--"

    if marker not in sys.argv:
        raise RuntimeError("BlendUp export output path is missing.")

    output_path = pathlib.Path(sys.argv[sys.argv.index(marker) + 1])
    output_path.parent.mkdir(parents=True, exist_ok=True)

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

main()
"#;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSnapshot {
    project_root: String,
    project: Value,
    assets: Vec<Value>,
    tasks: Vec<Value>,
    git_status: GitStatusSnapshot,
    problems: Vec<BlendUpProblem>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BlenderDetectionResult {
    found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatusSnapshot {
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
    files: Vec<GitStatusFile>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatusFile {
    status: String,
    path: String,
}

#[tauri::command]
fn read_default_project_snapshot() -> Result<ProjectSnapshot, String> {
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("BlendUpTest");

    read_project_snapshot(project_root.to_string_lossy().to_string())
}

#[tauri::command]
fn read_project_snapshot(project_root: String) -> Result<ProjectSnapshot, String> {
    let project_root = PathBuf::from(project_root);
    let project = read_json_file(&project_root.join(".blendup").join("project.json"))?;
    let (mut assets, mut problems) = read_assets(&project_root);
    let (mut tasks, task_problems) = read_tasks(&project_root);
    let git_status = read_git_status(&project_root);

    problems.extend(task_problems);

    assets.sort_by(|left, right| {
        json_string(left, &["displayName"])
            .unwrap_or_default()
            .cmp(json_string(right, &["displayName"]).unwrap_or_default())
    });
    tasks.sort_by(|left, right| {
        json_string(left, &["title"])
            .unwrap_or_default()
            .cmp(json_string(right, &["title"]).unwrap_or_default())
    });

    let asset_ids = assets
        .iter()
        .filter_map(|asset| json_string(asset, &["id"]).map(ToString::to_string))
        .collect::<HashSet<_>>();

    for asset in &assets {
        problems.extend(validate_asset(&project_root, asset));
    }

    for task in &tasks {
        problems.extend(validate_task(task, &asset_ids));
    }

    Ok(ProjectSnapshot {
        project_root: project_root.to_string_lossy().to_string(),
        project,
        assets,
        tasks,
        git_status,
        problems,
    })
}

#[tauri::command]
fn detect_blender(blender_path: Option<String>) -> BlenderDetectionResult {
    match find_blender_executable(blender_path.as_deref()) {
        Some(path) => BlenderDetectionResult {
            found: true,
            path: Some(path.to_string_lossy().to_string()),
            message: "Blender detecte.".to_string(),
        },
        None => BlenderDetectionResult {
            found: false,
            path: None,
            message:
                "Blender n'a pas ete trouve. Renseigne le chemin de blender.exe dans l'interface."
                    .to_string(),
        },
    }
}

#[tauri::command]
fn export_asset_to_fbx(
    project_root: String,
    asset_id: String,
    blender_path: Option<String>,
    exported_at: String,
) -> Result<ExportAssetResult, String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();
    let blender_source =
        required_asset_path(&asset, &["paths", "blenderSource"], "source Blender")?.to_string();
    let fbx_export =
        required_asset_path(&asset, &["paths", "fbxExport"], "chemin FBX")?.to_string();
    let blender_source_path = project_root.join(&blender_source);
    let fbx_export_path = project_root.join(&fbx_export);

    if !blender_source_path.exists() {
        update_asset_export_status(&asset_file, &mut asset, "error", &exported_at)?;
        return Ok(ExportAssetResult {
            success: false,
            asset_id,
            message: format!("Le fichier Blender est introuvable pour {display_name}."),
            output_path: Some(fbx_export_path.to_string_lossy().to_string()),
            blender_path: None,
            log: format!("Fichier absent: {}", blender_source_path.display()),
        });
    }

    let Some(blender_executable) = find_blender_executable(blender_path.as_deref()) else {
        update_asset_export_status(&asset_file, &mut asset, "error", &exported_at)?;
        return Ok(ExportAssetResult {
            success: false,
            asset_id,
            message: "Blender n'a pas ete trouve.".to_string(),
            output_path: Some(fbx_export_path.to_string_lossy().to_string()),
            blender_path: None,
            log: "Renseigne le chemin de blender.exe ou ajoute Blender au PATH.".to_string(),
        });
    };

    if let Some(parent) = fbx_export_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }

    let temp_dir = project_root.join(".blendup").join("temp");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Impossible de creer {}: {error}", temp_dir.display()))?;

    let script_path = temp_dir.join("export_fbx.py");
    fs::write(&script_path, FBX_EXPORT_SCRIPT)
        .map_err(|error| format!("Impossible d'ecrire {}: {error}", script_path.display()))?;

    let output = Command::new(&blender_executable)
        .arg("--background")
        .arg(&blender_source_path)
        .arg("--python")
        .arg(&script_path)
        .arg("--")
        .arg(&fbx_export_path)
        .output()
        .map_err(|error| {
            format!(
                "Impossible de lancer Blender depuis {}: {error}",
                blender_executable.display()
            )
        })?;

    let log = command_log(&output.stdout, &output.stderr);

    if output.status.success() && fbx_export_path.exists() {
        update_asset_export_status(&asset_file, &mut asset, "success", &exported_at)?;
        return Ok(ExportAssetResult {
            success: true,
            asset_id,
            message: format!("{display_name} a ete exporte en FBX."),
            output_path: Some(fbx_export_path.to_string_lossy().to_string()),
            blender_path: Some(blender_executable.to_string_lossy().to_string()),
            log,
        });
    }

    update_asset_export_status(&asset_file, &mut asset, "error", &exported_at)?;

    Ok(ExportAssetResult {
        success: false,
        asset_id,
        message: format!("L'export FBX de {display_name} a echoue."),
        output_path: Some(fbx_export_path.to_string_lossy().to_string()),
        blender_path: Some(blender_executable.to_string_lossy().to_string()),
        log,
    })
}

fn read_assets(project_root: &Path) -> (Vec<Value>, Vec<BlendUpProblem>) {
    let assets_dir = project_root.join(".blendup").join("assets");
    let mut assets = Vec::new();
    let mut problems = Vec::new();

    let entries = match fs::read_dir(&assets_dir) {
        Ok(entries) => entries,
        Err(error) => {
            problems.push(problem(
                "assets_directory_missing",
                "critical",
                "blendup",
                None,
                "Dossier assets introuvable",
                &format!("Impossible de lire {}: {error}", assets_dir.display()),
                None,
            ));
            return (assets, problems);
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }

        match read_json_file(&path) {
            Ok(asset) => assets.push(asset),
            Err(error) => problems.push(problem(
                &format!("asset_file_invalid_{}", file_stem(&path)),
                "error",
                "blendup",
                None,
                "Fiche asset illisible",
                &error,
                None,
            )),
        }
    }

    (assets, problems)
}

fn read_tasks(project_root: &Path) -> (Vec<Value>, Vec<BlendUpProblem>) {
    let tasks_dir = project_root.join(".blendup").join("tasks");
    let mut tasks = Vec::new();
    let mut problems = Vec::new();

    if !tasks_dir.exists() {
        return (tasks, problems);
    }

    let entries = match fs::read_dir(&tasks_dir) {
        Ok(entries) => entries,
        Err(error) => {
            problems.push(problem(
                "tasks_directory_unreadable",
                "warning",
                "blendup",
                None,
                "Dossier tasks illisible",
                &format!("Impossible de lire {}: {error}", tasks_dir.display()),
                None,
            ));
            return (tasks, problems);
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }

        match read_json_file(&path) {
            Ok(task) => tasks.push(task),
            Err(error) => problems.push(problem(
                &format!("task_file_invalid_{}", file_stem(&path)),
                "warning",
                "blendup",
                None,
                "Tache illisible",
                &error,
                None,
            )),
        }
    }

    (tasks, problems)
}

fn read_git_status(project_root: &Path) -> GitStatusSnapshot {
    let branch_output = Command::new("git")
        .arg("-C")
        .arg(project_root)
        .arg("rev-parse")
        .arg("--abbrev-ref")
        .arg("HEAD")
        .output();

    let Ok(branch_output) = branch_output else {
        return GitStatusSnapshot {
            available: false,
            branch: None,
            files: Vec::new(),
            message: "Git n'est pas disponible.".to_string(),
        };
    };

    if !branch_output.status.success() {
        return GitStatusSnapshot {
            available: false,
            branch: None,
            files: Vec::new(),
            message: "Ce dossier ne semble pas etre dans un depot Git.".to_string(),
        };
    }

    let branch = String::from_utf8_lossy(&branch_output.stdout)
        .trim()
        .to_string();
    let status_output = Command::new("git")
        .arg("-C")
        .arg(project_root)
        .arg("status")
        .arg("--short")
        .output();

    let files = status_output
        .ok()
        .filter(|output| output.status.success())
        .map(|output| parse_git_status(&String::from_utf8_lossy(&output.stdout)))
        .unwrap_or_default();

    let message = if files.is_empty() {
        "Aucun changement detecte.".to_string()
    } else {
        format!("{} changement(s) detecte(s).", files.len())
    };

    GitStatusSnapshot {
        available: true,
        branch: Some(branch),
        files,
        message,
    }
}

fn parse_git_status(output: &str) -> Vec<GitStatusFile> {
    output
        .lines()
        .filter_map(|line| {
            if line.len() < 4 {
                return None;
            }

            Some(GitStatusFile {
                status: line[0..2].trim().to_string(),
                path: line[3..].trim().to_string(),
            })
        })
        .collect()
}

fn validate_asset(project_root: &Path, asset: &Value) -> Vec<BlendUpProblem> {
    let mut problems = Vec::new();
    let asset_id = json_string(asset, &["id"]).unwrap_or("asset_unknown");
    let display_name = json_string(asset, &["displayName"]).unwrap_or(asset_id);
    let import_in_unity = json_bool(asset, &["export", "importInUnity"]).unwrap_or(false);
    let last_export_status = json_string(asset, &["export", "lastExportStatus"]).unwrap_or("");

    if last_export_status == "error" {
        problems.push(problem(
            &format!("{asset_id}_last_export_error"),
            "error",
            "blender",
            Some(asset_id),
            "Dernier export en erreur",
            &format!("Le dernier export FBX de {display_name} a echoue."),
            Some("Exporter"),
        ));
    }

    match json_string(asset, &["paths", "blenderSource"]) {
        Some(path) if project_root.join(path).exists() => {}
        Some(path) => problems.push(problem(
            &format!("{asset_id}_blender_source_missing"),
            "error",
            "blender",
            Some(asset_id),
            "Fichier Blender introuvable",
            &format!("{display_name} pointe vers {path}, mais le fichier n'existe pas."),
            Some("Corriger"),
        )),
        None => problems.push(problem(
            &format!("{asset_id}_blender_source_undefined"),
            "error",
            "blendup",
            Some(asset_id),
            "Source Blender non definie",
            &format!("{display_name} n'a pas encore de fichier Blender associe."),
            Some("Associer"),
        )),
    }

    if import_in_unity {
        match json_string(asset, &["paths", "fbxExport"]) {
            Some(path) if project_root.join(path).exists() => {}
            Some(path) => problems.push(problem(
                &format!("{asset_id}_fbx_missing"),
                "warning",
                "blender",
                Some(asset_id),
                "FBX pas encore exporte",
                &format!("{display_name} attend un export vers {path}."),
                Some("Exporter"),
            )),
            None => problems.push(problem(
                &format!("{asset_id}_fbx_path_undefined"),
                "warning",
                "blendup",
                Some(asset_id),
                "Chemin FBX non defini",
                &format!("{display_name} doit avoir un chemin FBX pour etre importe dans Unity."),
                Some("Definir"),
            )),
        }

        match json_string(asset, &["paths", "unityPrefab"]) {
            Some(path) if project_root.join(path).exists() => {}
            Some(path) => problems.push(problem(
                &format!("{asset_id}_prefab_missing"),
                "info",
                "unity",
                Some(asset_id),
                "Prefab pas encore cree",
                &format!("{display_name} attend un prefab Unity vers {path}."),
                Some("Importer"),
            )),
            None => problems.push(problem(
                &format!("{asset_id}_prefab_path_undefined"),
                "warning",
                "blendup",
                Some(asset_id),
                "Chemin prefab non defini",
                &format!("{display_name} doit avoir un chemin prefab pour le suivi Unity."),
                Some("Definir"),
            )),
        }
    }

    problems
}

fn validate_task(task: &Value, asset_ids: &HashSet<String>) -> Vec<BlendUpProblem> {
    let mut problems = Vec::new();
    let task_id = json_string(task, &["id"]).unwrap_or("task_unknown");
    let task_title = json_string(task, &["title"]).unwrap_or(task_id);

    if let Some(linked_assets) = task.get("assetIds").and_then(Value::as_array) {
        for linked_asset in linked_assets {
            let Some(asset_id) = linked_asset.as_str() else {
                continue;
            };

            if !asset_ids.contains(asset_id) {
                problems.push(problem(
                    &format!("{task_id}_missing_asset_{asset_id}"),
                    "warning",
                    "blendup",
                    None,
                    "Tache liee a un asset introuvable",
                    &format!("{task_title} reference {asset_id}, mais cet asset n'existe pas."),
                    None,
                ));
            }
        }
    }

    problems
}

fn read_json_file(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Impossible de lire {}: {error}", path.display()))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("JSON invalide dans {}: {error}", path.display()))
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Impossible de serialiser {}: {error}", path.display()))?;

    fs::write(path, format!("{content}\n"))
        .map_err(|error| format!("Impossible d'ecrire {}: {error}", path.display()))
}

fn find_asset_file(project_root: &Path, asset_id: &str) -> Result<(PathBuf, Value), String> {
    let assets_dir = project_root.join(".blendup").join("assets");
    let entries = fs::read_dir(&assets_dir)
        .map_err(|error| format!("Impossible de lire {}: {error}", assets_dir.display()))?;

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }

        let asset = read_json_file(&path)?;

        if json_string(&asset, &["id"]) == Some(asset_id) {
            return Ok((path, asset));
        }
    }

    Err(format!("Asset introuvable: {asset_id}"))
}

fn required_asset_path<'a>(
    asset: &'a Value,
    keys: &[&str],
    label: &str,
) -> Result<&'a str, String> {
    json_string(asset, keys).ok_or_else(|| format!("Asset sans {label}."))
}

fn update_asset_export_status(
    asset_file: &Path,
    asset: &mut Value,
    status: &str,
    exported_at: &str,
) -> Result<(), String> {
    let export = asset
        .get_mut("export")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "La fiche asset ne contient pas de section export.".to_string())?;

    export.insert(
        "lastExportAt".to_string(),
        Value::String(exported_at.to_string()),
    );
    export.insert(
        "lastExportStatus".to_string(),
        Value::String(status.to_string()),
    );

    if status == "success" {
        asset["status"] = Value::String("exported".to_string());
    }

    asset["updatedAt"] = Value::String(exported_at.to_string());

    write_json_file(asset_file, asset)
}

fn json_string<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    nested_value(value, keys).and_then(Value::as_str)
}

fn json_bool(value: &Value, keys: &[&str]) -> Option<bool> {
    nested_value(value, keys).and_then(Value::as_bool)
}

fn nested_value<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    let mut current = value;

    for key in keys {
        current = current.get(*key)?;
    }

    Some(current)
}

fn problem(
    id: &str,
    severity: &str,
    source: &str,
    asset_id: Option<&str>,
    title: &str,
    detail: &str,
    action_label: Option<&str>,
) -> BlendUpProblem {
    BlendUpProblem {
        id: id.to_string(),
        severity: severity.to_string(),
        source: source.to_string(),
        asset_id: asset_id.map(ToString::to_string),
        title: title.to_string(),
        detail: detail.to_string(),
        action_label: action_label.map(ToString::to_string),
    }
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("unknown")
        .to_string()
}

fn find_blender_executable(explicit_path: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = explicit_path.and_then(non_empty_path) {
        if path.exists() {
            return Some(path);
        }
    }

    if let Some(path) = env::var_os("BLENDUP_BLENDER_PATH")
        .and_then(|value| non_empty_path(&value.to_string_lossy()))
    {
        if path.exists() {
            return Some(path);
        }
    }

    if command_is_available("blender") {
        return Some(PathBuf::from("blender"));
    }

    if command_is_available("blender.exe") {
        return Some(PathBuf::from("blender.exe"));
    }

    common_blender_locations()
        .into_iter()
        .find(|candidate| candidate.exists())
}

fn non_empty_path(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

fn command_is_available(command: &str) -> bool {
    Command::new(command).arg("--version").output().is_ok()
}

fn common_blender_locations() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for variable in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Some(base) = env::var_os(variable) {
            let foundation = PathBuf::from(base).join("Blender Foundation");

            if let Ok(entries) = fs::read_dir(&foundation) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("blender.exe"));
                }
            }
        }
    }

    candidates.extend([
        PathBuf::from("/usr/bin/blender"),
        PathBuf::from("/usr/local/bin/blender"),
        PathBuf::from("/snap/bin/blender"),
        PathBuf::from("/var/lib/flatpak/exports/bin/org.blender.Blender"),
    ]);

    candidates
}

fn command_log(stdout: &[u8], stderr: &[u8]) -> String {
    let mut log = String::new();
    log.push_str(&String::from_utf8_lossy(stdout));

    if !stderr.is_empty() {
        if !log.is_empty() {
            log.push('\n');
        }

        log.push_str(&String::from_utf8_lossy(stderr));
    }

    let max_chars = 5000;

    if log.chars().count() > max_chars {
        log.chars()
            .rev()
            .take(max_chars)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    } else {
        log
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_default_project_snapshot,
            read_project_snapshot,
            detect_blender,
            export_asset_to_fbx
        ])
        .run(tauri::generate_context!())
        .expect("error while running BlendUp");
}
