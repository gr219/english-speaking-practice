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

interface FilterDropdownProps {
  filterKey: FilterKey;
  options: string[];
  openFilter: FilterKey | null;
  filters: Filters;
  setFilter: (key: FilterKey, value: string | undefined) => void;
}

function FilterDropdown({ filterKey, options, openFilter, filters, setFilter }: FilterDropdownProps) {
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
}

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
    if (!isAdmin || !adminToken) return;
    try {
      const data = await api.adminListHomework(adminToken);
      setQuestions(data);
    } catch {
      // ignore
    }
  }, [isAdmin, adminToken]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  useEffect(() => {
    setSelected(new Set());
  }, [filters]);

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
                      <FilterDropdown filterKey="class_label" options={classLabels} openFilter={openFilter} filters={filters} setFilter={setFilter} />
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
                      <FilterDropdown filterKey="reviewed_status" options={reviewedStatuses} openFilter={openFilter} filters={filters} setFilter={setFilter} />
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
    </div>
  );
}
