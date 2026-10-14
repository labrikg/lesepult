//! Runs the real migration through sqlx's SQLite (the same engine tauri-plugin-sql uses)
//! and checks foreign keys, cascades and full-text search.
use sqlx::{Row, SqlitePool, sqlite::SqliteConnectOptions};
use std::str::FromStr;

async fn pool() -> SqlitePool {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .foreign_keys(true);
    let pool = sqlx::pool::PoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();
    for m in lesepult_lib::migrations() {
        sqlx::raw_sql(m.sql)
            .execute(&pool)
            .await
            .expect("migration failed");
    }
    pool
}

#[tokio::test]
async fn schema_cascades_and_search() {
    let db = pool().await;
    sqlx::raw_sql(
        "INSERT INTO semesters (id, name, position) VALUES ('s1', 'Winter 26/27', 1);
         INSERT INTO courses (id, semester_id, name, color, position) VALUES ('c1', 's1', 'Algorithms', '#4A6741', 1);
         INSERT INTO pages (id, course_id, title, plain_text, position) VALUES ('p1', 'c1', 'Hashing', 'Open addressing uses probe sequences', 1);",
    )
    .execute(&db)
    .await
    .unwrap();

    let hits: Vec<String> =
        sqlx::query("SELECT page_id FROM pages_fts WHERE pages_fts MATCH 'probe*'")
            .fetch_all(&db)
            .await
            .unwrap()
            .iter()
            .map(|r| r.get(0))
            .collect();
    assert_eq!(hits, vec!["p1"]);

    sqlx::query("UPDATE pages SET plain_text = 'Chaining keeps a list per slot' WHERE id = 'p1'")
        .execute(&db)
        .await
        .unwrap();
    let old: i64 = sqlx::query("SELECT count(*) FROM pages_fts WHERE pages_fts MATCH 'probe*'")
        .fetch_one(&db)
        .await
        .unwrap()
        .get(0);
    let new: i64 = sqlx::query("SELECT count(*) FROM pages_fts WHERE pages_fts MATCH 'chaining'")
        .fetch_one(&db)
        .await
        .unwrap()
        .get(0);
    assert_eq!((old, new), (0, 1));

    sqlx::query("DELETE FROM semesters WHERE id = 's1'")
        .execute(&db)
        .await
        .unwrap();
    let left: i64 =
        sqlx::query("SELECT (SELECT count(*) FROM pages) + (SELECT count(*) FROM pages_fts)")
            .fetch_one(&db)
            .await
            .unwrap()
            .get(0);
    assert_eq!(
        left, 0,
        "deleting a semester should cascade to its pages and search index"
    );
}
