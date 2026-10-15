//! Writing exports (Markdown notes, copied PDFs and snip images) to a folder the user picked,
//! and printing the window (the macOS print dialog has "Save as PDF").

use crate::files::resolve_stored;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportEntry {
    /// Relative path inside the export folder, "/"-separated.
    pub path: String,
    pub text: Option<String>,
    /// A file in Lesepult's data folder to copy (documents/…).
    pub stored_path: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub dir: String,
    pub files: usize,
}

/// Joins a relative export path onto the target folder, refusing anything that could escape it.
fn join_relative(dir: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if rel.is_empty() || !p.components().all(|c| matches!(c, Component::Normal(_))) {
        return Err(format!("invalid export path: {rel}"));
    }
    Ok(dir.join(p))
}

/// Creates `<parent>/<name>`, or `<name> (2)`, … if that already exists.
fn fresh_dir(parent: &Path, name: &str) -> Result<PathBuf, String> {
    for i in 1..1000 {
        let candidate = if i == 1 {
            parent.join(name)
        } else {
            parent.join(format!("{name} ({i})"))
        };
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("couldn't find a free folder name".into())
}

pub fn export_into(
    data_root: &Path,
    target_dir: &Path,
    fresh_subfolder: Option<&str>,
    entries: &[ExportEntry],
) -> Result<ExportResult, String> {
    if !target_dir.is_absolute() {
        return Err("export folder must be an absolute path".into());
    }
    fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
    let dir = match fresh_subfolder {
        Some(name) => fresh_dir(target_dir, name)?,
        None => target_dir.to_path_buf(),
    };
    let mut files = 0;
    for entry in entries {
        let dest = join_relative(&dir, &entry.path)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        match (&entry.text, &entry.stored_path) {
            (Some(text), _) => fs::write(&dest, text).map_err(|e| e.to_string())?,
            (None, Some(stored)) => {
                let src = resolve_stored(data_root, stored)?;
                fs::copy(&src, &dest).map_err(|e| format!("couldn't copy {stored}: {e}"))?;
            }
            (None, None) => return Err(format!("nothing to write for {}", entry.path)),
        }
        files += 1;
    }
    Ok(ExportResult {
        dir: dir.to_string_lossy().into_owned(),
        files,
    })
}

#[tauri::command]
pub fn export_bundle(
    app: AppHandle,
    target_dir: String,
    fresh_subfolder: Option<String>,
    entries: Vec<ExportEntry>,
) -> Result<ExportResult, String> {
    let data_root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    export_into(
        &data_root,
        Path::new(&target_dir),
        fresh_subfolder.as_deref(),
        &entries,
    )
}

/// Opens the system print dialog for the window. The page's print stylesheet shows only the note.
#[tauri::command]
pub fn print_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lesepult-export-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn text(path: &str, t: &str) -> ExportEntry {
        ExportEntry {
            path: path.into(),
            text: Some(t.into()),
            stored_path: None,
        }
    }

    #[test]
    fn writes_text_and_copies_stored_files_into_a_fresh_folder() {
        let data = tmp();
        fs::create_dir_all(data.join("documents")).unwrap();
        fs::write(data.join("documents/a.pdf"), b"%PDF-1.7").unwrap();
        let out = tmp();

        let entries = vec![
            text("Winter/Algorithms/Hashing.md", "# Hashing\n"),
            ExportEntry {
                path: "Winter/Algorithms/PDFs/Lecture 07.pdf".into(),
                text: None,
                stored_path: Some("documents/a.pdf".into()),
            },
        ];
        let first = export_into(&data, &out, Some("Lesepult export"), &entries).unwrap();
        assert_eq!(first.files, 2);
        assert!(first.dir.ends_with("Lesepult export"));
        let dir = PathBuf::from(&first.dir);
        assert_eq!(
            fs::read_to_string(dir.join("Winter/Algorithms/Hashing.md")).unwrap(),
            "# Hashing\n"
        );
        assert_eq!(
            fs::read(dir.join("Winter/Algorithms/PDFs/Lecture 07.pdf")).unwrap(),
            b"%PDF-1.7"
        );

        let second = export_into(&data, &out, Some("Lesepult export"), &entries).unwrap();
        assert!(second.dir.ends_with("Lesepult export (2)"));
    }

    #[test]
    fn refuses_paths_that_escape_the_export_folder() {
        let data = tmp();
        let out = tmp();
        for bad in ["../evil.md", "/etc/passwd", "a/../../b.md", ""] {
            assert!(
                export_into(&data, &out, None, &[text(bad, "x")]).is_err(),
                "{bad} should be refused"
            );
        }
        let escape_store = ExportEntry {
            path: "x.pdf".into(),
            text: None,
            stored_path: Some("../lesepult.db".into()),
        };
        assert!(export_into(&data, &out, None, &[escape_store]).is_err());
        assert!(export_into(&data, Path::new("relative/dir"), None, &[]).is_err());
    }
}
