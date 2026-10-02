use super::*;
use std::hash::{Hash, Hasher};
use std::sync::{Mutex, OnceLock};

const BUILD_SCRIPT: &str = include_str!("../../../blender-addon/blendup/scripts/build_library.py");
const LAYOUT_SCRIPT: &str = include_str!("../../../blender-addon/blendup/core/showcase.py");
const PLUGIN_FILES: [(&str, &str); 9] = [
    (
        "plugin.cfg",
        include_str!("../../../godot-addon/addons/blendup/plugin.cfg"),
    ),
    (
        "plugin.gd",
        include_str!("../../../godot-addon/addons/blendup/plugin.gd"),
    ),
    (
        "library.gd",
        include_str!("../../../godot-addon/addons/blendup/library.gd"),
    ),
    (
        "drag_list.gd",
        include_str!("../../../godot-addon/addons/blendup/drag_list.gd"),
    ),
    (
        "asset_definition.gd",
        include_str!("../../../godot-addon/addons/blendup/asset_definition.gd"),
    ),
    (
        "asset_instance.gd",
        include_str!("../../../godot-addon/addons/blendup/asset_instance.gd"),
    ),
    (
        "instance_catalog.gd",
        include_str!("../../../godot-addon/addons/blendup/instance_catalog.gd"),
    ),
    (
        "variant_inspector.gd",
        include_str!("../../../godot-addon/addons/blendup/variant_inspector.gd"),
    ),
    (
        "variant_property.gd",
        include_str!("../../../godot-addon/addons/blendup/variant_property.gd"),
    ),
];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowcaseConfig {
    id: String,
    folder: String,
    #[serde(default = "default_spacing")]
    spacing: f64,
}
fn default_spacing() -> f64 {
    1.5
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowcaseView {
    id: String,
    folder: String,
    spacing: f64,
    pub status: String,
    asset_count: usize,
    included_count: usize,
    godot_count: usize,
    blender_path: String,
    godot_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Integrations {
    pub blender: bool,
    pub godot: bool,
    pub library_count: usize,
    pub library_errors: Vec<Value>,
    pub library_status: String,
}

static JOBS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
fn jobs() -> &'static Mutex<HashSet<String>> {
    JOBS.get_or_init(|| Mutex::new(HashSet::new()))
}
struct JobGuard(String);
impl Drop for JobGuard {
    fn drop(&mut self) {
        jobs().lock().unwrap().remove(&self.0);
    }
}
fn claim(key: String) -> Option<JobGuard> {
    let mut active = jobs().lock().unwrap();
    if active.len() < 2 && active.insert(key.clone()) {
        Some(JobGuard(key))
    } else {
        None
    }
}
fn busy(key: &str) -> bool {
    jobs().lock().unwrap().contains(key)
}
fn key(root: &Path, id: &str) -> String {
    format!("{}:{id}", root.display())
}
fn config_path(root: &Path) -> PathBuf {
    root.join(".blendup/showcases.json")
}
fn configurations(root: &Path) -> Vec<ShowcaseConfig> {
    read_value(&config_path(root))
        .and_then(|v| serde_json::from_value::<Vec<ShowcaseConfig>>(v).ok())
        .unwrap_or_default()
        .into_iter()
        .filter(|c| {
            !c.id.is_empty()
                && c.id.len() <= 128
                && c.id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                && c.spacing.is_finite()
                && (0.1..=100.0).contains(&c.spacing)
        })
        .collect()
}
fn read_value(path: &Path) -> Option<Value> {
    fs::read(path)
        .ok()
        .and_then(|v| serde_json::from_slice(&v).ok())
}
fn integration_path(root: &Path) -> PathBuf {
    root.join(".blendup/integrations.json")
}
fn integration_config(root: &Path) -> Integrations {
    read_value(&integration_path(root))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}
pub fn ensure_idle(root: &Path) -> Result<(), String> {
    let prefix = format!("{}:", root.display());
    if jobs()
        .lock()
        .unwrap()
        .iter()
        .any(|job| job.starts_with(&prefix))
    {
        return Err("Attends la fin de la génération des Showcases ou de la bibliothèque avant de déplacer les dossiers du projet.".into());
    }
    Ok(())
}
fn stamp(path: &Path) -> String {
    fs::metadata(path)
        .map(|m| {
            format!(
                "{}:{}",
                m.len(),
                m.modified()
                    .unwrap_or(UNIX_EPOCH)
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            )
        })
        .unwrap_or_default()
}
fn digest(value: &Value) -> String {
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    value.to_string().hash(&mut hash);
    format!("{:016x}", hash.finish())
}
fn browser_folder(asset: &BlendUpAsset) -> String {
    let path = Path::new(&asset.source_path);
    if path.parent().and_then(Path::file_name) == path.file_stem() {
        path.parent()
            .and_then(Path::parent)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|| asset.folder.clone())
    } else {
        asset.folder.clone()
    }
}
fn entries(root: &Path, project: &ProjectConfig, assets: &[BlendUpAsset]) -> Vec<Value> {
    fn version(
        root: &Path,
        project: &ProjectConfig,
        id: &str,
        name: &str,
        source: &str,
        output: &str,
        status: &str,
        quality: Option<&UvQualitySummary>,
        ignored: bool,
    ) -> Value {
        let blocked = project.blender.validate_uvs
            && !ignored
            && !quality.is_some_and(|q| !q.stale && !q.blocked);
        let status = if project.engine != "none" && blocked {
            "error"
        } else {
            status
        };
        let ready =
            project.engine == "godot" && status == "exported" && root.join(output).is_file();
        let resource = if ready {
            output
                .strip_prefix(&(project.paths.engine_root.clone() + "/"))
                .map(|p| format!("res://{p}"))
        } else {
            None
        };
        serde_json::json!({"id":id,"name":name,"sourcePath":source,"outputPath":output,"status":status,"godotReady":ready,"resourcePath":resource,
            "sourceSignature":stamp(&root.join(source)),"outputSignature":stamp(&root.join(output))})
    }
    assets
        .iter()
        .map(|a| {
            let ignored = a.metadata.ignore_uv_validation;
            let mut entry = version(
                root,
                project,
                &a.id,
                &a.name,
                &a.source_path,
                &a.output_path,
                &a.status,
                a.uv_quality.as_ref(),
                ignored,
            );
            entry["folder"] = serde_json::json!(browser_folder(a));
            entry["tags"] = serde_json::json!(a.metadata.tags);
            entry["variants"] = serde_json::json!(a
                .metadata
                .variants
                .iter()
                .map(|v| {
                    version(
                        root,
                        project,
                        &v.id,
                        &v.name,
                        v.source_path.as_deref().unwrap_or(""),
                        v.output_path.as_deref().unwrap_or(""),
                        &v.status,
                        v.uv_quality.as_ref(),
                        ignored,
                    )
                })
                .collect::<Vec<_>>());
            entry
        })
        .collect()
}
fn write_changed(path: &Path, value: &Value) -> Result<(), String> {
    if read_value(path).as_ref() != Some(value) {
        write_json(path, value)?;
    }
    Ok(())
}
fn scene_dir(root: &Path, id: &str) -> PathBuf {
    root.join(".blendup/showcases").join(id)
}
fn godot_path(project: &ProjectConfig, id: &str) -> Option<String> {
    (project.engine == "godot")
        .then(|| format!("{}/BlendUp/Showcases/{id}.tscn", project.paths.engine_root))
}
fn showcase_job(
    root: &Path,
    project: &ProjectConfig,
    config: &ShowcaseConfig,
    all: &[Value],
) -> Value {
    let assets: Vec<_> = all
        .iter()
        .filter(|a| {
            a["folder"]
                .as_str()
                .is_some_and(|folder| path_is_inside(folder, &config.folder))
        })
        .cloned()
        .collect();
    let signature = digest(
        &serde_json::json!({"v": 1, "config":config, "engine":project.engine, "paths":project.paths, "assets":assets}),
    );
    serde_json::json!({"mode":"showcase", "root":root.to_string_lossy(), "projectId":project.project_id,
        "folder":config.folder, "spacing":config.spacing, "target":scene_dir(root, &config.id).join("Showcase.blend").to_string_lossy(),
        "assets":assets, "signature":signature})
}
fn run_blender(
    root: &Path,
    id: &str,
    manifest: &Value,
    blender_path: Option<&str>,
) -> Result<(), String> {
    let blender = find_blender_executable(blender_path)
        .ok_or("Blender est introuvable. Configure son chemin dans Paramètres.")?;
    let directory = root.join(".blendup/temp/library").join(id);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let script = directory.join("build_library.py");
    fs::write(&script, BUILD_SCRIPT).map_err(|e| e.to_string())?;
    fs::write(directory.join("blendup_showcase.py"), LAYOUT_SCRIPT).map_err(|e| e.to_string())?;
    let job = directory.join("job.json");
    write_json(&job, manifest)?;
    let mut command = Command::new(blender);
    command
        .args([
            "--background",
            "--factory-startup",
            "--python-exit-code",
            "1",
            "--python",
        ])
        .arg(script)
        .arg("--")
        .arg(job)
        .env("BLENDUP_BACKGROUND_TASK", "1");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let log = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        fs::write(directory.join("last-error.log"), &log).ok();
        return Err(format!(
            "La génération Blender a échoué. Détails : {}",
            directory.join("last-error.log").display()
        ));
    }
    Ok(())
}

