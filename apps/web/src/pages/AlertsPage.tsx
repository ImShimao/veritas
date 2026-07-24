import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  Check,
  Eye,
  ImageIcon,
  PencilLine,
  TrendingDown,
  XCircle,
} from 'lucide-react';
import type { Watch, WatchAlert } from '@veritas/core';
import { api } from '@/lib/api';
import { Button, EmptyState } from '@/components/ui/primitives';
import { cn, formatRelative, SEVERITY_STYLES } from '@/lib/utils';

const ALERT_ICONS: Record<WatchAlert['kind'], typeof Bell> = {
  price_changed: TrendingDown,
  listing_removed: XCircle,
  images_changed: ImageIcon,
  text_changed: PencilLine,
  seller_changed: Eye,
  similar_listing: Bell,
  score_changed: TrendingDown,
};

export function AlertsPage() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<WatchAlert[]>([]);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    void Promise.all([api.alerts(false), api.listWatches()])
      .then(([alertResult, watchResult]) => {
        setAlerts(alertResult.items);
        setWatches(watchResult.items);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const markRead = async (id: string) => {
    await api.markAlertRead(id).catch(() => undefined);
    setAlerts((current) =>
      current.map((alert) => (alert.id === id ? { ...alert, read: true } : alert)),
    );
  };

  const stopWatch = async (id: string) => {
    await api.stopWatch(id).catch(() => undefined);
    setWatches((current) => current.filter((watch) => watch.id !== id));
  };

  const activeWatches = watches.filter((watch) => watch.active);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Alertes et surveillance</h1>
        <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-muted text-pretty">
          Veritas revérifie périodiquement les annonces surveillées et vous signale tout changement
          : baisse de prix, photos remplacées, texte réécrit ou disparition. Une annonce vivante en
          dit long.
        </p>
      </header>

      {/* Surveillances actives */}
      {activeWatches.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">
            Sous surveillance ({activeWatches.length})
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {activeWatches.map((watch) => (
              <li key={watch.id} className="card flex items-center gap-3 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Eye className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/analyse/${watch.analysisId}`)}
                    className="line-clamp-1 text-left text-[0.8125rem] font-medium text-ink hover:text-accent"
                  >
                    {watch.url.replace(/^https?:\/\/(www\.)?/, '')}
                  </button>
                  <p className="text-2xs text-faint">
                    Vérifiée {watch.lastCheckedAt ? formatRelative(watch.lastCheckedAt) : 'bientôt'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<BellOff className="h-3.5 w-3.5" />}
                  onClick={() => void stopWatch(watch.id)}
                  aria-label="Arrêter la surveillance"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Alertes */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Historique des alertes</h2>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="Aucune alerte"
              description="Mettez une annonce sous surveillance depuis son rapport pour être prévenu de tout changement."
              action={
                <Button variant="secondary" size="sm" onClick={() => navigate('/historique')}>
                  Voir mes analyses
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert, index) => {
              const Icon = ALERT_ICONS[alert.kind] ?? Bell;
              const severity = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info!;
              return (
                <motion.li
                  key={alert.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.2) }}
                  className={cn(
                    'card flex items-start gap-3 p-3.5',
                    !alert.read && 'ring-1 ring-accent/30',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      severity.bg,
                      severity.text,
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] leading-relaxed text-ink text-pretty">
                      {alert.message}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/analyse/${alert.analysisId}`)}
                        className="text-2xs font-medium text-accent hover:underline"
                      >
                        Voir l'analyse
                      </button>
                      <span className="text-2xs text-faint">{formatRelative(alert.createdAt)}</span>
                    </div>
                  </div>
                  {!alert.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Check className="h-3.5 w-3.5" />}
                      onClick={() => void markRead(alert.id)}
                      aria-label="Marquer comme lu"
                    />
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
