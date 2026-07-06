import { Grammar } from '../lib/api';
import { getScoreTextColor } from '../lib/utils';

interface GrammarDisplayProps {
  grammar: Grammar | null;
}

function getIssueIcon(kind: string): string {
  switch (kind) {
    case 'missing_words': return '⚠️';
    case 'extra_words': return '➕';
    case 'wrong_word': return '✗';
    case 'word_order': return '🔀';
    default: return '•';
  }
}

export default function GrammarDisplay({ grammar }: GrammarDisplayProps) {
  if (!grammar) return null;

  return (
    <div className="mt-4 mb-6">
      {/* Grammar score */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase text-zinc-400 tracking-wide">Grammar Score</div>
          <div className={`text-2xl font-bold ${getScoreTextColor(grammar.score)}`}>
            {grammar.score.toFixed(1)}
            <span className="text-base text-zinc-400">%</span>
          </div>
        </div>
      </div>

      {/* Issues */}
      {grammar.issues.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2">
          <div className="text-xs uppercase text-amber-700 dark:text-amber-400 tracking-wide font-semibold mb-2">Grammar Issues</div>
          {grammar.issues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <span className="flex-shrink-0">{getIssueIcon(issue.kind)}</span>
              <span className="text-zinc-800 dark:text-zinc-300">{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {grammar.issues.length === 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <span className="text-sm text-green-700 dark:text-green-300">✓ Perfect grammar — all words match the target!</span>
        </div>
      )}
    </div>
  );
}
