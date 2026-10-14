//! Headless addon maintenance used by the standalone Windows update executable.
use super::*;

const BLENDER_INSTALL_SCRIPT: &str = include_str!("../../../../scripts/update_blender_addon.py");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateRequest {
    blender_path: Option<String>,
    blender_archive: PathBuf,
    #[serde(default)]
    project_roots: Vec<PathBuf>,
    backup_root: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ComponentResult {
    component: String,
    path: String,
    status: String,
    message: String,
}

fn result(component: &str, path: &Path, update: Result<String, String>) -> ComponentResult {
    let (status, message) = match update {
        Ok(message) => ("updated", message),
        Err(message) => ("failed", message),
    };
    ComponentResult {
        component: component.into(),
        path: path.to_string_lossy().into_owned(),
        status: status.into(),
        message,
    }
}

fn update_blender(executable: &str, archive: &Path, backup: &Path) -> Result<String, String> {
    if !Path::new(executable).is_file() || !archive.is_file() {
        return Err("Blender ou l'archive de son addon est introuvable.".into());
    }
    fs::create_dir_all(backup).map_err(|e| e.to_string())?;
    let script = backup.join("install_addon.py");
    fs::write(&script, BLENDER_INSTALL_SCRIPT).map_err(|e| e.to_string())?;
    let log = backup.join("blender.log");
    let output = fs::File::create(&log).map_err(|e| e.to_string())?;
    let errors = output.try_clone().map_err(|e| e.to_string())?;
    let mut command = Command::new(executable);
    command
        .args(["--background", "--python-exit-code", "1", "--python"])
        .arg(&script)
        .arg("--")
        .arg(archive)
        .arg(backup.join("profile"))
        .env("BLENDUP_BACKGROUND_TASK", "1")
        .stdout(Stdio::from(output))
        .stderr(Stdio::from(errors));
    apply_command_window_preference(&mut command, false);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let started = std::time::Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            let text = fs::read_to_string(&log).unwrap_or_default();
            if status.success() && text.contains("BLENDUP_UPDATE_ADDON_OK") {
                return Ok("Addon Blender mis à jour ; préférences conservées.".into());
            }
            return Err(format!(
                "La mise à jour de l'addon Blender a échoué. Journal : {}",
                log.display()
            ));
        }
        if started.elapsed() > Duration::from_secs(180) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "Blender n'a pas terminé la mise à jour. Journal : {}",
                log.display()
            ));
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn update_godot(root: &Path, backup: &Path) -> Result<String, String> {
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let project = read_project_config(&root)?;
    if project.engine != "godot" {
        return Err("Ce projet n'est pas associé à Godot.".into());
    }
    let engine = fs::canonicalize(root.join(safe_relative_path(&project.paths.engine_root)?))
        .map_err(|e| e.to_string())?;
    if !engine.starts_with(&root) {
        return Err("Le dossier Godot doit rester dans le projet BlendUp.".into());
    }
    let addon = fs::canonicalize(engine.join("addons/blendup"))
        .map_err(|_| "L'addon BlendUp n'est pas installé dans ce projet Godot.".to_string())?;
    if !addon.starts_with(&engine) {
        return Err("Le dossier de l'addon sort du projet Godot.".into());
    }
    if !engine.join("project.godot").is_file() {
        return Err("project.godot est introuvable.".into());
    }
    fs::create_dir_all(backup).map_err(|e| e.to_string())?;
    // Never change project.godot: keep plugin enablement and other addons intact.
    let mut previous = Vec::new();
    for (name, _) in showcases::PLUGIN_FILES {
        let path = addon.join(name);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if !metadata.is_file() => {
                return Err(format!(
                    "Le fichier de l'addon doit être un fichier ordinaire : {name}"
                ))
            }
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                return Err(error.to_string())
            }
            _ => {}
        }
        let data = if path.is_file() {
            let data = fs::read(&path).map_err(|e| e.to_string())?;
            fs::write(backup.join(name), &data).map_err(|e| e.to_string())?;
            Some(data)
        } else {
            None
        };
        previous.push((path, data));
    }
    for (name, contents) in showcases::PLUGIN_FILES {
        let path = addon.join(name);
        if let Err(error) = fs::write(&path, contents) {
            // Restore all files changed in this project before reporting failure.
            for (path, data) in &previous {
                if let Some(data) = data {
                    let _ = fs::write(path, data);
                } else if path.is_file() {
                    let _ = fs::remove_file(path);
                }
            }
            return Err(format!("Mise à jour Godot impossible : {error}"));
        }
    }
    Ok("Addon Godot mis à jour ; activation et autres addons conservés.".into())
}

