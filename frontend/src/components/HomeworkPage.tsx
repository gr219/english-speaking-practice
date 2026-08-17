import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import api, { QuestionSummary, QuestionWithCreator, HomeworkShareInfo, HomeworkShareFilters } from '../lib/api';
import { useAdmin } from '../hooks/useAdmin';
import { useUserId } from '../hooks/useUserId';
import CreateQuestionModal from './CreateQuestionModal';
import HomeworkTable from './HomeworkTable';
import {
  FilterKey,
  Filters,
  FILTER_PARAMS,
  SortColumn,
  SortDirection,
  SORT_COLUMNS,
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  filterQuestions,
  sortQuestions,
} from '../lib/homeworkFilters';

function describeFilters(filters: HomeworkShareFilters): string {
  const parts: string[] = [];
  if (filters.class_label) parts.push(`Class: ${filters.class_label}`);
  if (filters.reviewed_status) parts.push(`Status: ${filters.reviewed_status}`);
  if (filters.question_type) parts.push(`Type: ${filters.question_type}`);
  return parts.join(', ') || 'No filters';
}

export default function HomeworkPage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const { isAdmin, getAdminToken } = useAdmin();
  const adminToken = getAdminToken();

  const [searchParams, setSearchParams] = useSearchParams();

  const [questions, setQuestions] = useState<(QuestionSummary | QuestionWithCreator)[]>([]);

  // Filters and sorting live in the URL so a filtered view can be shared as a link
  const filters = useMemo<Filters>(() => {
    const next: Filters = {};
    (Object.keys(FILTER_PARAMS) as FilterKey[]).forEach((key) => {
      const value = searchParams.get(FILTER_PARAMS[key]);
      if (value) next[key] = value;
    });
    return next;
  }, [searchParams]);

  const sortParam = searchParams.get('sort') as SortColumn | null;
  const sortColumn: SortColumn = sortParam && SORT_COLUMNS.includes(sortParam) ? sortParam : DEFAULT_SORT_COLUMN;
  const sortDirection: SortDirection = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  const updateParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      mutate(next);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateHomework, setShowCreateHomework] = useState(false);

  // Share link state
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [activeShare, setActiveShare] = useState<{ id: string; filterKey: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareList, setShareList] = useState<HomeworkShareInfo[]>([]);
  const [copyStatus, setCopyStatus] = useState(false);

  // Redirect non-admin
  useEffect(() => {
    if (!isAdmin) navigate('/');
  }, [isAdmin, navigate]);

  // Fetch data
  const fetchQuestions = useCallback(async () => {
    if (!isAdmin || !adminToken) return;
    try {
      const data = await api.adminListHomework(adminToken);
      setQuestions(data);
    } catch {
      // ignore
    }
  }, [isAdmin, adminToken]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setSelected(new Set());
  }, [filterKey]);

  // Auto-invalidate the share link created for the previous filter combo once
  // the admin changes/clears the filters — the link no longer represents what's shown.
  useEffect(() => {
    if (activeShare && activeShare.filterKey !== filterKey) {
      const staleId = activeShare.id;
      const token = adminToken;
      setActiveShare(null);
      setShareUrl(null);
      if (token) {
        api.adminRevokeHomeworkShare(staleId, token).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Unique values for filterable columns
  const classLabels = useMemo(() => {
    const labels = new Set<string>();
    questions.forEach((q) => { if (q.class_label) labels.add(q.class_label); });
    return Array.from(labels).sort();
  }, [questions]);

  const filteredQuestions = useMemo(() => filterQuestions(questions, filters), [questions, filters]);
  const sortedQuestions = useMemo(
    () => sortQuestions(filteredQuestions, sortColumn, sortDirection),
    [filteredQuestions, sortColumn, sortDirection]
  );

  const hasActiveFilters = Object.keys(filters).length > 0;

  const applySort = (col: SortColumn, dir: SortDirection) => {
    updateParams((params) => {
      if (col === DEFAULT_SORT_COLUMN && dir === DEFAULT_SORT_DIRECTION) {
        params.delete('sort');
        params.delete('dir');
      } else {
        params.set('sort', col);
        params.set('dir', dir);
      }
    });
  };

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      if (sortDirection === 'asc') applySort(col, 'desc');
      else applySort(DEFAULT_SORT_COLUMN, DEFAULT_SORT_DIRECTION);
    } else {
      applySort(col, 'asc');
    }
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

  const setFilter = (key: FilterKey, value: string | undefined) => {
    updateParams((params) => {
      if (value) params.set(FILTER_PARAMS[key], value);
      else params.delete(FILTER_PARAMS[key]);
    });
  };

  const refreshShareList = useCallback(async () => {
    if (!adminToken) return;
    try {
      const list = await api.adminListHomeworkShares(adminToken);
      setShareList(list);
    } catch {
      // ignore
    }
  }, [adminToken]);

  const handleOpenShare = async () => {
    setShowSharePanel(true);
    setShareBusy(true);
    setCopyStatus(false);
    try {
      if (adminToken) {
        const { id } = await api.adminCreateHomeworkShare(adminToken, filters, sortColumn, sortDirection);
        setActiveShare({ id, filterKey });
        setShareUrl(`${window.location.origin}/homework/shared/${id}`);
      }
      await refreshShareList();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleRevokeShare = async (id: string) => {
    if (!adminToken) return;
    try {
      await api.adminRevokeHomeworkShare(id, adminToken);
      if (activeShare?.id === id) {
        setActiveShare(null);
        setShareUrl(null);
      }
      await refreshShareList();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke share link');
    }
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
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">📚 Homework</h1>
            <div className="flex items-center gap-2 relative">
              {hasActiveFilters && (
                <button
                  onClick={handleOpenShare}
                  className="text-xs px-3 py-1.5 border border-gray-300 dark:border-zinc-600 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                >
                  🔗 Share
                </button>
              )}
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

              {showSharePanel && (
                <div
                  className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-30 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Share this filtered view</span>
                    <button onClick={() => setShowSharePanel(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm">×</button>
                  </div>
                  {shareBusy ? (
                    <p className="text-xs text-zinc-400">Creating link...</p>
                  ) : shareUrl ? (
                    <div className="flex items-center gap-1 mb-3">
                      <input
                        readOnly
                        value={shareUrl}
                        className="flex-1 text-xs px-2 py-1 border border-gray-200 dark:border-zinc-600 rounded bg-gray-50 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        onClick={handleCopyShareUrl}
                        className="text-xs px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 whitespace-nowrap"
                      >
                        {copyStatus ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  ) : null}

                  {shareList.length > 0 && (
                    <div>
                      <p className="text-[11px] text-zinc-400 mb-1">Active share links</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {shareList.map((s) => (
                          <div key={s.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-zinc-700/50 rounded px-2 py-1">
                            <span className="text-zinc-600 dark:text-zinc-300 truncate" title={describeFilters(s.filters)}>
                              {describeFilters(s.filters)}
                            </span>
                            <button
                              onClick={() => handleRevokeShare(s.id)}
                              className="text-red-500 hover:text-red-700 dark:hover:text-red-400 whitespace-nowrap"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
          {hasActiveFilters && (
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
              {filters.question_type && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full">
                  Type: {filters.question_type}
                  <button onClick={() => setFilter('question_type', undefined)} className="hover:text-indigo-900 dark:hover:text-indigo-100">×</button>
                </span>
              )}
            </div>
          )}

          {/* Table */}
          <HomeworkTable
            questions={sortedQuestions}
            emptyMessage={questions.length === 0 ? 'No homework questions yet.' : 'No questions match the current filters.'}
            filters={filters}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            onFilterChange={setFilter}
            classLabels={classLabels}
            selectMode={selectMode}
            selected={selected}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onRowClick={(id) => selectMode ? toggleSelect(id) : navigate(`/q/${id}/results`)}
          />
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
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { setShowCreateHomework(false); fetchQuestions(); }}
        >
          <div className="relative max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setShowCreateHomework(false); fetchQuestions(); }}
              className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 dark:bg-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-gray-300 dark:hover:bg-zinc-500 transition-colors"
              title="Close"
            >
              ×
            </button>
            <CreateQuestionModal
              onClose={() => { setShowCreateHomework(false); fetchQuestions(); }}
              requireClass
            />
          </div>
        </div>
      )}

      {/* Close share panel on outside click */}
      {showSharePanel && (
        <div className="fixed inset-0 z-20" onClick={() => setShowSharePanel(false)} />
      )}
    </div>
  );
}
