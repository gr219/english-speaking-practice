# Homework Page & Inline Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a teacher-only "Homework" sidebar panel for managing class-tagged questions, and show feedback inline in the submissions table.

**Architecture:** Add `class_label` column to `questions` table. Questions with non-null `class_label` are homework (shown in Homework panel, hidden from My Questions). Enrich submission entries with feedback text via LEFT JOIN.

**Tech Stack:** Rust (axum, rusqlite, serde), React (TypeScript, Tailwind CSS, React Router)

## Global Constraints

- Rust edition 2021, existing dependencies only (no new crates)
- React with Vite, TypeScript strict, Tailwind for styling
- SQLite migrations use the existing "check column exists, ALTER if not" pattern
- Follow existing code patterns (api.rs handler style, db.rs method style, frontend component style)
- All frontend components use the existing dark mode classes (`dark:bg-zinc-*`, etc.)

---

### Task 1: Database Migration & Backend — class_label column

**Files:**
- Modify: `src/db.rs:118-225` (Database::new migration section)
- Modify: `src/db.rs:326-334` (insert_question)
- Modify: `src/db.rs:385-404` (list_questions)
- Modify: `src/db.rs:418-437` (list_all_questions)
- Modify: `src/db.rs:479-492` (insert_questions_batch)

**Interfaces:**
- Produces: `Database::insert_question(&self, creator_id, text, time_limit_secs, class_label: Option<&str>) -> Result<String>`
- Produces: `Database::insert_questions_batch(&self, creator_id, questions: &[(String, i32, Option<String>)]) -> Result<Vec<String>>`
- Produces: `Database::list_questions` now filters `WHERE class_label IS NULL`
- Produces: `Database::list_all_questions` now filters `WHERE class_label IS NULL`
- Produces: `Database::list_homework(&self, creator_id: &str, class_filter: Option<&str>) -> Result<Vec<QuestionSummary>>`
- Produces: `Database::list_all_homework(&self, class_filter: Option<&str>) -> Result<Vec<QuestionWithCreator>>`
- Produces: `QuestionSummary` and `QuestionWithCreator` structs gain `class_label: Option<String>`

- [ ] **Step 1: Add class_label migration in Database::new**

In `src/db.rs`, after the existing `has_ielts` migration block (around line 174), add:

```rust
// Migrate: add class_label column if missing
let has_class_label: bool = conn
    .prepare("SELECT class_label FROM questions LIMIT 0")
    .is_ok();
if !has_class_label {
    conn.execute_batch("ALTER TABLE questions ADD COLUMN class_label TEXT;")?;
}
```

- [ ] **Step 2: Add class_label to QuestionSummary and QuestionWithCreator structs**

In `src/db.rs`, update `QuestionSummary` (line 80):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionSummary {
    pub id: String,
    pub text: String,
    pub time_limit_secs: i32,
    pub created_at: String,
    pub submission_count: i32,
    pub class_label: Option<String>,
}
```

Update `QuestionWithCreator` (line 98):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionWithCreator {
    pub id: String,
    pub creator_id: String,
    pub text: String,
    pub time_limit_secs: i32,
    pub created_at: String,
    pub submission_count: i32,
    pub class_label: Option<String>,
}
```

- [ ] **Step 3: Update insert_question to accept class_label**

Replace `insert_question` method:

```rust
pub fn insert_question(&self, creator_id: &str, text: &str, time_limit_secs: i32, class_label: Option<&str>) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let conn = self.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO questions (id, creator_id, text, time_limit_secs, class_label)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, creator_id, text, time_limit_secs, class_label],
    )?;
    Ok(id)
}
```

- [ ] **Step 4: Update insert_questions_batch to accept class_label**

Replace `insert_questions_batch` method:

```rust
pub fn insert_questions_batch(&self, creator_id: &str, questions: &[(String, i32, Option<String>)]) -> Result<Vec<String>> {
    let conn = self.conn.lock().unwrap();
    let mut ids = Vec::new();
    for (text, time_limit_secs, class_label) in questions {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO questions (id, creator_id, text, time_limit_secs, class_label)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, creator_id, text, time_limit_secs, class_label],
        )?;
        ids.push(id);
    }
    Ok(ids)
}
```

- [ ] **Step 5: Update list_questions to exclude homework and include class_label**

Replace `list_questions` method:

