import React from 'react';
import { Gift } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { UpdatingTimeCell } from '@/shared/components/UpdatingTimeCell';
import { formatTransactionType } from '../utils';

interface LedgerEntry {
  type: string;
  amount: number;
  created_at: string;
}

interface TransactionsTableProps {
  entries: LedgerEntry[] | undefined;
  isLoading: boolean;
  formatCurrency: (amount: number) => string;
}

export function TransactionsTable({ entries, isLoading, formatCurrency }: TransactionsTableProps) {
  // Filter out spend entries - only show purchases/credits
  const filteredEntries = entries?.filter(tx => tx.type !== 'spend') || [];

  if (isLoading) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 sm:w-auto">Date</TableHead>
                <TableHead className="w-16 sm:w-auto">Type</TableHead>
                <TableHead className="w-20 sm:w-auto">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell className="w-20 sm:w-auto">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="w-16 sm:w-auto">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell className="w-20 sm:w-auto">
                    <Skeleton className="h-4 w-14" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (filteredEntries.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="p-8 text-center">
          <Gift className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">No transactions yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Add budget to start using Reigh's AI features
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20 sm:w-auto">Date</TableHead>
              <TableHead className="w-16 sm:w-auto">Type</TableHead>
              <TableHead className="w-20 sm:w-auto">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.map((tx, index) => (
              <TableRow key={index}>
                <TableCell className="text-xs sm:text-sm w-20 sm:w-auto">
                  <UpdatingTimeCell date={tx.created_at} />
                </TableCell>
                <TableCell className="w-16 sm:w-auto">
                  <Badge
                    variant={tx.type === 'purchase' ? 'default' : 'secondary'}
                    className="text-xs px-2 py-1"
                  >
                    {formatTransactionType(tx.type)}
                  </Badge>
                </TableCell>
                <TableCell
                  className={`font-light text-xs sm:text-sm w-20 sm:w-auto ${
                    tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {tx.amount > 0 ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
