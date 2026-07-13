import { useCallback, useRef } from 'react';
import { Word } from '../lib/api';
import { getScoreColor } from '../lib/utils';

interface WordPillsProps {
  words: Word[];
  audioBlob: Blob | null;
  audioUrl?: string;
}

export default function WordPills({ words, audioBlob, audioUrl }: WordPillsProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playWord = useCallback(
    (word: Word) => {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      let url: string;
      if (audioBlob) {
        url = URL.createObjectURL(audioBlob);
      } else if (audioUrl) {
        url = audioUrl;
      } else {
        return;
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.currentTime = word.start;

      const onTimeUpdate = () => {
        if (audio.currentTime >= word.end) {
          audio.pause();
          audio.removeEventListener('timeupdate', onTimeUpdate);
        }
      };
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.play();
    },
    [audioBlob, audioUrl]
  );

  return (
    <div className="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-4">
      <div className="flex flex-wrap gap-1.5">
        {words.map((word, i) => (
          <button
            key={i}
            onClick={() => playWord(word)}
            className={`px-2.5 py-1 rounded text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity ${getScoreColor(word.score)}`}
            title={`${(word.score * 100).toFixed(0)}%`}
          >
            {word.text}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-400 mt-2">Click any word to hear how you pronounced it</p>
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500"></span> Excellent (&gt;85%)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500"></span> Good (75–85%)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500"></span> Needs work (50–75%)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span> Poor (&lt;50%)</span>
      </div>
    </div>
  );
}