fn run(request: UpdateRequest) -> Result<Vec<ComponentResult>, String> {
    // A fresh directory makes repeated updates retain their own rollback copies.
    fs::create_dir(&request.backup_root)
        .map_err(|e| format!("Le dossier de sauvegarde doit être nouveau : {e}"))?;
    let mut results = Vec::new();
    if let Some(executable) = request.blender_path {
        results.push(result(
            "blender",
            Path::new(&executable),
            update_blender(
                &executable,
                &request.blender_archive,
                &request.backup_root.join("blender"),
            ),
        ));
    }
    let mut seen = HashSet::new();
    for (index, root) in request.project_roots.iter().enumerate() {
        let normalized = fs::canonicalize(root).unwrap_or_else(|_| root.clone());
        if seen.insert(normalized) {
            results.push(result(
                "godot",
                root,
                update_godot(root, &request.backup_root.join(format!("godot-{index}"))),
            ));
        }
    }
    Ok(results)
}

pub fn handle_cli() -> Option<i32> {
    let args: Vec<_> = env::args_os().collect();
    if args.get(1).and_then(|arg| arg.to_str()) != Some("--update-addons") {
        return None;
    }
    let Some(report_path) = args.get(3) else {
        return Some(2);
    };
    let outcome = args
        .get(2)
        .ok_or("Le fichier de demande est manquant.".to_string())
        .and_then(|path| fs::read(path).map_err(|e| e.to_string()))
        .and_then(|data| serde_json::from_slice::<UpdateRequest>(&data).map_err(|e| e.to_string()))
        .and_then(run);
    let (success, report) = match outcome {
        Ok(results) => {
            let success = results.iter().all(|item| item.status == "updated");
            (
                success,
                serde_json::json!({"success": success, "version": env!("CARGO_PKG_VERSION"), "components": results}),
            )
        }
        Err(error) => (false, serde_json::json!({"success": false, "error": error})),
    };
    if write_json(Path::new(report_path), &report).is_err() {
        return Some(2);
    }
    Some(if success { 0 } else { 1 })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(name: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "blendup_{name}_{}_{}",
            std::process::id(),
            unix_time_ms()
        ))
    }

    #[test]
    fn godot_update_preserves_enablement_unmanaged_files_and_a_backup() {
        let root = test_root("updater_godot");
        let engine = root.join("Godot");
        let addon = engine.join("addons/blendup");
        fs::create_dir_all(&addon).unwrap();
        write_json(&project_file(&root), &new_project_config("Test", "godot")).unwrap();
        let config = "config_version=5\n[editor_plugins]\nenabled=PackedStringArray(\"res://addons/other/plugin.cfg\")\n";
        fs::write(engine.join("project.godot"), config).unwrap();
        fs::write(addon.join("plugin.gd"), "old plugin").unwrap();
        fs::write(addon.join("custom.txt"), "keep me").unwrap();
        let backup = root.join("backup");
        update_godot(&root, &backup).unwrap();
        assert_eq!(
            fs::read_to_string(engine.join("project.godot")).unwrap(),
            config
        );
        assert_eq!(
            fs::read_to_string(addon.join("custom.txt")).unwrap(),
            "keep me"
        );
        assert_eq!(
            fs::read_to_string(backup.join("plugin.gd")).unwrap(),
            "old plugin"
        );
        assert_eq!(
            fs::read_to_string(addon.join("plugin.gd")).unwrap(),
            showcases::PLUGIN_FILES
                .iter()
                .find(|(name, _)| *name == "plugin.gd")
                .unwrap()
                .1
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_reports_missing_targets_and_refuses_to_overwrite_backups() {
        let root = test_root("updater_missing");
        fs::create_dir_all(&root).unwrap();
        let backup = root.join("backup");
        let results = run(UpdateRequest {
            blender_path: Some("missing-blender.exe".into()),
            blender_archive: root.join("addon.zip"),
            project_roots: vec![root.join("missing")],
            backup_root: backup.clone(),
        })
        .unwrap();
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|item| item.status == "failed"));
        assert!(run(UpdateRequest {
            blender_path: None,
            blender_archive: root.join("addon.zip"),
            project_roots: vec![],
            backup_root: backup
        })
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
