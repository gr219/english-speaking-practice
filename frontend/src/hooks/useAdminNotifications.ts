import { useEffect, useRef } from 'react';
import api from '../lib/api';

const POLL_INTERVAL = 15_000; // 15 seconds

export function useAdminNotifications(adminToken: string | null) {
  const lastCheckedRef = useRef<string>(new Date().toISOString());
  const tokenRef = useRef<string | null>(adminToken);
  tokenRef.current = adminToken;

  useEffect(() => {
    if (!adminToken) return;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const poll = async () => {
      const token = tokenRef.current;
      if (!token) return;
      try {
        const submissions = await api.adminGetRecentSubmissions(token, lastCheckedRef.current);
        console.log(`[AdminNotify] polled since=${lastCheckedRef.current}, found=${submissions.length}`);
        if (submissions.length > 0) {
          lastCheckedRef.current = submissions[0].created_at;

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
          } else {
            console.warn(`[AdminNotify] Notification permission: ${Notification.permission}`);
          }
        }
      } catch (err) {
        console.error('[AdminNotify] poll error:', err);
      }
    };

    // Poll immediately, then on interval
    poll();
    const id = setInterval(poll, POLL_INTERVAL);

    // Also poll when tab becomes visible (Chrome throttles background tabs)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [adminToken]);
}
