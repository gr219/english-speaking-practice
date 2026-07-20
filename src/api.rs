use crate::data::SpeechAnalyzeResult;
use crate::db::NewRecording;
use crate::fluency::analyze_fluency;
use crate::grammar::analyze_grammar;
use crate::speech::SpeechEngine;
use crate::state::ServerState;
use axum::body::Body;
use axum::extract::{DefaultBodyLimit, Multipart, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn extract_user_id(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-user-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

fn extract_admin_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-admin-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

fn is_admin(state: &ServerState, headers: &HeaderMap) -> bool {
    extract_admin_token(headers)
        .and_then(|token| state.db.verify_admin_password(&token).ok())
        .unwrap_or(false)
}

async fn pronounce_lookup_handler(
    state: State<ServerState>,
    Json(words): Json<Vec<String>>,
) -> impl IntoResponse {
    let result = words
        .iter()
        .map(|word| state.lookup_pronounce(word))
        .collect::<Vec<String>>();
    Json(result)
}

async fn get_random_example_handler(state: State<ServerState>) -> impl IntoResponse {
    Json(state.get_random_example())
}

async fn speech_recognition_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let user_id = extract_user_id(&headers).unwrap_or_default();
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    let content_length = headers
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    let mut speaker_name = headers
        .get("x-speaker-name")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    info!(user_id = %user_id, speaker_name = ?speaker_name, user_agent = %user_agent, content_length = %content_length, "Analyze request received");

    let mut audio_bytes: Option<Vec<u8>> = None;
    let mut target_text: Option<String> = None;
    let mut question_id: Option<String> = None;
    let mut audio_content_type: Option<String> = None;

    // Read all multipart fields
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        error!(user_id = %user_id, user_agent = %user_agent, content_length = %content_length, error = %e, "Failed to read multipart form data");
        (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Failed to read form data. Please try again.".to_string(),
        }))
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name == "audio" {
            let ct = field.content_type().map(|s| s.to_string());
            audio_content_type = ct.clone();
            if ct.as_deref() == Some("audio/wav") || ct.as_deref() == Some("audio/x-wav") {
                let buffer = field.bytes().await.map_err(|e| {
                    error!(user_id = %user_id, user_agent = %user_agent, content_length = %content_length, error = %e, "Failed to read audio bytes from upload");
                    (StatusCode::BAD_REQUEST, Json(ErrorResponse {
                        error: "Failed to read audio data. Please try again.".to_string(),
                    }))
                })?;
                audio_bytes = Some(buffer.to_vec());
            } else {
                warn!(user_id = %user_id, content_type = ?ct, "Audio field has unsupported content type");
            }
        } else if name == "target_text" {
            let text = field.text().await.unwrap_or_default();
            if !text.is_empty() {
                target_text = Some(text);
            }
        } else if name == "question_id" {
            let qid = field.text().await.unwrap_or_default();
            if !qid.is_empty() {
                question_id = Some(qid);
            }
        } else if name == "speaker_name" {
            let sname = field.text().await.unwrap_or_default();
            if !sname.is_empty() {
                speaker_name = Some(sname);
            }
        }
    }

    // Speaker name is required
    if speaker_name.is_none() {
        warn!(user_id = %user_id, "Analyze rejected: missing speaker name");
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Speaker name is required. Please enter your full name.".to_string(),
        })));
    }

    let audio_bytes = audio_bytes.ok_or_else(|| {
        warn!(user_id = %user_id, content_type = ?audio_content_type, "No valid WAV audio received");
        (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "No valid WAV audio data received. Please ensure your microphone is working.".to_string(),
        }))
    })?;

    info!(user_id = %user_id, audio_size = audio_bytes.len(), target_text = ?target_text, question_id = ?question_id, "Processing audio");

    let mut cursor = std::io::Cursor::new(&audio_bytes);
    let reader = wav::read(&mut cursor).map_err(|e| {
        error!(user_id = %user_id, audio_size = audio_bytes.len(), error = %e, "WAV parse failed");
        (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Invalid audio format. Please try recording again.".to_string(),
        }))
    })?;

    let sample_rate = reader.0.sampling_rate;
    let channels = reader.0.channel_count;
    let samples = reader.1.as_sixteen().ok_or_else(|| {
        error!(user_id = %user_id, sample_rate = sample_rate, channels = channels, "Audio is not 16-bit PCM");
        (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Audio must be 16-bit WAV format. Please try recording again.".to_string(),
        }))
    })?;

    info!(user_id = %user_id, sample_rate = sample_rate, channels = channels, num_samples = samples.len(), "WAV decoded successfully");

    let mut rec = SpeechEngine::create_recognizer(sample_rate as f32)
        .ok_or_else(|| {
            error!(user_id = %user_id, sample_rate = sample_rate, "Failed to create speech recognizer");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Speech recognition engine unavailable. Please try again later.".to_string(),
            }))
        })?;

    for chunk in samples.chunks(100) {
        rec.accept_waveform(chunk);
    }

    let single = rec.final_result().single().ok_or_else(|| {
        warn!(user_id = %user_id, num_samples = samples.len(), sample_rate = sample_rate, duration_secs = samples.len() as f32 / sample_rate as f32, "No speech detected in audio");
        (StatusCode::UNPROCESSABLE_ENTITY, Json(ErrorResponse {
            error: "No speech detected. Please speak clearly and try again.".to_string(),
        }))
    })?;

    let mut result = SpeechAnalyzeResult::from_vosk(single);

    // Compute fluency and grammar, then IELTS band
    result.fluency = analyze_fluency(&result.words);
    result.example_text = target_text.clone();
    result.grammar = analyze_grammar(
        &result.text,
        target_text.as_deref(),
    );
    result.compute_ielts_band();

    info!(user_id = %user_id, recognized_text = %result.text, score = result.score, ielts_band = ?result.ielts_band, "Speech analysis complete");

    // Save audio file
    let audio_filename = format!("{}.wav", uuid::Uuid::new_v4());
    let audio_path = format!("./audio/{}", audio_filename);
    std::fs::write(&audio_path, &audio_bytes)
        .map_err(|e| {
            error!(user_id = %user_id, path = %audio_path, error = %e, "Failed to write audio file to disk");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to save audio file. Please try again.".to_string(),
            }))
        })?;

    // Save to database
    let words_json = serde_json::to_string(&result.words)
        .map_err(|e| {
            error!(user_id = %user_id, error = %e, "Failed to serialize words to JSON");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Internal processing error. Please try again.".to_string(),
            }))
        })?;

    let fluency_json = result.fluency.as_ref()
        .map(|f| serde_json::to_string(f).unwrap_or_default());

    let grammar_json = result.grammar.as_ref()
        .map(|g| serde_json::to_string(g).unwrap_or_default());

    let new_recording = NewRecording {
        user_id: user_id.clone(),
        text: result.text.clone(),
        score: result.score,
        words_json,
        fluency_json,
        grammar_json,
        ielts_band: result.ielts_band,
        example_text: target_text,
        speaker_name,
        audio_path: audio_filename,
        submitted: question_id.is_none(),
        question_id,
    };

    let id = state
        .db
        .insert_recording(&new_recording)
        .map_err(|e| {
            error!(user_id = %user_id, error = %e, "Failed to insert recording into database");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to save recording. Please try again.".to_string(),
            }))
        })?;

    info!(user_id = %user_id, recording_id = %id, "Recording saved successfully");
    result.id = id;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct ListRecordingsQuery {
    pub user_id: String,
}

