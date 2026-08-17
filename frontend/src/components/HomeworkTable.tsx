import { useEffect, useRef, useState } from 'react';
import { QuestionSummary, QuestionWithCreator } from '../lib/api';
import { truncateText, formatRelativeTime } from '../lib/utils';
import { Filters, FilterKey, SortColumn, SortDirection, getReviewedStatus } from '../lib/homeworkFilters';

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

interface HomeworkTableProps {
  questions: (QuestionSummary | QuestionWithCreator)[];
  emptyMessage: string;
  filters: Filters;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onRowClick: (id: string) => void;
  onSort?: (col: SortColumn) => void;
  onFilterChange?: (key: FilterKey, value: string | undefined) => void;
  classLabels?: string[];
  selectMode?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  readOnly?: boolean;
}

export default function HomeworkTable({
  questions,
  emptyMessage,
  filters,
  sortColumn,
  sortDirection,
  onRowClick,
  onSort,
  onFilterChange,
  classLabels = [],
  selectMode = false,
  selected = new Set<string>(),
  onToggleSelect,
  onSelectAll,
  readOnly = false,
}: HomeworkTableProps) {
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleFilter = (key: FilterKey) => setOpenFilter(openFilter === key ? null : key);

  const setFilter = (key: FilterKey, value: string | undefined) => {
    onFilterChange?.(key, value);
    setOpenFilter(null);
  };

  const sortIndicator = (col: SortColumn) => {
    if (sortColumn !== col) return <span className="text-zinc-300 dark:text-zinc-600 ml-1">⇅</span>;
    return <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const reviewedStatuses = ['All reviewed', 'Pending', 'No submissions'];

  const headerLabelClass = (interactive: boolean) =>
    `${interactive ? 'cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100' : ''} select-none`;

  if (questions.length === 0) {
    return <p className="text-sm text-zinc-400 text-center py-12">{emptyMessage}</p>;
  }

  return (
    <div ref={containerRef} className="overflow-x-auto border border-gray-200 dark:border-zinc-700 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
            {!readOnly && selectMode && (
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === questions.length && questions.length > 0}
                  onChange={onSelectAll}
                />
              </th>
            )}
            <th
              className={`px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 ${headerLabelClass(!readOnly)}`}
              onClick={readOnly ? undefined : () => onSort?.('text')}
            >
              Question {sortIndicator('text')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 select-none relative">
              <span className={headerLabelClass(!readOnly)} onClick={readOnly ? undefined : () => onSort?.('class_label')}>
                Class {sortIndicator('class_label')}
              </span>
              {!readOnly && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFilter('class_label'); }}
                    className={`ml-1 text-[10px] ${filters.class_label ? 'text-indigo-500' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'}`}
                    title="Filter by class"
                  >
                    🔽
                  </button>
                  <FilterDropdown filterKey="class_label" options={classLabels} openFilter={openFilter} filters={filters} setFilter={setFilter} />
                </>
              )}
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 select-none relative">
              <span className={headerLabelClass(!readOnly)} onClick={readOnly ? undefined : () => onSort?.('question_type')}>
                Type {sortIndicator('question_type')}
              </span>
              {!readOnly && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFilter('question_type'); }}
                    className={`ml-1 text-[10px] ${filters.question_type ? 'text-indigo-500' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'}`}
                    title="Filter by type"
                  >
                    🔽
                  </button>
                  <FilterDropdown filterKey="question_type" options={['Speaking', 'Writing']} openFilter={openFilter} filters={filters} setFilter={setFilter} />
                </>
              )}
            </th>
            <th
              className={`px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 ${headerLabelClass(!readOnly)}`}
              onClick={readOnly ? undefined : () => onSort?.('submission_count')}
            >
              Submissions {sortIndicator('submission_count')}
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 select-none relative">
              <span className={headerLabelClass(!readOnly)} onClick={readOnly ? undefined : () => onSort?.('reviewed')}>
                Reviewed {sortIndicator('reviewed')}
              </span>
              {!readOnly && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFilter('reviewed_status'); }}
                    className={`ml-1 text-[10px] ${filters.reviewed_status ? 'text-indigo-500' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'}`}
                    title="Filter by review status"
                  >
                    🔽
                  </button>
                  <FilterDropdown filterKey="reviewed_status" options={reviewedStatuses} openFilter={openFilter} filters={filters} setFilter={setFilter} />
                </>
              )}
            </th>
            <th
              className={`px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 ${headerLabelClass(!readOnly)}`}
              onClick={readOnly ? undefined : () => onSort?.('created_at')}
            >
              Created {sortIndicator('created_at')}
            </th>
            <th
              className={`px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 ${headerLabelClass(!readOnly)}`}
              onClick={readOnly ? undefined : () => onSort?.('time_limit_secs')}
            >
              Limit {sortIndicator('time_limit_secs')}
            </th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => {
            const status = getReviewedStatus(q);
            const isSelectRow = !readOnly && selectMode;
            return (
              <tr
                key={q.id}
                onClick={() => (isSelectRow ? onToggleSelect?.(q.id) : onRowClick(q.id))}
                className={`border-b border-gray-100 dark:border-zinc-700/50 cursor-pointer transition-colors ${
                  isSelectRow && selected.has(q.id)
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                {!readOnly && selectMode && (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(q.id)}
                      onChange={() => onToggleSelect?.(q.id)}
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
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    (q.question_type || 'speaking') === 'writing'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  }`}>
                    {(q.question_type || 'speaking') === 'writing' ? '✍️ Writing' : '🎤 Speaking'}
                  </span>
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
                  {(q.question_type || 'speaking') === 'writing' ? `${q.time_limit_secs} words` : `${q.time_limit_secs}s`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
