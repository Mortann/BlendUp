use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
    asset_folders: Vec<String>,
    asset_type_presets: Vec<Value>,
    asset_naming_rules: Value,
    assets: Vec<Value>,
    tasks: Vec<Value>,
    git_status: GitStatusSnapshot,
    activity: Vec<Value>,
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
struct OpenRequest {
    asset_id: String,
    requested_at: String,
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
struct ToolDetection {
    found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalToolsSnapshot {
    blender: ToolDetection,
    unity: ToolDetection,
    pure_ref: ToolDetection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectOptions {
    project_root: String,
    project_name: String,
    create_unity_folders: bool,
    create_gitignore: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectResult {
    project_root: String,
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

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserSettings {
    schema_version: u32,
    kind: String,
    last_project_root: Option<String>,
    recent_projects: Vec<String>,
    blender_path: Option<String>,
    unity_path: Option<String>,
    pure_ref_path: Option<String>,
    #[serde(default)]
    show_blender_command_prompt: bool,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            kind: "user_settings".to_string(),
            last_project_root: None,
            recent_projects: Vec::new(),
            blender_path: None,
            unity_path: None,
            pure_ref_path: None,
            show_blender_command_prompt: false,
        }
    }
}

#[tauri::command]
fn read_user_settings() -> Result<UserSettings, String> {
    let path = user_settings_path()?;

    if !path.exists() {
        return Ok(UserSettings::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Impossible de lire {}: {error}", path.display()))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("JSON invalide dans {}: {error}", path.display()))
}

#[tauri::command]
fn save_user_settings(settings: UserSettings) -> Result<UserSettings, String> {
    let normalized = normalize_user_settings(settings);
    let path = user_settings_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }

    let content = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Impossible de serialiser les settings utilisateur: {error}"))?;

    fs::write(&path, format!("{content}\n"))
        .map_err(|error| format!("Impossible d'ecrire {}: {error}", path.display()))?;

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
        .find(|candidate| candidate.join(".blendup").join("project.json").exists())
        .ok_or_else(|| "Projet test introuvable.".to_string())?;

    read_project_snapshot(project_root.to_string_lossy().to_string())
}

#[tauri::command]
fn read_project_snapshot(project_root: String) -> Result<ProjectSnapshot, String> {
    let project_root = PathBuf::from(project_root);
    let project = read_json_file(&project_root.join(".blendup").join("project.json"))?;
    let asset_folders = read_asset_folders(&project_root, &project);
    let asset_type_presets = read_asset_type_presets(&project_root);
    let asset_naming_rules = read_asset_naming_rules(&project_root);
    let (mut assets, mut problems) = read_assets(&project_root);
    let (mut tasks, task_problems) = read_tasks(&project_root);
    let git_status = read_git_status(&project_root);
    let activity = read_activity(&project_root);

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
        asset_folders,
        asset_type_presets,
        asset_naming_rules,
        assets,
        tasks,
        git_status,
        activity,
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
fn detect_local_tools(
    blender_path: Option<String>,
    unity_path: Option<String>,
    pure_ref_path: Option<String>,
) -> LocalToolsSnapshot {
    LocalToolsSnapshot {
        blender: detect_tool(
            "Blender",
            blender_path.as_deref(),
            find_blender_executable(blender_path.as_deref()),
        ),
        unity: detect_tool(
            "Unity",
            unity_path.as_deref(),
            find_unity_executable(unity_path.as_deref()),
        ),
        pure_ref: detect_tool(
            "PureRef",
            pure_ref_path.as_deref(),
            find_pure_ref_executable(pure_ref_path.as_deref()),
        ),
    }
}

#[tauri::command]
fn create_project(options: CreateProjectOptions) -> Result<CreateProjectResult, String> {
    let project_name = options.project_name.trim();
    let project_root_value = options.project_root.trim();

    if project_name.is_empty() {
        return Err("Donne un nom au projet.".to_string());
    }

    if project_root_value.is_empty() {
        return Err("Choisis un dossier racine pour le projet.".to_string());
    }

    let project_root = PathBuf::from(project_root_value);

    if project_root.exists() && !project_root.is_dir() {
        return Err(format!(
            "{} existe deja mais ce n'est pas un dossier.",
            project_root.display()
        ));
    }

    let project_file = project_root.join(".blendup").join("project.json");

    if project_file.exists() {
        return Err(format!(
            "Un projet BlendUp existe deja dans {}.",
            project_root.display()
        ));
    }

    fs::create_dir_all(&project_root)
        .map_err(|error| format!("Impossible de creer {}: {error}", project_root.display()))?;

    for directory in default_project_directories(options.create_unity_folders) {
        let path = project_root.join(directory);
        fs::create_dir_all(&path)
            .map_err(|error| format!("Impossible de creer {}: {error}", path.display()))?;
    }

    write_json_file(&project_file, &default_project_config(project_name))?;
    write_json_file(
        &project_root
            .join(".blendup")
            .join("presets")
            .join("asset-types.json"),
        &default_asset_type_presets(),
    )?;
    write_json_file(
        &project_root
            .join(".blendup")
            .join("naming")
            .join("asset-naming.json"),
        &default_asset_naming_rules(),
    )?;
    write_json_file(
        &project_root
            .join(".blendup")
            .join("naming")
            .join("branch-naming.json"),
        &default_branch_naming_rules(),
    )?;
    write_json_file(
        &project_root
            .join(".blendup")
            .join("migrations")
            .join("applied.json"),
        &json!({
            "schemaVersion": 1,
            "kind": "applied_migrations",
            "items": []
        }),
    )?;
    write_text_file(
        &project_root
            .join(".blendup")
            .join("logs")
            .join("activity.jsonl"),
        "",
    )?;

    if options.create_gitignore {
        let gitignore_path = project_root.join(".gitignore");

        if !gitignore_path.exists() {
            write_text_file(&gitignore_path, default_gitignore_content())?;
        }
    }

    Ok(CreateProjectResult {
        project_root: project_root.to_string_lossy().to_string(),
        message: format!("{project_name} est pret."),
    })
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

#[tauri::command]
fn open_project_path(project_root: String, relative_path: String) -> Result<(), String> {
    let project_root = PathBuf::from(project_root)
        .canonicalize()
        .map_err(|error| format!("Projet introuvable: {error}"))?;
    let relative_path = relative_path.trim();

    if relative_path.is_empty() {
        return Err("Aucun chemin de fichier n'est associe a cet element.".to_string());
    }

    let target_path = project_root.join(relative_path);
    let target_path = target_path.canonicalize().map_err(|error| {
        format!(
            "Impossible de trouver {}: {error}",
            project_root.join(relative_path).display()
        )
    })?;

    if !target_path.starts_with(&project_root) {
        return Err("Le fichier demande est en dehors du projet BlendUp.".to_string());
    }

    open_with_system(&target_path, false)
}

#[tauri::command]
fn open_blend_file(
    project_root: String,
    relative_path: String,
    blender_path: Option<String>,
    show_command_prompt: bool,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root)
        .canonicalize()
        .map_err(|error| format!("Projet introuvable: {error}"))?;
    let relative_path = relative_path.trim();

    if relative_path.is_empty() {
        return Err("Aucun fichier Blender n'est associe a cet asset.".to_string());
    }

    let target_path = project_root.join(relative_path);
    let target_path = target_path.canonicalize().map_err(|error| {
        format!(
            "Impossible de trouver {}: {error}",
            project_root.join(relative_path).display()
        )
    })?;

    if !target_path.starts_with(&project_root) {
        return Err("Le fichier demande est en dehors du projet BlendUp.".to_string());
    }

    if !target_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("blend"))
    {
        return Err("Le fichier demande n'est pas un fichier Blender .blend.".to_string());
    }

    if let Some(blender_executable) = find_blender_executable(blender_path.as_deref()) {
        let mut command = Command::new(&blender_executable);
        command.arg(&target_path);
        apply_command_window_preference(&mut command, show_command_prompt);
        command.spawn().map_err(|error| {
            format!(
                "Impossible d'ouvrir {} avec Blender {}: {error}",
                target_path.display(),
                blender_executable.display()
            )
        })?;
        return Ok(());
    }

    open_with_system(&target_path, show_command_prompt)
}

#[tauri::command]
fn read_project_file_data_url(project_root: String, relative_path: String) -> Result<String, String> {
    let project_root = PathBuf::from(project_root)
        .canonicalize()
        .map_err(|error| format!("Projet introuvable: {error}"))?;
    let relative_path = norm_rel(&relative_path);

    if relative_path.is_empty() {
        return Err("Aucun fichier a lire.".to_string());
    }

    let target_path = project_root.join(&relative_path);
    let target_path = target_path.canonicalize().map_err(|error| {
        format!(
            "Impossible de trouver {}: {error}",
            project_root.join(&relative_path).display()
        )
    })?;

    if !target_path.starts_with(&project_root) {
        return Err("Le fichier demande est en dehors du projet BlendUp.".to_string());
    }

    let mime = image_mime_for_path(&target_path)
        .ok_or_else(|| "Le fichier demande n'est pas une image supportee.".to_string())?;
    let metadata = fs::metadata(&target_path)
        .map_err(|error| format!("Impossible de lire {}: {error}", target_path.display()))?;

    if metadata.len() > 8 * 1024 * 1024 {
        return Err("Image trop lourde pour l'aperçu BlendUp.".to_string());
    }

    let bytes = fs::read(&target_path)
        .map_err(|error| format!("Impossible de lire {}: {error}", target_path.display()))?;
    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{mime};base64,{encoded}"))
}

#[tauri::command]
fn update_asset_status(
    project_root: String,
    asset_id: String,
    status: String,
    actor: String,
    actor_is_art_director: bool,
    updated_at: String,
) -> Result<(), String> {
    if !is_artist_status(&status) {
        return Err(format!("Statut artiste non reconnu: {status}"));
    }

    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let previous_status = json_string(&asset, &["status"])
        .unwrap_or("unknown")
        .to_string();

    // Verrou natif : seul le Directeur artistique peut valider un asset, et
    // seul un DA peut modifier un asset deja valide (le rouvrir). Cette
    // verification double celle de l'interface pour eviter tout contournement.
    if !actor_is_art_director && (status == "validated" || previous_status == "validated") {
        return Err(
            "Seul le Directeur artistique peut valider ou rouvrir un asset valide.".to_string(),
        );
    }
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();

    asset["status"] = Value::String(status.clone());
    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.status_changed",
            "assetId": asset_id,
            "message": format!("{display_name}: {previous_status} -> {status}")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn take_open_request(project_root: String) -> Option<OpenRequest> {
    // Requete ecrite par l'add-on Blender ("ouvrir la fiche dans BlendUp").
    // On la lit puis on la supprime pour qu'elle ne soit traitee qu'une fois.
    let request_path = PathBuf::from(&project_root)
        .join(".blendup")
        .join("temp")
        .join("open-request.json");

    if !request_path.exists() {
        return None;
    }

    let value = read_json_file(&request_path).ok()?;
    let asset_id = json_string(&value, &["assetId"])?.to_string();
    let requested_at = json_string(&value, &["requestedAt"])
        .unwrap_or("")
        .to_string();

    let _ = fs::remove_file(&request_path);

    Some(OpenRequest {
        asset_id,
        requested_at,
    })
}

fn open_with_system(path: &Path, show_command_prompt: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd");
        command.arg("/C").arg("start").arg("").arg(path);
        apply_command_window_preference(&mut command, show_command_prompt);
        command
            .spawn()
            .map_err(|error| format!("Impossible d'ouvrir {}: {error}", path.display()))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Impossible d'ouvrir {}: {error}", path.display()))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Impossible d'ouvrir {}: {error}", path.display()))?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_command_window_preference(command: &mut Command, show_command_prompt: bool) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    if !show_command_prompt {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_command_window_preference(_command: &mut Command, _show_command_prompt: bool) {}

fn image_mime_for_path(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("webp") => Some("image/webp"),
        Some("gif") => Some("image/gif"),
        Some("bmp") => Some("image/bmp"),
        _ => None,
    }
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
            Ok(mut asset) => {
                hydrate_asset_for_snapshot(project_root, &mut asset);
                assets.push(asset);
            }
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

fn hydrate_asset_for_snapshot(project_root: &Path, asset: &mut Value) {
    if asset.get("variants").and_then(Value::as_array).is_none() {
        asset["variants"] = Value::Array(Vec::new());
    }

    if asset.get("lods").and_then(Value::as_array).is_none() {
        asset["lods"] = Value::Array(Vec::new());
    }

    let has_thumbnail = json_string(asset, &["paths", "thumbnail"])
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    if has_thumbnail {
        return;
    }

    let Some(asset_id) = json_string(asset, &["id"]) else {
        return;
    };

    for extension in ["png", "jpg", "jpeg", "webp"] {
        let thumbnail_rel = format!(".blendup/thumbnails/{asset_id}.{extension}");
        if rel_to_abs(project_root, &thumbnail_rel).is_file() {
            set_paths_field(asset, "thumbnail", &thumbnail_rel);
            return;
        }
    }
}

fn read_asset_folders(project_root: &Path, project: &Value) -> Vec<String> {
    let mut folders = Vec::new();

    fn visit(project_root: &Path, directory: &Path, depth: usize, folders: &mut Vec<String>) {
        if depth > 5 {
            return;
        }

        let Ok(entries) = fs::read_dir(directory) else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let relative = path
                .strip_prefix(project_root)
                .map(|value| norm_rel(&value.to_string_lossy()))
                .unwrap_or_default();

            if !relative.is_empty() {
                folders.push(relative);
            }

            visit(project_root, &path, depth + 1, folders);
        }
    }

    for root_rel in asset_roots(project) {
        let root_abs = rel_to_abs(project_root, &root_rel);
        if root_abs.is_dir() {
            folders.push(root_rel);
            visit(project_root, &root_abs, 0, &mut folders);
        }
    }

    folders.sort();
    folders.dedup();
    folders
}

fn read_asset_type_presets(project_root: &Path) -> Vec<Value> {
    read_json_file(
        &project_root
            .join(".blendup")
            .join("presets")
            .join("asset-types.json"),
    )
    .ok()
    .and_then(|value| value.get("items").and_then(Value::as_array).cloned())
    .unwrap_or_else(|| {
        default_asset_type_presets()
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    })
}

fn read_asset_naming_rules(project_root: &Path) -> Value {
    read_json_file(
        &project_root
            .join(".blendup")
            .join("naming")
            .join("asset-naming.json"),
    )
    .unwrap_or_else(|_| default_asset_naming_rules())
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

fn write_text_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }

    fs::write(path, content)
        .map_err(|error| format!("Impossible d'ecrire {}: {error}", path.display()))
}

fn read_activity(project_root: &Path) -> Vec<Value> {
    let path = project_root
        .join(".blendup")
        .join("logs")
        .join("activity.jsonl");
    let Ok(content) = fs::read_to_string(&path) else {
        return Vec::new();
    };

    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                None
            } else {
                serde_json::from_str::<Value>(trimmed).ok()
            }
        })
        .collect()
}

fn append_activity(project_root: &Path, entry: Value) -> Result<(), String> {
    let path = project_root
        .join(".blendup")
        .join("logs")
        .join("activity.jsonl");
    let content = serde_json::to_string(&entry)
        .map_err(|error| format!("Impossible de serialiser l'activite: {error}"))?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent.display()))?;
    }

    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("Impossible d'ouvrir {}: {error}", path.display()))?;

    writeln!(file, "{content}")
        .map_err(|error| format!("Impossible d'ecrire {}: {error}", path.display()))
}

