import React from "react";
import { CreditsManagement } from "@/domains/billing/components/CreditsManagement/CreditsManagement";
import type { CreditsManagementProps } from "@/domains/billing/components/CreditsManagement/types";

interface TransactionsSectionProps {
  initialTab?: CreditsManagementProps['initialTab'];
}

const TransactionsSection: React.FC<TransactionsSectionProps> = ({ initialTab = 'purchase' }) => {
  return (
    <div className="space-y-4">
      <CreditsManagement initialTab={initialTab} mode="all" />
    </div>
  );
};

export { TransactionsSection };
