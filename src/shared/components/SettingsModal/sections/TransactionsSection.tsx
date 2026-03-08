import React from "react";
import { CreditsManagement } from "@/domains/billing/components/CreditsManagement/CreditsManagement";

const TransactionsSection: React.FC = () => {
  return (
    <div className="space-y-4">
      <CreditsManagement mode="transactions" />
    </div>
  );
};

export { TransactionsSection };
