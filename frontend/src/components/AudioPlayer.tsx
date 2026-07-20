import { useState, useRef, useEffect, useCallback } from 'react';

interface AudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  onEnded?: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2.0];

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ src, autoPlay, onEnded }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [, forceRender] = useState(0);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (!draggingRef.current) setCurrentTime(audio.currentTime);
    };
    const onLoaded = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); onEnded?.(); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnd);
    };
  }, [onEnded]);

  const seekTo = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    setCurrentTime(newTime);
    audio.currentTime = newTime;
  }, [duration]);

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    forceRender((n) => n + 1);
    seekTo(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingRef.current) seekTo(e.clientX);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    forceRender((n) => n + 1);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  };

  return (
    <div className="flex items-center gap-2 w-full py-2">
      <audio ref={audioRef} src={src} autoPlay={autoPlay} preload="auto" />
      <button
        onClick={togglePlay}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs"
      >
        {playing ? '⏸' : '▶'}
      </button>
      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 w-8 text-right tabular-nums shrink-0">
        {formatTime(currentTime)}
      </span>
      <div
        ref={progressRef}
        className="flex-1 h-2.5 bg-gray-200 dark:bg-zinc-600 rounded-full cursor-pointer relative select-none touch-none min-w-[60px]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="h-full bg-blue-500 rounded-full pointer-events-none"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full shadow pointer-events-none"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
      </div>
      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 w-8 tabular-nums shrink-0">
        {formatTime(duration)}
      </span>
      <select
        value={playbackRate}
        onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
        className="shrink-0 px-1 py-0.5 text-[10px] border border-gray-200 dark:border-zinc-600 rounded bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-300 cursor-pointer"
        title="Playback speed"
      >
        {SPEED_OPTIONS.map((speed) => (
          <option key={speed} value={speed}>
            {speed}x
          </option>
        ))}
      </select>
    </div>
  );
}
