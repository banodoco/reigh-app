import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { useCredits } from '@/shared/hooks/billing/useCredits';

interface ProcessingWarningsProps {
  onOpenSettings: () => void;
}

/** Astrid is the only supported generation route in the app. */
export const GlobalProcessingWarning: React.FC<ProcessingWarningsProps> = ({ onOpenSettings }) => {
  const { balance, isLoadingBalance } = useCredits();

  if (isLoadingBalance || (balance && balance.balance > 0)) {
    return null;
  }

  return (
    <div className="animate-in slide-in-from-top-2 fade-in duration-300" style={{ marginTop: '1.75rem' }}>
      <div className="container mx-auto px-4 md:px-6 mt-4">
        <Alert className="border-orange-200 bg-orange-50 text-orange-900 flex items-center justify-between py-3 pr-4 shadow-lg border-2">
          <div className="flex items-center gap-x-3">
            <span className="inline-flex items-center">
              <AlertTriangle className="h-5 w-5 text-orange-700 mr-2" />
              <span className="space-x-1">
                <span>Astrid cloud generation requires credits.</span>
                <span
                  className="text-orange-700 underline hover:text-orange-800 cursor-pointer"
                  onClick={onOpenSettings}
                >
                  Add credits
                </span>
                <span>to continue.</span>
              </span>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="border-orange-300 hover:bg-orange-100 flex-shrink-0"
          >
            Add credits
          </Button>
        </Alert>
      </div>
    </div>
  );
};

export const TasksPaneProcessingWarning: React.FC<ProcessingWarningsProps> = () => null;