fn default_project_directories(create_unity_folders: bool) -> Vec<&'static str> {
    let mut directories = vec![
        ".blendup/assets",
        ".blendup/tasks",
        ".blendup/refs",
        ".blendup/presets",
        ".blendup/naming",
        ".blendup/locks",
        ".blendup/logs",
        ".blendup/migrations",
        "Art/Blender/Props",
        "Art/Blender/Environment",
        "Art/Blender/Templates",
        "Art/References/Global",
        "Art/References/Props",
        "Art/Textures",
        "Art/UI",
    ];

    if create_unity_folders {
        directories.extend([
            "Unity/Assets/Models",
            "Unity/Assets/Prefabs",
            "Unity/Assets/Materials",
            "Unity/Assets/BlendUp",
            "Unity/Packages",
            "Unity/ProjectSettings",
        ]);
    }

    directories
}

fn default_project_config(project_name: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "kind": "project",
        "projectId": format!("project_{}", project_slug(project_name)),
        "name": project_name,
        "paths": {
            "artRoot": "Art",
            "blenderRoot": "Art/Blender",
            "referencesRoot": "Art/References",
            "texturesRoot": "Art/Textures",
            "uiRoot": "Art/UI",
            "unityRoot": "Unity",
            "unityAssetsRoot": "Unity/Assets",
            "unityModelsRoot": "Unity/Assets/Models",
            "unityPrefabsRoot": "Unity/Assets/Prefabs",
            "unityMaterialsRoot": "Unity/Assets/Materials"
        },
        "targets": {
            "blenderMinimumVersion": "4.0",
            "unityMinimumVersion": "6000.0.77f1"
        },
        "features": {
            "git": true,
            "gitLfs": true,
            "clickUp": false,
            "pureRef": true
        },
        "assets": {
            "roots": ["Art/Blender"],
            "typeFolderDepth": 1
        },
        "defaultView": "artist"
    })
}

