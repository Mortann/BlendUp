use super::*;

// A rename is planned before touching any files. Every move and overwritten
// metadata file is tracked so a failure can restore the original project.
pub(super) fn update(project_root: &str, paths: ProjectPaths) -> Result<ProjectConfig, String> {
    let root = validated_project_root(project_root)?;
    showcases::ensure_idle(&root)?;
    let old = read_project_config(&root)?;
    let mut next = old.clone();
    next.paths = ProjectPaths {
        art_root: normalize_relative_string(paths.art_root.trim()),
        engine_root: if old.engine == "none" {
            String::new()
        } else {
            normalize_relative_string(paths.engine_root.trim())
        },
        engine_assets_root: if old.engine == "none" {
            String::new()
        } else {
            normalize_relative_string(paths.engine_assets_root.trim())
        },
    };
    validate(&next)?;
    validate(&old)?;
    for relative in [
        &next.paths.art_root,
        &next.paths.engine_root,
        &next.paths.engine_assets_root,
        ".blendup/assets",
        ".blendup/temp",
        ".blendup/uv-reports",
    ]
    .into_iter()
    .filter(|path| !path.is_empty())
    {
        confined(&root, relative)?;
    }
    let art_changed = old.paths.art_root != next.paths.art_root;
    let engine_changed = old.paths.engine_root != next.paths.engine_root;
    let exports_changed = old.paths.engine_assets_root != next.paths.engine_assets_root;
    if !art_changed && !engine_changed && !exports_changed {
        return Ok(next);
    }
    if old.engine != "none" {
        for (target, other) in [
            (&next.paths.art_root, &old.paths.engine_root),
            (&next.paths.engine_root, &old.paths.art_root),
        ] {
            if overlaps(target, other) {
                return Err("Les nouveaux dossiers sources et moteur ne peuvent pas remplacer ou contenir l'autre dossier actuel.".into());
            }
        }
    }
    let mut moves = Vec::new();
    plan_move(&root, &old.paths.art_root, &next.paths.art_root, &mut moves)?;
    if old.engine != "none" {
        plan_move(
            &root,
            &old.paths.engine_root,
            &next.paths.engine_root,
            &mut moves,
        )?;
        let moved_exports = replace_path_prefix(
            &old.paths.engine_assets_root,
            &old.paths.engine_root,
            &next.paths.engine_root,
        );
        if moved_exports != next.paths.engine_assets_root {
            let actual_destination = replace_path_prefix(
                &next.paths.engine_assets_root,
                &next.paths.engine_root,
                &old.paths.engine_root,
            );
            let original = confined(&root, &old.paths.engine_assets_root)?;
            let destination = confined(&root, &actual_destination)?;
            if destination.exists() {
                return Err(format!(
                    "{} existe déjà. Choisis un autre nom de dossier d'exports.",
                    destination.display()
                ));
            }
            if original.is_dir() {
                let stage = confined(
                    &root,
                    &format!(
                        ".blendup/temp/path-move_{}_{}",
                        std::process::id(),
                        unix_time_ms()
                    ),
                )?;
                if stage.exists() {
                    return Err("Un déplacement de dossiers est déjà en cours.".into());
                }
                moves.push((root.join(&moved_exports), stage.clone()));
                moves.push((stage, root.join(&next.paths.engine_assets_root)));
                // Unity folder GUIDs live beside the directory, not inside it.
                let old_meta = confined(&root, &format!("{}.meta", old.paths.engine_assets_root))?;
                if old_meta.is_file() {
                    let actual_meta = confined(&root, &format!("{actual_destination}.meta"))?;
                    if actual_meta.exists() {
                        return Err(
                            "Le dossier de destination possède déjà des métadonnées Unity.".into(),
                        );
                    }
                    moves.push((
                        root.join(format!("{moved_exports}.meta")),
                        root.join(format!("{}.meta", next.paths.engine_assets_root)),
                    ));
                }
            }
        }
    }
    // Preserve reports too; their source fingerprint is unchanged by a rename.
    if art_changed {
        plan_move(
            &root,
            &format!(".blendup/uv-reports/{}", old.paths.art_root),
            &format!(".blendup/uv-reports/{}", next.paths.art_root),
            &mut moves,
        )?;
    }
    let assets = scan_assets(&root, &old, &read_export_state(&root))?;
    let mut metadatas: Vec<_> = assets
        .iter()
        .map(|asset| metadata_for_asset(&root, asset))
        .collect();
    for metadata in &mut metadatas {
        metadata.source_path = replace_path_prefix(
            &metadata.source_path,
            &old.paths.art_root,
            &next.paths.art_root,
        );
        for path in metadata
            .details
            .variants
            .iter_mut()
            .map(|v| &mut v.source_path)
            .chain(metadata.details.lods.iter_mut().map(|v| &mut v.source_path))
            .chain(std::iter::once(&mut metadata.details.thumbnail_path))
        {
            if let Some(path) = path {
                *path = replace_path_prefix(path, &old.paths.art_root, &next.paths.art_root);
            }
        }
        let output = output_path_for_source(&root, &next, &root.join(&metadata.source_path))?;
        refresh_version_output_paths(
            &relative_string(&root, &output)?,
            project_output_format(&next),
            &mut metadata.details,
        );
        for version in &mut metadata.details.variants {
            version.uv_quality = None;
        }
        for version in &mut metadata.details.lods {
            version.uv_quality = None;
        }
    }
    let mut state = read_export_state(&root);
    for record in state.exports.values_mut() {
        if old.engine != "none" {
            record.output_path = replace_path_prefix(
                &record.output_path,
                &old.paths.engine_assets_root,
                &next.paths.engine_assets_root,
            );
        }
    }
    let mut completed = Vec::new();
    let mut created = Vec::new();
    let mut originals: Vec<(PathBuf, Option<Vec<u8>>)> = Vec::new();
    let result = (|| {
        for (source, destination) in &moves {
            if let Some(parent) = destination.parent() {
                create_directories(parent, &root, &mut created)?;
            }
            fs::rename(source, destination).map_err(|error| {
                format!("Impossible de renommer {} : {error}", source.display())
            })?;
            completed.push((source.clone(), destination.clone()));
        }
        create_directories(&root.join(&next.paths.art_root), &root, &mut created)?;
        if next.engine != "none" {
            create_directories(
                &root.join(&next.paths.engine_assets_root),
                &root,
                &mut created,
            )?;
        }
        for metadata in &metadatas {
            save(
                &asset_metadata_file(&root, &metadata.id),
                &serde_json::to_vec_pretty(metadata).map_err(|e| e.to_string())?,
                &mut originals,
            )?;
        }
        if next.engine != "none" {
            save(
                &export_state_file(&root),
                &serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?,
                &mut originals,
            )?;
        }
        if art_changed {
            let path = root.join(".blendup/showcases.json");
            if path.is_file() {
                let mut value: Value =
                    serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                if let Some(configs) = value.as_array_mut() {
                    for config in configs {
                        if let Some(folder) = config["folder"].as_str() {
                            config["folder"] = Value::String(replace_path_prefix(
                                folder,
                                &old.paths.art_root,
                                &next.paths.art_root,
                            ));
                        }
                    }
                }
                save(
                    &path,
                    &serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?,
                    &mut originals,
                )?;
            }
            let directory = root.join(".blendup/uv-reports").join(&next.paths.art_root);
            let mut files = Vec::new();
            collect_files(&directory, &mut files)?;
            for file in files {
                if file
                    .extension()
                    .is_some_and(|extension| extension == "json")
                {
                    if let Ok(mut value) = fs::read(&file).and_then(|bytes| {
                        serde_json::from_slice::<Value>(&bytes).map_err(std::io::Error::other)
                    }) {
                        if let Some(source) = value.get("sourcePath").and_then(Value::as_str) {
                            value["sourcePath"] = Value::String(replace_path_prefix(
                                source,
                                &old.paths.art_root,
                                &next.paths.art_root,
                            ));
                            save(
                                &file,
                                &serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?,
                                &mut originals,
                            )?;
                        }
                    }
                }
            }
        }
        if next.engine == "godot" && exports_changed {
            let old_relative = Path::new(&old.paths.engine_assets_root)
                .strip_prefix(&old.paths.engine_root)
                .map_err(|e| e.to_string())?;
            let new_relative = Path::new(&next.paths.engine_assets_root)
                .strip_prefix(&next.paths.engine_root)
                .map_err(|e| e.to_string())?;
            let old_resource = format!("res://{}/", normalize_path(old_relative));
            let new_resource = format!("res://{}/", normalize_path(new_relative));
            let mut files = Vec::new();
            collect_files(&root.join(&next.paths.engine_root), &mut files)?;
            for file in files {
                if file.extension().and_then(|e| e.to_str()).is_some_and(|e| {
                    [
                        "tscn",
                        "tres",
                        "gd",
                        "godot",
                        "cfg",
                        "gdshader",
                        "gdextension",
                        "import",
                    ]
                    .contains(&e)
                }) {
                    if let Ok(content) = fs::read_to_string(&file) {
                        if content.contains(&old_resource) {
                            save(
                                &file,
                                content.replace(&old_resource, &new_resource).as_bytes(),
                                &mut originals,
                            )?;
                        }
                    }
                }
            }
        }
        save(
            &project_file(&root),
            &serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?,
            &mut originals,
        )?;
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        let mut rollback_errors = Vec::new();
        for (file, content) in originals.into_iter().rev() {
            let restored = if let Some(content) = content {
                if fs::read(&file).ok().as_ref() == Some(&content) {
                    Ok(())
                } else {
                    fs::write(file, content)
                }
            } else if file.exists() {
                fs::remove_file(file)
            } else {
                Ok(())
            };
            if let Err(error) = restored {
                rollback_errors.push(error.to_string());
            }
        }
        for (source, destination) in completed.into_iter().rev() {
            // A nested exports destination may have recreated its old parent.
            if source.exists() && created.contains(&source) {
                let _ = fs::remove_dir(&source);
            }
            if let Err(error) = fs::rename(&destination, &source) {
                rollback_errors.push(error.to_string());
            }
        }
        for directory in created.into_iter().rev() {
            let _ = fs::remove_dir(directory);
        }
        return Err(if rollback_errors.is_empty() {
            error
        } else {
            format!(
                "{error} Restauration incomplète : {}",
                rollback_errors.join(" ; ")
            )
        });
    }
    Ok(next)
}

fn validate(project: &ProjectConfig) -> Result<(), String> {
    validate_project_paths(project)?;
    for relative in [
        &project.paths.art_root,
        &project.paths.engine_root,
        &project.paths.engine_assets_root,
    ]
    .into_iter()
    .filter(|path| !path.is_empty())
    {
        let path = safe_relative_path(relative)?;
        if path.as_os_str().is_empty() || path_is_inside(&relative.to_lowercase(), ".blendup") {
            return Err("Choisis un dossier du projet, en dehors de .blendup.".into());
        }
        for component in path.components() {
            if let Component::Normal(name) = component {
                validate_item_name(&name.to_string_lossy())?;
            }
        }
    }
    if project.engine != "none" {
        if overlaps(&project.paths.art_root, &project.paths.engine_root) {
            return Err(
                "Les sources et le projet moteur doivent être dans des dossiers séparés.".into(),
            );
        }
        if project.paths.engine_assets_root == project.paths.engine_root
            || !path_is_inside(
                &project.paths.engine_assets_root,
                &project.paths.engine_root,
            )
        {
            return Err("Les exports doivent être dans un sous-dossier du projet moteur.".into());
        }
        if project.engine == "unity"
            && !path_is_inside(
                &project.paths.engine_assets_root,
                &format!("{}/Assets", project.paths.engine_root),
            )
        {
            return Err("Unity nécessite des exports dans son dossier Assets, ou dans un sous-dossier de Assets.".into());
        }
    }
    Ok(())
}

fn overlaps(first: &str, second: &str) -> bool {
    if cfg!(target_os = "windows") {
        return path_is_inside(&first.to_lowercase(), &second.to_lowercase())
            || path_is_inside(&second.to_lowercase(), &first.to_lowercase());
    }
    path_is_inside(first, second) || path_is_inside(second, first)
}

fn confined(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let target = root.join(safe_relative_path(relative)?);
    let mut ancestor = target.as_path();
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or("Chemin invalide")?;
    }
    if !fs::canonicalize(ancestor)
        .map_err(|e| e.to_string())?
        .starts_with(fs::canonicalize(root).map_err(|e| e.to_string())?)
    {
        return Err("Le dossier doit rester à l'intérieur du projet.".into());
    }
    Ok(target)
}

