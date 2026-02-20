import { useEffect } from 'react';
import { Video, Heart, Eye, Calendar } from 'lucide-react';
import { PageFadeIn, FadeInSection } from '@/shared/components/transitions';
import { artPieces } from './art/artPieces';

const FADE_IN_BASE_DELAY_S = 0.2;
const FADE_IN_INCREMENT_S = 0.1;
const MS_PER_SECOND = 1000;

export default function ArtPage() {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <PageFadeIn className="min-h-screen wes-texture relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/20 opacity-60"></div>
      <div className="absolute inset-0 wes-chevron-pattern opacity-30"></div>
      
      {/* Floating ornamental elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-wes-pink/10 rounded-full blur-3xl animate-parallax-float"></div>
      <div className="absolute top-40 right-20 w-24 h-24 bg-wes-yellow/15 rounded-full blur-2xl animate-parallax-float" style={{ animationDelay: '2s' }}></div>
      <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-wes-lavender/10 rounded-full blur-3xl animate-parallax-float" style={{ animationDelay: '4s' }}></div>
      
      <div className="container mx-auto px-4 py-16 relative z-10">
        {/* Header */}
        <FadeInSection className="text-center mb-16">
                      <h1 className="font-cocogoose text-5xl md:text-7xl font-light text-primary mb-8 text-shadow-vintage">
            Community Art Gallery
          </h1>
          <div className="w-32 h-1.5 bg-gradient-to-r from-wes-coral to-wes-vintage-gold rounded-full mx-auto mb-8 shadow-inner-vintage"></div>
          <p className="font-cocogoose text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            A curated collection of visual journeys created by our community of artists and dreamers
          </p>
        </FadeInSection>

        {/* Art Grid */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {artPieces.map((piece, index) => (
              <FadeInSection 
                key={piece.id} 
                delayMs={(FADE_IN_BASE_DELAY_S + index * FADE_IN_INCREMENT_S) * MS_PER_SECOND}
                className="wes-vintage-card group"
              >
                {/* Video Placeholder */}
                <div className={`aspect-video bg-gradient-to-br from-${piece.color}/20 to-${piece.color}/30 rounded-lg border-2 border-${piece.color}/20 flex items-center justify-center mb-4 overflow-hidden group-hover:border-${piece.color}/40 transition-all duration-300`}>
                  <div className="text-center">
                    <div className={`w-16 h-16 bg-${piece.color}/30 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300`}>
                      <Video className={`w-8 h-8 text-${piece.color}`} />
                    </div>
                    <p className="text-sm text-muted-foreground font-cocogoose">Click to play</p>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="font-cocogoose text-xl font-light text-primary mb-2 group-hover:text-primary/80 transition-colors">
                    {piece.title}
                  </h3>
                  <p className="text-sm text-muted-foreground font-cocogoose mb-3">
                    by <span className="font-light text-primary">{piece.artist}</span>
                  </p>
                  <p className="text-sm text-muted-foreground font-cocogoose leading-relaxed mb-4">
                    {piece.description}
                  </p>
                  
                  {/* Stats */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-x-4">
                      <div className="flex items-center gap-x-1">
                        <Eye className="w-3 h-3" />
                        <span>{piece.views.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-x-1">
                        <Heart className="w-3 h-3" />
                        <span>{piece.likes}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(piece.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg"></div>
              </FadeInSection>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <FadeInSection className="text-center mt-16" delayMs={800}>
          <div className="wes-ornate-frame p-8 max-w-2xl mx-auto">
            <h2 className="font-cocogoose text-2xl font-light text-primary mb-4">
              Share Your Journey
            </h2>
            <p className="font-cocogoose text-muted-foreground mb-6 leading-relaxed">
              Create your own visual journey and join our community of artists exploring the spaces between images.
            </p>
            <a
              href="#signup"
              className="inline-flex items-center gap-x-2 px-6 py-3 bg-gradient-to-r from-wes-coral to-wes-pink text-white rounded-full border-2 border-wes-coral/30 hover:border-wes-coral/50 transition-all duration-300 hover:shadow-wes-ornate font-cocogoose font-light"
            >
              <span>Start Creating</span>
            </a>
          </div>
        </FadeInSection>
      </div>
      
      {/* Vintage film strips */}
      <div className="absolute left-0 top-1/4 w-8 h-64 wes-filmstrip opacity-20"></div>
      <div className="absolute right-0 bottom-1/4 w-8 h-64 wes-filmstrip opacity-20"></div>
    </PageFadeIn>
  );
} 
