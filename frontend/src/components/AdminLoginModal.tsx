import { useState } from 'react';

interface AdminLoginModalProps {
  onLogin: (password: string) => Promise<boolean>;
  onClose: () => void;
}

export default function AdminLoginModal({ onLogin, onClose }: AdminLoginModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    const valid = await onLogin(password);
    setLoading(false);
    if (!valid) {
      setError('Invalid password');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 w-80 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          🔐 Admin Login
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-zinc-600 dark:text-zinc-400 block mb-1">
              Password:
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-600 rounded text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 focus:border-transparent"
            />
          </div>
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Login'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