```rust
pub fn list_questions(&self, creator_id: &str) -> Result<Vec<QuestionSummary>> {
    let conn = self.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT q.id, q.text, q.time_limit_secs, q.created_at,
                (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id) as submission_count,
                q.class_label
         FROM questions q
         WHERE q.creator_id = ?1 AND q.class_label IS NULL
         ORDER BY q.created_at DESC",
    )?;
    let rows = stmt.query_map(params![creator_id], |row| {
        Ok(QuestionSummary {
            id: row.get(0)?,
            text: row.get(1)?,
            time_limit_secs: row.get(2)?,
            created_at: row.get(3)?,
            submission_count: row.get(4)?,
            class_label: row.get(5)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 6: Update list_all_questions to exclude homework and include class_label**

Replace `list_all_questions` method:

```rust
pub fn list_all_questions(&self) -> Result<Vec<QuestionWithCreator>> {
    let conn = self.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT q.id, q.creator_id, q.text, q.time_limit_secs, q.created_at,
                (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id) as submission_count,
                q.class_label
         FROM questions q
         WHERE q.class_label IS NULL
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
            class_label: row.get(6)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 7: Add list_homework and list_all_homework methods**

Add after `list_all_questions`:

```rust
pub fn list_homework(&self, creator_id: &str, class_filter: Option<&str>) -> Result<Vec<QuestionSummary>> {
    let conn = self.conn.lock().unwrap();
    let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match class_filter {
        Some(label) => (
            "SELECT q.id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id) as submission_count,
                    q.class_label
             FROM questions q
             WHERE q.creator_id = ?1 AND q.class_label = ?2
             ORDER BY q.created_at DESC".to_string(),
            vec![Box::new(creator_id.to_string()), Box::new(label.to_string())],
        ),
        None => (
            "SELECT q.id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id) as submission_count,
                    q.class_label
             FROM questions q
             WHERE q.creator_id = ?1 AND q.class_label IS NOT NULL
             ORDER BY q.created_at DESC".to_string(),
            vec![Box::new(creator_id.to_string())],
        ),
    };
    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(QuestionSummary {
            id: row.get(0)?,
            text: row.get(1)?,
            time_limit_secs: row.get(2)?,
            created_at: row.get(3)?,
            submission_count: row.get(4)?,
            class_label: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn list_all_homework(&self, class_filter: Option<&str>) -> Result<Vec<QuestionWithCreator>> {
    let conn = self.conn.lock().unwrap();
    let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match class_filter {
        Some(label) => (
            "SELECT q.id, q.creator_id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id) as submission_count,
                    q.class_label
             FROM questions q
             WHERE q.class_label = ?1
             ORDER BY q.created_at DESC".to_string(),
            vec![Box::new(label.to_string())],
        ),
        None => (
            "SELECT q.id, q.creator_id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id) as submission_count,
                    q.class_label
             FROM questions q
             WHERE q.class_label IS NOT NULL
             ORDER BY q.created_at DESC".to_string(),
            vec![],
        ),
    };
    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(QuestionWithCreator {
            id: row.get(0)?,
            creator_id: row.get(1)?,
            text: row.get(2)?,
            time_limit_secs: row.get(3)?,
            created_at: row.get(4)?,
            submission_count: row.get(5)?,
            class_label: row.get(6)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 8: Build and verify compilation**

Run: `cargo build 2>&1 | head -50`

Note: This will likely fail due to api.rs calling the old signatures. That's expected — we fix those in Task 2.

- [ ] **Step 9: Commit database changes**

```bash
git add src/db.rs
git commit -m "feat(db): add class_label column and homework query methods"
```

---

### Task 2: Backend API — class_label in question creation + homework endpoints

**Files:**
- Modify: `src/api.rs:406-409` (CreateQuestionRequest)
- Modify: `src/api.rs:416-432` (create_question_handler)
- Modify: `src/api.rs:633-655` (BatchQuestionItem + create_questions_batch_handler)
- Modify: `src/api.rs:690-714` (router — add new routes)

**Interfaces:**
- Consumes: `Database::insert_question(creator_id, text, time_limit_secs, class_label)`
- Consumes: `Database::insert_questions_batch(creator_id, &[(String, i32, Option<String>)])`
- Consumes: `Database::list_homework(creator_id, class_filter)`
- Consumes: `Database::list_all_homework(class_filter)`
- Produces: `POST /api/questions` accepts optional `class_label` field
- Produces: `POST /api/questions/batch` accepts optional `class_label` per item
- Produces: `GET /api/homework?creator_id=X&class_label=Y` returns homework questions
- Produces: `GET /api/admin/homework?class_label=Y` returns all homework questions

- [ ] **Step 1: Update CreateQuestionRequest to include class_label**

In `src/api.rs`, replace the `CreateQuestionRequest` struct:

```rust
#[derive(Deserialize)]
pub struct CreateQuestionRequest {
    pub text: String,
    pub time_limit_secs: i32,
    pub class_label: Option<String>,
}
```

- [ ] **Step 2: Update create_question_handler to pass class_label**

Replace `create_question_handler`:

```rust
async fn create_question_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Json(req): Json<CreateQuestionRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let creator_id = extract_user_id(&headers).unwrap_or_default();
    info!(creator_id = %creator_id, text_len = req.text.len(), time_limit = req.time_limit_secs, "Creating question");
    let id = state
        .db
        .insert_question(&creator_id, &req.text, req.time_limit_secs, req.class_label.as_deref())
        .map_err(|e| {
            error!(creator_id = %creator_id, error = %e, "Failed to insert question");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    info!(creator_id = %creator_id, question_id = %id, "Question created");
    Ok(Json(CreateQuestionResponse { id }))
}
```

- [ ] **Step 3: Update BatchQuestionItem to include class_label**

Replace `BatchQuestionItem`:

```rust
#[derive(Deserialize)]
pub struct BatchQuestionItem {
    pub text: String,
    pub time_limit_secs: i32,
    pub class_label: Option<String>,
}
```

- [ ] **Step 4: Update create_questions_batch_handler**

Replace `create_questions_batch_handler`:

```rust
async fn create_questions_batch_handler(
    state: State<ServerState>,
    headers: HeaderMap,
    Json(req): Json<Vec<BatchQuestionItem>>,
) -> Result<impl IntoResponse, StatusCode> {
    let creator_id = extract_user_id(&headers).unwrap_or_default();
    let questions: Vec<(String, i32, Option<String>)> = req.into_iter().map(|q| (q.text, q.time_limit_secs, q.class_label)).collect();
    let ids = state
        .db
        .insert_questions_batch(&creator_id, &questions)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(BatchQuestionResponse { ids }))
}
```

- [ ] **Step 5: Add homework list handler and query struct**

Add before the router function:

```rust
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
```

- [ ] **Step 6: Register new routes in router()**

In the `router()` function, add these lines after the existing `/questions/:id/submissions` route:

```rust
.route("/homework", get(list_homework_handler))
.route("/admin/homework", get(admin_list_homework_handler))
```

- [ ] **Step 7: Build and verify compilation**

Run: `cargo build 2>&1 | head -50`
Expected: Successful compilation with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/api.rs
git commit -m "feat(api): add class_label to question creation and homework endpoints"
```

---

### Task 3: Backend — Enrich submissions with feedback_text

**Files:**
- Modify: `src/db.rs:70-77` (SubmissionEntry struct)
- Modify: `src/db.rs:359-383` (get_question_submissions method)

**Interfaces:**
- Produces: `SubmissionEntry` now includes `feedback_text: Option<String>`
- Produces: `get_question_submissions` uses subquery to get latest feedback

- [ ] **Step 1: Add feedback_text to SubmissionEntry struct**

Update `SubmissionEntry` in `src/db.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionEntry {
    pub id: String,
    pub speaker_name: Option<String>,
    pub score: f64,
    pub fluency_score: Option<f64>,
    pub created_at: String,
    pub feedback_text: Option<String>,
}
```

- [ ] **Step 2: Update get_question_submissions to include feedback**

Replace `get_question_submissions`:

```rust
pub fn get_question_submissions(&self, question_id: &str) -> Result<Vec<SubmissionEntry>> {
    let conn = self.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT r.id, r.speaker_name, r.score, r.fluency_json, r.created_at,
                (SELECT f.feedback_text FROM feedbacks f WHERE f.recording_id = r.id ORDER BY f.created_at DESC LIMIT 1) as feedback_text
         FROM recordings r
         WHERE r.question_id = ?1
         ORDER BY r.score DESC",
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
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 3: Build and verify**

Run: `cargo build 2>&1 | head -50`
Expected: Successful compilation.

- [ ] **Step 4: Commit**

```bash
git add src/db.rs
git commit -m "feat(db): enrich submission entries with feedback_text via subquery"
```

---

### Task 4: Frontend — API client updates

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `QuestionSummary.class_label: string | null`
- Produces: `QuestionWithCreator.class_label: string | null`
- Produces: `SubmissionEntry.feedback_text: string | null`
- Produces: `api.listHomework(userId, classLabel?): Promise<QuestionSummary[]>`
- Produces: `api.adminListHomework(adminToken, classLabel?): Promise<QuestionWithCreator[]>`
- Produces: `api.createQuestionsBatch` accepts `class_label` per item

- [ ] **Step 1: Update QuestionSummary interface**

In `frontend/src/lib/api.ts`, replace `QuestionSummary`:

```typescript
export interface QuestionSummary {
  id: string;
  text: string;
  time_limit_secs: number;
  created_at: string;
  submission_count: number;
  class_label: string | null;
}
```

- [ ] **Step 2: Update QuestionWithCreator interface**

```typescript
export interface QuestionWithCreator {
  id: string;
  creator_id: string;
  text: string;
  time_limit_secs: number;
  created_at: string;
  submission_count: number;
  class_label: string | null;
}
```

- [ ] **Step 3: Update SubmissionEntry interface**

```typescript
export interface SubmissionEntry {
  id: string;
  speaker_name: string | null;
  score: number;
  fluency_score: number | null;
  created_at: string;
  feedback_text: string | null;
}
```

- [ ] **Step 4: Update createQuestionsBatch to accept class_label**

Replace the `createQuestionsBatch` method:

```typescript
async createQuestionsBatch(questions: { text: string; time_limit_secs: number; class_label?: string | null }[], userId: string): Promise<{ ids: string[] }> {
  const res = await fetch('/api/questions/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    },
    body: JSON.stringify(questions),
  });
  if (!res.ok) throw new Error('Failed to create questions');
  return res.json();
},
```

- [ ] **Step 5: Add listHomework and adminListHomework methods**

Add before the closing `};` of the api object (before line 293):

```typescript
async listHomework(userId: string, classLabel?: string): Promise<QuestionSummary[]> {
  const params = new URLSearchParams({ creator_id: userId });
  if (classLabel) params.set('class_label', classLabel);
  const res = await fetch(`/api/homework?${params}`);
  if (!res.ok) throw new Error('Failed to list homework');
  return res.json();
},

