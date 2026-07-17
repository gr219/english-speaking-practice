import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { Question, SubmissionEntry } from '../lib/api';
import { useUserId } from '../hooks/useUserId';
import { useAdmin } from '../hooks/useAdmin';
import Banner from './Banner';
import AudioPlayer from './AudioPlayer';

export default function QuestionResultsView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = useUserId();
  const { isAdmin, getAdminToken } = useAdmin();
  const [question, setQuestion] = useState<Question | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({});
  const [feedbackSending, setFeedbackSending] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [feedbackPopupId, setFeedbackPopupId] = useState<string | null>(null);
  const feedbackTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (feedbackPopupId && feedbackTextareaRef.current) {
      feedbackTextareaRef.current.focus();
    }
  }, [feedbackPopupId]);

  const isCreator = question?.creator_id === userId;
  const canFeedback = isAdmin || isCreator;
  const canDelete = isAdmin || isCreator;

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const [q, subs] = await Promise.all([
          api.getQuestion(id),
          api.getQuestionSubmissions(id),
        ]);
        setQuestion(q);
        setSubmissions(subs);
      } catch {
        setError('Failed to load question or submissions');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const handlePlayAudio = (submissionId: string) => {
    if (playingId === submissionId) {
      setPlayingId(null);
    } else {
      setPlayingId(submissionId);
    }
  };

  const handleSubmitFeedback = async (submissionId: string) => {
    const text = feedbackText[submissionId]?.trim();
    if (!text || !id) return;
    setFeedbackSending(submissionId);
    try {
      await api.createFeedback(submissionId, id, text, userId);
      setFeedbackSent((prev) => ({ ...prev, [submissionId]: true }));
      setFeedbackText((prev) => ({ ...prev, [submissionId]: '' }));
    } catch {
      alert('Failed to submit feedback');
    } finally {
      setFeedbackSending(null);
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!confirm('Delete this submission?')) return;
    try {
      if (isAdmin) {
        const token = getAdminToken();
        if (!token) return;
        await api.adminDeleteRecording(submissionId, token);
      } else {
        await api.deleteRecording(submissionId, userId);
      }
      setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(submissionId); return next; });
    } catch {
      alert('Failed to delete submission');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === submissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submissions.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} submission(s)?`)) return;
    setBulkDeleting(true);
    const token = isAdmin ? getAdminToken() : null;
    const failed: string[] = [];
    for (const sid of selectedIds) {
      try {
        if (isAdmin && token) {
          await api.adminDeleteRecording(sid, token);
        } else {
          await api.deleteRecording(sid, userId);
        }
      } catch {
        failed.push(sid);
      }
    }
    setSubmissions((prev) => prev.filter((s) => failed.includes(s.id) || !selectedIds.has(s.id)));
    setSelectedIds(new Set(failed));
    setBulkDeleting(false);
    if (failed.length > 0) {
      alert(`Failed to delete ${failed.length} submission(s)`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900">
        <Banner />
        <div className="flex items-center justify-center h-[calc(100vh-40px)]">
          <p className="text-zinc-500 dark:text-zinc-400">Loading submissions...</p>
        </div>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900">
        <Banner />
        <div className="flex items-center justify-center h-[calc(100vh-40px)]">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Question not found'}</p>
            <a href="/" className="text-blue-500 hover:underline">Go home</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900">
      <Banner />
      <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Question Submissions
          </h1>
          <div className="text-lg text-zinc-800 dark:text-zinc-200 italic mb-2">"{question.text}"</div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Time limit: {Math.floor(question.time_limit_secs / 60)}:{(question.time_limit_secs % 60).toString().padStart(2, '0')}
          </div>
          {canFeedback && (
            <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              ✓ You can submit feedback for submissions
            </div>
          )}
        </div>

        {submissions.length === 0 ? (
          <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-8 text-center">
            <p className="text-zinc-500 dark:text-zinc-400">No submissions yet</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg overflow-hidden">
            {canDelete && selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-gray-200 dark:border-zinc-600">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                >
                  {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100"
                >
                  Clear
                </button>
              </div>
            )}
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-zinc-700">
                <tr>
                  {canDelete && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={submissions.length > 0 && selectedIds.size === submissions.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 dark:border-zinc-500"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    Pronunciation
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    Fluency
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    Actions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    Feedback
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-zinc-600">
                {submissions.map((sub) => (
                  <tr key={sub.id} className={selectedIds.has(sub.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}>
                    {canDelete && (
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(sub.id)}
                          onChange={() => toggleSelect(sub.id)}
                          className="rounded border-gray-300 dark:border-zinc-500"
                        />
                      </td>
                    )}
                    <td
                      className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                      onClick={() => navigate(`/share/${sub.id}`)}
                    >
                      {sub.speaker_name || 'Anonymous'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {sub.score.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {sub.fluency_score !== null ? (
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {sub.fluency_score.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDate(sub.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePlayAudio(sub.id)}
                          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-xs"
                        >
                          {playingId === sub.id ? '⏸' : '▶'}
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteSubmission(sub.id)}
                            className="text-red-500 hover:text-red-600 text-xs"
                            title="Delete submission"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                      {playingId === sub.id && (
                        <div className="mt-2">
                          <AudioPlayer
                            src={api.getAudioUrl(sub.id)}
                            autoPlay
                            onEnded={() => setPlayingId(null)}
                          />
                        </div>
                      )}
                      {canFeedback && (
                        <div className="mt-2">
                          {feedbackSent[sub.id] ? (
                            <div className="text-xs text-green-600 dark:text-green-400">✓ Feedback sent</div>
                          ) : (
                            <div className="flex gap-1">
                              <input
                                type="text"
                                readOnly
                                value={feedbackText[sub.id] || ''}
                                onFocus={() => setFeedbackPopupId(sub.id)}
                                placeholder="Write feedback..."
                                className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-zinc-600 rounded bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-300 cursor-pointer"
                              />
                              <button
                                onClick={() => handleSubmitFeedback(sub.id)}
                                disabled={feedbackSending === sub.id || !feedbackText[sub.id]?.trim()}
                                className="px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {feedbackSending === sub.id ? '...' : 'Send'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm align-top">
                      {sub.feedback_text ? (
                        <div className="group/fb relative flex items-start gap-1 px-2 py-1.5 rounded-md cursor-default">
                          <span className="text-green-500 shrink-0">✅</span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap line-clamp-2">
                            {sub.feedback_text}
                          </span>
                          <div className="invisible group-hover/fb:visible absolute bottom-full left-0 mb-2 z-50 w-80 max-h-60 overflow-y-auto p-4 bg-white dark:bg-zinc-800 rounded-lg shadow-xl ring-1 ring-gray-200 dark:ring-zinc-600">
                            <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap">
                              {sub.feedback_text}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-center">
          <a
            href={`/q/${id}`}
            className="text-blue-500 hover:underline text-sm"
          >
            ← Answer this question
          </a>
        </div>
      </div>
      </div>

      {/* Feedback popup modal */}
      {feedbackPopupId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setFeedbackPopupId(null)}
        >
          <div
            className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">
              Write Feedback
            </h3>
            <textarea
              ref={feedbackTextareaRef}
              value={feedbackText[feedbackPopupId] || ''}
              onChange={(e) => {
                const id = feedbackPopupId;
                setFeedbackText((prev) => ({ ...prev, [id]: e.target.value }));
              }}
              placeholder="Write your feedback here..."
              rows={6}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setFeedbackPopupId(null)}
                className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const popupId = feedbackPopupId;
                  setFeedbackPopupId(null);
                  handleSubmitFeedback(popupId);
                }}
                disabled={feedbackSending === feedbackPopupId || !feedbackText[feedbackPopupId]?.trim()}
                className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {feedbackSending === feedbackPopupId ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
