export const formatDollarAmount = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatTransactionType = (type: string): string => {
  switch (type) {
    case 'purchase':
      return 'Purchase';
    case 'spend':
      return 'Spend';
    default:
      return type;
  }
};
