import { useNavigate, useLocation } from 'react-router-dom';

interface IconRailProps {
  onHistoryToggle: () => void;
  isHistoryOpen: boolean;
  onQuestionsToggle: () => void;
  isQuestionsOpen: boolean;
  showHomework?: boolean;
}

export default function IconRail({ onHistoryToggle, isHistoryOpen, onQuestionsToggle, isQuestionsOpen, showHomework }: IconRailProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomeworkActive = location.pathname === '/homework';
  return (
    <div className="w-12 bg-zinc-900 flex flex-col items-center py-3 gap-3 shrink-0">
      <button
        className="w-8 h-8 bg-zinc-700 rounded-md flex items-center justify-center text-sm hover:bg-zinc-600 transition-colors"
        title="Record"
      >
        🎙️
      </button>
      <button
        className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors ${
          isHistoryOpen ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
        }`}
        title="History"
        onClick={onHistoryToggle}
      >
        📋
      </button>
      <button
        className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors ${
          isQuestionsOpen ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
        }`}
        title="My Questions"
        onClick={onQuestionsToggle}
      >
        📝
      </button>
      {showHomework && (
        <button
          className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors ${
            isHomeworkActive ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
          title="Homework"
          onClick={() => navigate('/homework')}
        >
          📚
        </button>
      )}
    </div>
  );
}
