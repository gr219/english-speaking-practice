import { useEffect, useRef } from 'react';
import api from '../lib/api';

const POLL_INTERVAL = 15_000; // 15 seconds

export function useAdminNotifications(adminToken: string | null) {
  const lastCheckedRef = useRef<string>(new Date().toISOString());
  const tokenRef = useRef<string | null>(adminToken);
  tokenRef.current = adminToken;

  useEffect(() => {
    if (!adminToken) return;

    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          // Do an immediate poll now that permission is granted
          poll();
        }
      });
    }

    const poll = async () => {
      const token = tokenRef.current;
      if (!token) return;
      try {
        const submissions = await api.adminGetRecentSubmissions(token, lastCheckedRef.current);
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
                tag: sub.id,
              });
            }
          }
        }
      } catch {
        // Silently fail
      }
    };

    // Poll immediately on start, then every interval
    poll();
    const id = setInterval(poll, POLL_INTERVAL);

    return () => clearInterval(id);
  }, [adminToken]);
}
