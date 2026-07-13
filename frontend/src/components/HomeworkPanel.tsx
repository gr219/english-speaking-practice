import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { QuestionSummary, QuestionWithCreator } from '../lib/api';
import { truncateText, formatRelativeTime } from '../lib/utils';

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
        {onCreateHomework && (
          <button
            onClick={onCreateHomework}
            className="text-[11px] px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
          >
            + Create
          </button>
        )}
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

      {questions.length === 0 ? (
        <p className="text-xs text-zinc-400">No homework questions yet.</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <div
              key={q.id}
              onClick={() => navigate(`/q/${q.id}/results`)}
              className="w-full text-left p-3 rounded-lg border bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600 hover:border-gray-300 dark:hover:border-zinc-500 transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                  {truncateText(q.text, 35)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
                    {q.class_label}
                  </span>
                  <span className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium">
                    {q.submission_count} sub{q.submission_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  {formatRelativeTime(q.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
