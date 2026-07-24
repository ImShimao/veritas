import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ScoreRingProps {
  /** Valeur affichée, 0 à 100. */
  value: number;
  label: string;
  /** Couleur du tracé, en CSS. */
  color: string;
  size?: number;
  /** Un score inversé se lit « plus bas, mieux c'est » — cas du risque. */
  inverted?: boolean;
  sublabel?: string;
  className?: string;
}

/**
 * Anneau de score.
 *
 * Le tracé s'anime de zéro à sa valeur : la progression rend la lecture
 * immédiate et donne au chiffre le poids qu'il mérite. L'animation est
 * supprimée si l'utilisateur a demandé de réduire les mouvements.
 */
export function ScoreRing({
  value,
  label,
  color,
  size = 132,
  inverted = false,
  sublabel,
  className,
}: ScoreRingProps) {
  const reduceMotion = useReducedMotion();
  const stroke = size >= 120 ? 9 : 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={cn('flex flex-col items-center gap-2.5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={`${label} : ${clamped} pour cent`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-border"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: reduceMotion ? offset : circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: reduceMotion ? 0 : 1.1, ease: [0.32, 0.72, 0, 1] }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="font-semibold tabular-nums tracking-tight"
            style={{ fontSize: size * 0.26, color }}
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
          >
            {Math.round(clamped)}
          </motion.span>
          <span className="text-2xs font-medium text-faint">%</span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-ink">{label}</p>
        {sublabel && <p className="mt-0.5 text-2xs text-faint">{sublabel}</p>}
        {inverted && !sublabel && (
          <p className="mt-0.5 text-2xs text-faint">plus bas, mieux c'est</p>
        )}
      </div>
    </div>
  );
}
