# Homework Page & Inline Feedback Design

**Date:** 2026-07-13  
**Status:** Approved

## Summary

Two features:
1. **Homework page** — Teachers get a new sidebar panel to create/manage questions tagged with a class label. These "homework" questions are separated from the existing "My Questions" panel.
2. **Inline feedback** — On the Question Submissions page, feedback from teachers is shown directly in the table (green check icon + text) so students don't need to navigate to a detail page.

## Database Changes

### `questions` table migration

Add a nullable `class_label` column:

```sql
ALTER TABLE questions ADD COLUMN class_label TEXT;
```

**Semantics:**
- `class_label IS NULL` → regular question (shown in "My Questions", hidden from Homework)
- `class_label IS NOT NULL` → homework question (shown in Homework, hidden from "My Questions")

No new tables required.

## API Changes

### Modified endpoints

**`GET /api/questions?creator_id=X`**
- Add filter: `WHERE class_label IS NULL`
- Ensures homework questions don't appear in the regular questions list

**`POST /api/questions`** and **`POST /api/questions/batch`**
- Accept optional `class_label: string | null` field in the request body
- When provided, the question is tagged as homework

**`GET /api/questions/:id/submissions`**
- Enrich each `SubmissionEntry` with `feedback_text: string | null`
- Join with `feedbacks` table to get the latest feedback text per submission
- Only includes the most recent feedback per recording

### New endpoint

**`GET /api/homework?creator_id=X`**
- Returns questions where `class_label IS NOT NULL` and `creator_id = X`
- Ordered by `created_at DESC`
- Optional query param `?class_label=10A` to filter by specific class
- Response shape: same as `QuestionSummary` but includes `class_label` field

### Admin endpoint

**`GET /api/admin/homework`**
- Same as `/api/homework` but returns all homework questions (no creator filter)
- Requires `X-Admin-Token` header

## Frontend Changes

### 1. IconRail — New Homework icon

- Add 📚 icon to `IconRail.tsx`
- Only visible when `isAdmin` is true
- Follows the same open/close toggle pattern as History and My Questions
- Opening Homework closes other panels

### 2. New component: `HomeworkPanel.tsx`

Sidebar panel displayed when the Homework icon is active.

**Layout:**
- Header: "Homework" title + "Create" button
- Filter: dropdown of unique class labels (populated from fetched data)
- Table/list of homework questions:
  - Question text (truncated)
  - Class label badge
  - Submission count
  - Relative time
- Clicking a question navigates to `/q/:id/results`

**Data fetching:**
- Calls `GET /api/homework?creator_id=X` (or admin endpoint if admin)
- Re-fetches on `refreshTrigger` change

### 3. CreateQuestionModal changes

- Add "Class" text input field
- Prop: `requireClass?: boolean` — when true, the class field is shown and required
- When opened from HomeworkPanel: `requireClass=true`
- When opened from MyQuestions: field hidden, class_label stays null
- The class value is sent in the batch/create API call

### 4. QuestionResultsView — Feedback column

- Add "Feedback" column to the submissions table (rightmost column)
- Cell content:
  - Has feedback: `✅` green check + feedback text (truncated to ~50 chars, full text on hover/title)
  - No feedback: `—` dash
- Data comes from the enriched `SubmissionEntry.feedback_text` field (no extra fetch)

### 5. MyQuestions — Exclude homework

- The existing `listQuestions` API already filters by `class_label IS NULL` (backend change)
- No frontend changes needed for MyQuestions itself

## Data Flow

```
Teacher creates homework:
  HomeworkPanel → CreateQuestionModal (class required) → POST /api/questions/batch {class_label: "10A"}
  → Saved with class_label in DB → Appears in HomeworkPanel, hidden from MyQuestions

Student submits answer:
  /q/:id → records audio → POST /api/analyze {question_id} → recording saved

Teacher gives feedback:
  /q/:id/results → feedback input → POST /api/recordings/:id/feedback
  → Saved in feedbacks table

Student sees feedback:
  /q/:id/results → GET /api/questions/:id/submissions
  → Response includes feedback_text per submission → Shown in Feedback column with ✅
```

## TypeScript Interface Changes

```typescript
// api.ts additions
export interface QuestionSummary {
  // existing fields...
  class_label: string | null;  // NEW
}

export interface QuestionWithCreator {
  // existing fields...
  class_label: string | null;  // NEW
}

export interface SubmissionEntry {
  // existing fields...
  feedback_text: string | null;  // NEW
}

// New API methods
listHomework(userId: string, classLabel?: string): Promise<QuestionSummary[]>
adminListHomework(adminToken: string, classLabel?: string): Promise<QuestionWithCreator[]>
```

## Rust Backend Changes

```rust
// db.rs
// QuestionSummary, QuestionWithCreator, Question — add class_label: Option<String>
// SubmissionEntry — add feedback_text: Option<String>

// New methods:
// list_homework(creator_id, class_label_filter) -> Vec<QuestionSummary>
// admin_list_homework(class_label_filter) -> Vec<QuestionWithCreator>
// get_question_submissions — LEFT JOIN feedbacks to include feedback_text

// api.rs
// New route: GET /api/homework
// New route: GET /api/admin/homework
// Modify: POST /api/questions, POST /api/questions/batch — accept class_label
// Modify: GET /api/questions — filter WHERE class_label IS NULL
```

## Component Tree (affected)

```
App
├── MainPage
│   ├── Layout
│   │   ├── IconRail ← add 📚 Homework icon (admin only)
│   │   └── Sidebar panels
│   │       ├── HistorySidebar (unchanged)
│   │       ├── MyQuestions (unchanged, backend filters homework out)
│   │       └── HomeworkPanel (NEW)
│   └── ...
├── QuestionResultsView ← add Feedback column
└── CreateQuestionModal ← add class_label field
```