async fn list_recordings_handler(
    state: State<ServerState>,
    Query(query): Query<ListRecordingsQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let recordings = state
        .db
        .list_recordings(&query.user_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(recordings))
}

async fn get_recording_handler(
    state: State<ServerState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut recording = state
        .db
        .get_recording(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Lazy backfill: compute and persist IELTS band if missing
    if recording.ielts_band.is_none() {
        let score = recording.score;
        let fluency_score = recording.fluency_json.as_ref()
            .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
            .and_then(|v| v.get("score").and_then(|s| s.as_f64()));
        let grammar_score = recording.grammar_json.as_ref()
            .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
            .and_then(|v| v.get("score").and_then(|s| s.as_f64()));

        let f = fluency_score.unwrap_or(score);
        let g = grammar_score.unwrap_or(score);
        let combined = score * 0.4 + f * 0.3 + g * 0.3;
        let band = if combined >= 95.0 {
            9.0
        } else if combined >= 85.0 {
            8.0 + (combined - 85.0) / 10.0
        } else if combined >= 75.0 {
            7.0 + (combined - 75.0) / 10.0
        } else if combined >= 60.0 {
            6.0 + (combined - 60.0) / 15.0
        } else if combined >= 45.0 {
            5.0 + (combined - 45.0) / 15.0
        } else if combined >= 30.0 {
            4.0 + (combined - 30.0) / 15.0
        } else {
            (combined / 30.0 * 3.0 + 1.0_f64).max(1.0)
        };
        let ielts_band = (band * 2.0).round() / 2.0;
        let _ = state.db.update_ielts_band(&id, ielts_band);
        recording.ielts_band = Some(ielts_band);
    }

    Ok(Json(recording))
}

async fn get_recording_audio_handler(
    state: State<ServerState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let recording = state
        .db
        .get_recording(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let audio_path = format!("./audio/{}", recording.audio_path);
    let audio_bytes =
        std::fs::read(&audio_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total = audio_bytes.len();

    // Handle Range requests for seeking support
    if let Some(range_header) = headers.get(axum::http::header::RANGE) {
        if let Ok(range_str) = range_header.to_str() {
            if let Some(range) = range_str.strip_prefix("bytes=") {
                let parts: Vec<&str> = range.splitn(2, '-').collect();
                let start = parts[0].parse::<usize>().unwrap_or(0);
                let end = if parts.len() > 1 && !parts[1].is_empty() {
                    parts[1].parse::<usize>().unwrap_or(total - 1).min(total - 1)
                } else {
                    total - 1
                };

                if start >= total {
                    return Ok(axum::http::Response::builder()
                        .status(StatusCode::RANGE_NOT_SATISFIABLE)
                        .header("Content-Range", format!("bytes */{}", total))
                        .body(Body::empty())
                        .unwrap());
                }

                let slice = &audio_bytes[start..=end];
                return Ok(axum::http::Response::builder()
                    .status(StatusCode::PARTIAL_CONTENT)
                    .header("Content-Type", "audio/wav")
                    .header("Accept-Ranges", "bytes")
                    .header("Content-Length", slice.len().to_string())
                    .header("Content-Range", format!("bytes {}-{}/{}", start, end, total))
                    .body(Body::from(slice.to_vec()))
                    .unwrap());
            }
        }
    }

    Ok(axum::http::Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "audio/wav")
        .header("Accept-Ranges", "bytes")
        .header("Content-Length", total.to_string())
        .body(Body::from(audio_bytes))
        .unwrap())
}

async fn delete_recording_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let user_id = extract_user_id(&headers).ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(ErrorResponse {
        error: "User ID is required.".to_string(),
    })))?;

    info!(user_id = %user_id, recording_id = %id, is_admin = is_admin(&state, &headers), "Delete recording request");

    // Get recording to find audio file path
    let recording = state
        .db
        .get_recording(&id)
        .map_err(|e| {
            error!(recording_id = %id, error = %e, "Failed to look up recording for deletion");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to look up recording.".to_string(),
            }))
        })?
        .ok_or_else(|| (StatusCode::NOT_FOUND, Json(ErrorResponse {
            error: "Recording not found. It may have already been deleted.".to_string(),
        })))?;

    // Admin can delete anyone's recording
    let deleted = if is_admin(&state, &headers) {
        state.db.delete_recording_admin(&id)
            .map_err(|e| {
                error!(recording_id = %id, error = %e, "Admin delete recording failed");
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                    error: "Failed to delete recording from database.".to_string(),
                }))
            })?;
        true
    } else {
        state.db.delete_recording(&id, &user_id)
            .map_err(|e| {
                error!(recording_id = %id, user_id = %user_id, error = %e, "Delete recording failed");
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                    error: "Failed to delete recording from database.".to_string(),
                }))
            })?
    };

    if deleted {
        // Remove audio file (best-effort)
        let audio_path = format!("./audio/{}", recording.audio_path);
        let _ = std::fs::remove_file(&audio_path);
        info!(recording_id = %id, "Recording deleted successfully");
        Ok(StatusCode::NO_CONTENT)
    } else {
        warn!(recording_id = %id, user_id = %user_id, owner = %recording.user_id, "Permission denied for recording deletion");
        Err((StatusCode::FORBIDDEN, Json(ErrorResponse {
            error: "You do not have permission to delete this recording.".to_string(),
        })))
    }
}

