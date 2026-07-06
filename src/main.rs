use crate::db::Database;
use crate::speech::SpeechEngine;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{fmt, EnvFilter};

use crate::state::ServerState;

mod api;
mod data;
mod db;
mod fluency;
mod grammar;
mod speech;
mod state;

async fn spa_fallback() -> impl IntoResponse {
    match tokio::fs::read("./public/index.html").await {
        Ok(content) => (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "text/html")],
            content,
        )
            .into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

#[tokio::main]
async fn main() {
    // Initialize tracing with env filter (default: info, override with RUST_LOG)
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tower_http=debug"));
    fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(true)
        .with_line_number(true)
        .init();

    // Create required directories
    std::fs::create_dir_all("./audio").expect("Failed to create audio directory");
    std::fs::create_dir_all("./db").expect("Failed to create db directory");

    SpeechEngine::initialize_speech_model();

    let database = Database::new("./db/speech.db").expect("Failed to initialize database");

    let app = Router::new()
        .nest("/api", api::router())
        .nest_service("/assets", ServeDir::new("./public/assets"))
        .nest_service("/lib", ServeDir::new("./public/lib"))
        .fallback(get(spa_fallback))
        .layer(TraceLayer::new_for_http())
        .with_state(ServerState::new(database));

    let port = std::env::var("PORT").unwrap_or("3000".to_string());
    info!(port = %port, "Server starting");
    axum::Server::bind(&format!("0.0.0.0:{port}").parse().unwrap())
        .serve(app.into_make_service())
        .await
        .unwrap();
}
