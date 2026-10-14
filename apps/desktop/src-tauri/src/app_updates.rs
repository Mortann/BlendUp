//! Only published stable releases from the project's GitHub repository are offered.
use reqwest::{blocking::Client, redirect::Policy, Url};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::Manager;

const API: &str = "https://api.github.com/repos/Mortann/BlendUp/releases/latest";
const DOWNLOAD_ROOT: &str = "https://github.com/Mortann/BlendUp/releases/download/";
const RELEASE_ROOT: &str = "https://github.com/Mortann/BlendUp/releases/tag/";
const MAX_DOWNLOAD: u64 = 500 * 1024 * 1024;
static INSTALLING: AtomicBool = AtomicBool::new(false);
struct InstallGuard;
impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::Release);
    }
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}
#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
    digest: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    version: String,
    release_url: String,
    can_install: bool,
}

fn trusted_host(url: &Url) -> bool {
    url.scheme() == "https"
        && matches!(
            url.host_str(),
            Some(
                "api.github.com"
                    | "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
}
fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent(concat!("BlendUp/", env!("CARGO_PKG_VERSION")))
        .https_only(true)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(180))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !trusted_host(attempt.url()) {
                attempt.error("Redirection de téléchargement non autorisée")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}
fn fetch_release(client: &Client) -> Result<Option<Release>, String> {
    let response = client
        .get(API)
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(20))
        .send()
        .map_err(|_| {
            "Impossible de joindre GitHub. Vérifie ta connexion puis réessaie.".to_string()
        })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let response = response
        .error_for_status()
        .map_err(|e| format!("Vérification des mises à jour indisponible : {e}"))?;
    let bytes = read_limited(response, 2 * 1024 * 1024)?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| format!("Réponse de mise à jour invalide : {e}"))
}
fn read_limited(mut reader: impl Read, limit: u64) -> Result<Vec<u8>, String> {
    let mut data = Vec::new();
    reader
        .by_ref()
        .take(limit + 1)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() as u64 > limit {
        return Err("Réponse de téléchargement trop volumineuse".into());
    }
    Ok(data)
}
fn installer<'a>(release: &'a Release, version: &str) -> Option<&'a Asset> {
    let name = format!("BlendUp_{version}_x64-update.exe");
    let expected = format!("{DOWNLOAD_ROOT}{}/{name}", release.tag_name);
    release.assets.iter().find(|asset| {
        asset.name == name
            && asset.browser_download_url == expected
            && asset.size > 0
            && asset.size <= MAX_DOWNLOAD
    })
}
fn available(release: &Release, current: &str) -> Result<Option<AvailableUpdate>, String> {
    let version = Version::parse(
        release
            .tag_name
            .strip_prefix('v')
            .unwrap_or(&release.tag_name),
    )
    .map_err(|_| "Version publiée invalide".to_string())?;
    let current = Version::parse(current).map_err(|e| e.to_string())?;
    if release.draft || release.prerelease || !version.pre.is_empty() || version <= current {
        return Ok(None);
    }
    if release.html_url != format!("{RELEASE_ROOT}{}", release.tag_name) {
        return Err("Lien de publication non autorisé".into());
    }
    let version = version.to_string();
    Ok(Some(AvailableUpdate {
        can_install: cfg!(target_os = "windows") && installer(release, &version).is_some(),
        version,
        release_url: release.html_url.clone(),
    }))
}
pub fn check() -> Result<Option<AvailableUpdate>, String> {
    match fetch_release(&client()?)? {
        Some(release) => available(&release, env!("CARGO_PKG_VERSION")),
        None => Ok(None),
    }
}
fn valid_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn checksum_line(text: &str, name: &str) -> Result<String, String> {
    let matches: Vec<_> = text
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let hash = parts.next()?;
            let filename = parts.next()?.trim_start_matches('*');
            (filename == name && parts.next().is_none() && valid_hash(hash))
                .then(|| hash.to_ascii_lowercase())
        })
        .collect();
    if matches.len() != 1 {
        return Err("Empreinte SHA-256 de la mise à jour manquante ou ambiguë".into());
    }
    Ok(matches[0].clone())
}
fn expected_hash(client: &Client, release: &Release, asset: &Asset) -> Result<String, String> {
    if let Some(digest) = &asset.digest {
        let hash = digest
            .strip_prefix("sha256:")
            .ok_or("Empreinte de téléchargement non prise en charge")?;
        if !valid_hash(hash) {
            return Err("Empreinte de téléchargement invalide".into());
        }
        return Ok(hash.to_ascii_lowercase());
    }
    let name = "SHA256SUMS-windows.txt";
    let url = format!("{DOWNLOAD_ROOT}{}/{name}", release.tag_name);
    let checksum = release
        .assets
        .iter()
        .find(|a| a.name == name && a.browser_download_url == url)
        .ok_or("Empreintes de la publication absentes")?;
    let response = client
        .get(&checksum.browser_download_url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?;
    let bytes = read_limited(response, 64 * 1024)?;
    checksum_line(
        std::str::from_utf8(&bytes).map_err(|e| e.to_string())?,
        &asset.name,
    )
}
// Validate both length and hash before the file can be launched.
fn copy_verified(
    mut reader: impl Read,
    mut writer: impl Write,
    expected_size: u64,
    hash: &str,
) -> Result<(), String> {
    let mut total = 0;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        total += count as u64;
        if total > expected_size || total > MAX_DOWNLOAD {
            return Err("Taille du téléchargement incorrecte".into());
        }
        digest.update(&buffer[..count]);
        writer
            .write_all(&buffer[..count])
            .map_err(|e| e.to_string())?;
    }
    if total != expected_size || format!("{:x}", digest.finalize()) != hash {
        return Err(
            "Le téléchargement est incomplet ou son empreinte SHA-256 est incorrecte. Réessaie."
                .into(),
        );
    }
    writer.flush().map_err(|e| e.to_string())
}
fn download(version: &str, cache: &Path) -> Result<PathBuf, String> {
    download_for_current(version, cache, env!("CARGO_PKG_VERSION"))
}
fn download_for_current(version: &str, cache: &Path, current: &str) -> Result<PathBuf, String> {
    let client = client()?;
    let release = fetch_release(&client)?.ok_or("Aucune mise à jour publiée")?;
    let update = available(&release, current)?.ok_or("BlendUp est déjà à jour")?;
    if update.version != version {
        return Err("La version disponible a changé. Vérifie à nouveau les mises à jour.".into());
    }
    let asset = installer(&release, version)
        .ok_or("Exécutable de mise à jour indisponible pour cette version")?;
    let hash = expected_hash(&client, &release, asset)?;
    let folder = cache.join("updates").join(&update.version);
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let partial = folder.join("download.part");
    let target = folder.join(&asset.name);
    let result = (|| {
        let response = client
            .get(&asset.browser_download_url)
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?;
        let file = fs::File::create(&partial).map_err(|e| e.to_string())?;
        copy_verified(response, &file, asset.size, &hash)?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        if target.exists() {
            fs::remove_file(&target).map_err(|e| e.to_string())?;
        }
        fs::rename(&partial, &target).map_err(|e| e.to_string())?;
        Ok(target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(partial);
    }
    result
}
#[tauri::command]
pub async fn check_app_update() -> Result<Option<AvailableUpdate>, String> {
    tauri::async_runtime::spawn_blocking(check)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn open_app_update_release(version: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let update = check()?.ok_or("Aucune mise à jour disponible")?;
        if update.version != version {
            return Err(
                "La version disponible a changé. Vérifie à nouveau les mises à jour.".into(),
            );
        }
        super::open_with_system(Path::new(&update.release_url))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn install_app_update(app: tauri::AppHandle, version: String) -> Result<(), String> {
    if INSTALLING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("Une mise à jour est déjà en cours.".into());
    }
    let _guard = InstallGuard;
    if !cfg!(target_os = "windows") {
        return Err("Utilise la page de publication pour mettre à jour cette plateforme.".into());
    }
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let path = tauri::async_runtime::spawn_blocking(move || download(&version, &cache))
        .await
        .map_err(|e| e.to_string())??;
    std::process::Command::new(path)
        .spawn()
        .map_err(|e| format!("Impossible de démarrer la mise à jour : {e}"))?;
    app.exit(0);
    Ok(())
}
// Read-only probe for release verification, without opening a desktop window.
pub fn handle_cli() -> Option<i32> {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).and_then(|s| s.to_str()) != Some("--check-app-update") {
        return None;
    }
    let result = args
        .get(2)
        .ok_or("Fichier de sortie requis".to_string())
        .and_then(|path| {
            let result = check()?;
            fs::write(
                path,
                serde_json::to_vec_pretty(&result).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())
        });
    Some(if result.is_ok() {
        0
    } else {
        eprintln!("{}", result.unwrap_err());
        1
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release(tag: &str) -> Release {
        Release {
            tag_name: tag.into(),
            html_url: format!("{RELEASE_ROOT}{tag}"),
            draft: false,
            prerelease: false,
            assets: vec![],
        }
    }
    #[test]
    fn offers_only_newer_stable_versions_and_trusted_links() {
        assert!(available(&release("v0.2.10"), "0.2.9").unwrap().is_some());
        assert!(available(&release("v0.2.9"), "0.2.10").unwrap().is_none());
        assert!(available(&release("v0.2.9"), "0.2.9").unwrap().is_none());
        assert!(available(&release("v0.3.0-beta.1"), "0.2.9")
            .unwrap()
            .is_none());
        let mut r = release("v0.3.0");
        r.draft = true;
        assert!(available(&r, "0.2.9").unwrap().is_none());
        r.draft = false;
        r.prerelease = true;
        assert!(available(&r, "0.2.9").unwrap().is_none());
        r.prerelease = false;
        r.html_url = "https://example.com".into();
        assert!(available(&r, "0.2.9").is_err());
    }
    #[test]
    fn rejects_foreign_downloads_and_redirects() {
        let mut r = release("v0.3.0");
        r.assets.push(Asset {
            name: "BlendUp_0.3.0_x64-update.exe".into(),
            browser_download_url: "https://example.com/update.exe".into(),
            size: 10,
            digest: None,
        });
        assert!(installer(&r, "0.3.0").is_none());
        r.assets[0].browser_download_url =
            format!("{DOWNLOAD_ROOT}v0.3.0/BlendUp_0.3.0_x64-update.exe");
        assert!(installer(&r, "0.3.0").is_some());
        assert!(!trusted_host(&Url::parse("http://github.com/x").unwrap()));
        assert!(!trusted_host(
            &Url::parse("https://github.com.example.com/x").unwrap()
        ));
        assert!(trusted_host(
            &Url::parse("https://release-assets.githubusercontent.com/x").unwrap()
        ));
    }
    #[test]
    fn download_must_match_hash_and_length() {
        let bytes = b"verified update";
        let hash = format!("{:x}", Sha256::digest(bytes));
        let mut output = Vec::new();
        copy_verified(&bytes[..], &mut output, bytes.len() as u64, &hash).unwrap();
        assert_eq!(output, bytes);
        assert!(copy_verified(
            &b"modified update"[..],
            Vec::new(),
            bytes.len() as u64,
            &hash
        )
        .is_err());
        assert!(copy_verified(&bytes[..5], Vec::new(), bytes.len() as u64, &hash).is_err());
        assert!(copy_verified(&bytes[..], Vec::new(), 3, &hash).is_err());
    }
    #[test]
    fn checksum_requires_one_exact_filename() {
        let hash = "a".repeat(64);
        assert_eq!(
            checksum_line(&format!("{hash}  update.exe\n"), "update.exe").unwrap(),
            hash
        );
        assert!(checksum_line(&format!("{hash}  other.exe"), "update.exe").is_err());
        assert!(checksum_line("abcd update.exe", "update.exe").is_err());
        assert!(checksum_line(
            &format!("{hash} update.exe\n{hash} update.exe"),
            "update.exe"
        )
        .is_err());
    }
    #[test]
    #[ignore = "Requires access to the public GitHub release API"]
    fn published_metadata_uses_real_api() {
        let release = fetch_release(&client().unwrap()).unwrap().unwrap();
        let update = available(&release, "0.0.0").unwrap().unwrap();
        println!(
            "Published release: {} ({})",
            update.version, update.release_url
        );
    }
    #[test]
    #[ignore = "Requires a published release containing the Windows update executable"]
    fn published_updater_download_is_verified() {
        let release = fetch_release(&client().unwrap()).unwrap().unwrap();
        let update = available(&release, "0.0.0").unwrap().unwrap();
        assert!(installer(&release, &update.version).is_some());
        let cache =
            std::env::temp_dir().join(format!("blendup-update-download-{}", std::process::id()));
        let path = download_for_current(&update.version, &cache, "0.0.0").unwrap();
        assert!(path.is_file());
        println!("Verified published updater: {}", path.display());
    }
}