#[derive(Deserialize)]
pub struct LeaderboardQuery {
    pub limit: Option<u32>,
}

async fn leaderboard_handler(
    state: State<ServerState>,
    Query(query): Query<LeaderboardQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let default_limit: u32 = std::env::var("LEADERBOARD_LIMIT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);
    let limit = query.limit.unwrap_or(default_limit);
    let entries = state
        .db
        .get_leaderboard(limit)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(entries))
}

#[derive(Deserialize)]
pub struct CreateQuestionRequest {
    pub text: String,
    pub time_limit_secs: i32,
    pub class_label: Option<String>,
    pub question_type: Option<String>,
}

#[derive(Serialize)]
pub struct CreateQuestionResponse {
    pub id: String,
}

async fn create_question_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Json(req): Json<CreateQuestionRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let creator_id = extract_user_id(&headers).unwrap_or_default();
    info!(creator_id = %creator_id, text_len = req.text.len(), time_limit = req.time_limit_secs, "Creating question");
    let id = state
        .db
        .insert_question(&creator_id, &req.text, req.time_limit_secs, req.class_label.as_deref(), req.question_type.as_deref())
        .map_err(|e| {
            error!(creator_id = %creator_id, error = %e, "Failed to insert question");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    info!(creator_id = %creator_id, question_id = %id, "Question created");
    Ok(Json(CreateQuestionResponse { id }))
}

async fn get_question_handler(
    state: State<ServerState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let question = state
        .db
        .get_question(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(question))
}

async fn get_question_submissions_handler(
    state: State<ServerState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let submissions = state
        .db
        .get_question_submissions(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(submissions))
}

#[derive(Deserialize)]
pub struct ListQuestionsQuery {
    pub creator_id: String,
}

async fn list_questions_handler(
    state: State<ServerState>,
    Query(query): Query<ListQuestionsQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let questions = state
        .db
        .list_questions(&query.creator_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(questions))
}

async fn delete_question_by_creator_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let user_id = extract_user_id(&headers).ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(ErrorResponse {
        error: "User ID is required.".to_string(),
    })))?;

    // Admin can also delete via this endpoint
    if is_admin(&state, &headers) {
        let deleted = state.db.delete_question(&id)
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to delete question.".to_string(),
            })))?;
        if deleted {
            return Ok(StatusCode::NO_CONTENT);
        } else {
            return Err((StatusCode::NOT_FOUND, Json(ErrorResponse {
                error: "Question not found.".to_string(),
            })));
        }
    }

    let deleted = state.db.delete_question_by_creator(&id, &user_id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to delete question.".to_string(),
        })))?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err((StatusCode::FORBIDDEN, Json(ErrorResponse {
            error: "You do not have permission to delete this question.".to_string(),
        })))
    }
}

