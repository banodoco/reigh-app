export const themeColors = {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				retro: {
					DEFAULT: 'hsl(var(--retro))',
					hover: 'hsl(var(--retro-hover))',
					border: 'hsl(var(--retro-border))',
					foreground: 'hsl(var(--retro-foreground))',
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Expanded Wes Anderson palette
				wes: {
					// Legacy names (for backward compatibility)
					pink: 'hsl(var(--wes-pink))',
					'pink-dark': 'hsl(var(--wes-pink-dark))',
					yellow: 'hsl(var(--wes-yellow))',
					'yellow-dark': 'hsl(var(--wes-yellow-dark))',
					mint: 'hsl(var(--wes-mint))',
					'mint-dark': 'hsl(var(--wes-mint-dark))',
					lavender: 'hsl(var(--wes-lavender))',
					'lavender-dark': 'hsl(var(--wes-lavender-dark))',
					cream: 'hsl(var(--wes-cream))',
					salmon: 'hsl(var(--wes-salmon))',
					sage: 'hsl(var(--wes-sage))',
					'dusty-blue': 'hsl(var(--wes-dusty-blue))',
					burgundy: 'hsl(var(--wes-burgundy))', // NOTE: Actually dark orange now
					forest: 'hsl(var(--wes-forest))',
					coral: 'hsl(var(--wes-coral))',
					mustard: 'hsl(var(--wes-mustard))',
					teal: 'hsl(var(--wes-teal))',
					'vintage-gold': 'hsl(var(--wes-vintage-gold))',
					
					// Descriptive aliases (same CSS variables, clearer names)
					'soft-pink': 'hsl(var(--wes-soft-pink))',
					'soft-pink-dark': 'hsl(var(--wes-soft-pink-dark))',
					'pale-yellow': 'hsl(var(--wes-pale-yellow))',
					'pale-yellow-dark': 'hsl(var(--wes-pale-yellow-dark))',
					'mint-green': 'hsl(var(--wes-mint-green))',
					'mint-green-dark': 'hsl(var(--wes-mint-green-dark))',
					'dusty-lavender': 'hsl(var(--wes-dusty-lavender))',
					'dusty-lavender-dark': 'hsl(var(--wes-dusty-lavender-dark))',
					'pastel-cream': 'hsl(var(--wes-pastel-cream))',
					'coral-salmon': 'hsl(var(--wes-coral-salmon))',
					'sage-green': 'hsl(var(--wes-sage-green))',
					'dark-orange': 'hsl(var(--wes-dark-orange))',
					'forest-green': 'hsl(var(--wes-forest-green))',
					'warm-coral': 'hsl(var(--wes-warm-coral))',
					'vintage-mustard': 'hsl(var(--wes-vintage-mustard))',
					'muted-teal': 'hsl(var(--wes-muted-teal))',
				}
} as const;
