import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api, { Question } from '../lib/api';
import { useRecorder } from '../hooks/useRecorder';
import { useUserId } from '../hooks/useUserId';
import RecordButton from './RecordButton';
import WordPills from './WordPills';
import FluencyDisplay from './FluencyDisplay';
import GrammarDisplay from './GrammarDisplay';
import Banner from './Banner';
import MicPermissionAlert from './MicPermissionAlert';

export default function QuestionAnswerView() {
  const { id } = useParams<{ id: string }>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speakerName, setSpeakerName] = useState(() => localStorage.getItem('speech_speaker_name') || '');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userId = useUserId();

  const { isRecording, isAnalyzing, result, audioBlob, error: recorderError, startRecording, stopRecording, reset } = useRecorder();

  useEffect(() => {
    const fetchQuestion = async () => {
      if (!id) return;
      try {
        const q = await api.getQuestion(id);
        setQuestion(q);
        setTimeRemaining(q.time_limit_secs);
      } catch {
        setError('Question not found');
      } finally {
        setLoading(false);
      }
    };
    fetchQuestion();
  }, [id]);

  useEffect(() => {
    if (isRecording && question) {
      setTimeRemaining(question.time_limit_secs);
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            stopRecording();
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, question, stopRecording]);

  const handleNameChange = (name: string) => {
    setSpeakerName(name);
    localStorage.setItem('speech_speaker_name', name);
  };

  const handleRecordClick = () => {
    if (!question) return;
    if (!speakerName.trim()) {
      alert('Please enter your name');
      return;
    }
    if (isRecording) {
      stopRecording();
    } else {
      reset();
      startRecording(question.text, speakerName.trim(), id);
    }
  };

  const handleSubmit = async () => {
    if (!result) return;
    setIsSubmitting(true);
    try {
      await api.submitRecording(result.id, userId);
      setHasSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit recording');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReRecord = () => {
    if (result) {
      api.deleteDraftRecording(result.id, userId).catch(() => {});
    }
    reset();
    setHasSubmitted(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900">
        <Banner />
        <div className="flex items-center justify-center h-[calc(100vh-40px)]">
          <p className="text-zinc-500 dark:text-zinc-400">Loading question...</p>
        </div>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900">
        <Banner />
        <div className="flex items-center justify-center h-[calc(100vh-40px)]">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Question not found'}</p>
            <a href="/" className="text-blue-500 hover:underline">Go home</a>
          </div>
        </div>
      </div>
    );
  }

  if (hasSubmitted && result) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900">
        <Banner />
        <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
            <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Question:</div>
            <div className="text-lg text-zinc-800 dark:text-zinc-200 italic">"{question.text}"</div>
          </div>

          <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              ✅ Submitted!
            </h2>
            <div className="space-y-4">
              {/* IELTS Band */}
              {result.ielts_band != null && (
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase text-indigo-400 tracking-wide">IELTS Speaking Band</div>
                    <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{result.ielts_band.toFixed(1)}</div>
                  </div>
                  <div className="text-xs text-indigo-500 dark:text-indigo-400 max-w-[180px] text-right">
                    Based on pronunciation, fluency, and accuracy
                  </div>
                </div>
              )}

              {/* Score summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {(result.words.length > 0
                      ? (result.words.reduce((sum, w) => sum + w.score, 0) / result.words.length * 100)
                      : 0
                    ).toFixed(1)}%
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Pronunciation</div>
                </div>
                {result.fluency && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {result.fluency.score.toFixed(1)}%
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">Fluency</div>
                  </div>
                )}
                {result.grammar && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {result.grammar.score.toFixed(1)}%
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">Accuracy</div>
                  </div>
                )}
              </div>

              {/* Detailed fluency analysis */}
              <FluencyDisplay fluency={result.fluency} />

              {/* Detailed grammar/accuracy analysis */}
              <GrammarDisplay grammar={result.grammar} />

              <div className="border-t border-gray-200 dark:border-zinc-600 pt-4">
                <div className="text-xs uppercase text-zinc-400 tracking-wide mb-2">Recognized speech</div>
                <div className="text-sm text-zinc-800 dark:text-zinc-200 italic mb-3">"{result.text}"</div>
                <WordPills words={result.words} audioBlob={audioBlob} audioUrl={api.getAudioUrl(result.id)} />
              </div>

              {audioBlob && (
                <div className="border-t border-gray-200 dark:border-zinc-600 pt-4">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Your recording:</div>
                  <audio src={URL.createObjectURL(audioBlob)} controls className="w-full" />
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-zinc-600 pt-4">
                <a
                  href={`/q/${id}/results`}
                  className="block w-full px-4 py-3 text-center text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  📋 View All Submissions & Teacher Feedback
                </a>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900">
      <Banner />
      <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
          <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Question:</div>
          <div className="text-lg text-zinc-800 dark:text-zinc-200 italic">"{question.text}"</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
            Time limit: {formatTime(question.time_limit_secs)}
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
              disabled={isRecording || isAnalyzing || !!result}
              className="w-full px-4 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {isRecording && (
            <div className="text-center mb-4">
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                {formatTime(timeRemaining)}
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">remaining</div>
            </div>
          )}

          <div className="flex flex-col items-center gap-4 mb-4">
            <RecordButton
              isRecording={isRecording}
              isAnalyzing={isAnalyzing}
              onClick={handleRecordClick}
            />
            {!isRecording && !isAnalyzing && !result && (
              <p className="text-xs text-zinc-400">Click to start recording</p>
            )}
            {isAnalyzing && (
              <p className="text-xs text-zinc-400">Analyzing your speech...</p>
            )}
          </div>

          {(recorderError || error) && (recorderError === 'microphone_permission_denied' ? (
            <MicPermissionAlert />
          ) : (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
              {recorderError || error}
            </div>
          ))}

          {result && !hasSubmitted && (
            <div className="space-y-4">
              {/* IELTS Band */}
              {result.ielts_band != null && (
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase text-indigo-400 tracking-wide">IELTS Speaking Band</div>
                    <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{result.ielts_band.toFixed(1)}</div>
                  </div>
                  <div className="text-xs text-indigo-500 dark:text-indigo-400 max-w-[180px] text-right">
                    Based on pronunciation, fluency, and accuracy
                  </div>
                </div>
              )}

              {/* Score summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {(result.words.length > 0
                      ? (result.words.reduce((sum, w) => sum + w.score, 0) / result.words.length * 100)
                      : 0
                    ).toFixed(1)}%
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Pronunciation</div>
                </div>
                {result.fluency && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {result.fluency.score.toFixed(1)}%
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">Fluency</div>
                  </div>
                )}
                {result.grammar && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {result.grammar.score.toFixed(1)}%
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">Accuracy</div>
                  </div>
                )}
              </div>

              {/* Detailed fluency analysis */}
              <FluencyDisplay fluency={result.fluency} />

              {/* Detailed grammar/accuracy analysis */}
              <GrammarDisplay grammar={result.grammar} />

              <div className="border-t border-gray-200 dark:border-zinc-600 pt-4">
                <div className="text-xs uppercase text-zinc-400 tracking-wide mb-2">Recognized speech</div>
                <div className="text-sm text-zinc-800 dark:text-zinc-200 italic mb-3">"{result.text}"</div>
                <WordPills words={result.words} audioBlob={audioBlob} audioUrl={api.getAudioUrl(result.id)} />
              </div>

              {audioBlob && (
                <div className="border-t border-gray-200 dark:border-zinc-600 pt-4">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Your recording:</div>
                  <audio src={URL.createObjectURL(audioBlob)} controls className="w-full" />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleReRecord}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 text-sm bg-gray-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50"
                >
                  Re-record
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
