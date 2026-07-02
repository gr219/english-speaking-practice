import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { QuestionSummary } from '../lib/api';
import { truncateText, formatRelativeTime } from '../lib/utils';

interface MyQuestionsProps {
  userId: string;
  refreshTrigger: number;
}

export default function MyQuestions({ userId, refreshTrigger }: MyQuestionsProps) {
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.listQuestions(userId).then(setQuestions).catch(() => {});
  }, [userId, refreshTrigger]);

  if (questions.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">My Questions</h3>
        <p className="text-xs text-zinc-400">No questions created yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">My Questions</h3>
      <div className="space-y-2">
        {questions.map((q) => (
          <div
            key={q.id}
            onClick={() => navigate(`/q/${q.id}/results`)}
            className="w-full text-left p-3 rounded-lg border bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600 hover:border-gray-300 dark:hover:border-zinc-500 cursor-pointer transition-colors"
          >
            <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-1">
              {truncateText(q.text, 35)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">
                {formatRelativeTime(q.created_at)}
              </span>
              <span className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium">
                {q.submission_count} submission{q.submission_count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
