use tauri_plugin_sql::{Migration, MigrationKind};

pub mod export;
pub mod files;

/// Database URL shared with the frontend (`src/lib/db.ts`).
/// The file is created in the app's config directory on first launch.
pub const DB_URL: &str = "sqlite:studyhub.db";

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "tag colours",
            sql: include_str!("../migrations/0002_tag_colors.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "folders",
            sql: include_str!("../migrations/0003_folders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "study tools: cards, reviews, deadlines, todos",
            sql: include_str!("../migrations/0004_study.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "focus sessions (Pomodoro)",
            sql: include_str!("../migrations/0005_focus.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "PDF text for search",
            sql: include_str!("../migrations/0006_pdf_text.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
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
        .expect("error while running Lesepult");
}
