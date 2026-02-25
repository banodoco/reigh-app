import { cva, type VariantProps } from 'class-variance-authority';

export const retroButtonPolicy = cva('', {
  variants: {
    variant: {
      retro:
        'bg-retro hover:bg-retro-hover rounded-sm border-2 border-retro-border text-retro-foreground tracking-wide transition-all duration-200 shadow-[-3px_3px_0_0_hsl(var(--retro-shadow)/0.2)] hover:shadow-[-1.5px_1.5px_0_0_hsl(var(--retro-shadow)/0.2)] hover:translate-x-[-0.75px] hover:translate-y-[0.75px] active:shadow-none active:translate-x-[-1.5px] active:translate-y-[1.5px]',
      'retro-secondary':
        'bg-transparent hover:bg-retro/20 rounded-sm border-2 border-retro-border/35 text-retro-foreground tracking-wide transition-all duration-200 shadow-[-2px_2px_0_0_hsl(var(--retro-shadow)/0.1)] hover:shadow-[-1px_1px_0_0_hsl(var(--retro-shadow)/0.1)] hover:translate-x-[-0.5px] hover:translate-y-[0.5px] active:shadow-none active:translate-x-[-1px] active:translate-y-[1px]',
    },
    size: {
      'retro-sm': 'h-9 px-4 py-2 text-sm font-heading',
      'retro-default': 'h-11 px-6 py-3 text-base font-heading',
      'retro-lg': 'h-14 px-12 py-4 text-xl font-heading',
    },
  },
  defaultVariants: {
    variant: 'retro',
    size: 'retro-default',
  },
});

export type RetroButtonVariant = VariantProps<typeof retroButtonPolicy>['variant'];
export type RetroButtonSize = VariantProps<typeof retroButtonPolicy>['size'];

export function isRetroButtonVariant(value: unknown): value is NonNullable<RetroButtonVariant> {
  return value === 'retro' || value === 'retro-secondary';
}

export function isRetroButtonSize(value: unknown): value is NonNullable<RetroButtonSize> {
  return value === 'retro-sm' || value === 'retro-default' || value === 'retro-lg';
}
