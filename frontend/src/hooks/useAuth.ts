import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/utils/storage';
import { User, AuthState } from '@/types';

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: storage.getToken(),
    isAuthenticated: Boolean(storage.getToken()),
    isLoading: true,
  });

  useEffect(() => {
    const token = storage.getToken();
    setState((prev) => ({
      ...prev,
      token,
      isAuthenticated: Boolean(token),
      isLoading: false,
    }));
  }, []);

  const login = useCallback((token: string, user: User) => {
    storage.setToken(token);
    setState({
      token,
      user,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    storage.removeToken();
    setState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  return {
    ...state,
    login,
    logout,
  };
}
