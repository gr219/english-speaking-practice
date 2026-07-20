export interface Word {
  text: string;
  score: number;
  start: number;
  end: number;
}

export interface Fluency {
  score: number;
  wpm: number;
  pause_count: number;
  longest_pause: number;
  rhythm_score: number;
}

export interface GrammarIssue {
  kind: string;
  message: string;
}

export interface Grammar {
  score: number;
  issues: GrammarIssue[];
}

export interface AnalyzeResult {
  id: string;
  text: string;
  words: Word[];
  score: number;
  fluency: Fluency | null;
  grammar: Grammar | null;
  example_text: string | null;
  ielts_band: number | null;
}

export interface ExampleSentence {
  text: string;
  pronounce: string[];
}

export interface RecordingSummary {
  id: string;
  text: string;
  score: number;
  speaker_name: string | null;
  created_at: string;
}

export interface RecordingDetail {
  id: string;
  user_id: string;
  text: string;
  score: number;
  words_json: string;
  fluency_json: string | null;
  grammar_json: string | null;
  ielts_band: number | null;
  example_text: string | null;
  audio_path: string;
  created_at: string;
}

export interface LeaderboardEntry {
  id: string;
  text: string;
  score: number;
  speaker_name: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  creator_id: string;
  text: string;
  time_limit_secs: number;
  created_at: string;
  question_type: string | null;
}

export interface SubmissionEntry {
  id: string;
  speaker_name: string | null;
  score: number;
  fluency_score: number | null;
  created_at: string;
  feedback_text: string | null;
}

