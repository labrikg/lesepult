use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_sql::{Migration, MigrationKind};

pub mod export;
pub mod files;
pub mod migrate;

/// Database URL shared with the frontend (`src/lib/db.ts`).
/// The file is created in the app's config directory on first launch.
pub const DB_URL: &str = "sqlite:lesepult.db";

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
        Migration {
            version: 7,
            description: "cram answers",
            sql: include_str!("../migrations/0007_cram.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// WebView2 (Windows) reacts to browser keys of its own: F5 and Ctrl+R reload the app, Ctrl+P
/// prints the whole window, Ctrl+F opens Edge's find bar. Lesepult handles its keys itself, so the
/// browser ones are switched off in release builds (copy, paste, undo and arrows keep working).
#[cfg(all(windows, not(debug_assertions)))]
fn disable_browser_keys(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;
    let result = window.with_webview(|webview| unsafe {
        let settings = webview.controller().CoreWebView2().and_then(|core| core.Settings());
        if let Ok(settings) = settings.and_then(|s| s.cast::<ICoreWebView2Settings3>()) {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
    if let Err(e) = result {
        eprintln!("Lesepult: couldn't switch off the browser keys: {e}");
    }
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
        .setup(|app| {
            // Bring over data from the old app ID first, then open the window (its web storage
            // must not exist yet when the old one is moved). The window is therefore created
            // here rather than from tauri.conf.json ("create": false there).
            let path = app.path();
            if let Ok(config) = path.app_config_dir() {
                let data: Vec<_> = [path.app_data_dir(), path.app_local_data_dir()]
                    .into_iter()
                    .flatten()
                    .filter(|d| *d != config)
                    .collect();
                let webkit = if cfg!(target_os = "macos") {
                    path.home_dir()
                        .ok()
                        .map(|h| h.join("Library/WebKit").join(&app.config().identifier))
                } else {
                    None
                };
                for line in migrate::run(&config, &data, webkit.as_deref()) {
                    println!("Lesepult: {line}");
                }
            }
            if let Some(window) = app.config().app.windows.first().cloned() {
                let _window = WebviewWindowBuilder::from_config(app.handle(), &window)?.build()?;
                #[cfg(all(windows, not(debug_assertions)))]
                disable_browser_keys(&_window);
            }
            Ok(())
        })
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
