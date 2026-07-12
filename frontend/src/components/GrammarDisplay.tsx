import { Grammar } from '../lib/api';
import { getScoreTextColor } from '../lib/utils';

interface GrammarDisplayProps {
  grammar: Grammar | null;
}

export default function GrammarDisplay({ grammar }: GrammarDisplayProps) {
  if (!grammar) return null;

  return (
    <div className="mt-4 mb-6">
      <div className="text-xs uppercase text-zinc-400 tracking-wide">Accuracy Score</div>
      <div className={`text-2xl font-bold ${getScoreTextColor(grammar.score)}`}>
        {grammar.score.toFixed(1)}
        <span className="text-base text-zinc-400">%</span>
      </div>
    </div>
  );
}
