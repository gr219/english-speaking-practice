import { useState, useCallback } from 'react';
import api from '../lib/api';

const ADMIN_TOKEN_KEY = 'speech_admin_token';

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return !!localStorage.getItem(ADMIN_TOKEN_KEY);
  });

  const getAdminToken = useCallback((): string | null => {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    const valid = await api.verifyAdmin(password);
    if (valid) {
      localStorage.setItem(ADMIN_TOKEN_KEY, password);
      setIsAdmin(true);
    }
    return valid;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAdmin(false);
  }, []);

  return { isAdmin, login, logout, getAdminToken };
}
