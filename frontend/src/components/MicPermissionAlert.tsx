interface MicPermissionAlertProps {
  onDismiss?: () => void;
}

export default function MicPermissionAlert({ onDismiss }: MicPermissionAlertProps) {
  return (
    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">🎙️</span>
        <div className="flex-1">
          <p className="font-semibold text-red-800 dark:text-red-200 mb-1">
            Microphone access denied
          </p>
          <p className="text-sm text-red-700 dark:text-red-300 mb-2">
            You need to allow microphone permission for speech recording to work.
            Without it, all scores will show 0%.
          </p>
          <ol className="text-sm text-red-700 dark:text-red-300 list-decimal list-inside space-y-1">
            <li>Reload this page</li>
            <li>Click <strong>"Allow"</strong> when the browser asks for microphone permission</li>
            <li>Try recording again</li>
          </ol>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="mt-3 text-xs text-red-600 dark:text-red-400 underline hover:no-underline"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
