import { useState, useEffect, useCallback } from 'react';
import RecordButton from './RecordButton';
import { useRecorder } from '../hooks/useRecorder';
import api, { AnalyzeResult, ExampleSentence } from '../lib/api';
import CreateQuestionModal from './CreateQuestionModal';
import MicPermissionAlert from './MicPermissionAlert';

interface RecordingViewProps {
  onResult: (result: AnalyzeResult, audioBlob?: Blob) => void;
  prefillText?: string;
}

export default function RecordingView({ onResult, prefillText }: RecordingViewProps) {
  const { isRecording, isAnalyzing, result, audioBlob, error, startRecording, stopRecording, reset } =
    useRecorder();
  const [example, setExample] = useState<ExampleSentence | null>(null);
  const [customText, setCustomText] = useState(prefillText || '');
  const [useCustom, setUseCustom] = useState(!!prefillText);
  const [speakerName, setSpeakerName] = useState(() => localStorage.getItem('speech_speaker_name') || '');
  const [showCreateQuestion, setShowCreateQuestion] = useState(false);

  useEffect(() => {
    if (prefillText) {
      setCustomText(prefillText);
      setUseCustom(true);
    }
  }, [prefillText]);

  const handleNameChange = (name: string) => {
    setSpeakerName(name);
    localStorage.setItem('speech_speaker_name', name);
  };

  const fetchExample = useCallback(async () => {
    try {
      const ex = await api.getExample();
      setExample(ex);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchExample();
  }, [fetchExample]);

  useEffect(() => {
    if (result) {
      onResult(result, audioBlob ?? undefined);
    }
  }, [result, audioBlob, onResult]);

  const handleRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      if (!speakerName.trim()) {
        alert('Please enter your full name before recording.');
        return;
      }
      reset();
      const targetText = useCustom && customText.trim() ? customText.trim() : example?.text || '';
      startRecording(targetText || undefined, speakerName.trim() || undefined);
    }
  };

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-lg w-full">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Practice your pronunciation
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          {isRecording
            ? 'Recording... click to stop when done'
            : 'Type your own text or use the random sentence below'}
        </p>

        {/* Create Question Modal */}
        {showCreateQuestion && (
          <CreateQuestionModal onClose={() => setShowCreateQuestion(false)} />
        )}

        {/* Recording UI - hidden when creating question */}
        {!showCreateQuestion && (
          <>
            {/* Speaker name */}
            <div className="mb-4">
              <input
                type="text"
                value={speakerName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Your full name (required)"
                className="w-full px-4 py-2 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 focus:border-transparent"
              />
            </div>

            {/* Custom text input */}
            <div className="mb-4">
              <textarea
                value={customText}
                onChange={(e) => { setCustomText(e.target.value); setUseCustom(true); }}
                placeholder="Type or paste your own text here..."
                className="w-full px-4 py-3 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 focus:border-transparent"
                rows={3}
              />
              {useCustom && customText.trim() && (
                <button
                  onClick={() => {
                    const utterance = new SpeechSynthesisUtterance(customText.trim());
                    utterance.lang = 'en-US';
                    utterance.rate = 0.9;
                    speechSynthesis.cancel();
                    speechSynthesis.speak(utterance);
                  }}
                  className="mt-2 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-700 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors inline-flex items-center gap-1"
                  title="Listen to how this text sounds"
                >
                  🔊 Listen
                </button>
              )}
            </div>

            {/* Random example — hidden when custom text is entered */}
            {example && (!useCustom || !customText.trim()) && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs uppercase text-zinc-400 tracking-wide">Reading:</div>
                  <button
                    onClick={() => {
                      const utterance = new SpeechSynthesisUtterance(example.text);
                      utterance.lang = 'en-US';
                      utterance.rate = 0.9;
                      speechSynthesis.cancel();
                      speechSynthesis.speak(utterance);
                    }}
                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    title="Listen to how this text sounds"
                  >
                    🔊
                  </button>
                </div>
                <div className="text-base text-zinc-800 dark:text-zinc-200 italic">"{example.text}"</div>
              </div>
            )}

            {/* Active text indicator when using custom */}
            {useCustom && customText.trim() && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="text-xs uppercase text-zinc-400 tracking-wide mb-2">Reading:</div>
                <div className="text-base text-zinc-800 dark:text-zinc-200 italic">"{customText.trim()}"</div>
              </div>
            )}

            <div className="flex flex-col items-center gap-4">
              <RecordButton
                isRecording={isRecording}
                isAnalyzing={isAnalyzing}
                onClick={handleRecordClick}
              />
              {!isRecording && !isAnalyzing && (
                <p className="text-xs text-zinc-400">Click to start recording</p>
              )}
              {isAnalyzing && (
                <p className="text-xs text-zinc-400">Analyzing your speech...</p>
              )}
            </div>

            {error && error === 'microphone_permission_denied' ? (
              <MicPermissionAlert />
            ) : error ? (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </>
        )}

        {!isRecording && !isAnalyzing && (
          <div className="flex flex-col gap-2 mt-4">
            {!showCreateQuestion && (
              <button
                onClick={fetchExample}
                className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-700 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
              >
                ↻ New Sentence
              </button>
            )}
            <button
              onClick={() => setShowCreateQuestion(!showCreateQuestion)}
              className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-700 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
            >
              📝 {showCreateQuestion ? 'Back to Recording' : 'Create Question'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
