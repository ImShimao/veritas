import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GitCompare, History, Search, Star } from 'lucide-react';
import { formatMoney, type Verdict } from '@veritas/core';
import { api, type AnalysisSummary, type ComparisonResult } from '@/lib/api';
import { Button, EmptyState, VerdictBadge } from '@/components/ui/primitives';
import { cn, formatRelative } from '@/lib/utils';

const VERDICT_FILTERS: { id: Verdict | 'all'; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'dangerous', label: 'Danger' },
  { id: 'risky', label: 'Risqué' },
  { id: 'caution', label: 'Prudence' },
  { id: 'likely_safe', label: 'Probablement fiable' },
  { id: 'safe', label: 'Fiable' },
];

export function HistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [verdict, setVerdict] = useState<Verdict | 'all'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Anti-rebond sur la recherche : évite une requête par frappe.
    const timer = setTimeout(() => {
      void api
        .listAnalyses({
          limit: 50,
          search: search || undefined,
          verdict: verdict === 'all' ? undefined : verdict,
          favoritesOnly: favoritesOnly || undefined,
        })
        .then((result) => {
          if (cancelled) return;
          setItems(result.items);
          setTotal(result.total);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, verdict, favoritesOnly]);

  const toggleSelection = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });

  const compare = async () => {
    const result = await api.compare([...selected]).catch(() => null);
    if (result) setComparison(result);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Historique</h1>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {total} analyse{total > 1 ? 's' : ''} conservée{total > 1 ? 's' : ''} localement,
            chiffrée
            {total > 1 ? 's' : ''} au repos.
          </p>
        </div>

        {selected.size >= 2 && (
          <Button
            variant="primary"
            size="sm"
            icon={<GitCompare className="h-3.5 w-3.5" />}
            onClick={() => void compare()}
          >
            Comparer ({selected.size})
          </Button>
        )}
      </header>

      {/* Filtres */}
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher par titre ou URL…"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            aria-label="Rechercher dans l'historique"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {VERDICT_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setVerdict(filter.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-2xs font-medium transition-colors',
                verdict === filter.id
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border text-muted hover:border-border-strong hover:text-ink',
              )}
              aria-pressed={verdict === filter.id}
            >
              {filter.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setFavoritesOnly((current) => !current)}
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-2xs font-medium transition-colors',
              favoritesOnly
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border text-muted hover:text-ink',
            )}
            aria-pressed={favoritesOnly}
          >
            <Star className={cn('h-3 w-3', favoritesOnly && 'fill-current')} aria-hidden />
            Favoris
          </button>
        </div>
      </div>

      {/* Comparaison */}
      {comparison && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">Comparaison</h2>
              {comparison.recommendation && (
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted text-pretty">
                  {comparison.recommendation.reason}
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setComparison(null)}>
              Fermer
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-[0.8125rem]">
              <thead>
                <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-faint">
                  <th className="pb-2 font-medium">Annonce</th>
                  <th className="pb-2 font-medium">Prix</th>
                  <th className="pb-2 font-medium">Risque</th>
                  <th className="pb-2 font-medium">Confiance</th>
                  <th className="pb-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparison.reports.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-elevated/50',
                      comparison.recommendation?.analysisId === item.id && 'bg-safe/5',
                    )}
                    onClick={() => navigate(`/analyse/${item.id}`)}
                  >
                    <td className="py-2.5 pr-3">
                      <span className="line-clamp-1 font-medium text-ink">{item.title}</span>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted">
                      {item.price ? formatMoney(item.price.amount, item.price.currency) : '—'}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted">{item.scores.risk} %</td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted">{item.scores.trust} %</td>
                    <td className="py-2.5">
                      <VerdictBadge verdict={item.verdict} size="sm" showIcon={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {comparison.differentiators.length > 0 && (
            <div className="mt-4">
              <p className="text-2xs font-medium uppercase tracking-wide text-faint">
                Ce qui les distingue
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {comparison.differentiators.slice(0, 12).map((item) => (
                  <span key={item.criterionId} className="chip">
                    {item.label}
                    <span className="text-faint">
                      {item.presentIn.length}/{comparison.reports.length}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.section>
      )}

      {/* Liste */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-[4.5rem] rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title="Aucune analyse"
            description={
              search || verdict !== 'all' || favoritesOnly
                ? 'Aucun résultat ne correspond à ces filtres.'
                : "Vos analyses apparaîtront ici. Elles alimentent aussi la détection d'annonces recyclées : plus vous en réalisez, plus Veritas repère les contenus déjà vus."
            }
            action={
              <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
                Analyser une annonce
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.25), duration: 0.3 }}
              className={cn(
                'card-interactive flex items-center gap-3 p-3',
                selected.has(item.id) && 'ring-2 ring-accent/40',
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleSelection(item.id)}
                className="h-4 w-4 shrink-0 rounded border-border-strong text-accent focus:ring-accent"
                aria-label={`Sélectionner ${item.title} pour comparaison`}
              />

              <button
                type="button"
                onClick={() => navigate(`/analyse/${item.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <span className="h-12 w-12 shrink-0 rounded-lg border border-border bg-elevated" />
                )}

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="line-clamp-1 text-sm font-medium text-ink">
                      {item.title || 'Annonce sans titre'}
                    </span>
                    {item.favorite && (
                      <Star className="h-3 w-3 shrink-0 fill-accent text-accent" aria-hidden />
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-faint">
                    <span className="capitalize">{item.platform.replace('_', ' ')}</span>
                    {item.price && (
                      <span>{formatMoney(item.price.amount, item.price.currency)}</span>
                    )}
                    <span>{formatRelative(item.createdAt)}</span>
                    <span>{item.findingCount} constats</span>
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <VerdictBadge verdict={item.verdict} size="sm" showIcon={false} />
                  <span className="mt-1 block text-2xs tabular-nums text-faint">
                    risque {item.scores.risk} %
                  </span>
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
