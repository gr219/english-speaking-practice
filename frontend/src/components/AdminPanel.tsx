import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { QuestionWithCreator, SubmissionEntry } from '../lib/api';
import { truncateText } from '../lib/utils';

interface AdminPanelProps {
  adminToken: string;
  onLogout: () => void;
}

export default function AdminPanel({ adminToken, onLogout }: AdminPanelProps) {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionWithCreator[]>([]);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, SubmissionEntry[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchQuestions = async () => {
    try {
      const qs = await api.adminListQuestions(adminToken);
      setQuestions(qs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [adminToken]);

  const handleExpandQuestion = async (qId: string) => {
    if (expandedQuestion === qId) {
      setExpandedQuestion(null);
      return;
    }
    setExpandedQuestion(qId);
    if (!submissions[qId]) {
      try {
        const subs = await api.getQuestionSubmissions(qId);
        setSubmissions((prev) => ({ ...prev, [qId]: subs }));
      } catch {
        // ignore
      }
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm('Delete this question and all its feedbacks?')) return;
    try {
      await api.adminDeleteQuestion(qId, adminToken);
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
    } catch {
      alert('Failed to delete question');
    }
  };

  const handleDeleteRecording = async (recordingId: string, questionId: string) => {
    if (!confirm('Delete this submission?')) return;
    try {
      await api.adminDeleteRecording(recordingId, adminToken);
      setSubmissions((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] || []).filter((s) => s.id !== recordingId),
      }));
    } catch {
      alert('Failed to delete recording');
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            🛡️ Admin Panel
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-sm bg-gray-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
            >
              ← Home
            </button>
            <button
              onClick={onLogout}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-zinc-700 border-b border-gray-200 dark:border-zinc-600">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              All Questions ({questions.length})
            </h2>
          </div>

          {questions.length === 0 ? (
            <div className="p-6 text-center text-zinc-500 dark:text-zinc-400">
              No questions yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-zinc-600">
              {questions.map((q) => (
                <div key={q.id}>
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-700/50">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleExpandQuestion(q.id)}
                    >
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {truncateText(q.text, 60)}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Creator: {q.creator_id.slice(0, 8)}... | {q.submission_count} submissions | {q.time_limit_secs}s limit
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => navigate(`/q/${q.id}/results`)}
                        className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {expandedQuestion === q.id && (
                    <div className="px-6 py-3 bg-gray-50 dark:bg-zinc-700/30 border-t border-gray-100 dark:border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">
                        Submissions:
                      </div>
                      {(!submissions[q.id] || submissions[q.id].length === 0) ? (
                        <div className="text-xs text-zinc-400">No submissions</div>
                      ) : (
                        <div className="space-y-2">
                          {submissions[q.id].map((sub) => (
                            <div key={sub.id} className="flex items-center justify-between p-2 bg-white dark:bg-zinc-800 rounded border border-gray-200 dark:border-zinc-600">
                              <div className="text-xs text-zinc-700 dark:text-zinc-300">
                                <span className="font-medium">{sub.speaker_name || 'Anonymous'}</span>
                                {' — '}
                                <span className="text-blue-600 dark:text-blue-400">{sub.score.toFixed(1)}%</span>
                                {sub.fluency_score !== null && (
                                  <span className="text-green-600 dark:text-green-400 ml-2">Fluency: {sub.fluency_score.toFixed(1)}%</span>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeleteRecording(sub.id, q.id)}
                                className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
