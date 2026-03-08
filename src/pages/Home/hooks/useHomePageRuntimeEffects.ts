import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '@/shared/components/ui/runtime/sonner';

interface UseHomePageRuntimeEffectsInput {
  isMobile: boolean;
  ecosystemTipOpen: boolean;
  setEcosystemTipOpen: (value: boolean) => void;
  setEcosystemTipDisabled: (value: boolean) => void;
  setAssetsLoaded: (value: boolean) => void;
}

export function useHomePageRuntimeEffects(input: UseHomePageRuntimeEffectsInput) {
  const {
    isMobile,
    ecosystemTipOpen,
    setEcosystemTipOpen,
    setEcosystemTipDisabled,
    setAssetsLoaded,
  } = input;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let loaded = false;
    const markLoaded = () => {
      if (!loaded) {
        loaded = true;
        setAssetsLoaded(true);
      }
    };

    const img = new Image();
    img.src = '/favicon-16x16.png';
    img.onload = markLoaded;
    img.onerror = markLoaded;

    const fallbackTimer = setTimeout(markLoaded, 2000);
    return () => clearTimeout(fallbackTimer);
  }, [setAssetsLoaded]);

  useEffect(() => {
    if ((location.state as { fromProtected?: boolean } | null)?.fromProtected) {
      toast({ description: 'You need to be logged in to view that page.' });
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  useEffect(() => {
    if (!isMobile || !ecosystemTipOpen) {
      return;
    }

    const handleScroll = () => {
      setEcosystemTipOpen(false);
      setEcosystemTipDisabled(false);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('touchmove', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('touchmove', handleScroll);
    };
  }, [ecosystemTipOpen, isMobile, setEcosystemTipDisabled, setEcosystemTipOpen]);
}
