# Homework Table Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar Homework panel with a full-page centered table at `/homework` with sortable columns and dropdown column filters.

**Architecture:** New `HomeworkPage` component rendered at `/homework` route. The IconRail's 📚 button becomes a navigation link instead of a sidebar toggle. Sort/filter state is managed via React `useState` hooks with client-side data manipulation. No new dependencies.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, react-router-dom v6

## Global Constraints

- No new npm dependencies
- Follow existing Tailwind CSS patterns and dark mode (`dark:`) conventions
- Admin-only access — redirect non-admin users to `/`
- Reuse existing API functions (`api.adminListHomework`, `api.listHomework`)
- Reuse existing utility functions (`truncateText`, `formatRelativeTime`) from `frontend/src/lib/utils.ts`
- No test framework exists in the project — manual verification only

---

### Task 1: Create `HomeworkPage` Component

**Files:**
- Create: `frontend/src/components/HomeworkPage.tsx`

**Interfaces:**
- Consumes: `api.adminListHomework(adminToken, classLabel?)`, `api.listHomework(userId, classLabel?)`, `api.deleteQuestion(id, userId, adminToken?)` from `frontend/src/lib/api.ts`; `useAdmin()` from `frontend/src/hooks/useAdmin.ts`; `useUserId()` from `frontend/src/hooks/useUserId.ts`; `truncateText(text, maxLen)`, `formatRelativeTime(dateStr)` from `frontend/src/lib/utils.ts`; `QuestionSummary`, `QuestionWithCreator` types from `frontend/src/lib/api.ts`
- Produces: `<HomeworkPage />` — a self-contained page component. No props needed (reads admin state from hooks).

- [ ] **Step 1: Create the HomeworkPage component with data fetching and table rendering**

Create `frontend/src/components/HomeworkPage.tsx`:

