# Homework Bulk Delete & Feedback Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add feedback review count ("X/Y reviewed") to question lists and bulk delete to HomeworkPanel.

**Architecture:** Add `feedback_count` field to backend structs and SQL queries, propagate to frontend TypeScript interfaces, display in both MyQuestions and HomeworkPanel. Port the existing bulk delete UI pattern from MyQuestions to HomeworkPanel.

**Tech Stack:** Rust (axum, rusqlite), React (TypeScript), Tailwind CSS

## Global Constraints

- Rust edition 2021, rusqlite with `params!` macro
- React functional components with hooks
- Tailwind CSS utility classes for styling
- Existing `deleteQuestion` API is reused — no new backend endpoints

---

### Task 1: Add `feedback_count` to backend structs and SQL queries

**Files:**
- Modify: `src/db.rs:82-89` (QuestionSummary struct)
- Modify: `src/db.rs:101-110` (QuestionWithCreator struct)
- Modify: `src/db.rs:417-438` (list_questions query)
- Modify: `src/db.rs:452-474` (list_all_questions query)
- Modify: `src/db.rs:476-511` (list_homework query)
- Modify: `src/db.rs:513-549` (list_all_homework query)

**Interfaces:**
- Produces: `QuestionSummary.feedback_count: i32`, `QuestionWithCreator.feedback_count: i32`

- [ ] **Step 1: Add `feedback_count` field to `QuestionSummary` struct**

In `src/db.rs`, add `feedback_count: i32` after `submission_count`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionSummary {
    pub id: String,
    pub text: String,
    pub time_limit_secs: i32,
    pub created_at: String,
    pub submission_count: i32,
    pub feedback_count: i32,
    pub class_label: Option<String>,
}
```

- [ ] **Step 2: Add `feedback_count` field to `QuestionWithCreator` struct**

In `src/db.rs`, add `feedback_count: i32` after `submission_count`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionWithCreator {
    pub id: String,
    pub creator_id: String,
    pub text: String,
    pub time_limit_secs: i32,
    pub created_at: String,
    pub submission_count: i32,
    pub feedback_count: i32,
    pub class_label: Option<String>,
}
```

- [ ] **Step 3: Update `list_questions` query**

In `src/db.rs`, the `list_questions` method. Add the feedback_count subquery and update the column mapping:

```rust
pub fn list_questions(&self, creator_id: &str) -> Result<Vec<QuestionSummary>> {
    let conn = self.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT q.id, q.text, q.time_limit_secs, q.created_at,
                (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id AND r.submitted = 1) as submission_count,
                (SELECT COUNT(DISTINCT r2.id) FROM recordings r2 JOIN feedbacks f ON f.recording_id = r2.id WHERE r2.question_id = q.id AND r2.submitted = 1) as feedback_count,
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
            feedback_count: row.get(5)?,
            class_label: row.get(6)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 4: Update `list_all_questions` query**

In `src/db.rs`, the `list_all_questions` method:

```rust
pub fn list_all_questions(&self) -> Result<Vec<QuestionWithCreator>> {
    let conn = self.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT q.id, q.creator_id, q.text, q.time_limit_secs, q.created_at,
                (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id AND r.submitted = 1) as submission_count,
                (SELECT COUNT(DISTINCT r2.id) FROM recordings r2 JOIN feedbacks f ON f.recording_id = r2.id WHERE r2.question_id = q.id AND r2.submitted = 1) as feedback_count,
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
            feedback_count: row.get(6)?,
            class_label: row.get(7)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 5: Update `list_homework` query (both branches)**

In `src/db.rs`, the `list_homework` method. Both the `Some(label)` and `None` branches need the subquery. Update the full method:

```rust
pub fn list_homework(&self, creator_id: &str, class_filter: Option<&str>) -> Result<Vec<QuestionSummary>> {
    let conn = self.conn.lock().unwrap();
    let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match class_filter {
        Some(label) => (
            "SELECT q.id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id AND r.submitted = 1) as submission_count,
                    (SELECT COUNT(DISTINCT r2.id) FROM recordings r2 JOIN feedbacks f ON f.recording_id = r2.id WHERE r2.question_id = q.id AND r2.submitted = 1) as feedback_count,
                    q.class_label
             FROM questions q
             WHERE q.creator_id = ?1 AND q.class_label = ?2
             ORDER BY q.created_at DESC".to_string(),
            vec![Box::new(creator_id.to_string()), Box::new(label.to_string())],
        ),
        None => (
            "SELECT q.id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id AND r.submitted = 1) as submission_count,
                    (SELECT COUNT(DISTINCT r2.id) FROM recordings r2 JOIN feedbacks f ON f.recording_id = r2.id WHERE r2.question_id = q.id AND r2.submitted = 1) as feedback_count,
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
            feedback_count: row.get(5)?,
            class_label: row.get(6)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 6: Update `list_all_homework` query (both branches)**

In `src/db.rs`, the `list_all_homework` method:

```rust
pub fn list_all_homework(&self, class_filter: Option<&str>) -> Result<Vec<QuestionWithCreator>> {
    let conn = self.conn.lock().unwrap();
    let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match class_filter {
        Some(label) => (
            "SELECT q.id, q.creator_id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id AND r.submitted = 1) as submission_count,
                    (SELECT COUNT(DISTINCT r2.id) FROM recordings r2 JOIN feedbacks f ON f.recording_id = r2.id WHERE r2.question_id = q.id AND r2.submitted = 1) as feedback_count,
                    q.class_label
             FROM questions q
             WHERE q.class_label = ?1
             ORDER BY q.created_at DESC".to_string(),
            vec![Box::new(label.to_string())],
        ),
        None => (
            "SELECT q.id, q.creator_id, q.text, q.time_limit_secs, q.created_at,
                    (SELECT COUNT(*) FROM recordings r WHERE r.question_id = q.id AND r.submitted = 1) as submission_count,
                    (SELECT COUNT(DISTINCT r2.id) FROM recordings r2 JOIN feedbacks f ON f.recording_id = r2.id WHERE r2.question_id = q.id AND r2.submitted = 1) as feedback_count,
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
            feedback_count: row.get(6)?,
            class_label: row.get(7)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 7: Build to verify compilation**

Run: `cargo build 2>&1 | tail -5`
Expected: `Finished` with no errors

- [ ] **Step 8: Commit**

```bash
git add src/db.rs
git commit -m "feat: add feedback_count to question listing queries"
```

---

### Task 2: Add `feedback_count` to frontend and display in both panels

**Files:**
- Modify: `frontend/src/lib/api.ts:344-361` (TypeScript interfaces)
- Modify: `frontend/src/components/MyQuestions.tsx:129-140` (display feedback ratio)
- Modify: `frontend/src/components/HomeworkPanel.tsx:84-99` (display feedback ratio)

**Interfaces:**
- Consumes: `feedback_count: number` from backend JSON responses
- Produces: Visual "X/Y reviewed" label in question cards

- [ ] **Step 1: Add `feedback_count` to TypeScript interfaces**

In `frontend/src/lib/api.ts`, add `feedback_count: number` to both interfaces:

```typescript
export interface QuestionSummary {
  id: string;
  text: string;
  time_limit_secs: number;
  created_at: string;
  submission_count: number;
  feedback_count: number;
  class_label: string | null;
}

export interface QuestionWithCreator {
  id: string;
  creator_id: string;
  text: string;
  time_limit_secs: number;
  created_at: string;
  submission_count: number;
  feedback_count: number;
  class_label: string | null;
}
```

- [ ] **Step 2: Display feedback ratio in MyQuestions**

In `frontend/src/components/MyQuestions.tsx`, add the reviewed label next to the submission count. Replace the existing stats row (lines 131-139):

```tsx
<div className="flex items-center justify-between">
  <span className="text-[11px] text-zinc-400">
    {formatRelativeTime(q.created_at)}
  </span>
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium">
      {q.submission_count} sub{q.submission_count !== 1 ? 's' : ''}
    </span>
    {q.submission_count > 0 && (
      <span className={`text-[11px] font-medium ${
        q.feedback_count >= q.submission_count
          ? 'text-green-600 dark:text-green-400'
          : 'text-amber-500 dark:text-amber-400'
      }`}>
        {q.feedback_count}/{q.submission_count} reviewed
      </span>
    )}
  </div>
</div>
```

- [ ] **Step 3: Display feedback ratio in HomeworkPanel**

In `frontend/src/components/HomeworkPanel.tsx`, add the reviewed label. Replace the existing stats section (lines 88-95):

```tsx
<div className="flex items-center justify-between">
  <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
    {q.class_label}
  </span>
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium">
      {q.submission_count} sub{q.submission_count !== 1 ? 's' : ''}
    </span>
    {q.submission_count > 0 && (
      <span className={`text-[11px] font-medium ${
        q.feedback_count >= q.submission_count
          ? 'text-green-600 dark:text-green-400'
          : 'text-amber-500 dark:text-amber-400'
      }`}>
        {q.feedback_count}/{q.submission_count} reviewed
      </span>
    )}
  </div>
</div>
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/MyQuestions.tsx frontend/src/components/HomeworkPanel.tsx
git commit -m "feat: display feedback review count in question lists"
```

---

### Task 3: Add bulk delete to HomeworkPanel

**Files:**
- Modify: `frontend/src/components/HomeworkPanel.tsx` (full file)

**Interfaces:**
- Consumes: `api.deleteQuestion(id, userId, adminToken)` — existing API
- Consumes: `useAdmin().getAdminToken()` — existing hook

- [ ] **Step 1: Add imports and state for bulk delete**

In `frontend/src/components/HomeworkPanel.tsx`, update the imports and add the `useAdmin` hook:

```tsx
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { QuestionSummary, QuestionWithCreator } from '../lib/api';
import { truncateText, formatRelativeTime } from '../lib/utils';
import { useAdmin } from '../hooks/useAdmin';
```

- [ ] **Step 2: Add state variables and bulk delete logic**

Inside the component function, after existing state, add:

```tsx
const [selectMode, setSelectMode] = useState(false);
const [selected, setSelected] = useState<Set<string>>(new Set());
const { getAdminToken } = useAdmin();

const toggleSelect = (id: string) => {
  setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const selectAll = () => {
  setSelected(new Set(questions.map((q) => q.id)));
};

const handleBulkDelete = async () => {
  if (selected.size === 0) return;
  if (!confirm(`Delete ${selected.size} homework question(s) and their feedbacks?`)) return;
  const failures: string[] = [];
  for (const id of selected) {
    try {
      await api.deleteQuestion(id, userId, getAdminToken() || undefined);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : 'Unknown error');
    }
  }
  if (failures.length > 0) {
    alert(`Failed to delete ${failures.length} question(s): ${failures[0]}`);
  }
  setSelected(new Set());
  setSelectMode(false);
  // Re-fetch
  if (isAdmin && adminToken) {
    api.adminListHomework(adminToken, classFilter || undefined).then(setQuestions).catch(() => {});
  } else {
    api.listHomework(userId, classFilter || undefined).then(setQuestions).catch(() => {});
  }
};
```

- [ ] **Step 3: Add Select/Cancel button to header**

Replace the header section to include the Select button alongside the existing Create button:

```tsx
<div className="flex items-center justify-between mb-4">
  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Homework</h3>
  <div className="flex items-center gap-2">
    {questions.length > 0 && (
      <button
        onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
        className="text-[11px] text-zinc-500 hover:text-zinc-700"
      >
        {selectMode ? 'Cancel' : 'Select'}
      </button>
    )}
    {onCreateHomework && (
      <button
        onClick={onCreateHomework}
        className="text-[11px] px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
      >
        + Create
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 4: Add Select All / Delete toolbar**

After the class filter dropdown and before the questions list, add the toolbar (same pattern as MyQuestions):

```tsx
{selectMode && (
  <div className="flex items-center gap-2 mb-3">
    <button
      onClick={() => selected.size === questions.length ? setSelected(new Set()) : selectAll()}
      className="text-[11px] px-2 py-1 bg-gray-100 dark:bg-zinc-600 rounded text-zinc-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-500"
    >
      {selected.size === questions.length ? 'Deselect all' : 'Select all'}
    </button>
    <button
      onClick={handleBulkDelete}
      disabled={selected.size === 0}
      className="text-[11px] px-2 py-1 bg-red-50 dark:bg-red-900/30 rounded text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-40"
    >
      Delete ({selected.size})
    </button>
  </div>
)}
```

- [ ] **Step 5: Add checkboxes and selection highlight to question cards**

Replace each question card's click handler and add checkbox + selection styling:

```tsx
{questions.map((q) => (
  <div
    key={q.id}
    onClick={() => selectMode ? toggleSelect(q.id) : navigate(`/q/${q.id}/results`)}
    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
      selectMode && selected.has(q.id)
        ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
        : 'bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600 hover:border-gray-300 dark:hover:border-zinc-500'
    }`}
  >
    <div className="flex items-center">
      {selectMode && (
        <input
          type="checkbox"
          checked={selected.has(q.id)}
          onChange={() => toggleSelect(q.id)}
          className="mr-2 shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-1">
          {truncateText(q.text, 35)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
            {q.class_label}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium">
              {q.submission_count} sub{q.submission_count !== 1 ? 's' : ''}
            </span>
            {q.submission_count > 0 && (
              <span className={`text-[11px] font-medium ${
                q.feedback_count >= q.submission_count
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-500 dark:text-amber-400'
              }`}>
                {q.feedback_count}/{q.submission_count} reviewed
              </span>
            )}
          </div>
        </div>
        <div className="text-[11px] text-zinc-400 mt-1">
          {formatRelativeTime(q.created_at)}
        </div>
      </div>
    </div>
  </div>
))}
```

- [ ] **Step 6: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/HomeworkPanel.tsx
git commit -m "feat: add bulk delete to homework panel"
```
