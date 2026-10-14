//! Files the app manages itself (imported PDFs, later snip images).
//!
//! Everything lives under `<app data dir>/documents/`. The database stores paths
//! *relative* to the app data dir (e.g. `documents/3f2c….pdf`), so the library can be
//! moved or backed up as a whole.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const DOCUMENTS_DIR: &str = "documents";

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    /// Path relative to the app data dir, with forward slashes.
    pub stored_path: String,
    pub file_name: String,
    pub sha256: String,
    pub bytes: u64,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Resolves a stored relative path, refusing anything that could escape the documents folder.
pub fn resolve_stored(root: &Path, stored_path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(stored_path);
    let mut parts = rel.components();
    let first_ok = matches!(parts.next(), Some(Component::Normal(c)) if c == DOCUMENTS_DIR);
    let rest_ok = parts.clone().count() > 0 && parts.all(|c| matches!(c, Component::Normal(_)));
    if !first_ok || !rest_ok {
        return Err(format!("not a managed file: {stored_path}"));
    }
    Ok(root.join(rel))
}

/// Copies `source` into `<root>/documents/<uuid>.pdf`, hashing it on the way.
pub fn import_pdf_into(root: &Path, source: &Path) -> Result<ImportedFile, String> {
    let mut input =
        fs::File::open(source).map_err(|e| format!("cannot open {}: {e}", source.display()))?;

    let mut magic = [0u8; 5];
    let n = input.read(&mut magic).map_err(|e| e.to_string())?;
    if n < 5 || &magic != b"%PDF-" {
        return Err("That file isn't a PDF.".into());
    }

    let dir = root.join(DOCUMENTS_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = format!("{}.pdf", uuid::Uuid::new_v4());
    let dest = dir.join(&name);
    let mut output = fs::File::create(&dest).map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(&magic[..n]);
    output.write_all(&magic[..n]).map_err(|e| e.to_string())?;
    let mut bytes = n as u64;
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let read = input.read(&mut buf).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
        output.write_all(&buf[..read]).map_err(|e| e.to_string())?;
        bytes += read as u64;
    }
    output.sync_all().map_err(|e| e.to_string())?;

    Ok(ImportedFile {
        stored_path: format!("{DOCUMENTS_DIR}/{name}"),
        file_name: source
            .file_name()
            .map(|f| f.to_string_lossy().into_owned())
            .unwrap_or_else(|| "document.pdf".into()),
        sha256: hex::encode(hasher.finalize()),
        bytes,
    })
}

/// Deletes files in the documents folder that no database row refers to. Returns how many were removed.
pub fn prune_into(root: &Path, keep: &[String]) -> Result<usize, String> {
    let dir = root.join(DOCUMENTS_DIR);
    if !dir.exists() {
        return Ok(0);
    }
    let keep: HashSet<PathBuf> = keep
        .iter()
        .filter_map(|p| resolve_stored(root, p).ok())
        .collect();
    let mut removed = 0;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_file() && !keep.contains(&path) {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn import_pdf(app: AppHandle, source: String) -> Result<ImportedFile, String> {
    import_pdf_into(&data_dir(&app)?, Path::new(&source))
}

#[tauri::command]
pub fn remove_stored_file(app: AppHandle, stored_path: String) -> Result<(), String> {
    let path = resolve_stored(&data_dir(&app)?, &stored_path)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn prune_stored_files(app: AppHandle, keep: Vec<String>) -> Result<usize, String> {
    prune_into(&data_dir(&app)?, &keep)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("studyhub-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn imports_hashes_and_prunes() {
        let root = tmp();
        let src = root.join("Lecture 07.pdf");
        fs::write(&src, b"%PDF-1.7\nhello").unwrap();

        let a = import_pdf_into(&root, &src).unwrap();
        assert_eq!(a.file_name, "Lecture 07.pdf");
        assert_eq!(a.bytes, 14);
        assert!(a.stored_path.starts_with("documents/") && a.stored_path.ends_with(".pdf"));
        assert_eq!(a.sha256, hex::encode(Sha256::digest(b"%PDF-1.7\nhello")));
        assert_eq!(
            fs::read(root.join(&a.stored_path)).unwrap(),
            b"%PDF-1.7\nhello"
        );

        let b = import_pdf_into(&root, &src).unwrap();
        assert_ne!(a.stored_path, b.stored_path);
        assert_eq!(prune_into(&root, &[a.stored_path.clone()]).unwrap(), 1);
        assert!(root.join(&a.stored_path).exists());
        assert!(!root.join(&b.stored_path).exists());
    }

    #[test]
    fn rejects_non_pdfs() {
        let root = tmp();
        let src = root.join("notes.txt");
        fs::write(&src, b"just text").unwrap();
        assert!(import_pdf_into(&root, &src).is_err());
    }

    #[test]
    fn refuses_paths_outside_documents() {
        let root = Path::new("/data");
        assert!(resolve_stored(root, "documents/a.pdf").is_ok());
        for bad in [
            "../etc/passwd",
            "documents/../studyhub.db",
            "/etc/passwd",
            "documents",
            "other/a.pdf",
        ] {
            assert!(
                resolve_stored(root, bad).is_err(),
                "{bad} should be refused"
            );
        }
    }
}
