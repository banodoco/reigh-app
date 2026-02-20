import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PaymentFailureView } from './payment-success/components/PaymentFailureView';
import { PaymentLoadingView } from './payment-success/components/PaymentLoadingView';
import { PaymentSuccessView } from './payment-success/components/PaymentSuccessView';
import { usePaymentVerification } from './payment-success/hooks/usePaymentVerification';

const PaymentSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const amount = searchParams.get('amount');
  const { state, sessionDetails } = usePaymentVerification({ sessionId, amount });

  const handleContinue = () => {
    navigate('/tools');
  };

  const handleViewTransactions = () => {
    navigate('/tools', { state: { openSettings: true, creditsTab: 'history' } });
  };

  if (!sessionId) {
    return (
      <PaymentFailureView
        errorMessage="If you were charged, your credits will be added automatically within a few minutes. You can check your transaction history in Settings."
        onGoHome={() => navigate('/')}
        onViewTransactions={handleViewTransactions}
      />
    );
  }

  if (state === 'loading' || state === 'polling') {
    return <PaymentLoadingView sessionId={sessionId} />;
  }

  return (
    <PaymentSuccessView
      sessionDetails={sessionDetails}
      onContinue={handleContinue}
      onViewTransactions={handleViewTransactions}
    />
  );
};

export default PaymentSuccessPage; 
