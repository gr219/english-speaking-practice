use crate::data::SpeechAnalyzeResult;
use crate::db::NewRecording;
use crate::fluency::analyze_fluency;
use crate::grammar::analyze_grammar;
use crate::speech::SpeechEngine;
use crate::state::ServerState;
use axum::body::Body;
use axum::extract::{Multipart, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

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
    let speaker_name = headers
        .get("x-speaker-name")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    // Speaker name is required
    if speaker_name.is_none() {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Speaker name is required. Please enter your full name.".to_string(),
        })));
    }

    let mut audio_bytes: Option<Vec<u8>> = None;
    let mut target_text: Option<String> = None;
    let mut question_id: Option<String> = None;

    // Read all multipart fields
    while let Some(field) = multipart.next_field().await.expect("Could not read form data") {
        let name = field.name().unwrap_or("").to_string();
        if name == "audio" {
            if field.content_type().eq(&Some("audio/wav"))
                || field.content_type().eq(&Some("audio/x-wav"))
            {
                let buffer = field.bytes().await.expect("Could not read audio data!");
                audio_bytes = Some(buffer.to_vec());
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
        }
    }

    let audio_bytes = audio_bytes.ok_or_else(|| (StatusCode::BAD_REQUEST, Json(ErrorResponse {
        error: "No valid WAV audio data received. Please ensure your microphone is working.".to_string(),
    })))?;
    let mut cursor = std::io::Cursor::new(&audio_bytes);
    let reader = wav::read(&mut cursor).map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse {
        error: "Invalid audio format. Please try recording again.".to_string(),
    })))?;
    let samples = reader.1.as_sixteen().ok_or_else(|| (StatusCode::BAD_REQUEST, Json(ErrorResponse {
        error: "Audio must be 16-bit WAV format. Please try recording again.".to_string(),
    })))?;

    let mut rec = SpeechEngine::create_recognizer(reader.0.sampling_rate as f32)
        .ok_or_else(|| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Speech recognition engine unavailable. Please try again later.".to_string(),
        })))?;

    for chunk in samples.chunks(100) {
        rec.accept_waveform(chunk);
    }

    let single = rec.final_result().single().ok_or_else(|| (StatusCode::UNPROCESSABLE_ENTITY, Json(ErrorResponse {
        error: "No speech detected. Please speak clearly and try again.".to_string(),
    })))?;

    let mut result = SpeechAnalyzeResult::from_vosk(single);

    // Compute fluency and grammar, then IELTS band
    result.fluency = analyze_fluency(&result.words);
    result.example_text = target_text.clone();
    result.grammar = analyze_grammar(
        &result.text,
        target_text.as_deref(),
    );
    result.compute_ielts_band();

    // Save audio file
    let audio_filename = format!("{}.wav", uuid::Uuid::new_v4());
    let audio_path = format!("./audio/{}", audio_filename);
    std::fs::write(&audio_path, &audio_bytes)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to save audio file. Please try again.".to_string(),
        })))?;

    // Save to database
    let words_json = serde_json::to_string(&result.words)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Internal processing error. Please try again.".to_string(),
        })))?;

    let fluency_json = result.fluency.as_ref()
        .map(|f| serde_json::to_string(f).unwrap_or_default());

    let grammar_json = result.grammar.as_ref()
        .map(|g| serde_json::to_string(g).unwrap_or_default());

    let new_recording = NewRecording {
        user_id,
        text: result.text.clone(),
        score: result.score,
        words_json,
        fluency_json,
        grammar_json,
        ielts_band: result.ielts_band,
        example_text: target_text,
        speaker_name,
        audio_path: audio_filename,
        question_id,
    };

    let id = state
        .db
        .insert_recording(&new_recording)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to save recording. Please try again.".to_string(),
        })))?;

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
) -> Result<impl IntoResponse, StatusCode> {
    let recording = state
        .db
        .get_recording(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let audio_path = format!("./audio/{}", recording.audio_path);
    let audio_bytes =
        std::fs::read(&audio_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((
        [(axum::http::header::CONTENT_TYPE, "audio/wav")],
        audio_bytes,
    ))
}

async fn delete_recording_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let user_id = extract_user_id(&headers).ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(ErrorResponse {
        error: "User ID is required.".to_string(),
    })))?;

    // Get recording to find audio file path
    let recording = state
        .db
        .get_recording(&id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to look up recording.".to_string(),
        })))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, Json(ErrorResponse {
            error: "Recording not found. It may have already been deleted.".to_string(),
        })))?;

    // Admin can delete anyone's recording
    let deleted = if is_admin(&state, &headers) {
        state.db.delete_recording_admin(&id)
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to delete recording from database.".to_string(),
            })))?;
        true
    } else {
        state.db.delete_recording(&id, &user_id)
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to delete recording from database.".to_string(),
            })))?
    };

    if deleted {
        // Remove audio file (best-effort)
        let audio_path = format!("./audio/{}", recording.audio_path);
        let _ = std::fs::remove_file(&audio_path);
        Ok(StatusCode::NO_CONTENT)
    } else {
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
    let id = state
        .db
        .insert_question(&creator_id, &req.text, req.time_limit_secs)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
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
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
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
    let questions: Vec<(String, i32)> = req.into_iter().map(|q| (q.text, q.time_limit_secs)).collect();
    let ids = state
        .db
        .insert_questions_batch(&creator_id, &questions)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(BatchQuestionResponse { ids }))
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

pub fn router() -> Router<ServerState, Body> {
    Router::new()
        .route("/pronounce", post(pronounce_lookup_handler))
        .route("/example", get(get_random_example_handler))
        .route("/analyze", post(speech_recognition_handler))
        .route("/recordings", get(list_recordings_handler))
        .route("/recordings/:id", get(get_recording_handler))
        .route("/recordings/:id", delete(delete_recording_handler))
        .route("/recordings/:id/audio", get(get_recording_audio_handler))
        .route("/recordings/:id/feedback", post(create_feedback_handler))
        .route("/recordings/:id/feedback", get(get_feedbacks_handler))
        .route("/leaderboard", get(leaderboard_handler))
        .route("/questions", post(create_question_handler))
        .route("/questions", get(list_questions_handler))
        .route("/questions/batch", post(create_questions_batch_handler))
        .route("/questions/:id", get(get_question_handler))
        .route("/questions/:id", delete(delete_question_by_creator_handler))
        .route("/questions/:id/submissions", get(get_question_submissions_handler))
        .route("/admin/verify", post(admin_verify_handler))
        .route("/admin/submissions/recent", get(admin_recent_submissions_handler))
        .route("/admin/questions", get(admin_list_questions_handler))
        .route("/admin/questions/:id", delete(admin_delete_question_handler))
        .route("/admin/recordings/:id", delete(admin_delete_recording_handler))
}
