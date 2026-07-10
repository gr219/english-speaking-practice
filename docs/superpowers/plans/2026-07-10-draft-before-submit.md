# Draft-Before-Submit for Question Answers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recordings made via question links are saved as drafts (not visible to admin/questioner) until the student explicitly clicks Submit. Re-recording deletes the draft from the server.

**Architecture:** Add a `submitted` boolean column to the `recordings` table (default `1` for backward compat). When `/api/analyze` is called with a `question_id`, the recording is saved with `submitted = 0`. A new `POST /api/recordings/:id/submit` endpoint flips it to `1`. All queries that surface question submissions filter on `submitted = 1`. The frontend calls the submit endpoint on "Submit" click and calls the existing delete endpoint on "Re-record".

**Tech Stack:** Rust (Axum, rusqlite), TypeScript (React, Vite)

## Global Constraints

- SQLite database with migration-on-startup pattern (column existence checks)
- Axum router using `Router<ServerState, Body>` pattern
- Frontend uses custom `useRecorder` hook that returns `{ result, audioBlob, reset, ... }`
- All API calls go through `frontend/src/lib/api.ts`
- Existing recordings without `question_id` must remain unaffected (always `submitted = 1`)

---

### Task 1: Add `submitted` column to DB and filter queries

**Files:**
- Modify: `src/db.rs` — add migration, update `NewRecording`, update all relevant queries

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `NewRecording.submitted: bool` field
  - `Database::submit_recording(&self, id: &str, user_id: &str) -> Result<bool>` method
  - All submission/leaderboard/listing queries filter on `submitted = 1`

- [ ] **Step 1: Add `submitted` field to `NewRecording` struct**

In `src/db.rs`, add the field to `NewRecording`:

```rust
// In the NewRecording struct, add after `question_id`:
pub submitted: bool,
```

- [ ] **Step 2: Add migration for `submitted` column**

In `src/db.rs`, inside `Database::new()`, add after the `ielts_band` migration block (after line 174):

```rust
// Migrate: add submitted column if missing (default 1 = submitted for existing recordings)
let has_submitted: bool = conn
    .prepare("SELECT submitted FROM recordings LIMIT 0")
    .is_ok();
if !has_submitted {
    conn.execute_batch("ALTER TABLE recordings ADD COLUMN submitted INTEGER NOT NULL DEFAULT 1;")?;
}
```

- [ ] **Step 3: Update `insert_recording` to include `submitted`**

Replace the `insert_recording` method:

```rust
pub fn insert_recording(&self, recording: &NewRecording) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let conn = self.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO recordings (id, user_id, text, score, words_json, fluency_json, grammar_json, ielts_band, example_text, speaker_name, audio_path, question_id, submitted)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
            recording.submitted,
        ],
    )?;
    Ok(id)
}
```

- [ ] **Step 4: Add `submit_recording` method**

Add this method to the `impl Database` block:

```rust
pub fn submit_recording(&self, id: &str, user_id: &str) -> Result<bool> {
    let conn = self.conn.lock().unwrap();
    let affected = conn.execute(
        "UPDATE recordings SET submitted = 1 WHERE id = ?1 AND user_id = ?2 AND submitted = 0",
        params![id, user_id],
    )?;
    Ok(affected > 0)
}
```

- [ ] **Step 5: Filter `get_question_submissions` to only return submitted recordings**

Update the SQL query in `get_question_submissions`:

```rust
// Change the WHERE clause from:
//   WHERE question_id = ?1
// to:
"SELECT id, speaker_name, score, fluency_json, created_at
 FROM recordings
 WHERE question_id = ?1 AND submitted = 1
 ORDER BY score DESC",
```

- [ ] **Step 6: Filter `get_recent_submissions` to only return submitted recordings**

Update the SQL query in `get_recent_submissions`:

```rust
// Change the WHERE clause from:
//   WHERE r.created_at > ?1
// to:
"SELECT r.id, r.speaker_name, r.score, r.question_id, q.text, r.created_at
 FROM recordings r
 LEFT JOIN questions q ON r.question_id = q.id
 WHERE r.created_at > ?1 AND r.submitted = 1
 ORDER BY r.created_at DESC
 LIMIT 50",
```

- [ ] **Step 7: Filter `list_all_questions` submission count to only count submitted**

