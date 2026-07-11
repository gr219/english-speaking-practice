import { useState, useEffect } from 'react';
import { AnalyzeResult } from '../lib/api';
import api from '../lib/api';
import WordPills from './WordPills';
import FluencyDisplay from './FluencyDisplay';
import GrammarDisplay from './GrammarDisplay';
import { getScoreTextColor } from '../lib/utils';

interface ResultsViewProps {
  result: AnalyzeResult;
  audioBlob: Blob | null;
  onNewRecording: () => void;
  onSameRecording: () => void;
  onDelete?: () => void;
}

interface ImprovementWord {
  word: string;
  pronounce: string;
}

export default function ResultsView({
  result,
  audioBlob,
  onNewRecording,
  onSameRecording,
  onDelete,
}: ResultsViewProps) {
  const [improvements, setImprovements] = useState<ImprovementWord[]>([]);

  useEffect(() => {
    const poorWords = [
      ...new Set(result.words.filter((w) => w.score < 0.8).map((w) => w.text)),
    ];
    if (poorWords.length > 0) {
      api.lookupPronounce(poorWords).then((pronunciations) => {
        setImprovements(
          pronunciations.map((p, i) => ({ word: poorWords[i], pronounce: p }))
        );
      });
    }
  }, [result]);

  const playFullAudio = () => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      new Audio(url).play();
    } else {
      new Audio(api.getAudioUrl(result.id)).play();
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/share/${result.id}`;
    await navigator.clipboard.writeText(shareUrl);
    alert('Link copied to clipboard!');
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* IELTS Band */}
      {result.ielts_band != null && (
        <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-indigo-400 tracking-wide">IELTS Speaking Band</div>
            <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{result.ielts_band.toFixed(1)}</div>
          </div>
          <div className="text-xs text-indigo-500 dark:text-indigo-400 max-w-[180px] text-right">
            Based on pronunciation, fluency, and grammar
          </div>
        </div>
      )}

      {/* Original text target */}
      {result.example_text && (
        <div className="mb-4 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-3">
          <div className="text-xs uppercase text-zinc-400 tracking-wide mb-1">Target text</div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300 italic">"{result.example_text}"</div>
        </div>
      )}

      {/* Score header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs uppercase text-zinc-400 tracking-wide">Overall Score</div>
          <div className={`text-4xl font-bold ${getScoreTextColor(result.score)}`}>
            {result.score.toFixed(1)}
            <span className="text-xl text-zinc-400">%</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={playFullAudio}
            className="px-3 py-2 bg-gray-100 rounded-md text-sm text-zinc-700 hover:bg-gray-200 transition-colors"
          >
            ▶ Replay
          </button>
          <button
            onClick={handleShare}
            className="px-3 py-2 bg-gray-100 rounded-md text-sm text-zinc-700 hover:bg-gray-200 transition-colors"
          >
            🔗 Share
          </button>
        </div>
      </div>

      {/* Fluency analysis */}
      <FluencyDisplay fluency={result.fluency} />

      {/* Grammar analysis */}
      <GrammarDisplay grammar={result.grammar} />

      {/* Word analysis */}
      <WordPills words={result.words} audioBlob={audioBlob} audioUrl={api.getAudioUrl(result.id)} />

      {/* Improvements */}
      {improvements.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Words to improve</h3>
          <div className="grid grid-cols-2 gap-3">
            {improvements.map((item) => (
              <div
                key={item.word}
                className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-3"
              >
                <div className="text-sm font-semibold text-red-700 dark:text-red-400">{item.word}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{item.pronounce}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-zinc-700 flex flex-col gap-3">
        <button
          onClick={onNewRecording}
          className="w-full py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          ⏺ Start a New Recording
        </button>
        <button
          onClick={onSameRecording}
          className="w-full py-3 bg-gray-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
        >
          ↻ Try Same Sentence
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="w-full py-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            🗑 Delete this recording
          </button>
        )}
      </div>
    </div>
  );
}
