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

export interface AnalyzeResult {
  id: string;
  text: string;
  words: Word[];
  score: number;
  fluency: Fluency | null;
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
}

export interface SubmissionEntry {
  id: string;
  speaker_name: string | null;
  score: number;
  fluency_score: number | null;
  created_at: string;
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
    const headers: Record<string, string> = { 'X-User-Id': userId };
    if (speakerName) {
      headers['X-Speaker-Name'] = speakerName;
    }
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error('Analysis failed');
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

  async deleteRecording(id: string, userId: string): Promise<void> {
    const res = await fetch(`/api/recordings/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    });
    if (!res.ok) throw new Error('Failed to delete recording');
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
}

export default api;