async adminListHomework(adminToken: string, classLabel?: string): Promise<QuestionWithCreator[]> {
  const params = new URLSearchParams();
  if (classLabel) params.set('class_label', classLabel);
  const res = await fetch(`/api/admin/homework?${params}`, {
    headers: { 'X-Admin-Token': adminToken },
  });
  if (!res.ok) throw new Error('Failed to list homework');
  return res.json();
},
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): update API client with class_label and homework endpoints"
```

---

### Task 5: Frontend — Feedback column in QuestionResultsView

**Files:**
- Modify: `frontend/src/components/QuestionResultsView.tsx`

**Interfaces:**
- Consumes: `SubmissionEntry.feedback_text: string | null` (from Task 4)

- [ ] **Step 1: Add Feedback column header to the table**

In `frontend/src/components/QuestionResultsView.tsx`, in the `<thead>` section, after the "Actions" `<th>` (around line 221), add:

```tsx
<th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
  Feedback
</th>
```

- [ ] **Step 2: Add Feedback column cell to each row**

In the `<tbody>` section, after the Actions `<td>` (the one ending around line 314), add a new `<td>`:

```tsx
<td className="px-4 py-3 text-sm align-top">
  {sub.feedback_text ? (
    <div className="flex items-start gap-1">
      <span className="text-green-500 shrink-0">✅</span>
      <span
        className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2"
        title={sub.feedback_text}
      >
        {sub.feedback_text}
      </span>
    </div>
  ) : (
    <span className="text-zinc-400">—</span>
  )}
