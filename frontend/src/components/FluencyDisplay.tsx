import { Fluency } from '../lib/api';
import { getScoreTextColor } from '../lib/utils';

interface FluencyDisplayProps {
  fluency: Fluency | null;
}

function getWpmLabel(wpm: number): { text: string; color: string } {
  if (wpm >= 120 && wpm <= 150) return { text: 'Good', color: 'text-green-600' };
  if (wpm >= 100 && wpm < 120) return { text: 'A bit slow', color: 'text-amber-500' };
  if (wpm > 150 && wpm <= 180) return { text: 'A bit fast', color: 'text-amber-500' };
  if (wpm < 100) return { text: 'Too slow', color: 'text-red-500' };
  return { text: 'Too fast', color: 'text-red-500' };
}

function getCoachingTip(fluency: Fluency): string {
  const speechRateScore = fluency.wpm >= 120 && fluency.wpm <= 150 ? 100 : fluency.wpm < 120 ? Math.max(0, 100 - (120 - fluency.wpm) * 2) : Math.max(0, 100 - (fluency.wpm - 150) * 1.5);
  const pauseScore = Math.max(0, 100 - fluency.pause_count * 15);

  if (pauseScore <= speechRateScore && pauseScore <= fluency.rhythm_score) {
    return 'Focus on reading through without stopping';
  }
  if (speechRateScore <= pauseScore && speechRateScore <= fluency.rhythm_score) {
    return fluency.wpm < 120
      ? 'Try speaking a bit faster for more natural flow'
      : 'Try slowing down slightly for clearer speech';
  }
  return 'Try to keep a more even pace between words';
}

export default function FluencyDisplay({ fluency }: FluencyDisplayProps) {
  if (!fluency) return null;

  const wpmInfo = getWpmLabel(fluency.wpm);
  const tip = getCoachingTip(fluency);

  return (
    <div className="mt-4 mb-6">
      {/* Fluency score */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase text-zinc-400 tracking-wide">Fluency Score</div>
          <div className={`text-2xl font-bold ${getScoreTextColor(fluency.score)}`}>
            {fluency.score.toFixed(1)}
            <span className="text-base text-zinc-400">%</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">Speech rate</span>
          <span className={`font-medium ${wpmInfo.color}`}>
            {Math.round(fluency.wpm)} WPM — {wpmInfo.text}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">Hesitations</span>
          <span className={`font-medium ${fluency.pause_count === 0 ? 'text-green-600' : 'text-amber-500'}`}>
            {fluency.pause_count === 0 ? 'None ✓' : `${fluency.pause_count} detected`}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">Rhythm</span>
          <span className={`font-medium ${getScoreTextColor(fluency.rhythm_score)}`}>
            {fluency.rhythm_score.toFixed(0)}%
          </span>
        </div>
        {/* Coaching tip */}
        {fluency.score < 90 && (
          <div className="pt-2 border-t border-gray-200 mt-2">
            <p className="text-xs text-zinc-500">
              💡 <span className="font-medium">Tip:</span> {tip}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
