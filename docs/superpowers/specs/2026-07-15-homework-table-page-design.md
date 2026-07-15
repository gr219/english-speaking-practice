# Homework Table Page Design

**Date:** 2026-07-15
**Status:** Approved

## Overview

Replace the narrow sidebar Homework panel with a full-page table view at `/homework`. The table displays homework questions centered on the page with sortable columns and dropdown filters on column headers. Admin-only access.

## Routing & Navigation

- **Route:** `/homework` → `HomeworkPage` component
- **Navigation:** The 📚 icon in `IconRail` navigates to `/homework` via `react-router-dom` instead of toggling a sidebar panel
- **Access:** Admin-only. Non-admin users are redirected to `/`
- **Layout:** Uses a minimal layout (top banner + footer, no sidebar panels needed)

## Table Columns

| Column | Data Source | Sortable | Filterable | Notes |
|--------|-----------|----------|------------|-------|
| ☐ (Checkbox) | N/A | No | No | Visible only in select mode |
| Question | `q.text` | Yes (alphabetical) | No | Truncated to ~60 chars, clickable → `/q/:id/results` |
| Class | `q.class_label` | Yes (alphabetical) | Yes (dropdown of unique values) | Styled as badge |
| Submissions | `q.submission_count` | Yes (numeric) | No | Integer count |
| Reviewed | `q.feedback_count / q.submission_count` | Yes (by ratio) | Yes (All reviewed / Pending / No submissions) | Color coded: green = complete, amber = pending |
| Created | `q.created_at` | Yes (date, default desc) | No | Displayed as relative time |
| Time Limit | `q.time_limit_secs` | Yes (numeric) | No | Displayed in seconds |

## Sorting Behavior

- Click a column header to sort ascending; click again for descending; click again to remove sort
- Visual indicator: ▲ (asc) / ▼ (desc) next to the active sort column header
- Default sort: `created_at` descending (newest first)
- Only one column sorted at a time

## Filtering Behavior

- Filterable columns (Class, Reviewed) show a small filter icon (funnel) in the header
- Clicking the filter icon opens a dropdown below the header with all unique values for that column
- Selecting a value filters the table rows to only show matching entries
- An "All" option clears the filter for that column
- Active filters are visually indicated (highlighted icon or badge)
- Multiple column filters can be active simultaneously (AND logic)

## Bulk Select & Delete

- "Select" button in the toolbar toggles select mode (shows checkbox column)
- "Select all" / "Deselect all" toggle in select mode
- "Delete (N)" button triggers confirmation dialog, then deletes selected questions
- Existing `handleBulkDelete` logic is reused

## Data Fetching

- Admin users: `api.adminListHomework(adminToken, classLabel?)` → `QuestionWithCreator[]`
- Non-admin users: `api.listHomework(userId, classLabel?)` → `QuestionSummary[]`
- Class label filter parameter is removed from the API call (filtering is now client-side on the full dataset)

## Component Structure

### `HomeworkPage` (new)
- Location: `frontend/src/components/HomeworkPage.tsx`
- Full-page component rendered at `/homework`
- Contains:
  - Title bar with "Homework" heading and action buttons (Select, + Create)
  - Table with sortable/filterable headers
  - Bulk action toolbar (visible in select mode)
  - Empty state when no questions exist
- State: `questions`, `sortColumn`, `sortDirection`, `filters`, `selectMode`, `selected`

### Changes to Existing Components

- **`App.tsx`**: Add `/homework` route pointing to `HomeworkPage`
- **`IconRail.tsx`**: Change homework button from toggle to navigation link (`/homework`)
- **`Layout.tsx`**: Remove `homeworkSidebar` prop and related toggle logic (simplify)
- **`HomeworkPanel.tsx`**: Keep file for potential future sidebar use, but no longer rendered from Layout

## Styling

- Table centered with `max-w-5xl mx-auto` in a padded container
- Tailwind CSS consistent with existing project styles
- Dark mode support using existing `dark:` variants
- Responsive: horizontal scroll on narrow screens
- Row hover effect for clickability affordance
