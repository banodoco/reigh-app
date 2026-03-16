import React, { useState } from 'react';
import { useCredits, useCreditLedger } from '@/shared/hooks/billing/useCredits';
import { useTaskLog } from '@/shared/hooks/tasks/useTaskLog';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-3 h-9 p-1">
              <TabsTrigger
                value="history"
                className="data-[active]:bg-card data-[active]:dark:bg-gray-700 data-[active]:shadow-sm data-[active]:text-foreground text-sm py-0 h-full leading-none"
              >
                Credits
              </TabsTrigger>
              <TabsTrigger
                value="task-log"
                className="data-[active]:bg-card data-[active]:dark:bg-gray-700 data-[active]:shadow-sm data-[active]:text-foreground text-sm py-0 h-full leading-none"
              >
                Task Log
              </TabsTrigger>
            </TabsList>
          </Tabs>

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

