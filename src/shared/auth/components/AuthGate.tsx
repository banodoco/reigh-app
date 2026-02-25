import { ReactNode } from 'react';
import { useAuth } from '@/shared/contexts/AuthContext';

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const { isLoading } = useAuth();

  if (isLoading) return null;

  return <>{children}</>;
};
