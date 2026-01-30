import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SharedGenerationView } from '@/tools/travel-between-images/components/SharedGenerationView';
import { Button } from '@/shared/components/ui/button';
import { Home, Palette } from 'lucide-react';

import { VideoTravelSettings } from '@/tools/travel-between-images/settings';
import { GenerationRow } from '@/types/shots';

// Data from get_shared_shot_data RPC - raw settings in same format as VideoTravelSettings
interface SharedData {
  shot_id: string;
  shot_name: string;
  generation: any;
  images: GenerationRow[];
  settings: VideoTravelSettings;  // Raw settings, same format as useShotSettings
  creator_id: string | null;
  view_count: number;
  creator_username?: string | null;
  creator_name?: string | null;
  creator_avatar_url?: string | null;
}

interface CreatorProfile {
  name: string | null;
  username: string | null;
  avatar_url: string | null;
}

/**
 * SharePage - Public page for viewing shared generations
 * 
 * Accessible without authentication
 * Displays: video output, timeline preview, settings details
 * CTA: Copy to My Account (auth required)
 */
const SharePage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<SharedData | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }

    loadShareData();
  }, [shareId]);

  // Update meta tags for social sharing
  useEffect(() => {
    if (!shareData) return;

    const { generation, settings } = shareData;

    // Set page title
    const title = generation?.name
      ? `${generation.name} | Reigh`
      : 'Shared Generation | Reigh';
    document.title = title;

    // Get meta description from prompt
    const description = settings?.prompt
      ? `${settings.prompt.substring(0, 150)}...`
      : 'Check out this AI-generated video created with Reigh';

    // Get OG image (use thumbnail or video)
    const ogImage = generation?.thumbnail_url || generation?.location || '/banodoco-gold.png';

    // Update or create meta tags
    const updateMetaTag = (property: string, content: string, isProperty = true) => {
      const attribute = isProperty ? 'property' : 'name';
      let tag = document.querySelector(`meta[${attribute}="${property}"]`);
      
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attribute, property);
        document.head.appendChild(tag);
      }
      
      tag.setAttribute('content', content);
    };

    // Basic meta tags
    updateMetaTag('description', description, false);

    // Open Graph tags
    updateMetaTag('og:title', title);
    updateMetaTag('og:description', description);
    updateMetaTag('og:image', ogImage);
    updateMetaTag('og:url', window.location.href);
    updateMetaTag('og:type', 'video.other');
    
    // Twitter Card tags
    updateMetaTag('twitter:card', generation?.location ? 'player' : 'summary_large_image', false);
    updateMetaTag('twitter:title', title, false);
    updateMetaTag('twitter:description', description, false);
    updateMetaTag('twitter:image', ogImage, false);

    // Cleanup function to reset title on unmount
    return () => {
      document.title = 'Reigh';
    };
  }, [shareData]);

  const loadShareData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch live shared data via RPC (returns live shot data when available)
      const { data, error: fetchError } = await supabase
        .rpc('get_shared_shot_data', { share_slug_param: shareId });

      if (fetchError) {
        console.error('[LiveShareDebug] Failed to load share:', fetchError);
        setError('Share not found or no longer available');
        setLoading(false);
        return;
      }

      // Check for error response from RPC
      if (data?.error) {
        console.error('[LiveShareDebug] Share not found:', data.error);
        setError('Share not found or no longer available');
        setLoading(false);
        return;
      }

      // Increment view count (fire and forget)
      supabase.rpc('increment_share_view_count', {
        share_slug_param: shareId
      }).then(() => {
        console.log('[LiveShareDebug] View count incremented');
      }).catch((err) => {
        console.warn('[LiveShareDebug] Failed to increment view count:', err);
      });

      console.log('[LiveShareDebug] Loaded share data:', {
        shotId: data.shot_id,
        shotName: data.shot_name,
        imagesCount: data.images?.length,
        generationMode: data.settings?.generationMode,
        settings: data.settings,
        firstImage: data.images?.[0],
      });

      // RPC returns same format as useAllShotGenerations
      setShareData({
        shot_id: data.shot_id,
        shot_name: data.shot_name,
        generation: data.generation,
        images: data.images || [],
        settings: data.settings,
        creator_id: data.creator_id,
        view_count: data.view_count,
        creator_username: data.creator_username ?? null,
        creator_name: data.creator_name ?? null,
        creator_avatar_url: data.creator_avatar_url ?? null,
      });

      // Set creator info
      setCreator({
        name: data.creator_name ?? null,
        username: data.creator_username ?? null,
        avatar_url: data.creator_avatar_url ?? null,
      });

    } catch (err) {
      console.error('[LiveShareDebug] Unexpected error:', err);
      setError('Failed to load shared generation');
    } finally {
      setLoading(false);
    }
  };

  const signupUrl = React.useMemo(() => {
    const code = creator?.username?.trim();
    if (code) {
      // Always include referral code in signup/landing link
      return `/?from=${encodeURIComponent(code)}`;
    }
    return '/';
  }, [creator?.username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header skeleton - matches actual header structure */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Logo button skeleton */}
              <div className="w-12 h-12 bg-muted animate-pulse rounded-sm" />
              <div className="flex items-center gap-4">
                {/* Creator info skeleton */}
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-muted animate-pulse" />
                  <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                </div>
                {/* CTA button skeleton */}
                <div className="h-9 w-28 bg-muted animate-pulse rounded-sm" />
              </div>
            </div>
          </div>
        </header>

        {/* Content skeleton - matches SharedGenerationView container */}
        <div className="container mx-auto px-4 pt-8 pb-24 sm:pb-28 max-w-6xl">
          <div className="space-y-6">
            {/* Final Video card skeleton - matches FinalVideoSection */}
            <div className="w-full">
              <div className="bg-card border rounded-xl shadow-sm">
                <div className="p-4 sm:p-6">
                  {/* Header row */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-5 h-5 bg-muted animate-pulse rounded" />
                    <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                  </div>
                  {/* Separator */}
                  <div className="h-px bg-border my-3" />
                  {/* Video skeleton - centered like actual */}
                  <div className="flex justify-center mt-4">
                    <div className="w-1/2">
                      <div className="w-full aspect-video bg-muted animate-pulse rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Input images card skeleton - matches Card structure */}
            <div className="bg-card border rounded-xl shadow-sm">
              <div className="p-6 space-y-4">
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
              </div>
              <div className="px-6 pb-6">
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              </div>
            </div>

            {/* Settings card skeleton - matches two-column layout */}
            <div className="bg-card border rounded-xl shadow-sm">
              <div className="p-6 space-y-4">
                <div className="h-6 w-40 bg-muted animate-pulse rounded" />
              </div>
              <div className="px-6 pb-6">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Left column */}
                  <div className="lg:w-1/2 order-2 lg:order-1 space-y-3">
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-full bg-muted animate-pulse rounded" />
                    <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
                  </div>
                  {/* Right column */}
                  <div className="lg:w-1/2 order-1 lg:order-2 space-y-3">
                    <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-full bg-muted animate-pulse rounded" />
                    <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !shareData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Share Not Found</h1>
            <p className="text-muted-foreground">
              {error || 'This shared generation could not be found or is no longer available.'}
            </p>
          </div>
          
          <Button 
            variant="retro"
            size="retro-sm"
            onClick={() => navigate('/')}
            className="w-full"
          >
            <Home className="mr-2 h-4 w-4" />
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with logo */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="group flex items-center justify-center w-12 h-12 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue dark:bg-none dark:border-2 rounded-sm shadow-[-3px_3px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-3px_3px_0_0_rgba(90,90,80,0.4)] hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:hover:shadow-[-1px_1px_0_0_rgba(180,160,100,0.4)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all duration-300"
              aria-label="Go to homepage"
            >
              <Palette className="h-6 w-6 text-white dark:text-[#a098a8] group-hover:rotate-12 transition-all duration-300 drop-shadow-lg dark:drop-shadow-none" />
            </button>
            
            <div className="flex items-center gap-4">
              {/* Creator info (replaces view count) */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {creator?.avatar_url ? (
                  <img
                    src={creator.avatar_url}
                    alt={creator?.name || creator?.username || 'Creator'}
                    className="h-6 w-6 rounded-full border"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-muted border" />
                )}
                <span className="preserve-case">
                  Shot shared by {creator?.name || creator?.username || 'a Reigh artist'}
                </span>
              </div>
              <Button 
                variant="retro"
                size="retro-sm"
                onClick={() => navigate(signupUrl)}
              >
                Create Your Own
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <SharedGenerationView 
        shareData={shareData}
        shareSlug={shareId!}
      />
    </div>
  );
};

export default SharePage;