</td>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/QuestionResultsView.tsx
git commit -m "feat(frontend): show feedback inline in submissions table with green check"
```

---

### Task 6: Frontend — HomeworkPanel component

**Files:**
- Create: `frontend/src/components/HomeworkPanel.tsx`

**Interfaces:**
- Consumes: `api.listHomework(userId, classLabel?)` (from Task 4)
- Consumes: `api.adminListHomework(adminToken, classLabel?)` (from Task 4)
- Produces: `<HomeworkPanel userId={string} refreshTrigger={number} isAdmin={boolean} adminToken={string|null} onRefresh={() => void} onCreateHomework={() => void} />`

- [ ] **Step 1: Create HomeworkPanel.tsx**

Create `frontend/src/components/HomeworkPanel.tsx`:

```tsx
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { QuestionSummary, QuestionWithCreator } from '../lib/api';
import { truncateText, formatRelativeTime } from '../lib/utils';

interface HomeworkPanelProps {
  userId: string;
  refreshTrigger: number;
  isAdmin?: boolean;
  adminToken?: string | null;
  onRefresh?: () => void;
  onCreateHomework?: () => void;
}

export default function HomeworkPanel({ userId, refreshTrigger, isAdmin, adminToken, onRefresh, onCreateHomework }: HomeworkPanelProps) {
  const [questions, setQuestions] = useState<(QuestionSummary | QuestionWithCreator)[]>([]);
  const [classFilter, setClassFilter] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (isAdmin && adminToken) {
          const data = await api.adminListHomework(adminToken, classFilter || undefined);
          setQuestions(data);
        } else {
          const data = await api.listHomework(userId, classFilter || undefined);
          setQuestions(data);
        }
      } catch {
        // ignore
      }
    };
    fetchData();
  }, [userId, refreshTrigger, isAdmin, adminToken, classFilter]);

  const classLabels = useMemo(() => {
    const labels = new Set<string>();
    questions.forEach((q) => {
      if (q.class_label) labels.add(q.class_label);
    });
    return Array.from(labels).sort();
  }, [questions]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Homework</h3>
        {onCreateHomework && (
          <button
            onClick={onCreateHomework}
            className="text-[11px] px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
          >
            + Create
          </button>
        )}
      </div>

      {classLabels.length > 0 && (
        <div className="mb-3">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-zinc-600 rounded bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none"
          >
            <option value="">All classes</option>
            {classLabels.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="text-xs text-zinc-400">No homework questions yet.</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <div
              key={q.id}
              onClick={() => navigate(`/q/${q.id}/results`)}
              className="w-full text-left p-3 rounded-lg border bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600 hover:border-gray-300 dark:hover:border-zinc-500 transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                  {truncateText(q.text, 35)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
                    {q.class_label}
                  </span>
                  <span className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium">
                    {q.submission_count} sub{q.submission_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  {formatRelativeTime(q.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HomeworkPanel.tsx
git commit -m "feat(frontend): add HomeworkPanel sidebar component"
```

---

### Task 7: Frontend — Wire up IconRail, Layout, and App for Homework panel

**Files:**
- Modify: `frontend/src/components/IconRail.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/CreateQuestionModal.tsx`

**Interfaces:**
- Consumes: `<HomeworkPanel>` from Task 6
- Consumes: `CreateQuestionModal` — add `requireClass` prop

- [ ] **Step 1: Add Homework icon to IconRail**

Replace `frontend/src/components/IconRail.tsx`:

```tsx
interface IconRailProps {
  onHistoryToggle: () => void;
  isHistoryOpen: boolean;
  onQuestionsToggle: () => void;
  isQuestionsOpen: boolean;
  onHomeworkToggle?: () => void;
  isHomeworkOpen?: boolean;
  showHomework?: boolean;
}

export default function IconRail({ onHistoryToggle, isHistoryOpen, onQuestionsToggle, isQuestionsOpen, onHomeworkToggle, isHomeworkOpen, showHomework }: IconRailProps) {
  return (
    <div className="w-12 bg-zinc-900 flex flex-col items-center py-3 gap-3 shrink-0">
      <button
        className="w-8 h-8 bg-zinc-700 rounded-md flex items-center justify-center text-sm hover:bg-zinc-600 transition-colors"
        title="Record"
      >
        🎙️
      </button>
      <button
        className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors ${
          isHistoryOpen ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
        }`}
        title="History"
        onClick={onHistoryToggle}
      >
        📋
      </button>
      <button
        className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors ${
          isQuestionsOpen ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
        }`}
        title="My Questions"
        onClick={onQuestionsToggle}
      >
        📝
      </button>
      {showHomework && onHomeworkToggle && (
        <button
          className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors ${
            isHomeworkOpen ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
          title="Homework"
          onClick={onHomeworkToggle}
        >
          📚
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update Layout to support Homework panel**

Replace `frontend/src/components/Layout.tsx`:

```tsx
import { useState, useEffect } from 'react';
import IconRail from './IconRail';

interface LayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  questionsSidebar?: React.ReactNode;
  homeworkSidebar?: React.ReactNode;
  rightPanel?: React.ReactNode;
  isAdmin?: boolean;
  onAdminLogin?: () => void;
  onAdminPanel?: () => void;
}

export default function Layout({ children, sidebar, questionsSidebar, homeworkSidebar, rightPanel, isAdmin = false, onAdminLogin, onAdminPanel }: LayoutProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isQuestionsOpen, setIsQuestionsOpen] = useState(isAdmin);
  const [isHomeworkOpen, setIsHomeworkOpen] = useState(false);

  useEffect(() => {
    if (isAdmin) setIsQuestionsOpen(true);
  }, [isAdmin]);
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('speech_dark_mode') === 'true' ||
      (!localStorage.getItem('speech_dark_mode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('speech_dark_mode', String(isDark));
  }, [isDark]);

  const handleHistoryToggle = () => {
    setIsHistoryOpen(!isHistoryOpen);
    if (!isHistoryOpen) { setIsQuestionsOpen(false); setIsHomeworkOpen(false); }
  };

  const handleQuestionsToggle = () => {
    setIsQuestionsOpen(!isQuestionsOpen);
    if (!isQuestionsOpen) { setIsHistoryOpen(false); setIsHomeworkOpen(false); }
  };

  const handleHomeworkToggle = () => {
    setIsHomeworkOpen(!isHomeworkOpen);
    if (!isHomeworkOpen) { setIsHistoryOpen(false); setIsQuestionsOpen(false); }
  };

  const isSidebarOpen = isHistoryOpen || isQuestionsOpen || isHomeworkOpen;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      {/* Top banner */}
      <div className="w-full bg-indigo-600 dark:bg-indigo-700 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="text-sm font-bold text-white tracking-wide">
          🏠 COZY LAN ENGLISH
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <button
              onClick={onAdminPanel}
              className="px-2 py-1 text-xs bg-yellow-400 text-yellow-900 rounded font-semibold hover:bg-yellow-300 transition-colors"
              title="Open Admin Panel"
            >
              🛡️ Admin
            </button>
          ) : (
            <button
              onClick={onAdminLogin}
              className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30 transition-colors"
              title="Admin Login"
            >
              🔐 Admin
            </button>
          )}
          <button
            onClick={() => setIsDark(!isDark)}
            className="text-white/80 hover:text-white text-sm"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Icon rail - hidden on mobile */}
        <div className="hidden sm:block">
          <IconRail
            onHistoryToggle={handleHistoryToggle}
            isHistoryOpen={isHistoryOpen}
            onQuestionsToggle={handleQuestionsToggle}
            isQuestionsOpen={isQuestionsOpen}
            onHomeworkToggle={handleHomeworkToggle}
            isHomeworkOpen={isHomeworkOpen}
            showHomework={isAdmin}
          />
        </div>

        {/* Sidebar panel */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out border-r border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 ${
            isSidebarOpen ? 'w-64' : 'w-0'
          }`}
        >
          <div className="w-64 h-full overflow-y-auto">
            {isHistoryOpen && sidebar}
            {isQuestionsOpen && questionsSidebar}
            {isHomeworkOpen && homeworkSidebar}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
          <div className="flex-1 flex flex-col lg:flex-row">
            <div className="flex-1 min-w-0">
              {children}
            </div>
            {/* Right panel (leaderboard) - below on mobile, side on desktop */}
            {rightPanel && (
              <div className="w-full lg:w-60 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 shrink-0 overflow-y-auto">
                {rightPanel}
              </div>
            )}
          </div>
          {/* Footer */}
          <div className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 py-3 border-t border-gray-100 dark:border-zinc-800">
            © {new Date().getFullYear()} Developed by{' '}
            <a
              href="https://www.facebook.com/gr219"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Tuyen Tran
            </a>
            . All rights reserved.
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="sm:hidden flex items-center justify-around border-t border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2 shrink-0">
        <button
          onClick={handleHistoryToggle}
          className={`text-lg ${isHistoryOpen ? 'opacity-100' : 'opacity-50'}`}
        >
          📋
        </button>
        <button
          onClick={handleQuestionsToggle}
          className={`text-lg ${isQuestionsOpen ? 'opacity-100' : 'opacity-50'}`}
        >
          📝
        </button>
        {isAdmin && (
          <button
            onClick={handleHomeworkToggle}
            className={`text-lg ${isHomeworkOpen ? 'opacity-100' : 'opacity-50'}`}
          >
            📚
          </button>
        )}
        <span className="text-lg opacity-50">🎙️</span>
        <button
          onClick={() => setIsDark(!isDark)}
          className="text-lg opacity-50"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add requireClass prop to CreateQuestionModal**

In `frontend/src/components/CreateQuestionModal.tsx`:

Replace the `CreateQuestionModalProps` interface:

```tsx
interface CreateQuestionModalProps {
  onClose: () => void;
  requireClass?: boolean;
}
```

Replace the `QuestionInput` interface:

```tsx
interface QuestionInput {
  text: string;
  timeLimitSecs: number;
  classLabel: string;
}
```

Update component signature:

```tsx
export default function CreateQuestionModal({ onClose, requireClass }: CreateQuestionModalProps) {
```

Add state after `const [includeResultsLink, setIncludeResultsLink] = useState(true);`:

```tsx
const [classLabel, setClassLabel] = useState('');
```

Replace `handleNumChange`:

```tsx
const handleNumChange = (value: string) => {
  const num = parseInt(value);
  if (!value) {
    setNumQuestions('');
    setQuestions([]);
    return;
  }
  if (num < 1 || num > 20) return;
  setNumQuestions(num);
  setQuestions(
    Array.from({ length: num }, (_, i) => questions[i] || { text: '', timeLimitSecs: 120, classLabel: classLabel })
  );
};
```

In `handleSubmit`, before `setIsCreating(true);` add:

```tsx
if (requireClass && !classLabel.trim()) {
  setError('Please enter a class name');
  return;
}
```

In `handleSubmit`, replace the payload construction:

```tsx
const payload = validQuestions.map((q) => ({
  text: q.text.trim(),
  time_limit_secs: q.timeLimitSecs,
  class_label: requireClass ? (classLabel.trim() || null) : null,
}));
```

In the form JSX, after the "Number of questions" `<div>` and before `{questions.length > 0 && (`, add:

```tsx
{requireClass && (
  <div>
    <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">
      Class:
    </label>
    <input
      type="text"
      value={classLabel}
      onChange={(e) => setClassLabel(e.target.value)}
      placeholder="e.g., 10A, 11B"
      className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent"
    />
  </div>
)}
```

- [ ] **Step 4: Update App.tsx to wire HomeworkPanel**

In `frontend/src/App.tsx`:

Add import at the top:

```tsx
import HomeworkPanel from './components/HomeworkPanel';
import CreateQuestionModal from './components/CreateQuestionModal';
```

In `MainPage`, after `const [prefillText, setPrefillText] = useState<string>('');` add:

```tsx
const [showCreateHomework, setShowCreateHomework] = useState(false);
```

After `const questionsSidebar = ...` (line 110), add:

```tsx
const homeworkSidebar = isAdmin ? (
  <HomeworkPanel
    userId={userId}
    refreshTrigger={refreshTrigger}
    isAdmin={isAdmin}
    adminToken={getAdminToken()}
    onRefresh={() => setRefreshTrigger((n) => n + 1)}
    onCreateHomework={() => setShowCreateHomework(true)}
  />
) : null;
```

In both `<Layout>` component usages, add `homeworkSidebar={homeworkSidebar}` prop.

After each `{showAdminLogin && (...)}` block, add:

```tsx
{showCreateHomework && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
      <CreateQuestionModal
        onClose={() => { setShowCreateHomework(false); setRefreshTrigger((n) => n + 1); }}
        requireClass
      />
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IconRail.tsx frontend/src/components/Layout.tsx frontend/src/components/CreateQuestionModal.tsx frontend/src/App.tsx
git commit -m "feat(frontend): wire up Homework panel in sidebar with class label support"
```

---

### Task 8: Full integration build & verification

**Files:**
- No new files — integration verification

- [ ] **Step 1: Build the Rust backend**

Run: `cargo build 2>&1 | tail -10`
Expected: `Finished` with no errors.

- [ ] **Step 2: Build the frontend**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit any fixes if needed**

```bash
git status
```

If there are uncommitted fixes:

```bash
git add -A
git commit -m "fix: resolve build issues from integration"
```