fn generate(
    root: &Path,
    project: &ProjectConfig,
    config: &ShowcaseConfig,
    manifest: &Value,
    blender: Option<&str>,
) -> Result<(), String> {
    run_blender(root, &config.id, manifest, blender)?;
    if let Some(path) = godot_path(project, &config.id) {
        let layout = read_value(&scene_dir(root, &config.id).join("Showcase.json"))
            .ok_or("Disposition Showcase manquante.")?;
        write_godot_scene(&root.join(path), manifest, &layout)?;
    }
    write_json(
        &scene_dir(root, &config.id).join("state.json"),
        &serde_json::json!({"signature":manifest["signature"], "complete":true}),
    )?;
    Ok(())
}

pub fn snapshot(
    root: &Path,
    project: &ProjectConfig,
    assets: &[BlendUpAsset],
) -> (Vec<ShowcaseView>, Integrations) {
    let all = entries(root, project, assets);
    let index = serde_json::json!({"schemaVersion":2, "projectId":project.project_id, "name":project.name, "artRoot":project.paths.art_root, "assets":all});
    let _ = write_changed(&root.join(".blendup/library/index.json"), &index);
    let blender = read_user_settings().unwrap_or_default().blender_path;
    let mut views = Vec::new();
    for config in configurations(root)
        .into_iter()
        .filter(|c| validated_art_directory(root, project, &c.folder, true).is_ok())
    {
        let manifest = showcase_job(root, project, &config, &all);
        let directory = scene_dir(root, &config.id);
        let state = read_value(&directory.join("state.json")).unwrap_or(Value::Null);
        let layout = read_value(&directory.join("Showcase.json")).unwrap_or(Value::Null);
        let stale = state["signature"] != manifest["signature"]
            || !directory.join("Showcase.blend").is_file()
            || godot_path(project, &config.id).is_some_and(|p| !root.join(p).is_file());
        let failed = state["signature"] == manifest["signature"] && state["error"].is_string();
        let job_key = key(root, &config.id);
        if stale && !failed {
            if let Some(guard) = claim(job_key.clone()) {
                let root = root.to_path_buf();
                let project = project.clone();
                let config = config.clone();
                let manifest = manifest.clone();
                let blender = blender.clone();
                thread::spawn(move || {
                    let _guard = guard;
                    if let Err(error) =
                        generate(&root, &project, &config, &manifest, blender.as_deref())
                    {
                        let _ = write_json(
                            &scene_dir(&root, &config.id).join("state.json"),
                            &serde_json::json!({"signature":manifest["signature"], "error":error}),
                        );
                    }
                });
            }
        }
        views.push(ShowcaseView {
            id: config.id.clone(),
            folder: config.folder,
            spacing: config.spacing,
            status: if busy(&job_key) {
                "generating"
            } else if failed || layout["errors"].as_array().is_some_and(|v| !v.is_empty()) {
                "error"
            } else if stale {
                "outdated"
            } else {
                "ready"
            }
            .into(),
            asset_count: manifest["assets"].as_array().map_or(0, Vec::len),
            included_count: layout["placements"].as_array().map_or(0, Vec::len),
            godot_count: manifest["assets"].as_array().map_or(0, |v| {
                v.iter()
                    .filter(|a| {
                        a["godotReady"] == true
                            && layout["placements"]
                                .as_array()
                                .is_some_and(|p| p.iter().any(|p| p["id"] == a["id"]))
                    })
                    .count()
            }),
            blender_path: relative_string(root, &directory.join("Showcase.blend"))
                .unwrap_or_default(),
            godot_path: godot_path(project, &config.id),
            error: state["error"].as_str().map(str::to_owned).or_else(|| {
                layout["errors"]
                    .as_array()
                    .filter(|v| !v.is_empty())
                    .map(|v| {
                        v.iter()
                            .map(|e| {
                                format!(
                                    "{} : {}",
                                    e["name"].as_str().unwrap_or("Asset"),
                                    e["error"].as_str().unwrap_or("Erreur")
                                )
                            })
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
            }),
        });
    }
    let mut integrations = integration_config(root);
    if integrations.blender {
        let signature = digest(
            &serde_json::json!({"v":2,"assets":all.iter().map(|a| serde_json::json!({"id":a["id"],"source":a["sourceSignature"],"sourcePath":a["sourcePath"],"folder":a["folder"],"name":a["name"],"tags":a["tags"]})).collect::<Vec<_>>()}),
        );
        let state_path = root.join(".blendup/library/blender/status.json");
        let state = read_value(&state_path).unwrap_or(Value::Null);
        let job_key = key(root, "library");
        if state["signature"] != signature {
            if let Some(guard) = claim(job_key.clone()) {
                let root = root.to_path_buf();
                let blender = blender.clone();
                let project_id = project.project_id.clone();
                let all = all.clone();
                thread::spawn(move || {
                    let _guard = guard;
                    let job = serde_json::json!({"mode":"library","root":root.to_string_lossy(),"projectId":project_id,"assets":all,"signature":signature});
                    if let Err(error) = run_blender(&root, "library", &job, blender.as_deref()) {
                        let _ = write_json(
                            &state_path,
                            &serde_json::json!({"signature":signature,"errors":[{"name":"Bibliothèque","error":error}]}),
                        );
                    }
                });
            }
        }
        integrations.library_count = state["count"].as_u64().unwrap_or(0) as usize;
        integrations.library_errors = state["errors"].as_array().cloned().unwrap_or_default();
        integrations.library_status = if busy(&job_key) {
            "generating"
        } else if !integrations.library_errors.is_empty() {
            "error"
        } else {
            "ready"
        }
        .into();
    }
    (views, integrations)
}

#[tauri::command]
pub fn configure_showcase(
    project_root: String,
    folder: String,
    enabled: bool,
    spacing: Option<f64>,
) -> Result<String, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let directory = validated_art_directory(&root, &project, &folder, true)?;
    let folder = relative_string(&root, &directory)?;
    let gap = spacing.unwrap_or(1.5);
    if !gap.is_finite() || !(0.1..=100.0).contains(&gap) {
        return Err("L’espacement doit être compris entre 0,1 et 100 mètres.".into());
    }
    let mut configs = configurations(&root);
    if let Some(existing) = configs.iter_mut().find(|c| c.folder == folder) {
        if busy(&key(&root, &existing.id)) {
            return Err("La scène est en cours de génération.".into());
        }
        if enabled {
            existing.spacing = gap;
        } else {
            configs.retain(|c| c.folder != folder);
        }
    } else if enabled {
        configs.push(ShowcaseConfig {
            id: format!(
                "showcase-{}",
                digest(&serde_json::json!([folder, unix_time_ms().to_string()]))
            ),
            folder,
            spacing: gap,
        });
    }
    write_json(&config_path(&root), &configs)?;
    Ok(if enabled {
        "Showcase activé : les scènes vont être générées automatiquement."
    } else {
        "Showcase désactivé. Les scènes générées sont conservées."
    }
    .into())
}

#[tauri::command]
pub async fn rebuild_showcase(
    project_root: String,
    id: String,
    blender_path: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = validated_project_root(&project_root)?;
        let project = read_project_config(&root)?;
        let config = configurations(&root)
            .into_iter()
            .find(|c| c.id == id)
            .ok_or("Showcase introuvable.")?;
        let _directory = validated_art_directory(&root, &project, &config.folder, true)?;
        let _guard = claim(key(&root, &id)).ok_or("Génération déjà en cours.")?;
        let assets = scan_assets(&root, &project, &read_export_state(&root))?;
        let job = showcase_job(&root, &project, &config, &entries(&root, &project, &assets));
        let result = generate(&root, &project, &config, &job, blender_path.as_deref());
        if let Err(error) = &result {
            write_json(
                &scene_dir(&root, &id).join("state.json"),
                &serde_json::json!({"signature":job["signature"],"error":error}),
            )?;
        }
        result.map(|_| "Scènes Showcase actualisées.".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn retarget(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let mut configs = configurations(root);
    for config in &mut configs {
        if path_is_inside(&config.folder, from) {
            config.folder = format!("{to}{}", &config.folder[from.len()..]);
        }
    }
    if config_path(root).exists() {
        write_json(&config_path(root), &configs)?;
    }
    Ok(())
}

#[tauri::command]
pub fn setup_editor_integration(project_root: String, editor: String) -> Result<String, String> {
    let root = validated_project_root(&project_root)?;
    let project = read_project_config(&root)?;
    let mut config = integration_config(&root);
    match editor.as_str() {
        "blender" => {
            config.blender = true;
            if busy(&key(&root, "library")) {
                return Err("Synchronisation en cours.".into());
            }
            let _ = fs::remove_file(root.join(".blendup/library/blender/status.json"));
        }
        "godot" => {
            if project.engine != "godot" {
                return Err("Ce projet n’est pas associé à Godot.".into());
            }
            let engine = root.join(&project.paths.engine_root);
            let plugin = engine.join("addons/blendup");
            fs::create_dir_all(&plugin).map_err(|e| e.to_string())?;
            for (name, contents) in PLUGIN_FILES {
                let path = plugin.join(name);
                if path.exists() && fs::read_to_string(&path).unwrap_or_default() != contents {
                    let backup = path.with_extension(format!(
                        "{}.backup",
                        path.extension().unwrap_or_default().to_string_lossy()
                    ));
                    if !backup.exists() {
                        fs::copy(&path, backup).map_err(|e| e.to_string())?;
                    }
                }
                fs::write(path, contents).map_err(|e| e.to_string())?;
            }
            enable_godot_plugin(&engine.join("project.godot"))?;
            config.godot = true;
        }
        _ => return Err("Éditeur inconnu.".into()),
    }
    write_json(&integration_path(&root), &config)?;
    Ok(if editor == "godot" { "Panneau installé et activé. Rouvre Godot si le projet est déjà ouvert." } else { "Synchronisation lancée. Dans Blender : panneau BlendUp → Bibliothèque → Navigateur d’assets." }.into())
}

fn enable_godot_plugin(path: &Path) -> Result<(), String> {
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let plugin = "res://addons/blendup/plugin.cfg";
    if text.contains(plugin) {
        return Ok(());
    }
    let mut lines: Vec<String> = text.lines().map(str::to_owned).collect();
    if let Some(section) = lines.iter().position(|l| l.trim() == "[editor_plugins]") {
        let end = (section + 1..lines.len())
            .find(|&i| lines[i].trim().starts_with('['))
            .unwrap_or(lines.len());
        if let Some(enabled) = (section + 1..end).find(|&i| lines[i].trim().starts_with("enabled="))
        {
            if let Some(close) = lines[enabled].rfind(')') {
                let separator = if lines[enabled][..close].trim_end().ends_with('(') {
                    ""
                } else {
                    ", "
                };
                lines[enabled].insert_str(close, &format!("{separator}\"{plugin}\""));
            } else {
                return Err("La liste des extensions Godot est illisible. Active BlendUp dans Projet → Paramètres → Extensions.".into());
            }
        } else {
            lines.insert(
                section + 1,
                format!("enabled=PackedStringArray(\"{plugin}\")"),
            );
        }
    } else {
        lines.extend([
            String::new(),
            "[editor_plugins]".into(),
            format!("enabled=PackedStringArray(\"{plugin}\")"),
        ]);
    }
    fs::write(path, lines.join("\n") + "\n").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_showcase_godot(
    project_root: String,
    id: String,
    godot_path: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = validated_project_root(&project_root)?;
        let project = read_project_config(&root)?;
        configurations(&root)
            .into_iter()
            .find(|c| c.id == id)
            .ok_or("Showcase introuvable.")?;
        let path = self::godot_path(&project, &id).ok_or("Projet Godot requis.")?;
        if !root.join(&path).is_file() {
            return Err("La scène n’est pas encore générée.".into());
        }
        let engine = root.join(&project.paths.engine_root);
        let resource = format!("res://BlendUp/Showcases/{id}.tscn");
        let request = root.join(".blendup/bridge/godot-open.json");
        let request_id = unix_time_ms().to_string();
        if integration_config(&root).godot {
            write_json(
                &request,
                &serde_json::json!({"id":request_id, "scene":resource}),
            )?;
            for _ in 0..12 {
                thread::sleep(Duration::from_millis(100));
                if read_value(&root.join(".blendup/bridge/godot-open-ack.json"))
                    .is_some_and(|v| v["id"] == request_id)
                {
                    return Ok("Scène ouverte dans Godot.".into());
                }
            }
            let _ = fs::remove_file(&request);
        }
        let tools = root.join(".blendup/local-tools.json");
        let saved = read_value(&tools).and_then(|v| v["godotPath"].as_str().map(str::to_owned));
        let exe = godot_path
            .or(saved)
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .or_else(|| {
                env::var_os("GODOT_PATH")
                    .map(PathBuf::from)
                    .filter(|p| p.is_file())
            })
            .or_else(|| {
                env::var_os("PATH").and_then(|paths| {
                    env::split_paths(&paths)
                        .map(|p| p.join(if cfg!(windows) { "godot.exe" } else { "godot" }))
                        .find(|p| p.is_file())
                })
            })
            .ok_or("GODOT_REQUIRED")?;
        write_json(
            &tools,
            &serde_json::json!({"godotPath":exe.to_string_lossy()}),
        )?;
        let mut command = Command::new(exe);
        command
            .arg("--editor")
            .arg("--path")
            .arg(engine)
            .arg(resource)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        command.spawn().map_err(|e| e.to_string())?;
        Ok("Lancement de Godot…".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn write_godot_scene(path: &Path, manifest: &Value, layout: &Value) -> Result<(), String> {
    let placements = layout["placements"]
        .as_array()
        .ok_or("Disposition invalide.")?;
    let assets = manifest["assets"].as_array().ok_or("Assets manquants.")?;
    let included: Vec<_> = placements
        .iter()
        .filter_map(|p| {
            assets
                .iter()
                .find(|a| a["id"] == p["id"] && a["godotReady"] == true)
                .map(|a| (a, p))
        })
        .collect();
    let x = layout["floor"][0].as_f64().unwrap_or(4.0);
    let z = layout["floor"][1].as_f64().unwrap_or(4.0);
    let distance = x.max(z).max(4.0);
    let mut text = format!("; Generated by BlendUp. Rebuilt automatically; copy this scene before editing.\n[gd_scene load_steps={} format=3]\n\n", included.len() + 4);
    for (i, (a, _)) in included.iter().enumerate() {
        text += &format!(
            "[ext_resource type=\"PackedScene\" path={} id=\"Asset_{i}\"]\n",
            a["resourcePath"]
        );
    }
    text += &format!("\n[sub_resource type=\"StandardMaterial3D\" id=\"FloorMaterial\"]\nalbedo_color = Color(0.24, 0.27, 0.3, 1)\n\n[sub_resource type=\"PlaneMesh\" id=\"FloorMesh\"]\nmaterial = SubResource(\"FloorMaterial\")\nsize = Vector2({x}, {z})\n\n[sub_resource type=\"Environment\" id=\"Environment\"]\nbackground_mode = 1\nbackground_color = Color(0.18, 0.2, 0.24, 1)\nambient_light_source = 3\nambient_light_color = Color(1, 1, 1, 1)\nambient_light_energy = 0.5\n\n[node name=\"Showcase\" type=\"Node3D\"]\n\n[node name=\"Sol\" type=\"MeshInstance3D\" parent=\".\"]\nmesh = SubResource(\"FloorMesh\")\n\n[node name=\"WorldEnvironment\" type=\"WorldEnvironment\" parent=\".\"]\nenvironment = SubResource(\"Environment\")\n\n[node name=\"Sun\" type=\"DirectionalLight3D\" parent=\".\"]\nrotation_degrees = Vector3(-45, -30, 0)\nlight_energy = 1.5\nshadow_enabled = true\n\n[node name=\"Camera\" type=\"Camera3D\" parent=\".\"]\nposition = Vector3({distance}, {distance}, {distance})\nrotation_degrees = Vector3(-35.26439, 45, 0)\nprojection = 1\nsize = {}\nfar = {}\ncurrent = true\n", distance * 1.8, (distance * 10.0).max(4000.0));
    for (i, (a, p)) in included.iter().enumerate() {
        let off = &p["offset"];
        let name = a["name"]
            .as_str()
            .unwrap_or("Asset")
            .replace(['/', ':', '@', '"', '\n', '\r', '%'], "_");
        text += &format!("\n[node name={} parent=\".\" instance=ExtResource(\"Asset_{i}\")]\nposition = Vector3({}, {}, {})\n", serde_json::to_string(&format!("{name}_{i}")).unwrap(), off[0], off[2], -off[1].as_f64().unwrap_or(0.0));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temporary = path.with_extension("tscn.tmp");
    fs::write(&temporary, text).map_err(|e| e.to_string())?;
    fs::rename(temporary, path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn library_index_publishes_variants_with_independent_readiness_and_uv_exemption() {
        let root = super::super::tests::test_root("library_variants");
        let project_root = root.to_string_lossy().to_string();
        create_project(CreateProjectOptions {
            project_root: project_root.clone(),
            project_name: "Variants".into(),
            engine: "godot".into(),
        })
        .unwrap();
        fs::create_dir_all(root.join("Art/Table")).unwrap();
        fs::write(root.join("Art/Table/Table.blend"), b"source").unwrap();
        let project = read_project_config(&root).unwrap();
        let asset = scan_assets(&root, &project, &ExportState::default())
            .unwrap()
            .remove(0);
        create_asset_variant(project_root.clone(), asset.id.clone(), "Rouge".into()).unwrap();
        create_asset_variant(
            project_root.clone(),
            asset.id.clone(),
            "Pas exportée".into(),
        )
        .unwrap();
        let assets = scan_assets(&root, &project, &ExportState::default()).unwrap();
        let variant = &assets[0].metadata.variants[0];
        for path in [&asset.output_path, variant.output_path.as_ref().unwrap()] {
            fs::create_dir_all(root.join(path).parent().unwrap()).unwrap();
            fs::write(root.join(path), b"glb").unwrap();
        }
        let assets = scan_assets(&root, &project, &ExportState::default()).unwrap();
        let index = entries(&root, &project, &assets).remove(0);
        assert_eq!(index["variants"][0]["id"], variant.id);
        assert_eq!(index["variants"][0]["name"], "Rouge");
        assert_eq!(index["variants"][0]["godotReady"], true);
        assert_ne!(index["resourcePath"], index["variants"][0]["resourcePath"]);
        assert_eq!(index["variants"][1]["godotReady"], false);
        let mut settings = project.blender.clone();
        settings.validate_uvs = true;
        let project = update_project_blender_settings(project_root.clone(), settings).unwrap();
        let assets = scan_assets(&root, &project, &ExportState::default()).unwrap();
        let index = entries(&root, &project, &assets).remove(0);
        assert_eq!(index["godotReady"], false);
        assert_eq!(index["variants"][0]["godotReady"], false);
        set_asset_uv_ignored(project_root, asset.id, true).unwrap();
        let assets = scan_assets(&root, &project, &ExportState::default()).unwrap();
        let index = entries(&root, &project, &assets).remove(0);
        assert_eq!(index["godotReady"], true);
        assert_eq!(index["variants"][0]["godotReady"], true);
        assert_eq!(index["variants"][1]["godotReady"], false);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn showcase_selection_is_recursive_without_including_sibling_prefixes() {
        let root = super::super::tests::test_root("showcase_selection");
        let project = new_project_config("Test", "godot");
        let config = ShowcaseConfig {
            id: "showcase-test".into(),
            folder: "Art/Props".into(),
            spacing: 1.5,
        };
        let all = vec![
            serde_json::json!({"folder":"Art/Props","id":"a"}),
            serde_json::json!({"folder":"Art/Props/Sub","id":"b"}),
            serde_json::json!({"folder":"Art/Props2","id":"c"}),
        ];
        let job = showcase_job(&root, &project, &config, &all);
        assert_eq!(job["assets"].as_array().unwrap().len(), 2);
        let mut changed = config.clone();
        changed.spacing = 3.0;
        assert_ne!(
            job["signature"],
            showcase_job(&root, &project, &changed, &all)["signature"]
        );
    }

    #[test]
    fn showcase_options_follow_folder_and_source_root_renames() {
        let root = super::super::tests::test_root("showcase_options");
        create_project(CreateProjectOptions {
            project_root: root.to_string_lossy().into(),
            project_name: "Test".into(),
            engine: "none".into(),
        })
        .unwrap();
        fs::create_dir_all(root.join("Art/Props/Sub")).unwrap();
        let project_root = root.to_string_lossy().to_string();
        configure_showcase(
            project_root.clone(),
            "Art/Props/Sub".into(),
            true,
            Some(2.0),
        )
        .unwrap();
        assert!(configure_showcase(project_root.clone(), "Art".into(), true, Some(-1.0)).is_err());
        assert!(configure_showcase(project_root.clone(), "../Outside".into(), true, None).is_err());
        let id = configurations(&root)[0].id.clone();
        rename_folder(project_root.clone(), "Art/Props".into(), "Items".into()).unwrap();
        assert_eq!(configurations(&root)[0].folder, "Art/Items/Sub");
        update_project_paths(
            project_root.clone(),
            ProjectPaths {
                art_root: "Sources".into(),
                engine_root: String::new(),
                engine_assets_root: String::new(),
            },
        )
        .unwrap();
        assert_eq!(configurations(&root)[0].folder, "Sources/Items/Sub");
        assert_eq!(configurations(&root)[0].id, id);
        configure_showcase(project_root, "Sources/Items/Sub".into(), false, None).unwrap();
        assert!(configurations(&root).is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn godot_scenes_reference_only_available_exports_and_convert_axes() {
        let root = super::super::tests::test_root("showcase_godot");
        let path = root.join("Showcase.tscn");
        let manifest = serde_json::json!({"assets":[{"id":"ok","name":"Porche_é","godotReady":true,"resourcePath":"res://Assets/Dossier é/Porche.glb"},{"id":"bad","name":"UV blocked","godotReady":false,"resourcePath":null}]});
        let layout = serde_json::json!({"floor":[8,12],"placements":[{"id":"ok","offset":[2,3,-4]},{"id":"bad","offset":[5,0,0]}]});
        write_godot_scene(&path, &manifest, &layout).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("Dossier é/Porche.glb"));
        assert!(text.contains("position = Vector3(2, -4, -3)"));
        assert!(!text.contains("UV blocked"));
        assert!(text.contains("size = Vector2(8, 12)"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn godot_plugin_installation_preserves_other_enabled_plugins() {
        let root = super::super::tests::test_root("showcase_plugin");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("project.godot");
        fs::write(&path, "config_version=5\n[editor_plugins]\nenabled=PackedStringArray(\"res://addons/other/plugin.cfg\")\n[rendering]\nrenderer/rendering_method=\"gl_compatibility\"\n").unwrap();
        enable_godot_plugin(&path).unwrap();
        enable_godot_plugin(&path).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("other/plugin.cfg\", \"res://addons/blendup/plugin.cfg"));
        assert_eq!(text.matches("res://addons/blendup/plugin.cfg").count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "Requires BLENDUP_TEST_BLENDER; optional BLENDUP_TEST_GODOT and BLENDUP_SHOWCASE_FIXTURE"]
    fn showcases_and_library_work_in_real_editors() {
        let blender = env::var("BLENDUP_TEST_BLENDER").expect("BLENDUP_TEST_BLENDER");
        let retain = env::var("BLENDUP_SHOWCASE_FIXTURE").ok();
        let root = retain
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| super::super::tests::test_root("showcase_real"));
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let output = Command::new(&blender)
            .args([
                "--background",
                "--factory-startup",
                "--python-exit-code",
                "1",
                "--python",
            ])
            .arg(repo.join("apps/blender-addon/tests/showcase_smoke.py"))
            .arg("--")
            .arg(repo.join("apps/blender-addon"))
            .arg(&root)
            .env("BLENDUP_BACKGROUND_TASK", "1")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let project = read_project_config(&root).unwrap();
        let assets = scan_assets(&root, &project, &read_export_state(&root)).unwrap();
        assert_eq!(assets.len(), 2);
        let config = ShowcaseConfig {
            id: "showcase-test".into(),
            folder: "Art/Props".into(),
            spacing: 2.0,
        };
        write_json(&config_path(&root), &vec![config.clone()]).unwrap();
        let job = showcase_job(&root, &project, &config, &entries(&root, &project, &assets));
        assert!(
            job["assets"]
                .as_array()
                .unwrap()
                .iter()
                .all(|a| a["godotReady"] == true),
            "{job}"
        );
        generate(&root, &project, &config, &job, Some(&blender)).unwrap();
        setup_editor_integration(root.to_string_lossy().into(), "godot".into()).unwrap();
        let (scenes, _) = snapshot(&root, &project, &assets);
        assert_eq!(scenes[0].status, "ready");
        assert_eq!(scenes[0].godot_count, 2);
        if let Ok(godot) = env::var("BLENDUP_TEST_GODOT") {
            let scene = "res://BlendUp/Showcases/showcase-test.tscn";
            let probe = repo.join("apps/godot-addon/tests/smoke.gd");
            fs::copy(probe, root.join("Godot/smoke.gd")).unwrap();
            let import = Command::new(&godot)
                .args(["--headless", "--editor", "--import", "--quit", "--path"])
                .arg(root.join("Godot"))
                .output()
                .unwrap();
            assert!(import.status.success());
            let log = format!(
                "{}\n{}",
                String::from_utf8_lossy(&import.stdout),
                String::from_utf8_lossy(&import.stderr)
            );
            assert!(!log.contains("SCRIPT ERROR"), "{log}");
            let output = Command::new(&godot)
                .args(["--headless", "--path"])
                .arg(root.join("Godot"))
                .args(["--script", "res://smoke.gd", "--", scene])
                .output()
                .unwrap();
            let log = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            assert!(
                output.status.success()
                    && log.contains("BLENDUP_GODOT_SMOKE_OK")
                    && !log.contains("SCRIPT ERROR"),
                "{log}"
            );
            fs::copy(
                repo.join("apps/godot-addon/tests/variants_smoke.gd"),
                root.join("Godot/variants_smoke.gd"),
            )
            .unwrap();
            let output = Command::new(&godot)
                .args(["--headless", "--path"])
                .arg(root.join("Godot"))
                .args(["--quit-after", "600", "--script", "res://variants_smoke.gd"])
                .output()
                .unwrap();
            let log = command_log(&output.stdout, &output.stderr);
            assert!(
                output.status.success()
                    && log.contains("BLENDUP_GODOT_VARIANTS_SMOKE_OK")
                    && !log.contains("SCRIPT ERROR"),
                "{log}"
            );
            let probe_dir = root.join("Godot/addons/blendup_probe");
            fs::create_dir_all(&probe_dir).unwrap();
            fs::copy(
                repo.join("apps/godot-addon/tests/editor_smoke.gd"),
                probe_dir.join("probe.gd"),
            )
            .unwrap();
            fs::write(probe_dir.join("plugin.cfg"), "[plugin]\nname=\"BlendUp Probe\"\ndescription=\"Isolated editor test\"\nauthor=\"BlendUp\"\nversion=\"1\"\nscript=\"probe.gd\"\n").unwrap();
            let config_path = root.join("Godot/project.godot");
            let text = fs::read_to_string(&config_path).unwrap().replace("enabled=PackedStringArray(\"res://addons/blendup/plugin.cfg\")", "enabled=PackedStringArray(\"res://addons/blendup/plugin.cfg\", \"res://addons/blendup_probe/plugin.cfg\")");
            fs::write(config_path, text).unwrap();
            let output = Command::new(&godot)
                .args(["--headless", "--editor", "--quit-after", "240", "--path"])
                .arg(root.join("Godot"))
                .output()
                .unwrap();
            let log = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            assert!(
                output.status.success()
                    && log.contains("BLENDUP_GODOT_EDITOR_SMOKE_OK")
                    && !log.contains("SCRIPT ERROR"),
                "{log}"
            );
        }
        if retain.is_none() {
            fs::remove_dir_all(root).unwrap();
        }
    }
}
