import { useMemo } from 'react';

export function useUserId(): string {
  return useMemo(() => {
    const key = 'speech_user_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  }, []);
}
