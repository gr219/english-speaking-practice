# Writing Feedback Track Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow teachers to provide "track changes" feedback on writing submissions — deletions shown in red strikethrough, additions in Azure blue.

**Architecture:** New backend endpoint computes word-level diff (using `similar` crate) between original and teacher-edited text, stores as structured JSON in a new `diff_json` column. Frontend shows an editing modal for writing submissions and renders the diff with colored spans.

**Tech Stack:** Rust (axum, similar, serde_json, rusqlite), React 18, TypeScript, Tailwind CSS

## Global Constraints

- Rust edition 2021, axum 0.6.x
- React 18, react-router-dom 6.x, Tailwind 3.4
- SQLite via rusqlite 0.31
- No new frontend dependencies required
- Existing feedback flow for non-writing questions must remain unchanged

---

### Task 1: Backend — Add `similar` crate and `diff_json` column

**Files:**
- Modify: `Cargo.toml:21` (add dependency)
- Modify: `src/db.rs:95-103` (update `Feedback` struct)
- Modify: `src/db.rs:240-254` (update table creation + migration)
- Modify: `src/db.rs:653-681` (update insert and query methods)

**Interfaces:**
- Consumes: nothing (foundational task)
- Produces:
  - `Feedback` struct with new field: `pub diff_json: Option<String>`
  - `Database::insert_diff_feedback(&self, recording_id: &str, question_id: &str, feedback_text: &str, diff_json: &str, created_by: &str) -> Result<String>`
  - Updated `get_feedbacks_for_recording` returns `diff_json` field

- [ ] **Step 1: Add `similar` crate to Cargo.toml**

In `Cargo.toml`, add after the `wav` line:

```toml
similar = "2"
```

- [ ] **Step 2: Update `Feedback` struct in `src/db.rs`**

Add `diff_json` field to the `Feedback` struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feedback {
    pub id: String,
    pub recording_id: String,
    pub question_id: String,
    pub feedback_text: String,
    pub diff_json: Option<String>,
    pub created_by: String,
    pub created_at: String,
}
```

- [ ] **Step 3: Update table creation to add `diff_json` column**

In `src/db.rs`, update the `CREATE TABLE IF NOT EXISTS feedbacks` statement to include `diff_json TEXT`:

```rust
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS feedbacks (
                id TEXT PRIMARY KEY,
                recording_id TEXT NOT NULL,
                question_id TEXT NOT NULL,
                feedback_text TEXT NOT NULL,
                diff_json TEXT,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                FOREIGN KEY (recording_id) REFERENCES recordings(id),
                FOREIGN KEY (question_id) REFERENCES questions(id)
            );
            CREATE INDEX IF NOT EXISTS idx_feedbacks_recording_id ON feedbacks(recording_id);
            CREATE INDEX IF NOT EXISTS idx_feedbacks_question_id ON feedbacks(question_id);"
        )?;
```

Also add a migration after the table creation block (to handle existing databases):

```rust
        // Migration: add diff_json column if not exists
        let _ = conn.execute_batch("ALTER TABLE feedbacks ADD COLUMN diff_json TEXT;");
```

- [ ] **Step 4: Add `insert_diff_feedback` method to `Database`**

Add a new method after `insert_feedback`:

```rust
    pub fn insert_diff_feedback(&self, recording_id: &str, question_id: &str, feedback_text: &str, diff_json: &str, created_by: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO feedbacks (id, recording_id, question_id, feedback_text, diff_json, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, recording_id, question_id, feedback_text, diff_json, created_by],
        )?;
        Ok(id)
    }
