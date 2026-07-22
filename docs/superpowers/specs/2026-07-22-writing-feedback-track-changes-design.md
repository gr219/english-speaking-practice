# Writing Feedback — Track Changes Feature

**Date:** 2026-07-22  
**Status:** Approved  
**Scope:** Writing question submissions only

## Overview

Teachers can provide "track changes" style feedback on writing question submissions. When a teacher clicks the feedback input for a writing submission, a modal opens pre-filled with the student's original text. The teacher edits freely (adding/removing text). On submit, the backend computes a word-level diff and stores it as structured JSON. The diff renders with red strikethrough for deletions and Azure blue for insertions — similar to Google Docs' suggestion mode.

## Data Model

### Database Schema Change

Add a nullable column to the `feedbacks` table:

```sql
ALTER TABLE feedbacks ADD COLUMN diff_json TEXT;
```

- `diff_json`: Nullable. Contains a JSON array of diff operations when feedback includes tracked changes.
- `feedback_text`: Continues to hold the teacher's general comment (may be empty if no comment provided).

### Diff JSON Format

```json
[
  {"op": "equal", "text": "For the most part, I think Zoom's gesture recognition feature is"},
  {"op": "delete", "text": "...handy. But"},
  {"op": "insert", "text": " neat and handy (no pun intended). However,"},
  {"op": "equal", "text": " when I first started using it, there were times when the frustration "},
  {"op": "delete", "text": "slash hilarity "},
  {"op": "equal", "text": "it caused far outweighed the convenience."}
]
```

Operations:
- `"equal"` — text unchanged between original and edited
- `"delete"` — text removed by teacher
- `"insert"` — text added by teacher

## Backend

### New Endpoint

`POST /api/recordings/:id/diff-feedback`

**Request body:**
```json
{
  "original_text": "student's original writing",
  "edited_text": "teacher's corrected version",
  "comment": "Optional general comment",
  "question_id": "question-uuid"
}
```

**Processing:**
1. Validate that the recording exists and belongs to the given question.
2. Compute word-level diff between `original_text` and `edited_text` using the `similar` Rust crate (patience diff algorithm on words, then grouped into operations).
3. Serialize diff as JSON array of `{op, text}` objects.
4. Insert into `feedbacks` table: `feedback_text = comment` (or empty string), `diff_json = serialized JSON`.

**Response:**
```json
{
  "id": "feedback-uuid",
  "diff_json": [...]
}
```

### Existing Endpoint Changes

`GET /api/recordings/:id/feedback` response now includes `diff_json` field (nullable) in each feedback object.

### Rust Dependencies

Add `similar` crate to `Cargo.toml`:
```toml
similar = "2"
```

## Frontend

### Track Changes Feedback Modal

**Trigger:** When teacher focuses the "Write feedback" input for a writing submission, open this modal instead of the generic textarea modal.

**Layout:**
1. **Header:** "Edit & Give Feedback" + student name
2. **Editable area:** `<textarea>` pre-filled with the student's original text. Teacher edits freely — no inline visualization during editing.
3. **Comment box:** Optional `<textarea>` labeled "Add a general comment (optional)"
4. **Footer:** "Cancel" | "Send Feedback" buttons

**On submit:**
- Send `{ original_text, edited_text, comment, question_id }` to `POST /api/recordings/:id/diff-feedback`
- On success, update UI to show feedback sent confirmation

**Condition:** This modal only triggers for writing question submissions (`isWritingQuestion === true`). Non-writing questions continue to use the existing plain textarea popup.

### DiffView Component

A new React component that renders a diff JSON array:

```tsx
interface DiffOp {
  op: 'equal' | 'delete' | 'insert';
  text: string;
}

function DiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="whitespace-pre-wrap text-sm">
      {ops.map((op, i) => {
        if (op.op === 'equal') return <span key={i}>{op.text}</span>;
        if (op.op === 'delete')
          return <span key={i} className="text-red-500 line-through">{op.text}</span>;
        if (op.op === 'insert')
          return <span key={i} className="text-[#0078D4]">{op.text}</span>;
      })}
    </div>
  );
}
```

### Viewing Feedback

**Feedback viewing modal:** When a user clicks to view feedback that has `diff_json`:
1. Render `DiffView` with the diff operations
2. Below it, render the teacher's general comment if present

**Backward compatibility:** If `diff_json` is null/undefined, render `feedback_text` as plain text (existing behavior).

### API Client Update

Add to `api.ts`:
```typescript
async createDiffFeedback(
  recordingId: string,
  questionId: string,
  originalText: string,
  editedText: string,
  comment: string,
  userId: string
): Promise<{ id: string; diff_json: DiffOp[] }>
```

### Fetching Student Writing Text

The modal needs the student's original writing text. The existing `SubmissionEntry` does not include the full text.

**Solution:** Add a `text` field (nullable) to the `SubmissionEntry` interface and backend response. The `GET /api/questions/:id/submissions` endpoint already queries the `recordings` table which has a `text` column. Include it in the response for writing questions. Frontend: add `text: string | null` to `SubmissionEntry` type.

## User Experience Flow

1. Teacher opens "Question Submissions" page for a writing question.
2. Teacher clicks/focuses "Write feedback..." input next to a submission.
3. **Track Changes Modal** opens with the student's full writing pre-filled in a textarea.
4. Teacher edits the text — deleting words, adding corrections, rephrasing sentences.
5. Optionally adds a general comment below.
6. Clicks "Send Feedback."
7. Backend computes diff, stores it.
8. In the submissions table, the feedback column now shows a truncated preview of the diff (with colored spans).
9. Anyone (student or teacher) clicking the feedback preview sees the full tracked-changes view in a modal.

## Styling

- **Deletions:** `text-red-500 line-through` (red text with strikethrough)
- **Insertions:** `text-[#0078D4]` (Azure blue, no underline — clean and readable)
- **Equal text:** default text color, no decoration

## Out of Scope

- Real-time collaborative editing
- Multiple revision history (only one diff feedback per submission at a time)
- Accept/reject individual changes (read-only diff view)
- Character-level diff (word-level is sufficient for writing feedback)
