import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { VERDICT_PRESENTATION, type Verdict } from '@veritas/core';
import { cn, VERDICT_STYLES } from '@/lib/utils';

// ── Bouton ─────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/90 active:bg-accent/80 shadow-soft',
  secondary:
    'bg-elevated text-ink border border-border hover:border-border-strong hover:bg-elevated/70',
  ghost: 'text-muted hover:text-ink hover:bg-elevated',
  danger: 'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/15',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[0.8125rem] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[0.9375rem] gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // Un bouton en cours de chargement reste focalisable mais non activable :
      // le retirer du flux ferait perdre le focus clavier à l'utilisateur.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-all duration-150 ease-smooth',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ── Badge de verdict ───────────────────────────────────────────────────

export function VerdictBadge({
  verdict,
  size = 'md',
  showIcon = true,
}: {
  verdict: Verdict;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}) {
  const presentation = VERDICT_PRESENTATION[verdict];
  const styles = VERDICT_STYLES[verdict];
  const sizes = {
    sm: 'px-2 py-0.5 text-2xs',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold',
        styles.bg,
        styles.text,
        styles.border,
        sizes[size],
      )}
    >
      {showIcon && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', styles.text)}
          style={{ background: 'currentColor' }}
        />
      )}
      {presentation.label}
    </span>
  );
}

// ── Carte de section ───────────────────────────────────────────────────

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card p-5 sm:p-6', className)}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          {description && (
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

// ── État vide ──────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-muted text-pretty">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

// ── Barre de progression ───────────────────────────────────────────────

export function Meter({
  value,
  color,
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border/60', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-smooth"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color ?? 'rgb(var(--accent))',
        }}
      />
    </div>
  );
}