// --- Admin endpoints ---

#[derive(Deserialize)]
pub struct AdminVerifyRequest {
    pub password: String,
}

#[derive(Serialize)]
pub struct AdminVerifyResponse {
    pub valid: bool,
}

async fn admin_verify_handler(
    state: State<ServerState>,
    Json(req): Json<AdminVerifyRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let valid = state
        .db
        .verify_admin_password(&req.password)
        .map_err(|e| {
            error!(error = %e, "Admin verify password failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    if !valid {
        warn!("Failed admin login attempt");
    }
    Ok(Json(AdminVerifyResponse { valid }))
}

#[derive(Deserialize)]
pub struct AdminRecentSubmissionsQuery {
    pub since: String,
}

async fn admin_recent_submissions_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Query(query): Query<AdminRecentSubmissionsQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    if !is_admin(&state, &headers) {
        return Err(StatusCode::FORBIDDEN);
    }
    let submissions = state
        .db
        .get_recent_submissions(&query.since)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(submissions))
}

async fn admin_list_questions_handler(
    state: State<ServerState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    if !is_admin(&state, &headers) {
        return Err(StatusCode::FORBIDDEN);
    }
    let questions = state
        .db
        .list_all_questions()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(questions))
}

async fn admin_delete_question_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    if !is_admin(&state, &headers) {
        return Err(StatusCode::FORBIDDEN);
    }
    let deleted = state
        .db
        .delete_question(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn admin_delete_recording_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    if !is_admin(&state, &headers) {
        return Err((StatusCode::FORBIDDEN, Json(ErrorResponse {
            error: "Admin access required.".to_string(),
        })));
    }

    // Verify recording exists before deleting
    let exists = state
        .db
        .get_recording(&id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to look up recording.".to_string(),
        })))?;

    if exists.is_none() {
        return Err((StatusCode::NOT_FOUND, Json(ErrorResponse {
            error: "Recording not found. It may have already been deleted.".to_string(),
        })));
    }

    let audio_path = state
        .db
        .delete_recording_admin(&id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to delete recording from database.".to_string(),
        })))?;
    if let Some(path) = audio_path {
        let full_path = format!("./audio/{}", path);
        let _ = std::fs::remove_file(&full_path);
    }
    Ok(StatusCode::NO_CONTENT)
}

// --- Batch question creation ---

