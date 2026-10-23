import { useAuth } from './useAuth';
import { User, UserRole } from '@/types';

export interface UseCurrentUserReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | undefined;
  isAdmin: boolean;
  name: string | undefined;
  email: string | undefined;
}

/**
 * Hook to access the current authenticated user's profile and RBAC role.
 */
export function useCurrentUser(): UseCurrentUserReturn {
  const { user, isAuthenticated, isLoading } = useAuth();

  return {
    user,
    isAuthenticated,
    isLoading,
    role: user?.role,
    isAdmin: user?.role === 'ADMIN',
    name: user?.name,
    email: user?.email,
  };
}
