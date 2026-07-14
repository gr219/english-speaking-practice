import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { QuestionSummary, QuestionWithCreator } from '../lib/api';
import { truncateText, formatRelativeTime } from '../lib/utils';
import { useAdmin } from '../hooks/useAdmin';

interface HomeworkPanelProps {
  userId: string;
  refreshTrigger: number;
  isAdmin?: boolean;
  adminToken?: string | null;
  onRefresh?: () => void;
  onCreateHomework?: () => void;
}

export default function HomeworkPanel({ userId, refreshTrigger, isAdmin, adminToken, onRefresh: _onRefresh, onCreateHomework }: HomeworkPanelProps) {
  const [questions, setQuestions] = useState<(QuestionSummary | QuestionWithCreator)[]>([]);
  const [classFilter, setClassFilter] = useState<string>('');
  const navigate = useNavigate();

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (isAdmin && adminToken) {
          const data = await api.adminListHomework(adminToken, classFilter || undefined);
          setQuestions(data);
        } else {
          const data = await api.listHomework(userId, classFilter || undefined);
          setQuestions(data);
        }
      } catch {
        // ignore
      }
    };
    fetchData();
  }, [userId, refreshTrigger, isAdmin, adminToken, classFilter]);

  const classLabels = useMemo(() => {
    const labels = new Set<string>();
    questions.forEach((q) => {
      if (q.class_label) labels.add(q.class_label);
    });
    return Array.from(labels).sort();
  }, [questions]);

  return (
    <div className="p-4">
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

      {classLabels.length > 0 && (
        <div className="mb-3">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-zinc-600 rounded bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none"
          >
            <option value="">All classes</option>
            {classLabels.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>
      )}

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

      {questions.length === 0 ? (
        <p className="text-xs text-zinc-400">No homework questions yet.</p>
      ) : (
        <div className="space-y-2">
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
        </div>
      )}
    </div>
  );
}