fn default_asset_type_presets() -> Value {
    json!({
        "schemaVersion": 1,
        "kind": "asset_type_presets",
        "items": [
            {
                "id": "assets",
                "displayName": "Assets",
                "prefix": "ASS",
                "categoryNames": ["Assets"],
                "influence": "General asset folders and imported props that are not classic PROP.",
                "defaultExportProfile": "static_mesh_default",
                "defaultQualityBudget": "prop_default"
            },
            {
                "id": "static_mesh",
                "displayName": "Static Mesh",
                "prefix": "PROP",
                "categoryNames": ["Static Mesh", "StaticMesh"],
                "influence": "Mesh asset exported to Unity as geometry.",
                "defaultExportProfile": "static_mesh_default",
                "defaultQualityBudget": "static_mesh_default"
            },
            {
                "id": "prop",
                "displayName": "Prop",
                "prefix": "PROP",
                "categoryNames": ["Prop", "Props", "Accessoire", "Accessoires"],
                "influence": "Move into this category for prop naming, export and quality defaults.",
                "defaultExportProfile": "static_mesh_default",
                "defaultQualityBudget": "prop_default"
            },
            {
                "id": "environment_piece",
                "displayName": "Environment Piece",
                "prefix": "ENV",
                "categoryNames": ["Environment", "Environnement", "Env", "Environments"],
                "influence": "Environment set dressing and world pieces.",
                "defaultExportProfile": "environment_piece_default",
                "defaultQualityBudget": "environment_piece_default"
            },
            {
                "id": "material",
                "displayName": "Material",
                "prefix": "MAT",
                "categoryNames": ["Material", "Materials", "Materiau", "Materiaux"],
                "influence": "Material or shader asset, usually without FBX export.",
                "defaultExportProfile": null,
                "defaultQualityBudget": "material_default"
            },
            {
                "id": "texture",
                "displayName": "Texture",
                "prefix": "TEX",
                "categoryNames": ["Texture", "Textures", "Tex"],
                "influence": "Texture source files and texture deliverables.",
                "defaultExportProfile": null,
                "defaultQualityBudget": "texture_default"
            },
            {
                "id": "ui_image",
                "displayName": "UI Image",
                "prefix": "UI",
                "categoryNames": ["UI", "Interface", "HUD"],
                "influence": "UI images and interface sprites.",
                "defaultExportProfile": null,
                "defaultQualityBudget": "ui_image_default"
            }
        ]
    })
}

fn default_asset_naming_rules() -> Value {
    json!({
        "schemaVersion": 1,
        "kind": "asset_naming_rules",
        "pattern": "{prefix}_{name}_{index}",
        "prefixes": ["PROP", "ENV", "CHR", "MAT", "TEX", "UI", "FX"],
        "blenderSuffixes": ["_MESH", "_COL", "_LOD0", "_LOD1", "_ARM", "_RIG", "_EMPTY", "_SOCKET"],
        "forbiddenNameFragments": ["final", "new", "copy", "test"]
    })
}

fn default_branch_naming_rules() -> Value {
    json!({
        "schemaVersion": 1,
        "kind": "branch_naming_rules",
        "patterns": {
            "asset": "asset/{assetName}-{workType}",
            "task": "task/{taskCode}-{slug}",
            "fix": "fix/{assetId}-{slug}",
            "review": "review/{assetName}-validation"
        },
        "examples": [
            "asset/PROP_Barrel_01-modeling",
            "asset/CHR_Knight_01-rig",
            "task/BU-124-door-interactable",
            "fix/asset_7a42-unity-import",
            "review/PROP_Barrel_01-validation"
        ]
    })
}

fn asset_roots(project: &Value) -> Vec<String> {
    let configured = project
        .get("assets")
        .and_then(|assets| assets.get("roots"))
        .and_then(Value::as_array)
        .map(|roots| {
            roots
                .iter()
                .filter_map(Value::as_str)
                .map(norm_rel)
                .filter(|root| !root.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if configured.is_empty() {
        vec![norm_rel(
            json_string(project, &["paths", "blenderRoot"]).unwrap_or("Art/Blender"),
        )]
    } else {
        configured
    }
}

fn default_gitignore_content() -> &'static str {
    "# Unity generated folders\nUnity/Library/\nUnity/Temp/\nUnity/Obj/\nUnity/Build/\nUnity/Builds/\nUnity/Logs/\nUnity/UserSettings/\n\n# Unity generated files\nUnity/*.csproj\nUnity/*.sln\nUnity/*.slnx\nUnity/*.user\nUnity/*.pidb\nUnity/*.booproj\nUnity/*.svd\nUnity/*.pdb\nUnity/*.mdb\nUnity/sysinfo.txt\n\n# OS / editor files\n.DS_Store\nThumbs.db\ndesktop.ini\n.vscode/\n\n# BlendUp local-only generated cache, if created later\n.blendup/cache/\n.blendup/tmp/\n.blendup/temp/\n"
}

fn project_slug(value: &str) -> String {
    let mut slug = String::new();

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
        } else if !slug.ends_with('_') {
            slug.push('_');
        }
    }

    let trimmed = slug.trim_matches('_');

    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed.to_string()
    }
}

fn user_settings_path() -> Result<PathBuf, String> {
    if let Some(app_data) = env::var_os("APPDATA") {
        return Ok(PathBuf::from(app_data)
            .join("BlendUp")
            .join("user-settings.json"));
    }

    if let Some(config_home) = env::var_os("XDG_CONFIG_HOME") {
        return Ok(PathBuf::from(config_home)
            .join("BlendUp")
            .join("user-settings.json"));
    }

    if let Some(home) = env::var_os("HOME") {
        return Ok(PathBuf::from(home)
            .join(".config")
            .join("BlendUp")
            .join("user-settings.json"));
    }

    Err("Impossible de determiner le dossier de configuration utilisateur.".to_string())
}

fn normalize_user_settings(settings: UserSettings) -> UserSettings {
    let mut recent_projects = Vec::new();

    for project in settings.recent_projects {
        let trimmed = project.trim();

        if trimmed.is_empty() || recent_projects.iter().any(|known| known == trimmed) {
            continue;
        }

        recent_projects.push(trimmed.to_string());

        if recent_projects.len() == 8 {
            break;
        }
    }

    let last_project_root = settings
        .last_project_root
        .and_then(|value| non_empty_string(&value));

    let recent_projects = match &last_project_root {
        Some(last_project)
            if recent_projects
                .iter()
                .all(|project| project != last_project) =>
        {
            let mut next = vec![last_project.clone()];
            next.extend(recent_projects);
            next.truncate(8);
            next
        }
        _ => recent_projects,
    };

    UserSettings {
        schema_version: 1,
        kind: "user_settings".to_string(),
        last_project_root,
        recent_projects,
        blender_path: settings
            .blender_path
            .and_then(|value| non_empty_string(&value)),
        unity_path: settings
            .unity_path
            .and_then(|value| non_empty_string(&value)),
        pure_ref_path: settings
            .pure_ref_path
            .and_then(|value| non_empty_string(&value)),
        show_blender_command_prompt: settings.show_blender_command_prompt,
    }
}

fn non_empty_string(value: &str) -> Option<String> {
    let trimmed = value.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
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

    asset["updatedAt"] = Value::String(exported_at.to_string());

    write_json_file(asset_file, asset)
}

fn is_artist_status(status: &str) -> bool {
    matches!(
        status,
        "todo" | "in_progress" | "review" | "needs_art_fix" | "validated"
    )
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

fn detect_tool(
    label: &str,
    explicit_path: Option<&str>,
    detected_path: Option<PathBuf>,
) -> ToolDetection {
    match detected_path {
        Some(path) => ToolDetection {
            found: true,
            path: Some(path.to_string_lossy().to_string()),
            message: format!("{label} detecte."),
        },
        None => {
            let detail = explicit_path.and_then(non_empty_string).map_or_else(
                || "Aucun chemin local valide detecte.".to_string(),
                |path| format!("Chemin introuvable: {path}"),
            );

            ToolDetection {
                found: false,
                path: None,
                message: format!("{label} non detecte. {detail}"),
            }
        }
    }
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

fn find_unity_executable(explicit_path: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = explicit_path.and_then(non_empty_path) {
        if path.exists() {
            return Some(path);
        }
    }

    common_unity_locations()
        .into_iter()
        .find(|candidate| candidate.exists())
}

fn common_unity_locations() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for variable in ["ProgramFiles", "ProgramW6432"] {
        if let Some(base) = env::var_os(variable) {
            let hub_editors = PathBuf::from(&base)
                .join("Unity")
                .join("Hub")
                .join("Editor");

            if let Ok(entries) = fs::read_dir(&hub_editors) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("Editor").join("Unity.exe"));
                }
            }

            candidates.push(
                PathBuf::from(base)
                    .join("Unity")
                    .join("Editor")
                    .join("Unity.exe"),
            );
        }
    }

    candidates.extend([
        PathBuf::from("/usr/bin/unity-editor"),
        PathBuf::from("/usr/local/bin/unity-editor"),
        PathBuf::from("/opt/unity/Editor/Unity"),
    ]);

    candidates
}

