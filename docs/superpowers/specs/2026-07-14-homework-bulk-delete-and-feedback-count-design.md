# Homework Bulk Delete & Feedback Count

**Date:** 2026-07-14
**Status:** Approved

## Overview

Two features for the teacher-facing question lists:

1. **Bulk delete for Homework questions** — HomeworkPanel currently lacks the Select/Delete pattern that MyQuestions already has.
2. **Feedback review count** — Show how many submissions have been reviewed (have feedback) out of total submissions, displayed as "X/Y reviewed" on both Questions and Homework lists.

## Feature 1: Feedback Count ("X/Y reviewed")

### Backend (db.rs)

Add `feedback_count: i32` to both `QuestionSummary` and `QuestionWithCreator` structs.

In every SQL query returning these structs, add a subquery alongside the existing `submission_count`:

```sql
(SELECT COUNT(DISTINCT r2.id)
 FROM recordings r2
 JOIN feedbacks f ON f.recording_id = r2.id
 WHERE r2.question_id = q.id AND r2.submitted = 1) as feedback_count
```

**Affected queries (6 total):**
- `list_questions_by_creator` — returns `QuestionSummary`
- `admin_list_questions` — returns `QuestionWithCreator`
- `list_homework` (with and without class_label filter) — returns `QuestionSummary`
- `admin_list_homework` (with and without class_label filter) — returns `QuestionWithCreator`

### Frontend (api.ts)

Add `feedback_count: number` to both `QuestionSummary` and `QuestionWithCreator` interfaces.

### Frontend (MyQuestions.tsx, HomeworkPanel.tsx)

Display next to existing submission count:

```
3/5 reviewed
```

- Format: `{feedback_count}/{submission_count} reviewed`
- Shown as a small label similar to the existing submission count
- Color coding: green tint when all reviewed (`feedback_count === submission_count > 0`), otherwise neutral

## Feature 2: Bulk Delete for Homework

### Frontend (HomeworkPanel.tsx)

Mirror the existing MyQuestions bulk delete pattern:

**New state:**
- `selectMode: boolean` — toggles selection UI
- `selected: Set<string>` — tracks selected question IDs

**New UI elements:**
- Select/Cancel toggle button in the header (next to "+ Create")
- When in select mode: Select All / Deselect All button + Delete (N) button
- Checkboxes on each question card
- Selected cards highlighted with red tint

**Delete behavior:**
- Uses existing `api.deleteQuestion(id, userId, adminToken)` per selected item
- On completion, refreshes the question list
- Exits select mode after delete

**Dependencies:**
- Import `useAdmin` hook for `getAdminToken()`
- No backend changes needed — reuses existing delete endpoints

## Files Changed

| File | Change |
|------|--------|
| `src/db.rs` | Add `feedback_count` field to structs; update 6 SQL queries |
| `frontend/src/lib/api.ts` | Add `feedback_count` to TS interfaces |
| `frontend/src/components/MyQuestions.tsx` | Display feedback ratio |
| `frontend/src/components/HomeworkPanel.tsx` | Display feedback ratio + add bulk delete |
