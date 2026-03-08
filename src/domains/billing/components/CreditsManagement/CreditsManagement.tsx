import React, { useState } from 'react';
import { useCredits, useCreditLedger } from '@/shared/hooks/billing/useCredits';
import { useTaskLog } from '@/shared/hooks/tasks/useTaskLog';
import { useAutoTopupState } from './hooks/useAutoTopupState';
import { useTaskLogFilters } from './hooks/useTaskLogFilters';
import { useTaskLogDownload } from './hooks/useTaskLogDownload';
import { AddCreditsSection } from './components/AddCreditsSection';
import { TransactionsTable } from './components/TransactionsTable';
import { TaskLogPanel } from './components/TaskLogPanel';
import type { CreditsManagementProps } from './types';

export const CreditsManagement: React.FC<CreditsManagementProps> = ({
  initialTab = 'history',
  mode = 'all'
}) => {
  const {
    balance,
    isLoadingBalance,
    isCreatingCheckout,
    createCheckout,
    formatCurrency,
  } = useCredits();

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const { data: ledgerData, isLoading: isLoadingLedger } = useCreditLedger();

  // Auto-top-up state management
  const {
    purchaseAmount,
    localAutoTopupEnabled,
    localAutoTopupThreshold,
    autoTopupState,
    isUpdatingAutoTopup,
    handlePurchaseAmountChange,
    handleAutoTopupToggle,
    handleAutoTopupThresholdChange,
  } = useAutoTopupState({ initialPurchaseAmount: 50 });

  // Task log filters
  const {
    filters: taskLogFilters,
    page: taskLogPage,
    setPage: setTaskLogPage,
    updateFilter,
    toggleArrayFilter,
    clearFilters,
    getFilterCount,
  } = useTaskLogFilters();

  // Task log data
  const { data: taskLogData, isLoading: isLoadingTaskLog } = useTaskLog(20, taskLogPage, taskLogFilters);

  // Task log download
  const { isDownloading, handleDownload } = useTaskLogDownload(taskLogFilters);

  const handlePurchase = () => {
    if (purchaseAmount > 0) {
      if (localAutoTopupEnabled && autoTopupState === 'enabled-but-not-setup') {
        createCheckout({
          amount: purchaseAmount,
          autoTopupEnabled: true,
          autoTopupAmount: purchaseAmount,
          autoTopupThreshold: localAutoTopupThreshold,
        });
      } else {
        createCheckout({ amount: purchaseAmount });
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Add Credits Section */}
      {(mode === 'all' || mode === 'add-credits') && (
        <AddCreditsSection
          balance={balance?.balance}
          isLoadingBalance={isLoadingBalance}
          formatCurrency={formatCurrency}
          purchaseAmount={purchaseAmount}
          onPurchaseAmountChange={handlePurchaseAmountChange}
          isCreatingCheckout={isCreatingCheckout}
          onPurchase={handlePurchase}
          localAutoTopupEnabled={localAutoTopupEnabled}
          localAutoTopupThreshold={localAutoTopupThreshold}
          autoTopupState={autoTopupState}
          isUpdatingAutoTopup={isUpdatingAutoTopup}
          onAutoTopupToggle={handleAutoTopupToggle}
          onAutoTopupThresholdChange={handleAutoTopupThresholdChange}
        />
      )}

      {/* Transaction History Section */}
      {(mode === 'all' || mode === 'transactions') && (
        <div className={`px-1 ${mode === 'all' ? 'mt-6' : ''}`}>
          <div className="flex border-b border-border mb-3">
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 pb-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'history'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Transactions
            </button>
            <button
              onClick={() => setActiveTab('task-log')}
              className={`flex-1 pb-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'task-log'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Task Log
            </button>
          </div>

          {activeTab === 'history' && (
            <TransactionsTable
              entries={ledgerData?.entries}
              isLoading={isLoadingLedger}
              formatCurrency={formatCurrency}
            />
          )}

          {activeTab === 'task-log' && (
            <TaskLogPanel
              tasks={taskLogData?.tasks}
              pagination={taskLogData?.pagination}
              availableFilters={taskLogData?.availableFilters}
              isLoading={isLoadingTaskLog}
              filters={taskLogFilters}
              filterCount={getFilterCount()}
              page={taskLogPage}
              isDownloading={isDownloading}
              onPageChange={setTaskLogPage}
              onUpdateFilter={updateFilter}
              onToggleArrayFilter={toggleArrayFilter}
              onClearFilters={clearFilters}
              onDownload={handleDownload}
            />
          )}
        </div>
      )}
    </div>
  );
};

