import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@skinny/ui';

/**
 * The design system's button, ported from `ios/SkinnyLegend/Core/DesignSystem/Buttons.swift`.
 *
 * It lives in `apps/web` rather than `@skinny/ui` on purpose (ruling R8): the admin already has
 * a shadcn/base-ui `Button` carrying base-ui behaviour the shared package has no business
 * owning, so the shared package deliberately ships none. This is the same anatomy expressed with
 * the utilities `@skinny/ui/styles/theme.css` guarantees — the geometry contract in
 * `packages/ui/src/index.ts` — and nothing else.
 *
 * | size | height | radius | padding | type role |
 * |---|---|---|---|---|
 * | `sm` | 32px | 6px (`rounded-sm`) | 12px | `.type-caption` |
 * | `md` | 44px — the minimum tap target | 12px (`rounded-md`) | 16px | `.type-body-medium` |
 * | `lg` | 54px — the full-width call to action | 18px (`rounded-lg`) | 24px | `.type-body-medium` |
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-sm px-3 type-caption',
  md: 'h-11 rounded-md px-4 type-body-medium',
  // 54px is not on Tailwind's 4px scale, so it is spelled out — the same literal iOS uses for
  // `Theme.ControlHeight.lg`, and the height the sign-in screen's Google button has to be.
  lg: 'h-[54px] rounded-lg px-6 type-body-medium',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground active:bg-primary-hover',
  secondary: 'border border-border-strong bg-card text-foreground active:bg-surface-2',
  ghost: 'bg-transparent text-primary active:bg-surface-2',
  destructive: 'bg-destructive text-destructive-foreground active:bg-destructive-hover',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches across the container — the full-width CTAs. */
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-colors duration-100 outline-ring',
        'disabled:pointer-events-none disabled:opacity-45',
        SIZE[size],
        VARIANT[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  );
}