#[derive(Deserialize)]
pub struct BatchQuestionItem {
    pub text: String,
    pub time_limit_secs: i32,
    pub class_label: Option<String>,
    pub question_type: Option<String>,
}

#[derive(Serialize)]
pub struct BatchQuestionResponse {
    pub ids: Vec<String>,
}

async fn create_questions_batch_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Json(req): Json<Vec<BatchQuestionItem>>,
) -> Result<impl IntoResponse, StatusCode> {
    let creator_id = extract_user_id(&headers).unwrap_or_default();
    let questions: Vec<(String, i32, Option<String>, Option<String>)> = req.into_iter().map(|q| (q.text, q.time_limit_secs, q.class_label, q.question_type)).collect();
    let ids = state
        .db
        .insert_questions_batch(&creator_id, &questions)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(BatchQuestionResponse { ids }))
}

async fn submit_recording_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let user_id = extract_user_id(&headers).ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(ErrorResponse {
        error: "User ID is required.".to_string(),
    })))?;

    let updated = state.db.submit_recording(&id, &user_id)
        .map_err(|e| {
            error!(recording_id = %id, user_id = %user_id, error = %e, "Failed to submit recording");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to submit recording.".to_string(),
            }))
        })?;

    if updated {
        info!(recording_id = %id, user_id = %user_id, "Recording submitted successfully");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err((StatusCode::NOT_FOUND, Json(ErrorResponse {
            error: "Recording not found or you do not have permission to submit it.".to_string(),
        })))
    }
}

// --- Feedback endpoints ---

#[derive(Deserialize)]
pub struct CreateFeedbackRequest {
    pub feedback_text: String,
    pub question_id: String,
}

async fn create_feedback_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(recording_id): Path<String>,
    Json(req): Json<CreateFeedbackRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let created_by = extract_user_id(&headers).unwrap_or_default();
    let id = state
        .db
        .insert_feedback(&recording_id, &req.question_id, &req.feedback_text, &created_by)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!({ "id": id })))
}

async fn get_feedbacks_handler(
    state: State<ServerState>,
    Path(recording_id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let feedbacks = state
        .db
        .get_feedbacks_for_recording(&recording_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(feedbacks))
}

// --- Homework list endpoints ---

#[derive(Deserialize)]
pub struct ListHomeworkQuery {
    pub creator_id: String,
    pub class_label: Option<String>,
}

async fn list_homework_handler(
    state: State<ServerState>,
    Query(query): Query<ListHomeworkQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let questions = state
        .db
        .list_homework(&query.creator_id, query.class_label.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(questions))
}

#[derive(Deserialize)]
pub struct AdminListHomeworkQuery {
    pub class_label: Option<String>,
}

async fn admin_list_homework_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Query(query): Query<AdminListHomeworkQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    if !is_admin(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let questions = state
        .db
        .list_all_homework(query.class_label.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(questions))
}

pub fn router() -> Router<ServerState, Body> {
    Router::new()
        .route("/pronounce", post(pronounce_lookup_handler))
        .route("/example", get(get_random_example_handler))
        .route("/analyze", post(speech_recognition_handler))
        .route("/recordings", get(list_recordings_handler))
        .route("/recordings/:id", get(get_recording_handler))
        .route("/recordings/:id", delete(delete_recording_handler))
        .route("/recordings/:id/audio", get(get_recording_audio_handler))
        .route("/recordings/:id/submit", post(submit_recording_handler))
        .route("/recordings/:id/feedback", post(create_feedback_handler))
        .route("/recordings/:id/feedback", get(get_feedbacks_handler))
        .route("/leaderboard", get(leaderboard_handler))
        .route("/questions", post(create_question_handler))
        .route("/questions", get(list_questions_handler))
        .route("/questions/batch", post(create_questions_batch_handler))
        .route("/questions/:id", get(get_question_handler))
        .route("/questions/:id", delete(delete_question_by_creator_handler))
        .route("/questions/:id/submissions", get(get_question_submissions_handler))
        .route("/homework", get(list_homework_handler))
        .route("/admin/homework", get(admin_list_homework_handler))
        .route("/admin/verify", post(admin_verify_handler))
        .route("/admin/submissions/recent", get(admin_recent_submissions_handler))
        .route("/admin/questions", get(admin_list_questions_handler))
        .route("/admin/questions/:id", delete(admin_delete_question_handler))
        .route("/admin/recordings/:id", delete(admin_delete_recording_handler))
        .layer(DefaultBodyLimit::max(20 * 1024 * 1024)) // 20MB for audio uploads
}
