//! Moves data from Lesepult's old app ID (`app.studyhub.desktop`, from when it was "Study Hub")
//! to the current one, once, before the window opens: the config/data folders (database and
//! imported PDFs), the database file name (`studyhub.db` → `lesepult.db`) and, on macOS, the web
//! view's storage (theme and other settings).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const OLD_ID: &str = "app.studyhub.desktop";
pub const OLD_DB: &str = "studyhub.db";
pub const DB: &str = "lesepult.db";

/// `.../app.studyhub.desktop` next to a folder named after the current ID.
pub fn old_sibling(new_dir: &Path) -> Option<PathBuf> {
    Some(new_dir.parent()?.join(OLD_ID))
}

/// Moves `old` to `new` if `old` exists and `new` doesn't. Returns whether it moved.
pub fn move_dir(old: &Path, new: &Path) -> io::Result<bool> {
    if !old.is_dir() || new.exists() {
        return Ok(false);
    }
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::rename(old, new) {
        Ok(()) => Ok(true),
        // Different volumes: copy, then remove the old folder.
        Err(_) => {
            copy_dir(old, new)?;
            fs::remove_dir_all(old)?;
            Ok(true)
        }
    }
}

fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Renames `studyhub.db` (with its `-wal`/`-shm` companions, which SQLite finds by name) to
/// `lesepult.db`, unless a `lesepult.db` already exists.
pub fn rename_db(dir: &Path) -> io::Result<bool> {
    if !dir.join(OLD_DB).is_file() || dir.join(DB).exists() {
        return Ok(false);
    }
    for suffix in ["-wal", "-shm", ""] {
        let from = dir.join(format!("{OLD_DB}{suffix}"));
        if from.exists() {
            fs::rename(&from, dir.join(format!("{DB}{suffix}")))?;
        }
    }
    Ok(true)
}

/// Runs every step for the given current folders; reports what it did (for the log).
pub fn run(config_dir: &Path, data_dirs: &[PathBuf], webkit_dir: Option<&Path>) -> Vec<String> {
    let mut done = Vec::new();
    let mut step = |what: String, r: io::Result<bool>| match r {
        Ok(true) => done.push(what),
        Ok(false) => {}
        Err(e) => done.push(format!("{what} failed: {e}")),
    };
    let mut dirs = vec![config_dir.to_path_buf()];
    dirs.extend(data_dirs.iter().cloned());
    dirs.dedup();
    for new in &dirs {
        if let Some(old) = old_sibling(new) {
            step(format!("moved {} to {}", old.display(), new.display()), move_dir(&old, new));
        }
    }
    step(format!("renamed {OLD_DB} to {DB}"), rename_db(config_dir));
    if let Some(new) = webkit_dir {
        if let Some(old) = old_sibling(new) {
            step(format!("moved {} to {}", old.display(), new.display()), move_dir(&old, new));
        }
    }
    done
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lesepult-migrate-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn moves_old_folders_and_renames_the_database() {
        let root = tmp();
        let old = root.join(OLD_ID);
        fs::create_dir_all(old.join("documents")).unwrap();
        fs::write(old.join(OLD_DB), b"db").unwrap();
        fs::write(old.join(format!("{OLD_DB}-wal")), b"wal").unwrap();
        fs::write(old.join("documents/a.pdf"), b"%PDF").unwrap();
        let webkit_root = root.join("WebKit");
        fs::create_dir_all(webkit_root.join(OLD_ID).join("WebsiteData")).unwrap();

        let new = root.join("io.github.someone.lesepult");
        let webkit_new = webkit_root.join("io.github.someone.lesepult");
        let done = run(&new, &[new.clone()], Some(&webkit_new));

        assert_eq!(done.len(), 3, "{done:?}");
        assert!(!old.exists());
        assert_eq!(fs::read(new.join(DB)).unwrap(), b"db");
        assert_eq!(fs::read(new.join(format!("{DB}-wal"))).unwrap(), b"wal");
        assert!(!new.join(OLD_DB).exists());
        assert!(new.join("documents/a.pdf").is_file());
        assert!(webkit_new.join("WebsiteData").is_dir());

        // Second start: nothing left to do.
        assert!(run(&new, &[new.clone()], Some(&webkit_new)).is_empty());
    }

    #[test]
    fn never_overwrites_newer_data() {
        let root = tmp();
        let old = root.join(OLD_ID);
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join(OLD_DB), b"old").unwrap();
        let new = root.join("io.github.someone.lesepult");
        fs::create_dir_all(&new).unwrap();
        fs::write(new.join(DB), b"new").unwrap();

        assert!(run(&new, &[], None).is_empty());
        assert_eq!(fs::read(new.join(DB)).unwrap(), b"new");
        assert!(old.join(OLD_DB).exists(), "old data stays where it was");
    }

    #[test]
    fn separate_config_and_data_folders_both_move() {
        // Linux: ~/.config/<id> holds the database, ~/.local/share/<id> the PDFs.
        let root = tmp();
        let (config, data) = (root.join("config"), root.join("share"));
        fs::create_dir_all(config.join(OLD_ID)).unwrap();
        fs::write(config.join(OLD_ID).join(OLD_DB), b"db").unwrap();
        fs::create_dir_all(data.join(OLD_ID).join("documents")).unwrap();
        let id = "io.github.someone.lesepult";

        run(&config.join(id), &[data.join(id)], None);
        assert!(config.join(id).join(DB).is_file());
        assert!(data.join(id).join("documents").is_dir());
    }
}