```tsx
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { QuestionSummary, QuestionWithCreator } from '../lib/api';
import { truncateText, formatRelativeTime } from '../lib/utils';
import { useAdmin } from '../hooks/useAdmin';
import { useUserId } from '../hooks/useUserId';
import CreateQuestionModal from './CreateQuestionModal';

type SortColumn = 'text' | 'class_label' | 'submission_count' | 'reviewed' | 'created_at' | 'time_limit_secs';
type SortDirection = 'asc' | 'desc';

type FilterKey = 'class_label' | 'reviewed_status';
type Filters = Partial<Record<FilterKey, string>>;

function getReviewedStatus(q: QuestionSummary | QuestionWithCreator): string {
  if (q.submission_count === 0) return 'No submissions';
  if (q.feedback_count >= q.submission_count) return 'All reviewed';
  return 'Pending';
}

function getReviewedRatio(q: QuestionSummary | QuestionWithCreator): number {
  if (q.submission_count === 0) return -1;
  return q.feedback_count / q.submission_count;
}

export default function HomeworkPage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const { isAdmin, getAdminToken } = useAdmin();
  const adminToken = getAdminToken();

  const [questions, setQuestions] = useState<(QuestionSummary | QuestionWithCreator)[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filters, setFilters] = useState<Filters>({});
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateHomework, setShowCreateHomework] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);

  // Redirect non-admin
  useEffect(() => {
    if (!isAdmin) navigate('/');
  }, [isAdmin, navigate]);

  // Fetch data
  const fetchQuestions = useCallback(async () => {
    try {
      if (isAdmin && adminToken) {
        const data = await api.adminListHomework(adminToken);
        setQuestions(data);
      } else {
        const data = await api.listHomework(userId);
        setQuestions(data);
      }
    } catch {
      // ignore
    }
  }, [isAdmin, adminToken, userId]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  // Close filter dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Unique values for filterable columns
  const classLabels = useMemo(() => {
    const labels = new Set<string>();
    questions.forEach((q) => { if (q.class_label) labels.add(q.class_label); });
    return Array.from(labels).sort();
  }, [questions]);

  const reviewedStatuses = ['All reviewed', 'Pending', 'No submissions'];

  // Filter
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (filters.class_label && q.class_label !== filters.class_label) return false;
      if (filters.reviewed_status && getReviewedStatus(q) !== filters.reviewed_status) return false;
      return true;
    });
  }, [questions, filters]);

  // Sort
  const sortedQuestions = useMemo(() => {
    const sorted = [...filteredQuestions];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'text':
          cmp = a.text.localeCompare(b.text);
          break;
        case 'class_label':
          cmp = (a.class_label || '').localeCompare(b.class_label || '');
          break;
        case 'submission_count':
          cmp = a.submission_count - b.submission_count;
          break;
        case 'reviewed':
          cmp = getReviewedRatio(a) - getReviewedRatio(b);
          break;
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'time_limit_secs':
          cmp = a.time_limit_secs - b.time_limit_secs;
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredQuestions, sortColumn, sortDirection]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else { setSortColumn('created_at'); setSortDirection('desc'); }
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const sortIndicator = (col: SortColumn) => {
    if (sortColumn !== col) return <span className="text-zinc-300 dark:text-zinc-600 ml-1">⇅</span>;
    return <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(sortedQuestions.map((q) => q.id)));

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
    fetchQuestions();
  };

  const toggleFilter = (key: FilterKey) => {
    setOpenFilter(openFilter === key ? null : key);
  };

  const setFilter = (key: FilterKey, value: string | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setOpenFilter(null);
  };

  const FilterDropdown = ({ filterKey, options }: { filterKey: FilterKey; options: string[] }) => {
    if (openFilter !== filterKey) return null;
    return (
      <div className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-20 min-w-[140px] py-1">
        <button
          onClick={() => setFilter(filterKey, undefined)}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-zinc-600 ${!filters[filterKey] ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-200'}`}
        >
          All
        </button>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => setFilter(filterKey, opt)}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-zinc-600 ${filters[filterKey] === opt ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-200'}`}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      {/* Top banner */}
      <div className="w-full bg-indigo-600 dark:bg-indigo-700 px-4 py-2 flex items-center justify-between shrink-0">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-white tracking-wide hover:opacity-90 transition-opacity">
          🏠 COZY LAN ENGLISH
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-6" ref={filterRef}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">📚 Homework</h1>
            <div className="flex items-center gap-2">
              {sortedQuestions.length > 0 && (
                <button
                  onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
                  className="text-xs px-3 py-1.5 border border-gray-300 dark:border-zinc-600 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </button>
              )}
              <button
                onClick={() => setShowCreateHomework(true)}
                className="text-xs px-3 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
              >
                + Create
              </button>
            </div>
          </div>

          {/* Bulk actions */}
          {selectMode && (
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => selected.size === sortedQuestions.length ? setSelected(new Set()) : selectAll()}
                className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-zinc-600 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-500"
              >
                {selected.size === sortedQuestions.length ? 'Deselect all' : 'Select all'}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selected.size === 0}
                className="text-xs px-3 py-1.5 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-40"
              >
                Delete ({selected.size})
              </button>
            </div>
          )}

          {/* Active filters */}
          {Object.keys(filters).length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Filters:</span>
              {filters.class_label && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full">
                  Class: {filters.class_label}
                  <button onClick={() => setFilter('class_label', undefined)} className="hover:text-indigo-900 dark:hover:text-indigo-100">×</button>
                </span>
              )}
              {filters.reviewed_status && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full">
                  Status: {filters.reviewed_status}
                  <button onClick={() => setFilter('reviewed_status', undefined)} className="hover:text-indigo-900 dark:hover:text-indigo-100">×</button>
                </span>
              )}
            </div>
          )}

          {/* Table */}
          {sortedQuestions.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-12">
              {questions.length === 0 ? 'No homework questions yet.' : 'No questions match the current filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 dark:border-zinc-700 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                    {selectMode && (
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selected.size === sortedQuestions.length && sortedQuestions.length > 0}
                          onChange={() => selected.size === sortedQuestions.length ? setSelected(new Set()) : selectAll()}
                        />
                      </th>
                    )}
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 select-none"
                      onClick={() => handleSort('text')}
                    >
                      Question {sortIndicator('text')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 select-none relative">
                      <span
                        className="cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
                        onClick={() => handleSort('class_label')}
                      >
                        Class {sortIndicator('class_label')}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFilter('class_label'); }}
                        className={`ml-1 text-[10px] ${filters.class_label ? 'text-indigo-500' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'}`}
                        title="Filter by class"
                      >
                        🔽
                      </button>
                      <FilterDropdown filterKey="class_label" options={classLabels} />
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 select-none"
                      onClick={() => handleSort('submission_count')}
                    >
                      Submissions {sortIndicator('submission_count')}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 select-none relative">
                      <span
                        className="cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
                        onClick={() => handleSort('reviewed')}
                      >
                        Reviewed {sortIndicator('reviewed')}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFilter('reviewed_status'); }}
                        className={`ml-1 text-[10px] ${filters.reviewed_status ? 'text-indigo-500' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'}`}
                        title="Filter by review status"
                      >
                        🔽
                      </button>
                      <FilterDropdown filterKey="reviewed_status" options={reviewedStatuses} />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 select-none"
                      onClick={() => handleSort('created_at')}
                    >
                      Created {sortIndicator('created_at')}
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 select-none"
                      onClick={() => handleSort('time_limit_secs')}
                    >
                      Time Limit {sortIndicator('time_limit_secs')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQuestions.map((q) => {
                    const status = getReviewedStatus(q);
                    return (
                      <tr
                        key={q.id}
                        onClick={() => selectMode ? toggleSelect(q.id) : navigate(`/q/${q.id}/results`)}
                        className={`border-b border-gray-100 dark:border-zinc-700/50 cursor-pointer transition-colors ${
                          selectMode && selected.has(q.id)
                            ? 'bg-red-50 dark:bg-red-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        {selectMode && (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(q.id)}
                              onChange={() => toggleSelect(q.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100 font-medium max-w-xs">
                          {truncateText(q.text, 60)}
                        </td>
                        <td className="px-4 py-3">
                          {q.class_label && (
                            <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full">
                              {q.class_label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-indigo-500 dark:text-indigo-400 font-medium">
                          {q.submission_count}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {q.submission_count > 0 ? (
                            <span className={`text-xs font-medium ${
                              status === 'All reviewed'
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-amber-500 dark:text-amber-400'
                            }`}>
                              {q.feedback_count}/{q.submission_count}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          {formatRelativeTime(q.created_at)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-zinc-600 dark:text-zinc-300">
                          {q.time_limit_secs}s
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

      {/* Create modal */}
      {showCreateHomework && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <CreateQuestionModal
              onClose={() => { setShowCreateHomework(false); fetchQuestions(); }}
              requireClass
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run:
```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors related to `HomeworkPage.tsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HomeworkPage.tsx
git commit -m "feat: add HomeworkPage component with sortable/filterable table"
```

---

### Task 2: Wire Up Routing and Navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/IconRail.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `HomeworkPage` from Task 1
- Produces: `/homework` route accessible via icon rail navigation

- [ ] **Step 1: Add the `/homework` route to `App.tsx`**

In `frontend/src/App.tsx`, add the import at the top (after the existing `HomeworkPanel` import):

```tsx
import HomeworkPage from './components/HomeworkPage';
```

Then add the route inside the `<Routes>` block, after the `/admin` route:

```tsx
<Route path="/homework" element={<HomeworkPage />} />
```

Also remove the now-unused `HomeworkPanel` import:

```tsx
// Remove this line:
import HomeworkPanel from './components/HomeworkPanel';
```

And remove the `homeworkSidebar` variable and its usage in both `<Layout>` JSX instances (the `currentResult` and non-`currentResult` branches). Remove the `showCreateHomework` state and related `CreateQuestionModal` rendering from `MainPage` since that's now in `HomeworkPage`.

Specifically in `MainPage`:

Remove these lines:
```tsx
const [showCreateHomework, setShowCreateHomework] = useState(false);
```

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

Remove `homeworkSidebar={homeworkSidebar}` from both `<Layout>` calls.

Remove both `{showCreateHomework && (...)}` blocks.

- [ ] **Step 2: Update `IconRail.tsx` to navigate to `/homework`**

In `frontend/src/components/IconRail.tsx`, replace the homework button from an onClick toggle to a navigation link.

Add import at top:
```tsx
import { useNavigate, useLocation } from 'react-router-dom';
```

Replace the interface — remove `onHomeworkToggle` and `isHomeworkOpen`:

```tsx
interface IconRailProps {
  onHistoryToggle: () => void;
  isHistoryOpen: boolean;
  onQuestionsToggle: () => void;
  isQuestionsOpen: boolean;
  showHomework?: boolean;
}
```

Inside the component, add navigation:
```tsx
const navigate = useNavigate();
const location = useLocation();
const isHomeworkActive = location.pathname === '/homework';
```

Replace the homework button JSX:
```tsx
{showHomework && (
  <button
    className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors ${
      isHomeworkActive ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
    }`}
    title="Homework"
    onClick={() => navigate('/homework')}
  >
    📚
  </button>
)}
```

- [ ] **Step 3: Simplify `Layout.tsx` — remove homework sidebar props**

In `frontend/src/components/Layout.tsx`:

Remove `homeworkSidebar` from the `LayoutProps` interface:
```tsx
interface LayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  questionsSidebar?: React.ReactNode;
  rightPanel?: React.ReactNode;
  isAdmin?: boolean;
  onAdminLogin?: () => void;
  onAdminPanel?: () => void;
}
```

Remove from the destructured props:
```tsx
export default function Layout({ children, sidebar, questionsSidebar, rightPanel, isAdmin = false, onAdminLogin, onAdminPanel }: LayoutProps) {
```

Remove the `isHomeworkOpen` state and `handleHomeworkToggle` function.

Update `isSidebarOpen`:
```tsx
const isSidebarOpen = isHistoryOpen || isQuestionsOpen;
```

Remove `onHomeworkToggle`, `isHomeworkOpen` from the `<IconRail>` call.

Remove `{isHomeworkOpen && homeworkSidebar}` from the sidebar panel div.

Remove the homework button from mobile bottom nav.

- [ ] **Step 4: Verify compilation**

Run:
```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/IconRail.tsx frontend/src/components/Layout.tsx
git commit -m "feat: wire /homework route, update navigation and remove sidebar homework panel"
```

---

### Task 3: Manual Verification

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run:
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verify the following manually**

1. Navigate to `/homework` — should see the table page centered with the 📚 Homework heading
2. If not logged in as admin, should redirect to `/`
3. Click column headers — should sort asc/desc with arrow indicators
4. Click 🔽 on "Class" column — dropdown appears with unique class values; selecting one filters the table
5. Click 🔽 on "Reviewed" column — dropdown with "All reviewed", "Pending", "No submissions"
6. Active filters show as pills above the table with × to remove
7. Click "Select" — checkbox column appears; can select/deselect items; "Delete (N)" works
8. Click "+ Create" — CreateQuestionModal opens; creating a question refreshes the table
9. Click a question row — navigates to `/q/:id/results`
10. The 📚 icon in the left rail navigates to `/homework` and highlights when active

- [ ] **Step 3: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
