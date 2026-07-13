import { Link } from 'react-router-dom';

export default function Banner() {
  return (
    <div className="w-full bg-indigo-600 dark:bg-indigo-700 px-4 py-2 shrink-0">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-white tracking-wide hover:opacity-90 transition-opacity">
        🏠 COZY LAN ENGLISH
      </Link>
    </div>
  );
}