fn plan_move(
    root: &Path,
    source: &str,
    destination: &str,
    moves: &mut Vec<(PathBuf, PathBuf)>,
) -> Result<(), String> {
    if source == destination {
        return Ok(());
    }
    if overlaps(source, destination) {
        return Err("Un dossier ne peut pas être déplacé dans lui-même ou son parent.".into());
    }
    let source = confined(root, source)?;
    let destination = confined(root, destination)?;
    if destination.exists() {
        return Err(format!(
            "{} existe déjà. Choisis un autre nom.",
            destination.display()
        ));
    }
    if source.exists() {
        if !source.is_dir() {
            return Err(format!("{} doit être un dossier.", source.display()));
        }
        moves.push((source, destination));
    }
    Ok(())
}

fn create_directories(path: &Path, root: &Path, created: &mut Vec<PathBuf>) -> Result<(), String> {
    if !path.starts_with(root) {
        return Err("Dossier hors du projet.".into());
    }
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        create_directories(parent, root, created)?;
    }
    fs::create_dir(path).map_err(|e| e.to_string())?;
    created.push(path.to_path_buf());
    Ok(())
}

fn save(
    path: &Path,
    bytes: &[u8],
    originals: &mut Vec<(PathBuf, Option<Vec<u8>>)>,
) -> Result<(), String> {
    let original = if path.exists() {
        Some(fs::read(path).map_err(|e| e.to_string())?)
    } else {
        None
    };
    originals.push((path.to_path_buf(), original));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, bytes).map_err(|e| e.to_string())
}

fn collect_files(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() || entry.file_name() == ".godot" || entry.file_name() == ".git" {
            continue;
        }
        if kind.is_dir() {
            collect_files(&entry.path(), files)?;
        } else {
            files.push(entry.path());
        }
    }
    Ok(())
}
