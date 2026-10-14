use tauri_plugin_sql::{Migration, MigrationKind};

pub mod export;
pub mod files;

/// Database URL shared with the frontend (`src/lib/db.ts`).
/// The file is created in the app's config directory on first launch.
pub const DB_URL: &str = "sqlite:studyhub.db";

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            files::import_pdf,
            files::remove_stored_file,
            files::save_png,
            files::prune_stored_files,
            export::export_bundle,
            export::print_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Study Hub");
}