Update the subquery in `list_all_questions`:

```rust
// Change the submission_count subquery from:
//   (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id)
// to:
"SELECT q.id, q.creator_id, q.text, q.time_limit_secs, q.created_at,
        (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id AND r.submitted = 1) as submission_count
 FROM questions q
 ORDER BY q.created_at DESC",
```

- [ ] **Step 8: Filter `list_questions` submission count to only count submitted**

Update the subquery in `list_questions`:

```rust
// Change the submission_count subquery from:
//   (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id)
// to:
"SELECT q.id, q.text, q.time_limit_secs, q.created_at,
        (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id AND r.submitted = 1) as submission_count
 FROM questions q
 WHERE q.creator_id = ?1
 ORDER BY q.created_at DESC",
```

- [ ] **Step 9: Verify it compiles**

Run: `cargo check 2>&1 | head -30`

Expected: Compilation error in `api.rs` where `NewRecording` is constructed (missing `submitted` field). This is expected — Task 2 fixes it.

- [ ] **Step 10: Commit**

```bash
git add src/db.rs
git commit -m "feat: add submitted column and filter question submissions

Add 'submitted' column to recordings table (default 1 for backward
compat). Question submissions, recent submissions, and submission
counts now only include submitted=1 recordings. Add submit_recording
method for explicit submission.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Add submit endpoint and set `submitted=false` for question recordings

**Files:**
- Modify: `src/api.rs` — set `submitted: false` when `question_id` is present, add submit handler, register route

**Interfaces:**
- Consumes: `Database::submit_recording(&self, id: &str, user_id: &str) -> Result<bool>` from Task 1
- Produces: `POST /api/recordings/:id/submit` endpoint (requires `X-User-Id` header, returns 200 on success)

- [ ] **Step 1: Set `submitted` based on `question_id` presence in `speech_recognition_handler`**

In `src/api.rs`, in the `speech_recognition_handler` function, update the `NewRecording` construction (around line 214-226). Change it to:

```rust
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
    submitted: question_id.is_none(), // draft if answering a question
    question_id,
};
```

- [ ] **Step 2: Add `submit_recording_handler` function**

Add this handler function in `src/api.rs` (before the `router()` function):

```rust
async fn submit_recording_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let user_id = extract_user_id(&headers).ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(ErrorResponse {
        error: "User ID is required.".to_string(),
    })))?;

    let submitted = state
        .db
        .submit_recording(&id, &user_id)
        .map_err(|e| {
            error!(recording_id = %id, user_id = %user_id, error = %e, "Failed to submit recording");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to submit recording.".to_string(),
            }))
        })?;

    if submitted {
        info!(recording_id = %id, user_id = %user_id, "Recording submitted");
        Ok(Json(serde_json::json!({ "ok": true })))
    } else {
        Err((StatusCode::NOT_FOUND, Json(ErrorResponse {
            error: "Recording not found or already submitted.".to_string(),
        })))
    }
}
```

- [ ] **Step 3: Register the submit route**

In `src/api.rs`, inside the `router()` function, add after the `/recordings/:id/feedback` GET route:

```rust
.route("/recordings/:id/submit", post(submit_recording_handler))
```

- [ ] **Step 4: Build and verify compilation**

Run: `cargo check`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/api.rs
git commit -m "feat: add POST /recordings/:id/submit endpoint

Question recordings are saved as drafts (submitted=false). Students
must explicitly call the submit endpoint to make them visible.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Frontend — add `submitRecording` and `deleteDraftRecording` to API client

**Files:**
- Modify: `frontend/src/lib/api.ts` — add two new API methods

**Interfaces:**
- Consumes: `POST /api/recordings/:id/submit` from Task 2, `DELETE /api/recordings/:id` (existing)
- Produces:
  - `api.submitRecording(id: string, userId: string): Promise<void>` 
  - `api.deleteDraftRecording(id: string, userId: string): Promise<void>`

- [ ] **Step 1: Add `submitRecording` method to the api object**

In `frontend/src/lib/api.ts`, add inside the `api` object (after the `getQuestionSubmissions` method):

```typescript
async submitRecording(id: string, userId: string): Promise<void> {
  const res = await fetch(`/api/recordings/${id}/submit`, {
    method: 'POST',
    headers: { 'X-User-Id': userId },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Failed to submit recording');
  }
},

async deleteDraftRecording(id: string, userId: string): Promise<void> {
  const res = await fetch(`/api/recordings/${id}`, {
    method: 'DELETE',
    headers: { 'X-User-Id': userId },
  });
  // Ignore 404 — draft may have already been cleaned up
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Failed to delete draft recording');
  }
},
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add submitRecording and deleteDraftRecording API methods

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Frontend — update QuestionAnswerView to submit on click and cleanup on re-record