fn find_pure_ref_executable(explicit_path: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = explicit_path.and_then(non_empty_path) {
        if path.exists() {
            return Some(path);
        }
    }

    common_pure_ref_locations()
        .into_iter()
        .find(|candidate| candidate.exists())
}

fn common_pure_ref_locations() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for variable in [
        "ProgramFiles",
        "ProgramW6432",
        "ProgramFiles(x86)",
        "LOCALAPPDATA",
    ] {
        if let Some(base) = env::var_os(variable) {
            candidates.push(PathBuf::from(&base).join("PureRef").join("PureRef.exe"));
            candidates.push(PathBuf::from(&base).join("PureRef").join("PureRef-2.0.exe"));
        }
    }

    candidates.extend([
        PathBuf::from("/usr/bin/pureref"),
        PathBuf::from("/usr/local/bin/pureref"),
        PathBuf::from("/opt/PureRef/PureRef"),
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

    log.trim().to_string()
}

// ===== Modele asset = dossier : helpers chemins =====

fn norm_rel(p: &str) -> String {
    p.replace('\\', "/")
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn parent_rel(rel: &str) -> String {
    match rel.rfind('/') {
        Some(index) => rel[..index].to_string(),
        None => String::new(),
    }
}

fn base_rel(rel: &str) -> String {
    match rel.rfind('/') {
        Some(index) => rel[index + 1..].to_string(),
        None => rel.to_string(),
    }
}

fn stem_rel(rel: &str) -> String {
    let base = base_rel(rel);
    match base.rfind('.') {
        Some(index) if index > 0 => base[..index].to_string(),
        _ => base,
    }
}

fn join_rel(parent: &str, child: &str) -> String {
    if parent.is_empty() {
        child.to_string()
    } else {
        format!("{parent}/{child}")
    }
}

fn rel_to_abs(project_root: &Path, rel: &str) -> PathBuf {
    let mut path = project_root.to_path_buf();
    for segment in rel.split('/').filter(|segment| !segment.is_empty()) {
        path.push(segment);
    }
    path
}

fn move_file_if_exists(project_root: &Path, old_rel: &str, new_rel: &str) {
    if old_rel == new_rel || old_rel.is_empty() || new_rel.is_empty() {
        return;
    }
    let old_abs = rel_to_abs(project_root, old_rel);
    let new_abs = rel_to_abs(project_root, new_rel);
    if old_abs.exists() && !new_abs.exists() {
        if let Some(parent) = new_abs.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::rename(&old_abs, &new_abs);
        // Deplace aussi le fichier .meta Unity associe s'il existe.
        let old_meta = rel_to_abs(project_root, &format!("{old_rel}.meta"));
        let new_meta = rel_to_abs(project_root, &format!("{new_rel}.meta"));
        if old_meta.exists() && !new_meta.exists() {
            let _ = fs::rename(&old_meta, &new_meta);
        }
    }
}

fn set_paths_field(asset: &mut Value, key: &str, value: &str) {
    if asset.get("paths").and_then(Value::as_object).is_none() {
        asset["paths"] = json!({});
    }
    if let Some(paths) = asset.get_mut("paths").and_then(Value::as_object_mut) {
        paths.insert(key.to_string(), Value::String(value.to_string()));
    }
}

fn asset_folder_rel(asset: &Value) -> String {
    if let Some(folder) = json_string(asset, &["paths", "assetFolder"]) {
        let folder = norm_rel(folder);
        if !folder.is_empty() {
            return folder;
        }
    }
    // Fallback : dossier parent du fichier blender (modele post-migration).
    let blender = json_string(asset, &["paths", "blenderSource"]).unwrap_or("");
    parent_rel(&norm_rel(blender))
}

fn is_safe_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && !trimmed.contains('/')
        && !trimmed.contains('\\')
        && !trimmed
            .chars()
            .any(|c| matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        && trimmed != "."
        && trimmed != ".."
}

// ===== Commandes asset (dossier) =====

#[tauri::command]
fn migrate_assets_to_folders(project_root: String) -> Result<u32, String> {
    let project_root = PathBuf::from(project_root);
    let assets_dir = project_root.join(".blendup").join("assets");
    let entries = match fs::read_dir(&assets_dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(0),
    };

    let mut migrated = 0u32;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }

        let mut asset = read_json_file(&path)?;

        // Deja migre si un assetFolder non vide est present.
        if json_string(&asset, &["paths", "assetFolder"])
            .map(|folder| !folder.trim().is_empty())
            .unwrap_or(false)
        {
            continue;
        }

        let blender = norm_rel(json_string(&asset, &["paths", "blenderSource"]).unwrap_or(""));
        if blender.is_empty() {
            continue;
        }

        let stem = stem_rel(&blender);
        if stem.is_empty() {
            continue;
        }
        let parent = parent_rel(&blender);
        let folder_rel = join_rel(&parent, &stem);
        let new_blender_rel = format!("{folder_rel}/{stem}.blend");

        let folder_abs = rel_to_abs(&project_root, &folder_rel);
        fs::create_dir_all(folder_abs.join("references"))
            .map_err(|error| format!("Impossible de creer references: {error}"))?;
        fs::create_dir_all(folder_abs.join("textures"))
            .map_err(|error| format!("Impossible de creer textures: {error}"))?;

        let old_abs = rel_to_abs(&project_root, &blender);
        let new_abs = rel_to_abs(&project_root, &new_blender_rel);
        if old_abs.exists() && old_abs != new_abs {
            if let Some(parent_dir) = new_abs.parent() {
                fs::create_dir_all(parent_dir).map_err(|error| {
                    format!("Impossible de creer {}: {error}", parent_dir.display())
                })?;
            }
            fs::rename(&old_abs, &new_abs).map_err(|error| {
                format!("Impossible de deplacer {}: {error}", old_abs.display())
            })?;
        }

        set_paths_field(&mut asset, "assetFolder", &folder_rel);
        set_paths_field(&mut asset, "blenderSource", &new_blender_rel);
        set_paths_field(
            &mut asset,
            "referencesDir",
            &format!("{folder_rel}/references"),
        );
        set_paths_field(&mut asset, "texturesDir", &format!("{folder_rel}/textures"));
        write_json_file(&path, &asset)?;
        migrated += 1;
    }

    Ok(migrated)
}

