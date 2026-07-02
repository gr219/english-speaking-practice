use crate::db::Database;
use crate::speech::SpeechEngine;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use tower_http::services::ServeDir;

use crate::state::ServerState;

mod api;
mod data;
mod db;
mod fluency;
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
        .with_state(ServerState::new(database));

    let port = std::env::var("PORT").unwrap_or("3000".to_string());
    println!("Server starting on port {port}");
    axum::Server::bind(&format!("0.0.0.0:{port}").parse().unwrap())
        .serve(app.into_make_service())
        .await
        .unwrap();
}