```

- [ ] **Step 5: Update `get_feedbacks_for_recording` to include `diff_json`**

```rust
    pub fn get_feedbacks_for_recording(&self, recording_id: &str) -> Result<Vec<Feedback>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, recording_id, question_id, feedback_text, diff_json, created_by, created_at
             FROM feedbacks WHERE recording_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![recording_id], |row| {
            Ok(Feedback {
                id: row.get(0)?,
                recording_id: row.get(1)?,
                question_id: row.get(2)?,
                feedback_text: row.get(3)?,
                diff_json: row.get(4)?,
                created_by: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }
```

- [ ] **Step 6: Verify it compiles**

Run: `cargo build`
Expected: Successful compilation (warnings are OK)

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml Cargo.lock src/db.rs
git commit -m "feat: add similar crate and diff_json column to feedbacks table"
```

---

### Task 2: Backend — New diff-feedback endpoint

**Files:**
- Modify: `src/api.rs:775-806` (add new handler and request struct)
- Modify: `src/api.rs:847-860` (register new route)

**Interfaces:**
- Consumes: `Database::insert_diff_feedback` from Task 1
- Produces: `POST /api/recordings/:id/diff-feedback` endpoint
  - Request: `{ original_text: String, edited_text: String, comment: Option<String>, question_id: String }`
  - Response: `{ id: String, diff_json: Vec<DiffOp> }` where `DiffOp = { op: String, text: String }`

- [ ] **Step 1: Add the request/response structs and diff computation in `src/api.rs`**

Add these after the existing `CreateFeedbackRequest` struct (around line 781):

```rust
#[derive(Deserialize)]
pub struct CreateDiffFeedbackRequest {
    pub original_text: String,
    pub edited_text: String,
    pub comment: Option<String>,
    pub question_id: String,
}

#[derive(Serialize)]
pub struct DiffOp {
    pub op: String,
    pub text: String,
}

fn compute_word_diff(original: &str, edited: &str) -> Vec<DiffOp> {
    use similar::{ChangeTag, TextDiff};

    let diff = TextDiff::from_words(original, edited);
    let mut ops: Vec<DiffOp> = Vec::new();

    for change in diff.iter_all_changes() {
        let op_str = match change.tag() {
            ChangeTag::Equal => "equal",
            ChangeTag::Delete => "delete",
            ChangeTag::Insert => "insert",
        };
        let text = change.value().to_string();

        // Merge consecutive ops of the same type
        if let Some(last) = ops.last_mut() {
            if last.op == op_str {
                last.text.push_str(&text);
                continue;
            }
        }
        ops.push(DiffOp {
            op: op_str.to_string(),
            text,
        });
    }
    ops
}
```

- [ ] **Step 2: Add the handler function**

Add after `create_feedback_handler`:

```rust
async fn create_diff_feedback_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Path(recording_id): Path<String>,
    Json(req): Json<CreateDiffFeedbackRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let created_by = extract_user_id(&headers).unwrap_or_default();
    let comment = req.comment.unwrap_or_default();

    let diff_ops = compute_word_diff(&req.original_text, &req.edited_text);
    let diff_json = serde_json::to_string(&diff_ops)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let id = state
        .db
        .insert_diff_feedback(&recording_id, &req.question_id, &comment, &diff_json, &created_by)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({ "id": id, "diff_json": diff_ops })))
}
```

- [ ] **Step 3: Register the new route**

In the `router()` function, add after the existing feedback routes (line ~858):

```rust
        .route("/recordings/:id/diff-feedback", post(create_diff_feedback_handler))
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo build`
Expected: Successful compilation

- [ ] **Step 5: Commit**

```bash
git add src/api.rs
git commit -m "feat: add POST /recordings/:id/diff-feedback endpoint with word-level diff"
```

---

### Task 3: Backend — Include `text` in submissions response for writing questions

**Files:**
- Modify: `src/db.rs:72-81` (update `SubmissionEntry` struct)
- Modify: `src/db.rs:404-432` (update query)

**Interfaces:**
- Consumes: nothing new
- Produces: `SubmissionEntry` now has `pub text: Option<String>` field, populated for writing submissions

- [ ] **Step 1: Add `text` field to `SubmissionEntry` struct**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionEntry {
    pub id: String,
    pub speaker_name: Option<String>,
    pub score: f64,
    pub fluency_score: Option<f64>,
    pub created_at: String,
    pub feedback_text: Option<String>,
    pub word_count: Option<i64>,
    pub text: Option<String>,
}
```

- [ ] **Step 2: Update the `get_question_submissions` query**

Update the SQL to include `r.text` and the mapping:

```rust
    pub fn get_question_submissions(&self, question_id: &str) -> Result<Vec<SubmissionEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT r.id, r.speaker_name, r.score, r.fluency_json, r.created_at,
                    (SELECT f.feedback_text FROM feedbacks f WHERE f.recording_id = r.id ORDER BY f.created_at DESC LIMIT 1) as feedback_text,
                    CASE WHEN r.audio_path = '' THEN (length(trim(r.text)) - length(replace(trim(r.text), ' ', '')) + 1) ELSE NULL END as word_count,
                    CASE WHEN r.audio_path = '' THEN r.text ELSE NULL END as text
             FROM recordings r
             WHERE r.question_id = ?1 AND r.submitted = 1
             ORDER BY r.created_at DESC",
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
                feedback_text: row.get(5)?,
                word_count: row.get(6)?,
                text: row.get(7)?,
            })
        })?;
        rows.collect()
    }
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo build`
Expected: Successful compilation

- [ ] **Step 4: Commit**

```bash
git add src/db.rs
git commit -m "feat: include writing text in submissions response"
```

---

### Task 4: Frontend — Update API client types and add `createDiffFeedback`

**Files:**
- Modify: `frontend/src/lib/api.ts:83-91` (update `SubmissionEntry`)
- Modify: `frontend/src/lib/api.ts:387-394` (update `Feedback` interface)
- Modify: `frontend/src/lib/api.ts:278-296` (add new API method)

**Interfaces:**
- Consumes: Backend endpoints from Tasks 2 and 3
- Produces:
  - `DiffOp` type: `{ op: 'equal' | 'delete' | 'insert'; text: string }`
  - `SubmissionEntry.text: string | null`
  - `Feedback.diff_json: string | null`
  - `api.createDiffFeedback(recordingId, questionId, originalText, editedText, comment, userId): Promise<{ id: string; diff_json: DiffOp[] }>`

- [ ] **Step 1: Add `DiffOp` interface**

Add after the existing `Feedback` interface (around line 395):

```typescript
export interface DiffOp {
  op: 'equal' | 'delete' | 'insert';
  text: string;
}
```

- [ ] **Step 2: Update `SubmissionEntry` to include `text`**

```typescript
export interface SubmissionEntry {
  id: string;
  speaker_name: string | null;
  score: number;
  fluency_score: number | null;
  created_at: string;
  feedback_text: string | null;
  word_count: number | null;
  text: string | null;
}
```

- [ ] **Step 3: Update `Feedback` interface to include `diff_json`**

```typescript
export interface Feedback {
  id: string;
  recording_id: string;
  question_id: string;
  feedback_text: string;
  diff_json: string | null;
  created_by: string;
  created_at: string;
}
```

- [ ] **Step 4: Add `createDiffFeedback` method**

Add after the existing `createFeedback` method:

```typescript
  async createDiffFeedback(
    recordingId: string,
    questionId: string,
    originalText: string,
    editedText: string,
    comment: string,
    userId: string
  ): Promise<{ id: string; diff_json: DiffOp[] }> {
    const res = await fetch(`/api/recordings/${recordingId}/diff-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        original_text: originalText,
        edited_text: editedText,
        comment: comment || undefined,
        question_id: questionId,
      }),
    });
    if (!res.ok) throw new Error('Failed to submit diff feedback');
    return res.json();
  },
```

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (or only pre-existing unrelated ones)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add DiffOp type and createDiffFeedback API method"
```

---

### Task 5: Frontend — DiffView component

**Files:**
- Create: `frontend/src/components/DiffView.tsx`

**Interfaces:**
- Consumes: `DiffOp` type from `../lib/api`
- Produces: `<DiffView ops={DiffOp[]} />` component

- [ ] **Step 1: Create `DiffView.tsx`**

```tsx
import { DiffOp } from '../lib/api';

interface DiffViewProps {
  ops: DiffOp[];
}

export default function DiffView({ ops }: DiffViewProps) {
  return (
    <div className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
      {ops.map((op, i) => {
        switch (op.op) {
          case 'equal':
            return <span key={i}>{op.text}</span>;
          case 'delete':
            return (
              <span key={i} className="text-red-500 line-through bg-red-50 dark:bg-red-900/20">
                {op.text}
              </span>
            );
          case 'insert':
            return (
              <span key={i} className="text-[#0078D4] bg-blue-50 dark:bg-blue-900/20">
                {op.text}
              </span>
            );
          default:
            return <span key={i}>{op.text}</span>;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DiffView.tsx
git commit -m "feat: add DiffView component for rendering tracked changes"
```

---

### Task 6: Frontend — Track Changes Feedback Modal for writing submissions

**Files:**
- Create: `frontend/src/components/TrackChangesFeedbackModal.tsx`

**Interfaces:**
- Consumes: `api.createDiffFeedback`, `DiffOp` from `../lib/api`
- Produces: `<TrackChangesFeedbackModal submissionId originalText questionId userId onClose onSent />` component

- [ ] **Step 1: Create `TrackChangesFeedbackModal.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface TrackChangesFeedbackModalProps {
  submissionId: string;
  originalText: string;
  speakerName: string | null;
  questionId: string;
  userId: string;
  onClose: () => void;
  onSent: () => void;
}

export default function TrackChangesFeedbackModal({
  submissionId,
  originalText,
  speakerName,
  questionId,
  userId,
  onClose,
  onSent,
}: TrackChangesFeedbackModalProps) {
  const [editedText, setEditedText] = useState(originalText);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSend = async () => {
    if (editedText === originalText && !comment.trim()) {
      setError('Please make changes to the text or add a comment.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.createDiffFeedback(submissionId, questionId, originalText, editedText, comment.trim(), userId);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
          Edit & Give Feedback
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          {speakerName || 'Anonymous'}'s submission — edit the text to show corrections
        </p>

        <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
          Student's answer (edit to mark corrections):
        </label>
        <textarea
          ref={textareaRef}
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y mb-4"
        />

        <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
          General comment (optional):
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Add a general comment..."
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y mb-4"
        />

        {error && (
          <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TrackChangesFeedbackModal.tsx
git commit -m "feat: add TrackChangesFeedbackModal for writing question feedback"
```

---

### Task 7: Frontend — Integrate into QuestionResultsView

**Files:**
- Modify: `frontend/src/components/QuestionResultsView.tsx`

**Interfaces:**
- Consumes: `TrackChangesFeedbackModal`, `DiffView`, `DiffOp` from earlier tasks
- Produces: Updated submissions page with track-changes modal for writing questions and diff rendering in feedback view

- [ ] **Step 1: Add imports at top of `QuestionResultsView.tsx`**

Add these imports:

```tsx
import TrackChangesFeedbackModal from './TrackChangesFeedbackModal';
import DiffView from './DiffView';
import { DiffOp } from '../lib/api';
```

- [ ] **Step 2: Add state for track changes modal**

Add after the existing `feedbackTextareaRef` state (around line 26):

```tsx
  const [trackChangesSubId, setTrackChangesSubId] = useState<string | null>(null);
```

- [ ] **Step 3: Update the feedback input `onFocus` for writing questions**

In the submissions table, find the feedback input `onFocus` handler (line ~369). Change the condition so that for writing questions, it opens the track changes modal instead of the generic feedback popup.

Replace the `onFocus` callback on the readonly input (around line 369):

```tsx
onFocus={() => {
  if (isWritingQuestion && sub.text) {
    setTrackChangesSubId(sub.id);
  } else {
    setFeedbackPopupId(sub.id);
  }
}}
```

- [ ] **Step 4: Add the TrackChangesFeedbackModal rendering**

Add after the existing feedback popup modal (after the closing `}` of the `feedbackPopupId &&` block, around line 458):

```tsx
      {/* Track Changes Feedback Modal for writing questions */}
      {trackChangesSubId && (() => {
        const sub = submissions.find(s => s.id === trackChangesSubId);
        if (!sub || !sub.text) return null;
        return (
          <TrackChangesFeedbackModal
            submissionId={sub.id}
            originalText={sub.text}
            speakerName={sub.speaker_name}
            questionId={id!}
            userId={userId}
            onClose={() => setTrackChangesSubId(null)}
            onSent={() => {
              setTrackChangesSubId(null);
              setFeedbackSent((prev) => ({ ...prev, [sub.id]: true }));
            }}
          />
        );
      })()}
```

- [ ] **Step 5: Update the feedback viewing modal to render diff**

Find the feedback viewing modal (around line 460-480). Replace the plain text display with conditional diff rendering:

Replace:

```tsx
      {viewingFeedback && (
```

With a new state approach. First, add a new state variable near the other state declarations:

```tsx
  const [viewingDiffJson, setViewingDiffJson] = useState<string | null>(null);
```

Then update where feedback is clicked to view (the `onClick` on the feedback preview around line 349):

```tsx
onClick={() => {
  setViewingFeedback(sub.feedback_text!);
  // Try to load diff_json from the latest feedback
  api.getFeedbacks(sub.id).then(feedbacks => {
    if (feedbacks.length > 0 && feedbacks[0].diff_json) {
      setViewingDiffJson(feedbacks[0].diff_json);
    }
  });
}}
```

Then update the viewing modal content to show diff when available:

```tsx
      {viewingFeedback && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setViewingFeedback(null); setViewingDiffJson(null); }}
        >
          <div
            className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {viewingDiffJson && (() => {
              try {
                const ops: DiffOp[] = JSON.parse(viewingDiffJson);
                return (
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mb-3">Tracked Changes</h3>
                    <DiffView ops={ops} />
                    {viewingFeedback && (
                      <div className="mt-4 pt-3 border-t border-gray-200 dark:border-zinc-600">
                        <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Teacher's comment:</h4>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{viewingFeedback}</p>
                      </div>
                    )}
                  </div>
                );
              } catch {
                return <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{viewingFeedback}</p>;
              }
            })()}
            {!viewingDiffJson && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mb-3">Feedback</h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{viewingFeedback}</p>
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={() => { setViewingFeedback(null); setViewingDiffJson(null); }}
                className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/QuestionResultsView.tsx
git commit -m "feat: integrate track changes modal and diff view into submissions page"
```

---

### Task 8: End-to-end verification

**Files:** None (testing only)

**Interfaces:**
- Consumes: All prior tasks
- Produces: Verified working feature

- [ ] **Step 1: Build the backend**

Run: `cargo build`
Expected: Successful compilation

- [ ] **Step 2: Build the frontend**

Run: `cd frontend && npm run build`
Expected: Successful build with no errors

- [ ] **Step 3: Commit the final build artifacts (if any lock file changes)**

```bash
git add -u
git status
# If Cargo.lock changed:
git commit -m "chore: update Cargo.lock with similar crate"
```