#[tauri::command]
fn rename_asset(
    project_root: String,
    asset_id: String,
    new_name: String,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    if !is_safe_name(&new_name) {
        return Err("Nom d'asset invalide.".to_string());
    }
    let new_name = new_name.trim().to_string();

    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let old_display = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();

    let old_folder = asset_folder_rel(&asset);
    let parent = parent_rel(&old_folder);
    let new_folder = join_rel(&parent, &new_name);

    if new_folder != old_folder && !old_folder.is_empty() {
        let old_abs = rel_to_abs(&project_root, &old_folder);
        let new_abs = rel_to_abs(&project_root, &new_folder);
        if new_abs.exists() {
            return Err(format!(
                "Un dossier {new_name} existe deja a cet emplacement."
            ));
        }
        if old_abs.exists() {
            fs::rename(&old_abs, &new_abs)
                .map_err(|error| format!("Impossible de renommer le dossier: {error}"))?;
        }
    }

    // Renommer le fichier blender a l'interieur du dossier.
    let old_blender = norm_rel(json_string(&asset, &["paths", "blenderSource"]).unwrap_or(""));
    let new_blender = format!("{new_folder}/{new_name}.blend");
    if !old_blender.is_empty() {
        // Apres le rename de dossier, l'ancien blend vit sous le nouveau dossier.
        let moved_old_blender = if old_folder.is_empty() {
            old_blender.clone()
        } else {
            old_blender.replacen(&old_folder, &new_folder, 1)
        };
        let moved_old_abs = rel_to_abs(&project_root, &moved_old_blender);
        let new_blender_abs = rel_to_abs(&project_root, &new_blender);
        if moved_old_abs.exists() && moved_old_abs != new_blender_abs {
            fs::rename(&moved_old_abs, &new_blender_abs)
                .map_err(|error| format!("Impossible de renommer le fichier blender: {error}"))?;
        }
    }

    set_paths_field(&mut asset, "assetFolder", &new_folder);
    set_paths_field(&mut asset, "blenderSource", &new_blender);
    set_paths_field(
        &mut asset,
        "referencesDir",
        &format!("{new_folder}/references"),
    );
    set_paths_field(&mut asset, "texturesDir", &format!("{new_folder}/textures"));

    // Renomme aussi les fichiers Unity (.fbx / .prefab) et leur .meta.
    if let Some(fbx) = json_string(&asset, &["paths", "fbxExport"]) {
        let fbx = norm_rel(fbx);
        if !fbx.is_empty() {
            let new_fbx = join_rel(&parent_rel(&fbx), &format!("{new_name}.fbx"));
            move_file_if_exists(&project_root, &fbx, &new_fbx);
            set_paths_field(&mut asset, "fbxExport", &new_fbx);
        }
    }
    if let Some(prefab) = json_string(&asset, &["paths", "unityPrefab"]) {
        let prefab = norm_rel(prefab);
        if !prefab.is_empty() {
            let new_prefab = join_rel(&parent_rel(&prefab), &format!("{new_name}.prefab"));
            move_file_if_exists(&project_root, &prefab, &new_prefab);
            set_paths_field(&mut asset, "unityPrefab", &new_prefab);
        }
    }

    asset["displayName"] = Value::String(new_name.clone());
    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.renamed",
            "assetId": asset_id,
            "message": format!("{old_display} -> {new_name}")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn move_asset(
    project_root: String,
    asset_id: String,
    target_dir: String,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();

    let old_folder = asset_folder_rel(&asset);
    if old_folder.is_empty() {
        return Err("Cet asset n'a pas de dossier a deplacer.".to_string());
    }
    let folder_name = base_rel(&old_folder);
    let target_dir = norm_rel(&target_dir);
    let new_folder = join_rel(&target_dir, &folder_name);
    let mut final_folder = new_folder.clone();

    if new_folder == old_folder {
        return Ok(());
    }

    let old_abs = rel_to_abs(&project_root, &old_folder);
    let new_abs = rel_to_abs(&project_root, &new_folder);
    if new_abs.exists() {
        return Err(format!(
            "Un dossier {folder_name} existe deja dans la destination."
        ));
    }
    if let Some(parent_dir) = new_abs.parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent_dir.display()))?;
    }
    if old_abs.exists() {
        fs::rename(&old_abs, &new_abs)
            .map_err(|error| format!("Impossible de deplacer le dossier: {error}"))?;
    }

    let rewrite = |asset: &mut Value, key: &str| {
        if let Some(current) = json_string(asset, &["paths", key]) {
            let current = norm_rel(current);
            if current == old_folder || current.starts_with(&format!("{old_folder}/")) {
                let updated = current.replacen(&old_folder, &new_folder, 1);
                set_paths_field(asset, key, &updated);
            }
        }
    };
    rewrite(&mut asset, "assetFolder");
    rewrite(&mut asset, "blenderSource");
    rewrite(&mut asset, "referencesDir");
    rewrite(&mut asset, "texturesDir");

    // Le type d'asset depend de la categorie (dossier) dans laquelle il se trouve.
    if let Some(new_type) = type_for_folder(&project_root, &target_dir) {
        asset["type"] = Value::String(new_type.to_string());
        if let Some((_old_name, new_name)) =
            retarget_asset_name_to_type(&project_root, &mut asset, &new_type)
        {
            let renamed_folder = join_rel(&target_dir, &new_name);
            let current_abs = rel_to_abs(&project_root, &new_folder);
            let renamed_abs = rel_to_abs(&project_root, &renamed_folder);
            if renamed_folder != new_folder {
                if renamed_abs.exists() {
                    return Err(format!(
                        "Un dossier {new_name} existe deja dans la destination."
                    ));
                }
                if current_abs.exists() {
                    fs::rename(&current_abs, &renamed_abs).map_err(|error| {
                        format!("Impossible de renommer le dossier de type: {error}")
                    })?;
                }
                for key in [
                    "assetFolder",
                    "blenderSource",
                    "referencesDir",
                    "texturesDir",
                ] {
                    if let Some(current) = json_string(&asset, &["paths", key]) {
                        let current = norm_rel(current);
                        if current == new_folder || current.starts_with(&format!("{new_folder}/")) {
                            let updated = current.replacen(&new_folder, &renamed_folder, 1);
                            set_paths_field(&mut asset, key, &updated);
                        }
                    }
                }
                if let Some(blender) = json_string(&asset, &["paths", "blenderSource"]) {
                    let blender = norm_rel(blender);
                    let desired_blender = format!("{renamed_folder}/{new_name}.blend");
                    if blender != desired_blender {
                        move_file_if_exists(&project_root, &blender, &desired_blender);
                        set_paths_field(&mut asset, "blenderSource", &desired_blender);
                    }
                }
                final_folder = renamed_folder;
            }
        }
    }

    // Deplace aussi les fichiers Unity en remplacant le segment de categorie.
    let old_cat = base_rel(&parent_rel(&old_folder));
    let new_cat = base_rel(&target_dir);
    if !old_cat.is_empty() && old_cat != new_cat {
        let needle = format!("/{old_cat}/");
        for key in ["fbxExport", "unityPrefab"] {
            if let Some(path) = json_string(&asset, &["paths", key]) {
                let path = norm_rel(path);
                if let Some(pos) = path.rfind(&needle) {
                    let new_path = format!(
                        "{}/{}/{}",
                        &path[..pos],
                        new_cat,
                        &path[pos + needle.len()..]
                    );
                    move_file_if_exists(&project_root, &path, &new_path);
                    set_paths_field(&mut asset, key, &new_path);
                }
            }
        }
    }

    if let Some(current_name) = json_string(&asset, &["displayName"]).map(ToString::to_string) {
        for (key, extension) in [("fbxExport", "fbx"), ("unityPrefab", "prefab")] {
            if let Some(path) = json_string(&asset, &["paths", key]) {
                let path = norm_rel(path);
                if !path.is_empty() {
                    let new_path =
                        join_rel(&parent_rel(&path), &format!("{current_name}.{extension}"));
                    if new_path != path {
                        move_file_if_exists(&project_root, &path, &new_path);
                        set_paths_field(&mut asset, key, &new_path);
                    }
                }
            }
        }
    }

    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.moved",
            "assetId": asset_id,
            "message": format!("{display_name}: {old_folder} -> {final_folder}")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn move_folder(
    project_root: String,
    from_dir: String,
    target_dir: String,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let from_dir = norm_rel(&from_dir);
    let target_dir = norm_rel(&target_dir);

    if from_dir.is_empty() {
        return Err("Dossier source invalide.".to_string());
    }
    let folder_name = base_rel(&from_dir);
    let new_dir = join_rel(&target_dir, &folder_name);

    if new_dir == from_dir {
        return Ok(());
    }
    if new_dir == from_dir || new_dir.starts_with(&format!("{from_dir}/")) {
        return Err("Impossible de deplacer un dossier dans lui-meme.".to_string());
    }

    let old_abs = rel_to_abs(&project_root, &from_dir);
    let new_abs = rel_to_abs(&project_root, &new_dir);
    if new_abs.exists() {
        return Err(format!(
            "Un dossier {folder_name} existe deja dans la destination."
        ));
    }
    if let Some(parent_dir) = new_abs.parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|error| format!("Impossible de creer {}: {error}", parent_dir.display()))?;
    }
    if old_abs.exists() {
        fs::rename(&old_abs, &new_abs)
            .map_err(|error| format!("Impossible de deplacer le dossier: {error}"))?;
    }

    // Reecrire les chemins des assets situes sous le dossier deplace.
    let assets_dir = project_root.join(".blendup").join("assets");
    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            let mut asset = read_json_file(&path)?;
            let mut changed = false;
            for key in [
                "assetFolder",
                "blenderSource",
                "referencesDir",
                "texturesDir",
            ] {
                if let Some(current) = json_string(&asset, &["paths", key]) {
                    let current = norm_rel(current);
                    if current == from_dir || current.starts_with(&format!("{from_dir}/")) {
                        let updated = current.replacen(&from_dir, &new_dir, 1);
                        set_paths_field(&mut asset, key, &updated);
                        changed = true;
                    }
                }
            }
            if changed {
                let folder = asset_folder_rel(&asset);
                if let Some(new_type) = type_for_folder(&project_root, &parent_rel(&folder)) {
                    asset["type"] = Value::String(new_type.to_string());
                    let _ = retarget_asset_name_to_type(&project_root, &mut asset, &new_type);
                    align_asset_folder_to_display_name(&project_root, &mut asset)?;
                }
                asset["updatedAt"] = Value::String(updated_at.clone());
                write_json_file(&path, &asset)?;
            }
        }
    }

    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "folder.moved",
            "message": format!("{from_dir} -> {new_dir}")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn delete_asset(
    project_root: String,
    asset_id: String,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, asset) = find_asset_file(&project_root, &asset_id)?;
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();
    let folder = asset_folder_rel(&asset);

    if !folder.is_empty() {
        let folder_abs = rel_to_abs(&project_root, &folder);
        if folder_abs.exists() {
            trash::delete(&folder_abs).map_err(|error| {
                format!("Impossible d'envoyer le dossier a la corbeille: {error}")
            })?;
        }
    }

    if asset_file.exists() {
        trash::delete(&asset_file)
            .map_err(|error| format!("Impossible de supprimer la fiche asset: {error}"))?;
    }

    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.deleted",
            "assetId": asset_id,
            "message": format!("{display_name} supprime (corbeille)")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn set_asset_owners(
    project_root: String,
    asset_id: String,
    artist: Vec<String>,
    developer: Vec<String>,
    reviewer: Option<String>,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();

    let to_single_value =
        |value: Option<String>| match value.and_then(|inner| non_empty_string(&inner)) {
            Some(name) => Value::String(name),
            None => Value::Null,
        };
    let to_list_value = |values: Vec<String>| {
        Value::Array(
            values
                .iter()
                .filter_map(|value| non_empty_string(value).map(Value::String))
                .collect(),
        )
    };

    if asset.get("owners").and_then(Value::as_object).is_none() {
        asset["owners"] = json!({});
    }
    if let Some(owners) = asset.get_mut("owners").and_then(Value::as_object_mut) {
        owners.insert("artist".to_string(), to_list_value(artist));
        owners.insert("developer".to_string(), to_list_value(developer));
        owners.insert("reviewer".to_string(), to_single_value(reviewer));
    }

    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.owners_changed",
            "assetId": asset_id,
            "message": format!("Assignation mise a jour pour {display_name}")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn update_asset_notes(
    project_root: String,
    asset_id: String,
    artist_notes: String,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();

    if asset.get("notes").and_then(Value::as_object).is_none() {
        asset["notes"] = json!({});
    }
    if let Some(notes) = asset.get_mut("notes").and_then(Value::as_object_mut) {
        notes.insert("artist".to_string(), Value::String(artist_notes));
    }

    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.notes_changed",
            "assetId": asset_id,
            "message": format!("Notes artiste mises a jour pour {display_name}")
        }),
    )?;

    Ok(())
}

