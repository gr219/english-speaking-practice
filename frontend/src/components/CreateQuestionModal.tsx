import { useState } from 'react';
import api from '../lib/api';
import { useUserId } from '../hooks/useUserId';

interface CreateQuestionModalProps {
  onClose: () => void;
}

export default function CreateQuestionModal({ onClose }: CreateQuestionModalProps) {
  const userId = useUserId();
  const [text, setText] = useState('');
  const [timeLimitSecs, setTimeLimitSecs] = useState(120);
  const [isCreating, setIsCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || timeLimitSecs < 10 || timeLimitSecs > 600) {
      setError('Please enter valid question text and time limit (10-600 seconds)');
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const result = await api.createQuestion(text.trim(), timeLimitSecs, userId);
      setCreatedId(result.id);
    } catch {
      setError('Failed to create question');
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  if (createdId) {
    const questionUrl = `${window.location.origin}/q/${createdId}`;
    const resultsUrl = `${window.location.origin}/q/${createdId}/results`;
    return (
      <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          ✅ Question Created!
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">
              Share with students:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={questionUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded text-zinc-800 dark:text-zinc-200"
              />
              <button
                onClick={() => copyToClipboard(questionUrl)}
                className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">
              View submissions:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={resultsUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded text-zinc-800 dark:text-zinc-200"
              />
              <button
                onClick={() => copyToClipboard(resultsUrl)}
                className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-gray-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-6 mb-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
        📝 Create Question
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">
            Question / Prompt:
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g., Describe your favorite vacation destination..."
            className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent"
            rows={3}
            required
          />
        </div>
        <div>
          <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">
            Time Limit (seconds):
          </label>
          <input
            type="number"
            value={timeLimitSecs}
            onChange={(e) => setTimeLimitSecs(parseInt(e.target.value) || 120)}
            min={10}
            max={600}
            className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent"
            required
          />
          <p className="text-xs text-zinc-400 mt-1">Min: 10s, Max: 600s (10 minutes)</p>
        </div>
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isCreating}
            className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Question'}
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
      </form>
    </div>
  );
}
