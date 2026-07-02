interface RecordButtonProps {
  isRecording: boolean;
  isAnalyzing: boolean;
  onClick: () => void;
}

export default function RecordButton({ isRecording, isAnalyzing, onClick }: RecordButtonProps) {
  if (isAnalyzing) {
    return (
      <div className="w-14 h-14 bg-zinc-200 rounded-full flex items-center justify-center animate-pulse">
        <div className="w-4 h-4 bg-zinc-400 rounded-full" />
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
        isRecording
          ? 'bg-red-500 hover:bg-red-600 animate-pulse'
          : 'bg-zinc-900 dark:bg-indigo-600 hover:bg-zinc-800 dark:hover:bg-indigo-500'
      }`}
      title={isRecording ? 'Stop recording' : 'Start recording'}
    >
      {isRecording ? (
        <div className="w-5 h-5 bg-white rounded-sm" />
      ) : (
        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      )}
    </button>
  );
}
