import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { Word, Fluency } from '../lib/api';
import WordPills from './WordPills';
import FluencyDisplay from './FluencyDisplay';
import { getScoreTextColor, computeIeltsBand } from '../lib/utils';

interface SharedRecording {
  id: string;
  text: string;
  score: number;
  words: Word[];
  fluency: Fluency | null;
  ielts_band: number;
}

export default function ShareView() {
  const { id } = useParams<{ id: string }>();
  const [recording, setRecording] = useState<SharedRecording | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getRecording(id)
      .then((rec) => {
        const fluency = rec.fluency_json ? JSON.parse(rec.fluency_json) : null;
        setRecording({
          id: rec.id,
          text: rec.text,
          score: rec.score,
          words: JSON.parse(rec.words_json),
          fluency,
          ielts_band: computeIeltsBand(rec.score, fluency?.score ?? null),
        });
      })
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-zinc-900 mb-2">Recording not found</h1>
          <p className="text-sm text-zinc-500 mb-4">
            This recording may have been deleted or the link is invalid.
          </p>
          <Link
            to="/"
            className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800"
          >
            Try Speech yourself →
          </Link>
        </div>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  const audioUrl = api.getAudioUrl(recording.id);

  const playFullAudio = () => {
    new Audio(audioUrl).play();
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎙️</span>
            <span className="text-sm font-semibold text-zinc-900">Speech</span>
          </div>
          <Link
            to="/"
            className="text-xs text-zinc-500 hover:text-zinc-700"
          >
            Try it yourself →
          </Link>
        </div>

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
            className="px-4 py-2 bg-gray-100 rounded-md text-sm text-zinc-700 hover:bg-gray-200 transition-colors"
          >
            ▶ Listen
          </button>
        </div>

        {/* Fluency analysis */}
        <FluencyDisplay fluency={recording.fluency} />

        {/* Recognized text */}
        <div className="mb-4">
          <div className="text-xs uppercase text-zinc-400 tracking-wide mb-2">Recognized speech</div>
          <p className="text-sm text-zinc-700 italic">"{recording.text}"</p>
        </div>

        {/* Word analysis */}
        <WordPills words={recording.words} audioBlob={null} audioUrl={audioUrl} />

        {/* CTA */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-zinc-500 mb-3">Want to practice your pronunciation?</p>
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition-colors"
          >
            Try Speech yourself
          </Link>
        </div>
      </div>
    </div>
  );
}
