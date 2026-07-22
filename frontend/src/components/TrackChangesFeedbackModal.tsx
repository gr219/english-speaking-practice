import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface TrackChangesFeedbackModalProps {
  submissionId: string;
  originalText: string;
  speakerName: string | null;
  questionId: string;
  userId: string;
  onClose: () => void;
  onSent: () => void;
}

export default function TrackChangesFeedbackModal({
  submissionId,
  originalText,
  speakerName,
  questionId,
  userId,
  onClose,
  onSent,
}: TrackChangesFeedbackModalProps) {
  const [editedText, setEditedText] = useState(originalText);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSend = async () => {
    if (editedText === originalText && !comment.trim()) {
      setError('Please make changes to the text or add a comment.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.createDiffFeedback(submissionId, questionId, originalText, editedText, comment.trim(), userId);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
          Edit & Give Feedback
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          {speakerName || 'Anonymous'}'s submission — edit the text to show corrections
        </p>

        <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
          Student's answer (edit to mark corrections):
        </label>
        <textarea
          ref={textareaRef}
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y mb-4"
        />

        <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
          General comment (optional):
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Add a general comment..."
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y mb-4"
        />

        {error && (
          <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}
