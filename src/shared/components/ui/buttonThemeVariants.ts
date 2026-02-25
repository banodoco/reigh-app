export const APP_BUTTON_VARIANTS = {
  // Retro blocky style matching home page - softened borders and text
  retro: "bg-retro hover:bg-retro-hover rounded-sm border-2 border-retro-border text-retro-foreground tracking-wide transition-all duration-200 shadow-[-3px_3px_0_0_hsl(var(--retro-shadow)/0.2)] hover:shadow-[-1.5px_1.5px_0_0_hsl(var(--retro-shadow)/0.2)] hover:translate-x-[-0.75px] hover:translate-y-[0.75px] active:shadow-none active:translate-x-[-1.5px] active:translate-y-[1.5px]",
  "retro-secondary": "bg-transparent hover:bg-retro/20 rounded-sm border-2 border-retro-border/35 text-retro-foreground tracking-wide transition-all duration-200 shadow-[-2px_2px_0_0_hsl(var(--retro-shadow)/0.1)] hover:shadow-[-1px_1px_0_0_hsl(var(--retro-shadow)/0.1)] hover:translate-x-[-0.5px] hover:translate-y-[0.5px] active:shadow-none active:translate-x-[-1px] active:translate-y-[1px]",
  // Theme-adaptive variants
  theme: "theme-button bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary shadow-theme hover:shadow-theme-hover border-2 border-primary/20",
  "theme-ghost": "theme-nav-item bg-transparent border-2 border-transparent hover:border-primary/20 hover:bg-accent/30",
  "theme-outline": "border-2 border-primary/30 bg-card/80 dark:bg-card/90 hover:bg-accent/20 hover:border-primary/50 text-primary font-cocogoose tracking-wide transition-all duration-300",
  "theme-soft": "bg-gradient-to-br from-accent/80 to-secondary/80 border-2 border-primary/10 text-primary hover:from-accent hover:to-secondary shadow-theme hover:shadow-theme-hover",
  success: "bg-gradient-to-r from-secondary to-secondary/80 border-2 border-secondary/50 text-primary hover:from-secondary/90 hover:to-secondary shadow-theme hover:shadow-theme-hover transition-all duration-300",
} as const;

export const APP_BUTTON_SIZES = {
  // Retro sizes with TTGertika font
  "retro-sm": "h-9 px-4 py-2 text-sm font-heading",
  "retro-default": "h-11 px-6 py-3 text-base font-heading",
  "retro-lg": "h-14 px-12 py-4 text-xl font-heading",
  "theme-sm": "h-9 px-6 py-2 rounded-lg font-cocogoose tracking-wide",
  "theme-default": "h-11 px-8 py-3 rounded-xl font-cocogoose tracking-wide",
  "theme-lg": "h-14 px-12 py-4 rounded-2xl font-cocogoose font-light tracking-wider",
} as const;
