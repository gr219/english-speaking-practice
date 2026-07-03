import { useState, useEffect } from 'react';
import IconRail from './IconRail';

interface LayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  questionsSidebar?: React.ReactNode;
  rightPanel?: React.ReactNode;
  isAdmin?: boolean;
  onAdminLogin?: () => void;
  onAdminPanel?: () => void;
}

export default function Layout({ children, sidebar, questionsSidebar, rightPanel, isAdmin = false, onAdminLogin, onAdminPanel }: LayoutProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isQuestionsOpen, setIsQuestionsOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('speech_dark_mode') === 'true' ||
      (!localStorage.getItem('speech_dark_mode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('speech_dark_mode', String(isDark));
  }, [isDark]);

  const handleHistoryToggle = () => {
    setIsHistoryOpen(!isHistoryOpen);
    if (!isHistoryOpen) setIsQuestionsOpen(false);
  };

  const handleQuestionsToggle = () => {
    setIsQuestionsOpen(!isQuestionsOpen);
    if (!isQuestionsOpen) setIsHistoryOpen(false);
  };

  const isSidebarOpen = isHistoryOpen || isQuestionsOpen;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      {/* Top banner */}
      <div className="w-full bg-indigo-600 dark:bg-indigo-700 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="text-sm font-bold text-white tracking-wide">
          🏠 COZY LAN ENGLISH
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <button
              onClick={onAdminPanel}
              className="px-2 py-1 text-xs bg-yellow-400 text-yellow-900 rounded font-semibold hover:bg-yellow-300 transition-colors"
              title="Open Admin Panel"
            >
              🛡️ Admin
            </button>
          ) : (
            <button
              onClick={onAdminLogin}
              className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30 transition-colors"
              title="Admin Login"
            >
              🔐 Admin
            </button>
          )}
          <button
            onClick={() => setIsDark(!isDark)}
            className="text-white/80 hover:text-white text-sm"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Icon rail - hidden on mobile */}
        <div className="hidden sm:block">
          <IconRail
            onHistoryToggle={handleHistoryToggle}
            isHistoryOpen={isHistoryOpen}
            onQuestionsToggle={handleQuestionsToggle}
            isQuestionsOpen={isQuestionsOpen}
          />
        </div>

        {/* Sidebar panel */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out border-r border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 ${
            isSidebarOpen ? 'w-64' : 'w-0'
          }`}
        >
          <div className="w-64 h-full overflow-y-auto">
            {isHistoryOpen && sidebar}
            {isQuestionsOpen && questionsSidebar}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
          <div className="flex-1 flex flex-col lg:flex-row">
            <div className="flex-1 min-w-0">
              {children}
            </div>
            {/* Right panel (leaderboard) - below on mobile, side on desktop */}
            {rightPanel && (
              <div className="w-full lg:w-60 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 shrink-0 overflow-y-auto">
                {rightPanel}
              </div>
            )}
          </div>
          {/* Footer */}
          <div className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 py-3 border-t border-gray-100 dark:border-zinc-800">
            © {new Date().getFullYear()} Developed by{' '}
            <a
              href="https://www.facebook.com/gr219"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Tuyen Tran
            </a>
            . All rights reserved.
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="sm:hidden flex items-center justify-around border-t border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2 shrink-0">
        <button
          onClick={handleHistoryToggle}
          className={`text-lg ${isHistoryOpen ? 'opacity-100' : 'opacity-50'}`}
        >
          📋
        </button>
        <button
          onClick={handleQuestionsToggle}
          className={`text-lg ${isQuestionsOpen ? 'opacity-100' : 'opacity-50'}`}
        >
          📝
        </button>
        <span className="text-lg opacity-50">🎙️</span>
        <button
          onClick={() => setIsDark(!isDark)}
          className="text-lg opacity-50"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
}