const api = {
  async analyze(audioBlob: Blob, userId: string, targetText?: string, speakerName?: string, questionId?: string): Promise<AnalyzeResult> {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    if (targetText) {
      formData.append('target_text', targetText);
    }
    if (questionId) {
      formData.append('question_id', questionId);
    }
    if (speakerName) {
      formData.append('speaker_name', speakerName);
    }
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Analysis failed');
    }
    return res.json();
  },

  async getExample(): Promise<ExampleSentence> {
    const res = await fetch('/api/example');
    if (!res.ok) throw new Error('Failed to get example');
    return res.json();
  },

  async getRecordings(userId: string): Promise<RecordingSummary[]> {
    const res = await fetch(`/api/recordings?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('Failed to get recordings');
    return res.json();
  },

  async getRecording(id: string): Promise<RecordingDetail> {
    const res = await fetch(`/api/recordings/${id}`);
    if (!res.ok) throw new Error('Recording not found');
    return res.json();
  },

  async deleteRecording(id: string, userId: string, adminToken?: string): Promise<void> {
    const headers: Record<string, string> = { 'X-User-Id': userId };
    if (adminToken) {
      headers['X-Admin-Token'] = adminToken;
    }
    const res = await fetch(`/api/recordings/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete recording');
    }
  },

  async lookupPronounce(words: string[]): Promise<string[]> {
    const res = await fetch('/api/pronounce', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(words),
    });
    if (!res.ok) throw new Error('Lookup failed');
    return res.json();
  },

  getAudioUrl(recordingId: string): string {
    return `/api/recordings/${recordingId}/audio`;
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) throw new Error('Failed to get leaderboard');
    return res.json();
  },

  async createQuestion(text: string, timeLimitSecs: number, userId: string): Promise<{ id: string }> {
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({ text, time_limit_secs: timeLimitSecs }),
    });
    if (!res.ok) throw new Error('Failed to create question');
    return res.json();
  },

  async getQuestion(id: string): Promise<Question> {
    const res = await fetch(`/api/questions/${id}`);
    if (!res.ok) throw new Error('Question not found');
    return res.json();
  },

  async getQuestionSubmissions(id: string): Promise<SubmissionEntry[]> {
    const res = await fetch(`/api/questions/${id}/submissions`);
    if (!res.ok) throw new Error('Failed to get submissions');
    return res.json();
  },

  async listQuestions(userId: string): Promise<QuestionSummary[]> {
    const res = await fetch(`/api/questions?creator_id=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('Failed to list questions');
    return res.json();
  },

  async deleteQuestion(id: string, userId: string, adminToken?: string): Promise<void> {
    const headers: Record<string, string> = { 'X-User-Id': userId };
    if (adminToken) {
      headers['X-Admin-Token'] = adminToken;
    }
    const res = await fetch(`/api/questions/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete question');
    }
  },

  // Admin endpoints
  async verifyAdmin(password: string): Promise<boolean> {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.valid;
  },

  async adminListQuestions(adminToken: string): Promise<QuestionWithCreator[]> {
    const res = await fetch('/api/admin/questions', {
      headers: { 'X-Admin-Token': adminToken },
    });
    if (!res.ok) throw new Error('Failed to list questions');
    return res.json();
  },

  async adminDeleteQuestion(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`/api/admin/questions/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': adminToken },
    });
    if (!res.ok) throw new Error('Failed to delete question');
  },

  async adminDeleteRecording(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`/api/admin/recordings/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': adminToken },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete recording');
    }
  },

  async adminGetRecentSubmissions(adminToken: string, since: string): Promise<RecentSubmission[]> {
    const res = await fetch(`/api/admin/submissions/recent?since=${encodeURIComponent(since)}`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    if (!res.ok) return [];
    return res.json();
  },

  // Batch question creation
  async createQuestionsBatch(questions: { text: string; time_limit_secs: number; class_label?: string | null; question_type?: string | null }[], userId: string): Promise<{ ids: string[] }> {
    const res = await fetch('/api/questions/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify(questions),
    });
    if (!res.ok) throw new Error('Failed to create questions');
    return res.json();
  },

  // Feedback endpoints
  async createFeedback(recordingId: string, questionId: string, feedbackText: string, userId: string): Promise<{ id: string }> {
    const res = await fetch(`/api/recordings/${recordingId}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({ feedback_text: feedbackText, question_id: questionId }),
    });
    if (!res.ok) throw new Error('Failed to submit feedback');
    return res.json();
  },

  async getFeedbacks(recordingId: string): Promise<Feedback[]> {
    const res = await fetch(`/api/recordings/${recordingId}/feedback`);
    if (!res.ok) throw new Error('Failed to get feedbacks');
    return res.json();
  },

  async submitRecording(id: string, userId: string): Promise<void> {
    const res = await fetch(`/api/recordings/${id}/submit`, {
      method: 'POST',
      headers: { 'X-User-Id': userId },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to submit recording');
    }
  },

  async deleteDraftRecording(id: string, userId: string): Promise<void> {
    const res = await fetch(`/api/recordings/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    });
    // Ignore 404 — draft may have already been cleaned up
    if (!res.ok && res.status !== 404) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete draft recording');
    }
  },

  async listHomework(userId: string, classLabel?: string): Promise<QuestionSummary[]> {
    const params = new URLSearchParams({ creator_id: userId });
    if (classLabel) params.set('class_label', classLabel);
    const res = await fetch(`/api/homework?${params}`);
    if (!res.ok) throw new Error('Failed to list homework');
    return res.json();
  },

  async adminListHomework(adminToken: string, classLabel?: string): Promise<QuestionWithCreator[]> {
    const params = new URLSearchParams();
    if (classLabel) params.set('class_label', classLabel);
    const res = await fetch(`/api/admin/homework?${params}`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    if (!res.ok) throw new Error('Failed to list homework');
    return res.json();
  },
};

export interface LeaderboardEntry {
  id: string;
  text: string;
  score: number;
  speaker_name: string | null;
  created_at: string;
}

export interface QuestionSummary {
  id: string;
  text: string;
  time_limit_secs: number;
  created_at: string;
  submission_count: number;
  feedback_count: number;
  class_label: string | null;
  question_type: string | null;
}

export interface QuestionWithCreator {
  id: string;
  creator_id: string;
  text: string;
  time_limit_secs: number;
  created_at: string;
  submission_count: number;
  feedback_count: number;
  class_label: string | null;
  question_type: string | null;
}

export interface Feedback {
  id: string;
  recording_id: string;
  question_id: string;
  feedback_text: string;
  created_by: string;
  created_at: string;
}

export interface RecentSubmission {
  id: string;
  speaker_name: string | null;
  score: number;
  question_id: string | null;
  question_text: string | null;
  created_at: string;
}

export default api;
