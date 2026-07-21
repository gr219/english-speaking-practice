import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { Word, Fluency, Grammar, Feedback } from '../lib/api';
import WordPills from './WordPills';
import FluencyDisplay from './FluencyDisplay';
import GrammarDisplay from './GrammarDisplay';
import Banner from './Banner';
import { getScoreTextColor } from '../lib/utils';

interface SharedRecording {
  id: string;
  text: string;
  score: number;
  words: Word[];
  fluency: Fluency | null;
  grammar: Grammar | null;
  ielts_band: number | null;
  speaker_name: string | null;
  audio_path: string;
  question_id: string | null;
}

export default function ShareView() {
  const { id } = useParams<{ id: string }>();
  const [recording, setRecording] = useState<SharedRecording | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getRecording(id)
      .then((rec) => {
        const fluency = rec.fluency_json ? JSON.parse(rec.fluency_json) : null;
        const grammar = rec.grammar_json ? JSON.parse(rec.grammar_json) : null;
        setRecording({
          id: rec.id,
          text: rec.text,
          score: rec.score,
          words: JSON.parse(rec.words_json),
          fluency,
          grammar,
          ielts_band: rec.ielts_band,
          speaker_name: rec.speaker_name,
          audio_path: rec.audio_path,
          question_id: rec.question_id,
        });
      })
      .catch(() => setError(true));

    api.getFeedbacks(id).then(setFeedbacks).catch(() => {});
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-900">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Recording not found</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            This recording may have been deleted or the link is invalid.
          </p>
          <Link
            to="/"
            className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200"
          >
            Go home →
          </Link>
        </div>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-900">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  const audioUrl = api.getAudioUrl(recording.id);
  const isWriting = recording.audio_path === '';
  const wordCount = recording.text.trim() ? recording.text.trim().split(/\s+/).length : 0;

  const playFullAudio = () => {
    new Audio(audioUrl).play();
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900">
      <Banner />
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <span className="text-lg">{isWriting ? '✍️' : '🎙️'}</span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {isWriting ? 'Writing' : 'Speech'}
            </span>
          </div>
          {recording.question_id && (
            <Link
              to={`/q/${recording.question_id}`}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {isWriting ? 'Try writing yourself →' : 'Try it yourself →'}
            </Link>
          )}
        </div>

        {/* Student name */}
        {recording.speaker_name && (
          <div className="mb-6 p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg">
            <div className="text-xs uppercase text-zinc-400 tracking-wide mb-1">Student</div>
            <div className="text-base font-medium text-zinc-900 dark:text-zinc-100">{recording.speaker_name}</div>
          </div>
        )}

        {isWriting ? (
          <>
            {/* Writing answer display */}
            <div className="mb-6">
              <div className="text-xs uppercase text-zinc-400 tracking-wide mb-2">Written answer ({wordCount} words)</div>
              <div className="p-4 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{recording.text}</p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* IELTS Band */}
            {recording.ielts_band != null && (
              <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase text-indigo-400 tracking-wide">IELTS Speaking Band</div>
                  <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{recording.ielts_band.toFixed(1)}</div>
                </div>
                <div className="text-xs text-indigo-500 dark:text-indigo-400 max-w-[180px] text-right">
                  Based on pronunciation, fluency, and accuracy
                </div>
              </div>
            )}

            {/* Score */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-xs uppercase text-zinc-400 tracking-wide">Score</div>
                <div className={`text-4xl font-bold ${getScoreTextColor(recording.score)}`}>
                  {recording.score.toFixed(1)}
                  <span className="text-xl text-zinc-400">%</span>
                </div>
              </div>
              <button
                onClick={playFullAudio}
                className="px-4 py-2 bg-gray-100 dark:bg-zinc-700 rounded-md text-sm text-zinc-700 dark:text-zinc-200 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
              >
                ▶ Listen
              </button>
            </div>

            {/* Fluency analysis */}
            <FluencyDisplay fluency={recording.fluency} />

            {/* Grammar analysis */}
            <GrammarDisplay grammar={recording.grammar} />

            {/* Recognized text */}
            <div className="mb-4">
              <div className="text-xs uppercase text-zinc-400 tracking-wide mb-2">Recognized speech</div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 italic">"{recording.text}"</p>
            </div>

            {/* Word analysis */}
            <WordPills words={recording.words} audioBlob={null} audioUrl={audioUrl} />
          </>
        )}

        {/* Feedback section */}
        {feedbacks.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-zinc-700">
            <div className="text-xs uppercase text-zinc-400 tracking-wide mb-3">
              💬 Feedback from teacher
            </div>
            <div className="space-y-3">
              {feedbacks.map((fb) => (
                <div
                  key={fb.id}
                  className="p-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg"
                >
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">{fb.feedback_text}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {new Date(fb.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-zinc-700 text-center">
          {recording.question_id ? (
            <Link
              to={`/q/${recording.question_id}`}
              className="inline-block px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              {isWriting ? 'Try Writing yourself' : 'Try Speech yourself'}
            </Link>
          ) : (
            <>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">Want to practice your pronunciation?</p>
              <Link
                to="/"
                className="inline-block px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                Try Speech yourself
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
