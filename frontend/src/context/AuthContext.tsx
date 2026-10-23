'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { storage } from '@/utils/storage';
import {
  authService,
  LoginPayload,
  RegisterPayload,
  LoginResponse,
} from '@/api/services/authService';
import { AUTH_UNAUTHORIZED_EVENT } from '@/api/client';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<LoginResponse>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Logout handler
  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    setIsLoading(false);
    if (typeof window !== 'undefined') {
      router.push('/login');
    }
  }, [router]);

  // Refresh current user session from GET /api/v1/auth/me
  const refreshUser = useCallback(async (): Promise<User | null> => {
    const activeToken = storage.getToken();
    if (!activeToken) {
      setUser(null);
      setToken(null);
      setIsAuthenticated(false);
      return null;
    }

    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setToken(activeToken);
      setIsAuthenticated(true);
      return currentUser;
    } catch (error: any) {
      // If token is invalid or expired (401), clean up
      if (error?.response?.status === 401) {
        logout();
      }
      return null;
    }
  }, [logout]);

  // Initial session hydration on mount / browser refresh
  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      const storedToken = storage.getToken();
      if (!storedToken) {
        if (isMounted) {
          setUser(null);
          setToken(null);
          setIsAuthenticated(false);
          setIsLoading(false);
        }
        return;
      }

      try {
        const currentUser = await authService.getCurrentUser();
        if (isMounted) {
          setUser(currentUser);
          setToken(storedToken);
          setIsAuthenticated(true);
        }
      } catch (error: any) {
        if (isMounted) {
          // If unauthorized, clean up credentials
          if (error?.response?.status === 401) {
            storage.removeToken();
            setUser(null);
            setToken(null);
            setIsAuthenticated(false);
          } else {
            // Backend connection error or transient failure
            console.warn('TaskFlow session initialization issue:', error.message || error);
            // Keep token in case connection recovers, but mark not authenticated until /me resolves
            setIsAuthenticated(false);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeSession();

    // Listen for unauthorized 401 events globally emitted by apiClient
    const handleUnauthorizedEvent = () => {
      setUser(null);
      setToken(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedEvent);
    }

    return () => {
      isMounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedEvent);
      }
    };
  }, []);

  // Login action
  const login = useCallback(
    async (payload: LoginPayload): Promise<LoginResponse> => {
      const response = await authService.login(payload);
      if (response.access_token) {
        setToken(response.access_token);
        setUser(response.user);
        setIsAuthenticated(true);
      }
      return response;
    },
    []
  );

  // Register action
  const register = useCallback(
    async (payload: RegisterPayload): Promise<User> => {
      return await authService.register(payload);
    },
    []
  );

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