const CREATE_BLEND_SCRIPT: &str = r#"
import sys
import bpy

marker = "--"
if marker not in sys.argv:
    raise RuntimeError("BlendUp create: output path is missing.")

output_path = sys.argv[sys.argv.index(marker) + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.save_as_mainfile(filepath=output_path)
"#;

fn slug_id(name: &str) -> String {
    let mut slug = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if !slug.ends_with('_') {
            slug.push('_');
        }
    }
    format!("asset_{}", slug.trim_matches('_'))
}

fn copy_files_into(dir_abs: &Path, sources: &[String]) {
    for source in sources {
        let source_path = PathBuf::from(source);
        if let Some(file_name) = source_path.file_name() {
            let _ = fs::copy(&source_path, dir_abs.join(file_name));
        }
    }
}

fn create_blend_file(
    blender_path: &str,
    blend_abs: &Path,
    project_root: &Path,
) -> Result<(), String> {
    let script_path = project_root
        .join(".blendup")
        .join("temp")
        .join("create_blend.py");
    write_text_file(&script_path, CREATE_BLEND_SCRIPT)?;

    if let Some(parent) = blend_abs.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let output = Command::new(blender_path)
        .arg("-b")
        .arg("--python")
        .arg(&script_path)
        .arg("--")
        .arg(blend_abs)
        .output()
        .map_err(|error| format!("Impossible de lancer Blender: {error}"))?;

    if !output.status.success() {
        return Err("Blender n'a pas pu creer le fichier .blend.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn create_folder(project_root: String, parent_dir: String, name: String) -> Result<(), String> {
    if !is_safe_name(&name) {
        return Err("Nom de dossier invalide.".to_string());
    }
    let project_root = PathBuf::from(project_root);
    let rel = join_rel(&norm_rel(&parent_dir), name.trim());
    let abs = rel_to_abs(&project_root, &rel);
    if abs.exists() {
        return Err(format!("Le dossier {} existe deja.", name.trim()));
    }
    fs::create_dir_all(&abs)
        .map_err(|error| format!("Impossible de creer {}: {error}", abs.display()))?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn create_asset(
    project_root: String,
    parent_dir: String,
    name: String,
    asset_type: String,
    notes: String,
    reference_images: Vec<String>,
    texture_images: Vec<String>,
    fbx_export: Option<String>,
    unity_prefab: Option<String>,
    blender_path: Option<String>,
    actor: String,
    created_at: String,
) -> Result<String, String> {
    if !is_safe_name(&name) {
        return Err("Nom d'asset invalide.".to_string());
    }
    let name = name.trim().to_string();
    let project_root = PathBuf::from(project_root);
    let parent = norm_rel(&parent_dir);
    let folder_rel = join_rel(&parent, &name);
    let folder_abs = rel_to_abs(&project_root, &folder_rel);
    if folder_abs.exists() {
        return Err(format!("Un dossier {name} existe deja a cet emplacement."));
    }

    let references_rel = format!("{folder_rel}/references");
    let textures_rel = format!("{folder_rel}/textures");
    fs::create_dir_all(rel_to_abs(&project_root, &references_rel))
        .map_err(|error| format!("Impossible de creer references: {error}"))?;
    fs::create_dir_all(rel_to_abs(&project_root, &textures_rel))
        .map_err(|error| format!("Impossible de creer textures: {error}"))?;
    copy_files_into(
        &rel_to_abs(&project_root, &references_rel),
        &reference_images,
    );
    copy_files_into(&rel_to_abs(&project_root, &textures_rel), &texture_images);

    let blender_rel = format!("{folder_rel}/{name}.blend");
    let mut message = format!("Asset {name} cree.");
    match blender_path
        .as_ref()
        .and_then(|path| non_empty_string(path))
    {
        Some(path) => {
            let blend_abs = rel_to_abs(&project_root, &blender_rel);
            if let Err(error) = create_blend_file(&path, &blend_abs, &project_root) {
                message = format!("Asset {name} cree (sans .blend : {error}).");
            }
        }
        None => {
            message = format!("Asset {name} cree (ouvre-le dans Blender pour generer le .blend).");
        }
    }

    let id = slug_id(&name);
    let mut paths = json!({
        "assetFolder": folder_rel,
        "blenderSource": blender_rel,
        "referencesDir": references_rel,
        "texturesDir": textures_rel
    });
    if let Some(fbx) = fbx_export.and_then(|path| non_empty_string(&path)) {
        paths["fbxExport"] = Value::String(norm_rel(&fbx));
    }
    if let Some(prefab) = unity_prefab.and_then(|path| non_empty_string(&path)) {
        paths["unityPrefab"] = Value::String(norm_rel(&prefab));
    }

    let asset = json!({
        "schemaVersion": 1,
        "kind": "asset",
        "id": id.clone(),
        "displayName": name.clone(),
        "type": asset_type,
        "status": "todo",
        "productionMode": "production",
        "owners": { "artist": Value::Null, "developer": Value::Null, "reviewer": Value::Null },
        "assignees": [],
        "paths": paths,
        "export": {
            "profileId": Value::Null,
            "autoExport": false,
            "importInUnity": false,
            "lastExportAt": Value::Null,
            "lastExportStatus": "never_exported"
        },
        "unity": {
            "importStatus": "not_imported",
            "lastImportAt": Value::Null,
            "components": [],
            "expectedComponents": [],
            "warnings": []
        },
        "tags": [],
        "references": [],
        "tasks": [],
        "variants": [],
        "lods": [],
        "notes": { "artist": notes, "developer": "" },
        "createdAt": created_at,
        "updatedAt": created_at
    });

    let asset_file = project_root
        .join(".blendup")
        .join("assets")
        .join(format!("{id}.json"));
    if asset_file.exists() {
        return Err(format!("Une fiche asset {id} existe deja."));
    }
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": created_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.created",
            "assetId": id,
            "message": format!("Asset {name} cree dans {parent}")
        }),
    )?;

    Ok(message)
}

#[tauri::command]
fn save_asset_configuration(
    project_root: String,
    asset_roots: Vec<String>,
    asset_type_presets: Vec<Value>,
    asset_naming_rules: Value,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let project_file = project_root.join(".blendup").join("project.json");
    let mut project = read_json_file(&project_file)?;
    let roots = asset_roots
        .iter()
        .map(|root| norm_rel(root))
        .filter(|root| !root.is_empty())
        .collect::<Vec<_>>();

    project["assets"] = json!({
        "roots": if roots.is_empty() {
            vec![norm_rel(json_string(&project, &["paths", "blenderRoot"]).unwrap_or("Art/Blender"))]
        } else {
            roots
        },
        "typeFolderDepth": 1
    });
    write_json_file(&project_file, &project)?;

    write_json_file(
        &project_root
            .join(".blendup")
            .join("presets")
            .join("asset-types.json"),
        &json!({
            "schemaVersion": 1,
            "kind": "asset_type_presets",
            "items": asset_type_presets
        }),
    )?;

    write_json_file(
        &project_root
            .join(".blendup")
            .join("naming")
            .join("asset-naming.json"),
        &asset_naming_rules,
    )?;

    Ok(())
}

// ===== Type d'asset deduit de la categorie (dossier) =====

// Slug d'un nom de categorie inconnu en token de type (parite avec slugType du frontend).
fn slug_type(name: &str) -> String {
    let mut out = String::new();
    let mut pending_underscore = false;
    for ch in name.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            if pending_underscore && !out.is_empty() {
                out.push('_');
            }
            pending_underscore = false;
            out.push(ch);
        } else {
            pending_underscore = true;
        }
    }
    out
}

