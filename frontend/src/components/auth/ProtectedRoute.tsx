'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { CheckSquare, Loader2 } from 'lucide-react';

export interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Loading state while verifying token & session with backend
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Checking authentication session"
        className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white"
      >
        <div className="flex flex-col items-center text-center max-w-sm">
          {/* Logo Brand Animation */}
          <div className="relative mb-6">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/30 animate-pulse">
              <CheckSquare className="w-7 h-7 stroke-[2.25]" />
            </div>
            <div className="absolute -inset-1 rounded-2xl bg-indigo-500/20 blur-md -z-10 animate-ping opacity-60" />
          </div>

          <div className="flex items-center gap-2 text-indigo-600 font-medium text-sm mb-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verifying session...</span>
          </div>

          <h2 className="text-lg font-bold text-slate-800 tracking-tight">TaskFlow Workspace</h2>
          <p className="text-xs text-slate-400 mt-1">
            Validating authorization credentials with the server
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated: avoid flash of protected UI before redirect
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated: Render protected child hierarchy
  return <>{children}</>;
};
