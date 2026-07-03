export function getScoreColor(score: number): string {
  if (score > 0.85) return 'bg-green-100 text-green-800';
  if (score >= 0.75) return 'bg-yellow-100 text-yellow-800';
  if (score > 0.5) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

export function getScoreTextColor(score: number): string {
  if (score >= 85) return 'text-green-600';
  if (score >= 70) return 'text-amber-500';
  return 'text-red-500';
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

export function computeIeltsBand(pronunciationScore: number, fluencyScore: number | null, grammarScore: number | null): number {
  const fluency = fluencyScore ?? pronunciationScore;
  const grammar = grammarScore ?? pronunciationScore;
  // Weighted: 40% pronunciation, 30% fluency, 30% grammar
  const combined = pronunciationScore * 0.4 + fluency * 0.3 + grammar * 0.3;
  let band: number;
  if (combined >= 95) band = 9.0;
  else if (combined >= 85) band = 8.0 + (combined - 85) / 10;
  else if (combined >= 75) band = 7.0 + (combined - 75) / 10;
  else if (combined >= 60) band = 6.0 + (combined - 60) / 15;
  else if (combined >= 45) band = 5.0 + (combined - 45) / 15;
  else if (combined >= 30) band = 4.0 + (combined - 30) / 15;
  else band = Math.max(1.0, (combined / 30) * 3 + 1);
  return Math.round(band * 2) / 2;
}