// Mapping categorie -> token de type. Connu => canonique ; sinon => slug du nom (type dynamique).
fn category_to_type(project_root: &Path, category: &str) -> String {
    let normalized_category = category.trim().to_lowercase();
    for preset in read_asset_type_presets(project_root) {
        let mut names = Vec::new();
        if let Some(value) = json_string(&preset, &["id"]) {
            names.push(value.to_string());
        }
        if let Some(value) = json_string(&preset, &["displayName"]) {
            names.push(value.to_string());
        }
        if let Some(values) = preset.get("categoryNames").and_then(Value::as_array) {
            for value in values.iter().filter_map(Value::as_str) {
                names.push(value.to_string());
            }
        }
        if names
            .iter()
            .any(|name| name.trim().to_lowercase() == normalized_category)
        {
            if let Some(id) = json_string(&preset, &["id"]) {
                return id.to_string();
            }
        }
    }

    match category.trim().to_lowercase().as_str() {
        "environment" | "environnement" | "env" | "environments" => "environment_piece".to_string(),
        "prop" | "props" | "accessoire" | "accessoires" => "prop".to_string(),
        "character" | "characters" | "personnage" | "personnages" | "chr" => {
            "character".to_string()
        }
        "material" | "materials" | "materiau" | "materiaux" => "material".to_string(),
        "texture" | "textures" | "tex" => "texture".to_string(),
        "ui" | "interface" | "hud" => "ui_image".to_string(),
        other => {
            let slug = slug_type(other);
            if slug.is_empty() {
                "prop".to_string()
            } else {
                slug
            }
        }
    }
}

// Type deduit de l'emplacement : categorie = 1er segment sous la racine Blender.
fn type_for_folder(project_root: &Path, folder_rel: &str) -> Option<String> {
    let project = read_json_file(&project_root.join(".blendup").join("project.json")).ok()?;
    let normalized = norm_rel(folder_rel);
    let roots = asset_roots(&project);
    let root = roots
        .iter()
        .filter(|candidate| {
            normalized == **candidate || normalized.starts_with(&format!("{candidate}/"))
        })
        .max_by_key(|candidate| candidate.len())?;
    let relative = normalized[root.len()..].trim_start_matches('/').to_string();
    let category = relative
        .split('/')
        .find(|segment| !segment.is_empty())
        .unwrap_or("");
    if category.is_empty() {
        return None;
    }
    Some(category_to_type(project_root, category))
}

fn prefix_for_type(project_root: &Path, asset_type: &str) -> String {
    for preset in read_asset_type_presets(project_root) {
        if json_string(&preset, &["id"]) == Some(asset_type) {
            if let Some(prefix) = json_string(&preset, &["prefix"]) {
                let prefix = prefix.trim().to_uppercase();
                if !prefix.is_empty() {
                    return prefix;
                }
            }
        }
    }

    match asset_type {
        "static_mesh" | "prop" => "PROP".to_string(),
        "environment_piece" => "ENV".to_string(),
        "material" => "MAT".to_string(),
        "texture" => "TEX".to_string(),
        "ui_image" => "UI".to_string(),
        "character" => "CHR".to_string(),
        other => {
            let letters: String = other
                .chars()
                .filter(|ch| ch.is_ascii_alphanumeric())
                .collect();
            if letters.is_empty() {
                "AST".to_string()
            } else {
                letters.chars().take(3).collect::<String>().to_uppercase()
            }
        }
    }
}

fn rename_asset_prefix(project_root: &Path, display_name: &str, asset_type: &str) -> String {
    let prefix = prefix_for_type(project_root, asset_type);
    let mut parts = display_name.split('_').collect::<Vec<_>>();

    if parts.len() >= 2
        && parts[0]
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit())
    {
        parts[0] = &prefix;
        parts.join("_")
    } else {
        format!("{prefix}_{display_name}_01")
    }
}

fn retarget_asset_name_to_type(
    project_root: &Path,
    asset: &mut Value,
    asset_type: &str,
) -> Option<(String, String)> {
    let old_name = json_string(asset, &["displayName"])?.to_string();
    let new_name = rename_asset_prefix(project_root, &old_name, asset_type);

    if new_name == old_name {
        return None;
    }

    asset["displayName"] = Value::String(new_name.clone());
    Some((old_name, new_name))
}

fn align_asset_folder_to_display_name(
    project_root: &Path,
    asset: &mut Value,
) -> Result<(), String> {
    let folder = asset_folder_rel(asset);
    let name = json_string(asset, &["displayName"])
        .unwrap_or("")
        .to_string();

    if folder.is_empty() || name.is_empty() || base_rel(&folder) == name {
        return Ok(());
    }

    let parent = parent_rel(&folder);
    let new_folder = join_rel(&parent, &name);
    let old_abs = rel_to_abs(project_root, &folder);
    let new_abs = rel_to_abs(project_root, &new_folder);

    if new_abs.exists() {
        return Err(format!("Un dossier {name} existe deja a cet emplacement."));
    }
    if old_abs.exists() {
        fs::rename(&old_abs, &new_abs)
            .map_err(|error| format!("Impossible de renommer le dossier d'asset: {error}"))?;
    }

    for key in [
        "assetFolder",
        "blenderSource",
        "referencesDir",
        "texturesDir",
    ] {
        if let Some(current) = json_string(asset, &["paths", key]) {
            let current = norm_rel(current);
            if current == folder || current.starts_with(&format!("{folder}/")) {
                let updated = current.replacen(&folder, &new_folder, 1);
                set_paths_field(asset, key, &updated);
            }
        }
    }

    if let Some(blender) = json_string(asset, &["paths", "blenderSource"]) {
        let blender = norm_rel(blender);
        let desired_blender = format!("{new_folder}/{name}.blend");
        if blender != desired_blender {
            move_file_if_exists(project_root, &blender, &desired_blender);
            set_paths_field(asset, "blenderSource", &desired_blender);
        }
    }

    for (key, extension) in [("fbxExport", "fbx"), ("unityPrefab", "prefab")] {
        if let Some(path) = json_string(asset, &["paths", key]) {
            let path = norm_rel(path);
            if !path.is_empty() {
                let new_path = join_rel(&parent_rel(&path), &format!("{name}.{extension}"));
                if new_path != path {
                    move_file_if_exists(project_root, &path, &new_path);
                    set_paths_field(asset, key, &new_path);
                }
            }
        }
    }

    Ok(())
}

// Copie recursive d'un dossier (utilisee pour dupliquer / coller un asset).
fn copy_dir_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = to.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

// Genere un nom de dossier d'asset unique dans un dossier parent (suffixe _copy, _copy2, ...).
fn unique_asset_name(parent_abs: &Path, base_name: &str) -> String {
    if !parent_abs.join(base_name).exists() {
        return base_name.to_string();
    }
    let mut index = 1;
    loop {
        let candidate = if index == 1 {
            format!("{base_name}_copy")
        } else {
            format!("{base_name}_copy{index}")
        };
        if !parent_abs.join(&candidate).exists() {
            return candidate;
        }
        index += 1;
    }
}

#[tauri::command]
fn delete_folder(
    project_root: String,
    dir: String,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let dir = norm_rel(&dir);
    if dir.is_empty() {
        return Err("Dossier invalide.".to_string());
    }

    let dir_abs = rel_to_abs(&project_root, &dir);
    if dir_abs.exists() {
        trash::delete(&dir_abs)
            .map_err(|error| format!("Impossible d'envoyer le dossier a la corbeille: {error}"))?;
    }

    // Supprime aussi les fiches asset situees sous ce dossier.
    let assets_dir = project_root.join(".blendup").join("assets");
    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            if let Ok(asset) = read_json_file(&path) {
                let folder = asset_folder_rel(&asset);
                if folder == dir || folder.starts_with(&format!("{dir}/")) {
                    let _ = trash::delete(&path);
                }
            }
        }
    }

    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "folder.deleted",
            "message": format!("Dossier {dir} supprime (corbeille)")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn rename_folder(
    project_root: String,
    dir: String,
    new_name: String,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    if !is_safe_name(&new_name) {
        return Err("Nom de dossier invalide.".to_string());
    }
    let project_root = PathBuf::from(project_root);
    let from_dir = norm_rel(&dir);
    if from_dir.is_empty() {
        return Err("Dossier invalide.".to_string());
    }
    let parent = parent_rel(&from_dir);
    let new_dir = join_rel(&parent, new_name.trim());
    if new_dir == from_dir {
        return Ok(());
    }

    let old_abs = rel_to_abs(&project_root, &from_dir);
    let new_abs = rel_to_abs(&project_root, &new_dir);
    if new_abs.exists() {
        return Err(format!("Un dossier {} existe deja.", new_name.trim()));
    }
    if old_abs.exists() {
        fs::rename(&old_abs, &new_abs)
            .map_err(|error| format!("Impossible de renommer le dossier: {error}"))?;
    }

    // Reecrit les chemins des assets sous le dossier renomme + recalcule leur type.
    let assets_dir = project_root.join(".blendup").join("assets");
    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            let mut asset = read_json_file(&path)?;
            let mut changed = false;
            for key in [
                "assetFolder",
                "blenderSource",
                "referencesDir",
                "texturesDir",
            ] {
                if let Some(current) = json_string(&asset, &["paths", key]) {
                    let current = norm_rel(current);
                    if current == from_dir || current.starts_with(&format!("{from_dir}/")) {
                        let updated = current.replacen(&from_dir, &new_dir, 1);
                        set_paths_field(&mut asset, key, &updated);
                        changed = true;
                    }
                }
            }
            if changed {
                let folder = asset_folder_rel(&asset);
                if let Some(new_type) = type_for_folder(&project_root, &parent_rel(&folder)) {
                    asset["type"] = Value::String(new_type.to_string());
                    let _ = retarget_asset_name_to_type(&project_root, &mut asset, &new_type);
                    align_asset_folder_to_display_name(&project_root, &mut asset)?;
                }
                asset["updatedAt"] = Value::String(updated_at.clone());
                write_json_file(&path, &asset)?;
            }
        }
    }

    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "folder.renamed",
            "message": format!("{from_dir} -> {new_dir}")
        }),
    )?;

    Ok(())
}

