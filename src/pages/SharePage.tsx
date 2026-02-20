import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SharedGenerationView } from '@/tools/travel-between-images/components/SharedGenerationView';
import { SharePageLoading } from '@/pages/share/components/SharePageLoading';
import { SharePageError } from '@/pages/share/components/SharePageError';
import { SharePageHeader } from '@/pages/share/components/SharePageHeader';
import { useSharePageData } from '@/pages/share/hooks/useSharePageData';
import { useShareMetaTags } from '@/pages/share/hooks/useShareMetaTags';

/**
 * SharePage - Public page for viewing shared generations.
 */
const SharePage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();

  const { loading, error, shareData, creator } = useSharePageData(shareId);
  useShareMetaTags(shareData);

  const signupUrl = useMemo(() => {
    const code = creator?.username?.trim();
    if (code) {
      return `/?from=${encodeURIComponent(code)}`;
    }

    return '/';
  }, [creator?.username]);

  if (loading) {
    return <SharePageLoading />;
  }

  if (error || !shareData) {
    return (
      <SharePageError
        message={error || 'This shared generation could not be found or is no longer available.'}
        onGoHome={() => navigate('/')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SharePageHeader
        creator={creator}
        onGoHome={() => navigate('/')}
        onCreateOwn={() => navigate(signupUrl)}
      />

      <SharedGenerationView
        shareData={shareData}
        shareSlug={shareId ?? ''}
      />
    </div>
  );
};

export default SharePage;
