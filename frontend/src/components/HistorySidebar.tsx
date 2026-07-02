import { useEffect, useState } from 'react';
import api, { RecordingSummary } from '../lib/api';
import { formatRelativeTime, getScoreTextColor, truncateText } from '../lib/utils';

interface HistorySidebarProps {
  userId: string;
  activeId: string | null;
  onSelectRecording: (id: string) => void;
  refreshTrigger: number;
  onRefresh: () => void;
}

export default function HistorySidebar({
  userId,
  activeId,
  onSelectRecording,
  refreshTrigger,
  onRefresh,
}: HistorySidebarProps) {
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getRecordings(userId).then(setRecordings).catch(() => {});
  }, [userId, refreshTrigger]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} recording(s)?`)) return;
    for (const id of selected) {
      try {
        await api.deleteRecording(id, userId);
      } catch { /* skip failures */ }
    }
    setSelected(new Set());
    setSelectMode(false);
    onRefresh();
  };

  const selectAll = () => {
    setSelected(new Set(recordings.map((r) => r.id)));
  };

  if (recordings.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">History</h3>
        <p className="text-xs text-zinc-400">No recordings yet. Start practicing!</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">History</h3>
        <button
          onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
          className="text-[11px] text-zinc-500 hover:text-zinc-700"
        >
          {selectMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      {selectMode && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => selected.size === recordings.length ? setSelected(new Set()) : selectAll()}
            className="text-[11px] px-2 py-1 bg-gray-100 rounded text-zinc-600 hover:bg-gray-200"
          >
            {selected.size === recordings.length ? 'Deselect all' : 'Select all'}
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={selected.size === 0}
            className="text-[11px] px-2 py-1 bg-red-50 rounded text-red-600 hover:bg-red-100 disabled:opacity-40"
          >
            Delete ({selected.size})
          </button>
        </div>
      )}

      <div className="space-y-2">
        {recordings.map((rec) => (
          <div
            key={rec.id}
            onClick={() => selectMode ? toggleSelect(rec.id) : onSelectRecording(rec.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
              selectMode && selected.has(rec.id)
                ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
                : activeId === rec.id
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
                : 'bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600 hover:border-gray-300 dark:hover:border-zinc-500'
            }`}
          >
            <div className="flex items-center justify-between">
              {selectMode && (
                <input
                  type="checkbox"
                  checked={selected.has(rec.id)}
                  onChange={() => toggleSelect(rec.id)}
                  className="mr-2 shrink-0"
                />
              )}
              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate flex-1">
                {truncateText(rec.text || 'Untitled', 22)}
              </span>
              <span className={`text-xs font-semibold ${getScoreTextColor(rec.score)} ml-1`}>
                {rec.score.toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-zinc-400">
                {formatRelativeTime(rec.created_at)}
              </span>
              {rec.speaker_name && (
                <span className="text-[11px] text-zinc-400 italic">
                  by {rec.speaker_name}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