// Cree une nouvelle fiche + copie le dossier d'un asset dans `parent_dir`.
fn clone_asset_into(
    project_root: &Path,
    source: &Value,
    parent_dir: &str,
    actor: &str,
    created_at: &str,
) -> Result<String, String> {
    let old_folder = asset_folder_rel(source);
    if old_folder.is_empty() {
        return Err("Cet asset n'a pas de dossier a copier.".to_string());
    }
    let parent_dir = norm_rel(parent_dir);
    let base_name = base_rel(&old_folder);
    let parent_abs = rel_to_abs(project_root, &parent_dir);
    fs::create_dir_all(&parent_abs)
        .map_err(|error| format!("Impossible de creer {}: {error}", parent_abs.display()))?;
    let new_name = unique_asset_name(&parent_abs, &base_name);
    let new_folder = join_rel(&parent_dir, &new_name);

    let old_abs = rel_to_abs(project_root, &old_folder);
    let new_abs = rel_to_abs(project_root, &new_folder);
    if old_abs.exists() {
        copy_dir_recursive(&old_abs, &new_abs)
            .map_err(|error| format!("Impossible de copier le dossier: {error}"))?;
        // Renomme le .blend interne s'il porte l'ancien nom.
        let old_blend = new_abs.join(format!("{base_name}.blend"));
        if old_blend.exists() {
            let _ = fs::rename(&old_blend, new_abs.join(format!("{new_name}.blend")));
        }
    } else {
        fs::create_dir_all(&new_abs)
            .map_err(|error| format!("Impossible de creer {}: {error}", new_abs.display()))?;
    }

    let id = slug_id(&new_name);
    let mut asset = source.clone();
    asset["id"] = Value::String(id.clone());
    asset["displayName"] = Value::String(new_name.clone());
    asset["createdAt"] = Value::String(created_at.to_string());
    asset["updatedAt"] = Value::String(created_at.to_string());
    set_paths_field(&mut asset, "assetFolder", &new_folder);
    set_paths_field(
        &mut asset,
        "blenderSource",
        &format!("{new_folder}/{new_name}.blend"),
    );
    set_paths_field(
        &mut asset,
        "referencesDir",
        &format!("{new_folder}/references"),
    );
    set_paths_field(&mut asset, "texturesDir", &format!("{new_folder}/textures"));
    // Les sorties Unity ne sont pas dupliquees.
    if let Some(paths) = asset.get_mut("paths").and_then(Value::as_object_mut) {
        paths.remove("fbxExport");
        paths.remove("unityPrefab");
        paths.remove("thumbnail");
    }
    // Le type suit la categorie de destination.
    if let Some(new_type) = type_for_folder(project_root, &parent_dir) {
        asset["type"] = Value::String(new_type.to_string());
    }

    let asset_file = project_root
        .join(".blendup")
        .join("assets")
        .join(format!("{id}.json"));
    if asset_file.exists() {
        return Err(format!("Une fiche asset {id} existe deja."));
    }
    write_json_file(&asset_file, &asset)?;

    append_activity(
        project_root,
        json!({
            "time": created_at,
            "actor": non_empty_string(actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.created",
            "assetId": id,
            "message": format!("{new_name} copie depuis {}", base_name)
        }),
    )?;

    Ok(format!("Asset {new_name} cree."))
}

#[tauri::command]
fn duplicate_asset(
    project_root: String,
    asset_id: String,
    actor: String,
    created_at: String,
) -> Result<String, String> {
    let project_root = PathBuf::from(project_root);
    let (_, asset) = find_asset_file(&project_root, &asset_id)?;
    let parent = parent_rel(&asset_folder_rel(&asset));
    clone_asset_into(&project_root, &asset, &parent, &actor, &created_at)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn copy_asset(
    project_root: String,
    asset_id: String,
    target_dir: String,
    cut: bool,
    actor: String,
    created_at: String,
) -> Result<String, String> {
    if cut {
        // Couper/coller = deplacer (reutilise la logique de deplacement).
        move_asset(project_root, asset_id, target_dir, actor, created_at)?;
        return Ok("Asset deplace.".to_string());
    }

    let project_root = PathBuf::from(project_root);
    let (_, asset) = find_asset_file(&project_root, &asset_id)?;
    clone_asset_into(&project_root, &asset, &target_dir, &actor, &created_at)
}

#[tauri::command]
fn add_asset_files(
    project_root: String,
    asset_id: String,
    kind: String,
    sources: Vec<String>,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let key = if kind == "textures" {
        "texturesDir"
    } else {
        "referencesDir"
    };
    let dir_rel = norm_rel(json_string(&asset, &["paths", key]).unwrap_or(""));
    if dir_rel.is_empty() {
        return Err("Dossier cible introuvable pour cet asset.".to_string());
    }
    let dir_abs = rel_to_abs(&project_root, &dir_rel);
    fs::create_dir_all(&dir_abs)
        .map_err(|error| format!("Impossible de creer {}: {error}", dir_abs.display()))?;
    copy_files_into(&dir_abs, &sources);

    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.files_added",
            "assetId": asset_id,
            "message": format!("{} fichier(s) ajoute(s) ({kind})", sources.len())
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn set_asset_variants(
    project_root: String,
    asset_id: String,
    variants: Vec<Value>,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();
    let count = variants.len();

    asset["variants"] = Value::Array(variants);
    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.variants_changed",
            "assetId": asset_id,
            "message": format!("{count} variante(s) pour {display_name}")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn set_asset_lods(
    project_root: String,
    asset_id: String,
    lods: Vec<Value>,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();
    let count = lods.len();

    asset["lods"] = Value::Array(lods);
    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.lods_changed",
            "assetId": asset_id,
            "message": format!("{count} LOD(s) pour {display_name}")
        }),
    )?;

    Ok(())
}

#[tauri::command]
fn set_asset_assignees(
    project_root: String,
    asset_id: String,
    assignees: Vec<String>,
    actor: String,
    updated_at: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(project_root);
    let (asset_file, mut asset) = find_asset_file(&project_root, &asset_id)?;
    let display_name = json_string(&asset, &["displayName"])
        .unwrap_or(&asset_id)
        .to_string();

    asset["assignees"] = Value::Array(
        assignees
            .iter()
            .filter_map(|value| non_empty_string(value).map(Value::String))
            .collect(),
    );
    asset["updatedAt"] = Value::String(updated_at.clone());
    write_json_file(&asset_file, &asset)?;
    append_activity(
        &project_root,
        json!({
            "time": updated_at,
            "actor": non_empty_string(&actor).unwrap_or_else(|| "BlendUp".to_string()),
            "type": "asset.assignees_changed",
            "assetId": asset_id,
            "message": format!("Assignes mis a jour pour {display_name}")
        }),
    )?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_user_settings,
            save_user_settings,
            read_default_project_snapshot,
            read_project_snapshot,
            create_project,
            detect_blender,
            detect_local_tools,
            export_asset_to_fbx,
            read_project_file_data_url,
            open_blend_file,
            open_project_path,
            update_asset_status,
            migrate_assets_to_folders,
            rename_asset,
            move_asset,
            move_folder,
            delete_asset,
            delete_folder,
            rename_folder,
            duplicate_asset,
            copy_asset,
            set_asset_owners,
            update_asset_notes,
            create_folder,
            create_asset,
            save_asset_configuration,
            set_asset_lods,
            set_asset_variants,
            add_asset_files,
            set_asset_assignees,
            take_open_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
