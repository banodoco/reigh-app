/**
 * CreditsManagement - Modular Component
 *
 * A component for managing user credits, including:
 * - Balance display and credit purchase
 * - Auto-top-up configuration
 * - Transaction history
 * - Task log with filtering and CSV export
 *
 * Available Hooks (all in ./hooks/):
 * - useAutoTopupState: Local state management for auto-top-up preferences
 * - useTaskLogFilters: Filter state and helpers for task log
 * - useTaskLogDownload: CSV download functionality
 *
 * Available Components (all in ./components/):
 * - AddCreditsSection: Balance display, purchase slider, auto-top-up
 * - TransactionsTable: Credit ledger history
 * - TaskLogPanel: Task log with filters, table, pagination
 * - TaskLogFilters: Filter bar with popovers
 *
 * Available Utils (all in ./utils/):
 * - formatDollarAmount: Currency formatting
 * - formatTransactionType: Transaction type labels
 */

export { default } from './CreditsManagement';
export type { CreditsManagementProps, TaskLogFilters, AutoTopupState } from './types';

// Re-export hooks
export { useAutoTopupState, useTaskLogFilters, useTaskLogDownload } from './hooks';

// Re-export components
export { AddCreditsSection, TransactionsTable, TaskLogPanel, TaskLogFilters } from './components';

// Re-export utils
export { formatDollarAmount, formatTransactionType } from './utils';
