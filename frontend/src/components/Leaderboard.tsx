import { useEffect, useState } from 'react';
import api, { LeaderboardEntry } from '../lib/api';
import { getScoreTextColor, truncateText } from '../lib/utils';

interface LeaderboardProps {
  refreshTrigger: number;
  onSelectRecording?: (id: string) => void;
}

export default function Leaderboard({ refreshTrigger, onSelectRecording }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    api.getLeaderboard().then(setEntries).catch(() => {});
  }, [refreshTrigger]);

  if (entries.length === 0) return null;

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-1">
        🏆 Top Scores
      </h3>
      <div className="space-y-1.5">
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            onClick={() => onSelectRecording?.(entry.id)}
            className={`flex items-center gap-2 p-2 rounded-md bg-white dark:bg-zinc-700 border border-gray-100 dark:border-zinc-600 ${
              onSelectRecording ? 'cursor-pointer hover:border-gray-300 dark:hover:border-zinc-500' : ''
            }`}
          >
            <span className={`text-xs font-bold w-5 text-center ${
              i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-zinc-400'
            }`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-zinc-700 dark:text-zinc-200 truncate">
                {truncateText(entry.text || 'Untitled', 20)}
              </div>
              {entry.speaker_name && (
                <div className="text-[10px] text-zinc-400 italic">{entry.speaker_name}</div>
              )}
            </div>
            <span className={`text-xs font-bold ${getScoreTextColor(entry.score)}`}>
              {entry.score.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