**Files:**
- Modify: `frontend/src/components/QuestionAnswerView.tsx` — call submit endpoint on Submit, delete draft on Re-record, add audio playback in preview
- Modify: `frontend/src/hooks/useRecorder.ts` — expose `userId` or accept cleanup callback (not needed — `QuestionAnswerView` handles it)

**Interfaces:**
- Consumes: `api.submitRecording(id, userId)` and `api.deleteDraftRecording(id, userId)` from Task 3
- Produces: Updated UI behavior — Submit calls server, Re-record deletes draft, preview shows audio player

- [ ] **Step 1: Add `useUserId` import and state for submission**

In `frontend/src/components/QuestionAnswerView.tsx`, update the imports at line 1-4:

```typescript
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api, { Question } from '../lib/api';
import { useRecorder } from '../hooks/useRecorder';
import { useUserId } from '../hooks/useUserId';
import RecordButton from './RecordButton';
import WordPills from './WordPills';
```

- [ ] **Step 2: Add `userId` hook call and `isSubmitting` state**

Inside the component function, after the existing state declarations (after line 16), add:

```typescript
const userId = useUserId();
const [isSubmitting, setIsSubmitting] = useState(false);
```

- [ ] **Step 3: Update `handleSubmit` to call the server**

Replace the `handleSubmit` function (lines 79-83):

```typescript
const handleSubmit = async () => {
  if (!result) return;
  setIsSubmitting(true);
  try {
    await api.submitRecording(result.id, userId);
    setHasSubmitted(true);
  } catch {
    alert('Failed to submit. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};
```

- [ ] **Step 4: Update `handleReRecord` to delete the draft from server**

Replace the `handleReRecord` function (lines 85-88):

```typescript
const handleReRecord = async () => {
  if (result) {
    // Clean up draft recording from server (fire-and-forget)
    api.deleteDraftRecording(result.id, userId).catch(() => {});
  }
  reset();
  setHasSubmitted(false);
};
```

- [ ] **Step 5: Add audio playback to the preview section**

In the preview section (the `{result && !hasSubmitted && (` block, around line 259-283), add an audio player after the score display and before the buttons. Replace the entire block:

```typescript
{result && !hasSubmitted && (
  <div className="space-y-4">
    <div className="p-4 bg-gray-50 dark:bg-zinc-700 rounded-lg">
      <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Preview:</div>
      <div className="text-zinc-800 dark:text-zinc-200 mb-2">{result.text}</div>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        Score: <span className="font-semibold">{result.score.toFixed(1)}%</span>
      </div>
    </div>
    {audioBlob && (
      <div>
        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Listen to your recording:</div>
        <audio src={URL.createObjectURL(audioBlob)} controls className="w-full" />
      </div>
    )}
    <div className="flex gap-2">
      <button
        onClick={handleReRecord}
        disabled={isSubmitting}
        className="flex-1 px-4 py-2 text-sm bg-gray-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50"
      >
        Re-record
      </button>
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Build the frontend to verify**

Run: `cd frontend && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/QuestionAnswerView.tsx
git commit -m "feat: submit recording only on explicit Submit click

- Submit button calls POST /recordings/:id/submit
- Re-record deletes the draft recording from server
- Preview section shows audio playback before submission
- Buttons disabled during submission

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Full integration build and smoke test

**Files:**
- No new files — verification only

**Interfaces:**
- Consumes: All changes from Tasks 1-4

- [ ] **Step 1: Full Rust build**

Run: `cargo build`

Expected: Build succeeds.

- [ ] **Step 2: Full frontend build**

Run: `cd frontend && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit all remaining changes (if any)**

```bash
git add -A
git status
```

If there are uncommitted changes, commit them. Otherwise, no action needed.
