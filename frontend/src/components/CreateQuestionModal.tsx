import { useState } from 'react';
import api from '../lib/api';
import { useUserId } from '../hooks/useUserId';

interface CreateQuestionModalProps {
  onClose: () => void;
}

interface QuestionInput {
  text: string;
  timeLimitSecs: number;
}

export default function CreateQuestionModal({ onClose }: CreateQuestionModalProps) {
  const userId = useUserId();
  const [numQuestions, setNumQuestions] = useState<number | ''>('');
  const [questions, setQuestions] = useState<QuestionInput[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleNumChange = (value: string) => {
    const num = parseInt(value);
    if (!value) {
      setNumQuestions('');
      setQuestions([]);
      return;
    }
    if (num < 1 || num > 20) return;
    setNumQuestions(num);
    setQuestions(
      Array.from({ length: num }, (_, i) => questions[i] || { text: '', timeLimitSecs: 120 })
    );
  };

  const updateQuestion = (index: number, field: keyof QuestionInput, value: string | number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validQuestions = questions.filter((q) => q.text.trim());
    if (validQuestions.length === 0) {
      setError('Please enter at least one question');
      return;
    }
    for (const q of validQuestions) {
      if (q.timeLimitSecs < 10 || q.timeLimitSecs > 600) {
        setError('Time limit must be between 10 and 600 seconds');
        return;
      }
    }
    setIsCreating(true);
    setError(null);
    try {
      const payload = validQuestions.map((q) => ({
        text: q.text.trim(),
        time_limit_secs: q.timeLimitSecs,
      }));
      const result = await api.createQuestionsBatch(payload, userId);
      setCreatedIds(result.ids);
    } catch {
      setError('Failed to create questions');
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  if (createdIds.length > 0) {
    return (
      <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          ✅ {createdIds.length} Question{createdIds.length > 1 ? 's' : ''} Created!
        </h2>
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {createdIds.map((id, i) => {
            const questionUrl = `${window.location.origin}/q/${id}`;
            const resultsUrl = `${window.location.origin}/q/${id}/results`;
            return (
              <div key={id} className="border border-gray-200 dark:border-zinc-600 rounded p-3">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                  Question {i + 1}
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400">Student link:</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={questionUrl}
                        readOnly
                        className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded text-zinc-800 dark:text-zinc-200"
                      />
                      <button
                        onClick={() => copyToClipboard(questionUrl)}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400">Results link:</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={resultsUrl}
                        readOnly
                        className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded text-zinc-800 dark:text-zinc-200"
                      />
                      <button
                        onClick={() => copyToClipboard(resultsUrl)}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2 text-sm bg-gray-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-6 mb-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
        📝 Create Questions
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">
            Number of questions:
          </label>
          <input
            type="number"
            value={numQuestions}
            onChange={(e) => handleNumChange(e.target.value)}
            min={1}
            max={20}
            placeholder="Enter number (1-20)"
            className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        {questions.length > 0 && (
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {questions.map((q, i) => (
              <div key={i} className="border border-gray-200 dark:border-zinc-600 rounded-lg p-4">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                  Question {i + 1}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
                      Question / Prompt:
                    </label>
                    <textarea
                      value={q.text}
                      onChange={(e) => updateQuestion(i, 'text', e.target.value)}
                      placeholder="e.g., Describe your favorite vacation destination..."
                      className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
                      Time Limit (seconds):
                    </label>
                    <input
                      type="number"
                      value={q.timeLimitSecs}
                      onChange={(e) => updateQuestion(i, 'timeLimitSecs', parseInt(e.target.value) || 120)}
                      min={10}
                      max={600}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {questions.length > 0 && (
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isCreating}
              className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : `Create ${questions.filter((q) => q.text.trim()).length} Question${questions.filter((q) => q.text.trim()).length !== 1 ? 's' : ''}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 text-sm bg-gray-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

        {questions.length === 0 && (
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-gray-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
