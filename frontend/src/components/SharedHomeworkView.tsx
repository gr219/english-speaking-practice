import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { QuestionWithCreator, HomeworkShareFilters } from '../lib/api';
import HomeworkTable from './HomeworkTable';
import { Filters, SortColumn, SortDirection, SORT_COLUMNS, DEFAULT_SORT_COLUMN, DEFAULT_SORT_DIRECTION, filterQuestions, sortQuestions } from '../lib/homeworkFilters';

export default function SharedHomeworkView() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionWithCreator[]>([]);
  const [filters, setFilters] = useState<HomeworkShareFilters>({});
  const [sortColumn, setSortColumn] = useState<SortColumn>(DEFAULT_SORT_COLUMN);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) return;
    (async () => {
      try {
        const data = await api.getSharedHomework(shareId);
        setQuestions(data.questions);
        setFilters(data.filters);
        const col = SORT_COLUMNS.includes(data.sort_column as SortColumn) ? (data.sort_column as SortColumn) : DEFAULT_SORT_COLUMN;
        setSortColumn(col);
        setSortDirection(data.sort_direction === 'asc' ? 'asc' : 'desc');
      } catch {
        setError('Link đã hết hiệu lực hoặc không tồn tại.');
      } finally {
        setLoading(false);
      }
    })();
  }, [shareId]);

  const filteredQuestions = filterQuestions(questions, filters as Filters);
  const sortedQuestions = sortQuestions(filteredQuestions, sortColumn, sortDirection);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      <div className="w-full bg-indigo-600 dark:bg-indigo-700 px-4 py-2 flex items-center justify-between shrink-0">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-white tracking-wide hover:opacity-90 transition-opacity">
          🏠 COZY LAN ENGLISH
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">📚 Homework</h1>

          {loading ? (
            <p className="text-sm text-zinc-400 text-center py-12">Loading...</p>
          ) : error ? (
            <p className="text-sm text-zinc-400 text-center py-12">{error}</p>
          ) : (
            <>
              {(filters.class_label || filters.reviewed_status || filters.question_type) && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Filters:</span>
                  {filters.class_label && (
                    <span className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full">
                      Class: {filters.class_label}
                    </span>
                  )}
                  {filters.reviewed_status && (
                    <span className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full">
                      Status: {filters.reviewed_status}
                    </span>
                  )}
                  {filters.question_type && (
                    <span className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full">
                      Type: {filters.question_type}
                    </span>
                  )}
                </div>
              )}

              <HomeworkTable
                questions={sortedQuestions}
                emptyMessage="No homework questions match this link's filters."
                filters={filters as Filters}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onRowClick={(id) => navigate(`/q/${id}/results`)}
                readOnly
              />
            </>
          )}
        </div>
      </div>

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
  );
}
