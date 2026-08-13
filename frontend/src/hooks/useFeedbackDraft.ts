const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface FeedbackDraft {
  editedText: string;
  comment: string;
  savedAt: number;
}

function makeKey(submissionId: string, questionId: string) {
  return `feedback_draft:${submissionId}:${questionId}`;
}

export function useFeedbackDraft(submissionId: string, questionId: string) {
  const key = makeKey(submissionId, questionId);

  const load = (): FeedbackDraft | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const draft: FeedbackDraft = JSON.parse(raw);
      if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(key);
        return null;
      }
      return draft;
    } catch {
      return null;
    }
  };

  const save = (draft: Omit<FeedbackDraft, 'savedAt'>) => {
    localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }));
  };

  const clear = () => localStorage.removeItem(key);

  return { load, save, clear };
}
