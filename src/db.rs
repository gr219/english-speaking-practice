use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const DEFAULT_ADMIN_PASSWORD: &str = "CozyLan94@";

pub struct Database {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewRecording {
    pub user_id: String,
    pub text: String,
    pub score: f64,
    pub words_json: String,
    pub fluency_json: Option<String>,
    pub grammar_json: Option<String>,
    pub ielts_band: Option<f64>,
    pub example_text: Option<String>,
    pub speaker_name: Option<String>,
    pub audio_path: String,
    pub question_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recording {
    pub id: String,
    pub user_id: String,
    pub text: String,
    pub score: f64,
    pub words_json: String,
    pub fluency_json: Option<String>,
    pub grammar_json: Option<String>,
    pub ielts_band: Option<f64>,
    pub example_text: Option<String>,
    pub speaker_name: Option<String>,
    pub audio_path: String,
    pub created_at: String,
    pub question_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSummary {
    pub id: String,
    pub text: String,
    pub score: f64,
    pub speaker_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    pub id: String,
    pub text: String,
    pub score: f64,
    pub speaker_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    pub id: String,
    pub creator_id: String,
    pub text: String,
    pub time_limit_secs: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionEntry {
    pub id: String,
    pub speaker_name: Option<String>,
    pub score: f64,
    pub fluency_score: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionSummary {
    pub id: String,
    pub text: String,
    pub time_limit_secs: i32,
    pub created_at: String,
    pub submission_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feedback {
    pub id: String,
    pub recording_id: String,
    pub question_id: String,
    pub feedback_text: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionWithCreator {
    pub id: String,
    pub creator_id: String,
    pub text: String,
    pub time_limit_secs: i32,
    pub created_at: String,
    pub submission_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentSubmission {
    pub id: String,
    pub speaker_name: Option<String>,
    pub score: f64,
    pub question_id: Option<String>,
    pub question_text: Option<String>,
    pub created_at: String,
}

impl Database {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS recordings (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                text TEXT,
                score REAL,
                words_json TEXT,
                example_text TEXT,
                audio_path TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);
            CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at);",
        )?;

        // Migrate: add fluency_json column if missing
        let has_fluency: bool = conn
            .prepare("SELECT fluency_json FROM recordings LIMIT 0")
            .is_ok();
        if !has_fluency {
            conn.execute_batch("ALTER TABLE recordings ADD COLUMN fluency_json TEXT;")?;
        }

        // Migrate: add speaker_name column if missing
        let has_speaker: bool = conn
            .prepare("SELECT speaker_name FROM recordings LIMIT 0")
            .is_ok();
        if !has_speaker {
            conn.execute_batch("ALTER TABLE recordings ADD COLUMN speaker_name TEXT;")?;
        }

        // Migrate: add question_id column if missing
        let has_question_id: bool = conn
            .prepare("SELECT question_id FROM recordings LIMIT 0")
            .is_ok();
        if !has_question_id {
            conn.execute_batch("ALTER TABLE recordings ADD COLUMN question_id TEXT;")?;
        }

        // Migrate: add grammar_json column if missing
        let has_grammar: bool = conn
            .prepare("SELECT grammar_json FROM recordings LIMIT 0")
            .is_ok();
        if !has_grammar {
            conn.execute_batch("ALTER TABLE recordings ADD COLUMN grammar_json TEXT;")?;
        }

        // Migrate: add ielts_band column if missing
        let has_ielts: bool = conn
            .prepare("SELECT ielts_band FROM recordings LIMIT 0")
            .is_ok();
        if !has_ielts {
            conn.execute_batch("ALTER TABLE recordings ADD COLUMN ielts_band REAL;")?;
        }

        // Create questions table
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS questions (
                id TEXT PRIMARY KEY,
                creator_id TEXT NOT NULL,
                text TEXT NOT NULL,
                time_limit_secs INTEGER NOT NULL DEFAULT 120,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE INDEX IF NOT EXISTS idx_questions_creator_id ON questions(creator_id);"
        )?;

        // Create admin_password table
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS admin_password (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                password TEXT NOT NULL
            );"
        )?;
        // Insert default password if not exists
        let has_password: bool = conn
            .query_row("SELECT COUNT(*) FROM admin_password", [], |row| row.get::<_, i32>(0))
            .unwrap_or(0) > 0;
        if !has_password {
            conn.execute(
                "INSERT INTO admin_password (id, password) VALUES (1, ?1)",
                params![DEFAULT_ADMIN_PASSWORD],
            )?;
        }

        // Create feedbacks table
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS feedbacks (
                id TEXT PRIMARY KEY,
                recording_id TEXT NOT NULL,
                question_id TEXT NOT NULL,
                feedback_text TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                FOREIGN KEY (recording_id) REFERENCES recordings(id),
                FOREIGN KEY (question_id) REFERENCES questions(id)
            );
            CREATE INDEX IF NOT EXISTS idx_feedbacks_recording_id ON feedbacks(recording_id);
            CREATE INDEX IF NOT EXISTS idx_feedbacks_question_id ON feedbacks(question_id);"
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn insert_recording(&self, recording: &NewRecording) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO recordings (id, user_id, text, score, words_json, fluency_json, grammar_json, ielts_band, example_text, speaker_name, audio_path, question_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                id,
                recording.user_id,
                recording.text,
                recording.score,
                recording.words_json,
                recording.fluency_json,
                recording.grammar_json,
                recording.ielts_band,
                recording.example_text,
                recording.speaker_name,
                recording.audio_path,
                recording.question_id,
            ],
        )?;
        Ok(id)
    }

    pub fn get_recording(&self, id: &str) -> Result<Option<Recording>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, user_id, text, score, words_json, fluency_json, grammar_json, ielts_band, example_text, speaker_name, audio_path, created_at, question_id
             FROM recordings WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Recording {
                id: row.get(0)?,
                user_id: row.get(1)?,
                text: row.get(2)?,
                score: row.get(3)?,
                words_json: row.get(4)?,
                fluency_json: row.get(5)?,
                grammar_json: row.get(6)?,
                ielts_band: row.get(7)?,
                example_text: row.get(8)?,
                speaker_name: row.get(9)?,
                audio_path: row.get(10)?,
                created_at: row.get(11)?,
                question_id: row.get(12)?,
            })
        })?;
        match rows.next() {
            Some(Ok(recording)) => Ok(Some(recording)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn list_recordings(&self, user_id: &str) -> Result<Vec<RecordingSummary>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, text, score, speaker_name, created_at FROM recordings
             WHERE user_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(RecordingSummary {
                id: row.get(0)?,
                text: row.get(1)?,
                score: row.get(2)?,
                speaker_name: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete_recording(&self, id: &str, user_id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let affected = conn.execute(
            "DELETE FROM recordings WHERE id = ?1 AND user_id = ?2",
            params![id, user_id],
        )?;
        Ok(affected > 0)
    }

    pub fn get_leaderboard(&self, limit: u32) -> Result<Vec<LeaderboardEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, text, score, speaker_name, created_at FROM recordings
             ORDER BY score DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(LeaderboardEntry {
                id: row.get(0)?,
                text: row.get(1)?,
                score: row.get(2)?,
                speaker_name: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn insert_question(&self, creator_id: &str, text: &str, time_limit_secs: i32) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO questions (id, creator_id, text, time_limit_secs)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, creator_id, text, time_limit_secs],
        )?;
        Ok(id)
    }

    pub fn get_question(&self, id: &str) -> Result<Option<Question>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, creator_id, text, time_limit_secs, created_at
             FROM questions WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Question {
                id: row.get(0)?,
                creator_id: row.get(1)?,
                text: row.get(2)?,
                time_limit_secs: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        match rows.next() {
            Some(Ok(question)) => Ok(Some(question)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn get_question_submissions(&self, question_id: &str) -> Result<Vec<SubmissionEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, speaker_name, score, fluency_json, created_at
             FROM recordings
             WHERE question_id = ?1
             ORDER BY score DESC",
        )?;
        let rows = stmt.query_map(params![question_id], |row| {
            let fluency_json: Option<String> = row.get(3)?;
            let fluency_score = fluency_json.and_then(|json| {
                serde_json::from_str::<serde_json::Value>(&json)
                    .ok()
                    .and_then(|v| v.get("score").and_then(|s| s.as_f64()))
            });
            Ok(SubmissionEntry {
                id: row.get(0)?,
                speaker_name: row.get(1)?,
                score: row.get(2)?,
                fluency_score,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn list_questions(&self, creator_id: &str) -> Result<Vec<QuestionSummary>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT q.id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id) as submission_count
             FROM questions q
             WHERE q.creator_id = ?1
             ORDER BY q.created_at DESC",
        )?;
        let rows = stmt.query_map(params![creator_id], |row| {
            Ok(QuestionSummary {
                id: row.get(0)?,
                text: row.get(1)?,
                time_limit_secs: row.get(2)?,
                created_at: row.get(3)?,
                submission_count: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    // --- Admin methods ---

    pub fn verify_admin_password(&self, password: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let stored: String = conn.query_row(
            "SELECT password FROM admin_password WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        Ok(stored == password)
    }

    pub fn list_all_questions(&self) -> Result<Vec<QuestionWithCreator>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT q.id, q.creator_id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id) as submission_count
             FROM questions q
             ORDER BY q.created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(QuestionWithCreator {
                id: row.get(0)?,
                creator_id: row.get(1)?,
                text: row.get(2)?,
                time_limit_secs: row.get(3)?,
                created_at: row.get(4)?,
                submission_count: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete_question(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        // Delete associated feedbacks first
        conn.execute("DELETE FROM feedbacks WHERE question_id = ?1", params![id])?;
        let affected = conn.execute("DELETE FROM questions WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    pub fn delete_question_by_creator(&self, id: &str, creator_id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        // Verify ownership
        let is_owner: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM questions WHERE id = ?1 AND creator_id = ?2",
                params![id, creator_id],
                |row| row.get::<_, i32>(0),
            )
            .unwrap_or(0) > 0;
        if !is_owner {
            return Ok(false);
        }
        conn.execute("DELETE FROM feedbacks WHERE question_id = ?1", params![id])?;
        conn.execute("DELETE FROM questions WHERE id = ?1", params![id])?;
        Ok(true)
    }

    pub fn delete_recording_admin(&self, id: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        // Get audio path before delete
        let audio_path: Option<String> = conn
            .query_row("SELECT audio_path FROM recordings WHERE id = ?1", params![id], |row| row.get(0))
            .ok();
        // Delete associated feedbacks
        conn.execute("DELETE FROM feedbacks WHERE recording_id = ?1", params![id])?;
        conn.execute("DELETE FROM recordings WHERE id = ?1", params![id])?;
        Ok(audio_path)
    }

    // --- Batch question creation ---

    pub fn insert_questions_batch(&self, creator_id: &str, questions: &[(String, i32)]) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut ids = Vec::new();
        for (text, time_limit_secs) in questions {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO questions (id, creator_id, text, time_limit_secs)
                 VALUES (?1, ?2, ?3, ?4)",
                params![id, creator_id, text, time_limit_secs],
            )?;
            ids.push(id);
        }
        Ok(ids)
    }

    // --- Feedback methods ---

    pub fn insert_feedback(&self, recording_id: &str, question_id: &str, feedback_text: &str, created_by: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO feedbacks (id, recording_id, question_id, feedback_text, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, recording_id, question_id, feedback_text, created_by],
        )?;
        Ok(id)
    }

    pub fn get_feedbacks_for_recording(&self, recording_id: &str) -> Result<Vec<Feedback>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, recording_id, question_id, feedback_text, created_by, created_at
             FROM feedbacks WHERE recording_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![recording_id], |row| {
            Ok(Feedback {
                id: row.get(0)?,
                recording_id: row.get(1)?,
                question_id: row.get(2)?,
                feedback_text: row.get(3)?,
                created_by: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn update_ielts_band(&self, id: &str, ielts_band: f64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE recordings SET ielts_band = ?1 WHERE id = ?2",
            params![ielts_band, id],
        )?;
        Ok(())
    }

    pub fn get_recent_submissions(&self, since: &str) -> Result<Vec<RecentSubmission>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT r.id, r.speaker_name, r.score, r.question_id, q.text, r.created_at
             FROM recordings r
             LEFT JOIN questions q ON r.question_id = q.id
             WHERE r.created_at > ?1
             ORDER BY r.created_at DESC
             LIMIT 50",
        )?;
        let rows = stmt.query_map(params![since], |row| {
            Ok(RecentSubmission {
                id: row.get(0)?,
                speaker_name: row.get(1)?,
                score: row.get(2)?,
                question_id: row.get(3)?,
                question_text: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }
}
