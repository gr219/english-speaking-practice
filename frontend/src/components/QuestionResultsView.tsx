import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { Question, SubmissionEntry } from '../lib/api';

export default function QuestionResultsView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [question, setQuestion] = useState<Question | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">Loading submissions...</p>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-zinc-900">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Question not found'}</p>
          <a href="/" className="text-blue-500 hover:underline">Go home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Question Submissions
          </h1>
          <div className="text-lg text-zinc-800 dark:text-zinc-200 italic mb-2">"{question.text}"</div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Time limit: {Math.floor(question.time_limit_secs / 60)}:{(question.time_limit_secs % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {submissions.length === 0 ? (
          <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-8 text-center">
            <p className="text-zinc-500 dark:text-zinc-400">No submissions yet</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-zinc-700">
                <tr>
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
                    Audio
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-zinc-600">
                {submissions.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => navigate(`/share/${sub.id}`)}
                    className="hover:bg-gray-50 dark:hover:bg-zinc-700/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200">
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
                      <button
                        onClick={() => handlePlayAudio(sub.id)}
                        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                      >
                        {playingId === sub.id ? '⏸ Pause' : '▶ Play'}
                      </button>
                      {playingId === sub.id && (
                        <div className="mt-2">
                          <audio
                            src={api.getAudioUrl(sub.id)}
                            controls
                            autoPlay
                            onEnded={() => setPlayingId(null)}
                            className="w-full max-w-xs"
                          />
                        </div>
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
  );
}
