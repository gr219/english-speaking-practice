import { useState, useEffect, useRef, useCallback } from 'react';
import api, { Question } from '../lib/api';
import { useUserId } from '../hooks/useUserId';
import Banner from './Banner';

interface GrammarIssue {
  message: string;
  start: number;
  end: number;
  suggestions: string[];
}

interface WritingAnswerViewProps {
  question: Question;
}

export default function WritingAnswerView({ question }: WritingAnswerViewProps) {
  const userId = useUserId();
  const [speakerName, setSpeakerName] = useState(() => localStorage.getItem('speech_speaker_name') || '');
  const [answer, setAnswer] = useState('');
  const [issues, setIssues] = useState<GrammarIssue[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linterRef = useRef<any>(null);

  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const wordLimit = question.time_limit_secs; // For writing questions, time_limit_secs stores word limit

  useEffect(() => {
    return () => {
      if (linterRef.current) {
        linterRef.current.dispose().catch(() => {});
      }
    };
  }, []);

  const getLinter = useCallback(async () => {
    if (linterRef.current) return linterRef.current;
    const harper = await import('harper.js');
    const { binary } = await import('harper.js/binary');
    const linter = new harper.WorkerLinter({ binary, dialect: harper.Dialect.American });
    linterRef.current = linter;
    return linter;
  }, []);

  const handleCheckGrammar = async () => {
    if (!answer.trim()) return;
    setIsChecking(true);
    setError(null);
    try {
      const linter = await getLinter();
      const lints = await linter.lint(answer);
      const grammarIssues: GrammarIssue[] = lints.map((lint: any) => {
        const span = lint.span();
        const suggestions: string[] = lint.suggestions().map((s: any) => s.get_replacement_text());
        return {
          message: lint.message(),
          start: span.start,
          end: span.end,
          suggestions,
        };
      });
      setIssues(grammarIssues);
      setHasChecked(true);
    } catch (err) {
      setError('Failed to check grammar. Please try again.');
      console.error('Harper lint error:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const applySuggestion = (issue: GrammarIssue, replacement: string) => {
    const newAnswer = answer.slice(0, issue.start) + replacement + answer.slice(issue.end);
    setAnswer(newAnswer);
    setIssues([]);
    setHasChecked(false);
  };

  const handleNameChange = (name: string) => {
    setSpeakerName(name);
    localStorage.setItem('speech_speaker_name', name);
  };

  const handleSubmit = async () => {
    if (!answer.trim()) return;
    if (!speakerName.trim()) {
      setError('Please enter your name');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      // Submit as a recording with the text answer (using the analyze endpoint with a special flow)
      // For writing, we submit text directly via a new endpoint
      await api.submitWritingAnswer(question.id, answer.trim(), speakerName.trim(), userId);
      setHasSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasSubmitted) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900">
        <Banner />
        <div className="p-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Question:</div>
              <div className="text-lg text-zinc-800 dark:text-zinc-200 italic">"{question.text}"</div>
            </div>
            <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">✅ Submitted!</h2>
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">Your writing answer has been submitted successfully.</div>
              <div className="bg-gray-50 dark:bg-zinc-700 rounded-lg p-4 mb-4">
                <div className="text-xs uppercase text-zinc-400 tracking-wide mb-2">Your answer ({wordCount} words)</div>
                <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{answer}</div>
              </div>
              <a
                href={`/q/${question.id}/results`}
                className="block w-full px-4 py-3 text-center text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
              >
                📋 View All Submissions & Teacher Feedback
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderHighlightedText = () => {
    if (issues.length === 0) return null;
    const sorted = [...issues].sort((a, b) => a.start - b.start);
    const parts: JSX.Element[] = [];
    let lastEnd = 0;

    sorted.forEach((issue, idx) => {
      if (issue.start > lastEnd) {
        parts.push(<span key={`t-${idx}`}>{answer.slice(lastEnd, issue.start)}</span>);
      }
      parts.push(
        <span
          key={`h-${idx}`}
          className="bg-red-200 dark:bg-red-900/50 border-b-2 border-red-500 cursor-help"
          title={issue.message}
        >
          {answer.slice(issue.start, issue.end)}
        </span>
      );
      lastEnd = issue.end;
    });
    if (lastEnd < answer.length) {
      parts.push(<span key="t-last">{answer.slice(lastEnd)}</span>);
    }
    return (
      <div className="p-3 bg-gray-50 dark:bg-zinc-700 rounded-lg text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap mb-4">
        {parts}
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">✍️ Writing Question:</div>
        <div className="text-lg text-zinc-800 dark:text-zinc-200 italic">"{question.text}"</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
          Words limit: {wordLimit} words
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-6">
        <div className="mb-4">
          <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">Your name (required):</label>
          <input
            type="text"
            value={speakerName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Enter your name"
            disabled={isSubmitting}
            className="w-full px-4 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent disabled:opacity-50"
          />
        </div>

        <div className="mb-4">
          <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">Your answer:</label>
          <textarea
            value={answer}
            onChange={(e) => { setAnswer(e.target.value); setHasChecked(false); setIssues([]); }}
            placeholder="Write your answer here..."
            rows={8}
            disabled={isSubmitting}
            className="w-full px-4 py-3 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent disabled:opacity-50 resize-y"
          />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-xs ${wordCount > wordLimit ? 'text-red-500 font-semibold' : 'text-zinc-400'}`}>
              {wordCount}/{wordLimit} words
            </span>
            {wordCount > wordLimit && (
              <span className="text-xs text-red-500">Exceeds word limit!</span>
            )}
          </div>
        </div>

        {/* Highlighted text with issues */}
        {renderHighlightedText()}

        {/* Grammar issues list */}
        {issues.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              ⚠️ {issues.length} issue{issues.length > 1 ? 's' : ''} found:
            </div>
            {issues.map((issue, idx) => (
              <div key={idx} className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="text-sm text-zinc-800 dark:text-zinc-200 mb-1">
                  <span className="font-medium text-red-600 dark:text-red-400">"{answer.slice(issue.start, issue.end)}"</span>
                  {' — '}{issue.message}
                </div>
                {issue.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {issue.suggestions.map((sug, si) => (
                      <button
                        key={si}
                        onClick={() => applySuggestion(issue, sug)}
                        className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                      >
                        {sug || '(remove)'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {hasChecked && issues.length === 0 && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
            ✅ No grammar issues found!
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleCheckGrammar}
            disabled={isChecking || !answer.trim() || isSubmitting}
            className="flex-1 px-4 py-2 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isChecking ? '🔍 Checking...' : '🔍 Check Grammar'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !answer.trim() || wordCount > wordLimit}
            className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : '📤 Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
