import { useContext } from 'react';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';

export function useLastAffectedShot() {
  const context = useContext(LastAffectedShotContext);
  if (context === undefined) {
    throw new Error('useLastAffectedShot must be used within a LastAffectedShotProvider');
  }
  return context;
} 