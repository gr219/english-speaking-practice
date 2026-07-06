import { useEffect, useRef } from 'react';
import api from '../lib/api';

const POLL_INTERVAL = 15_000; // 15 seconds

export function useAdminNotifications(adminToken: string | null) {
  const lastCheckedRef = useRef<string>(new Date().toISOString());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!adminToken) return;

    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const poll = async () => {
      try {
        const submissions = await api.adminGetRecentSubmissions(adminToken, lastCheckedRef.current);
        if (submissions.length > 0) {
          // Update last checked to the most recent submission's timestamp
          lastCheckedRef.current = submissions[0].created_at;

          // Show notifications
          if ('Notification' in window && Notification.permission === 'granted') {
            for (const sub of submissions) {
              const speaker = sub.speaker_name || 'Anonymous';
              const question = sub.question_text
                ? `"${sub.question_text.slice(0, 40)}${sub.question_text.length > 40 ? '...' : ''}"`
                : 'free practice';
              new Notification('🎙️ New Submission', {
                body: `${speaker} scored ${sub.score.toFixed(0)}% on ${question}`,
                tag: sub.id, // Prevent duplicates
              });
            }
          }
        }
      } catch {
        // Silently fail
      }
    };

    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [adminToken]);
}
