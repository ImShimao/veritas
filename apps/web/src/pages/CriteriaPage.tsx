import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, Search, TrendingUp } from 'lucide-react';
import { api, type CriteriaCatalogue, type Identity, type LearningStats } from '@/lib/api';
import { cn, CATEGORY_LABELS, SEVERITY_STYLES } from '@/lib/utils';

/**
 * Page « Critères ».
 *
 * Elle matérialise la promesse d'explicabilité au niveau du produit entier :
 * l'utilisateur peut inspecter chacun des critères du moteur, leur poids, et
 * voir comment l'apprentissage les a recalibrés. Rien n'est caché.
 */
export function CriteriaPage() {
  const [catalogue, setCatalogue] = useState<CriteriaCatalogue | null>(null);
  const [learning, setLearning] = useState<LearningStats | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    void api
      .criteria()
      .then(setCatalogue)
      .catch(() => undefined);
    void api
      .learning()
      .then(setLearning)
      .catch(() => undefined);
    void api
      .identity()
      .then(setIdentity)
      .catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    if (!catalogue) return [];
    const needle = search.trim().toLowerCase();
    return catalogue.items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!needle) return true;
      return (
        item.label.toLowerCase().includes(needle) ||
        item.rationale.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle)
      );
    });
  }, [catalogue, search, category]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Comment Veritas décide</h1>
        <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-muted text-pretty">
          {identity ? (
            <>
              Le moteur passe chaque annonce au crible de{' '}
              <strong className="font-semibold text-ink">{identity.criteria} critères</strong>{' '}
              nommés, documentés et pondérés. Aucun point de score n'existe sans une règle explicite
              derrière lui — les voici toutes.
            </>
          ) : (
            'Le moteur repose sur des centaines de critères nommés et pondérés. Les voici tous.'
          )}
        </p>
      </header>

      {/* Apprentissage */}
      {learning && learning.samples > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-sm font-semibold text-ink">Apprentissage en cours</h2>
          </div>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {learning.samples} retour{learning.samples > 1 ? 's' : ''} intégré
            {learning.samples > 1 ? 's' : ''}. Les critères ci-dessous ont vu leur poids ajusté par
            votre usage réel — un multiplicateur au-dessus de 1 renforce le critère, en dessous il
            l'atténue.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {learning.topDiscriminators.map((item) => (
              <span
                key={item.criterionId}
                className={cn(
                  'chip',
                  item.multiplier > 1
                    ? 'border-safe/25 bg-safe/10 text-safe'
                    : 'border-risky/25 bg-risky/10 text-risky',
                )}
                title={`${item.samples} observation(s)`}
              >
                {item.label}
                <span className="font-mono">×{item.multiplier.toFixed(2)}</span>
              </span>
            ))}
          </div>
        </motion.section>
      )}

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
            placeholder="Rechercher un critère…"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>

        {catalogue && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
              Tous ({catalogue.stats.total})
            </FilterChip>
            {catalogue.categories.map((cat) => (
              <FilterChip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
                {CATEGORY_LABELS[cat] ?? cat} ({catalogue.stats.byCategory[cat] ?? 0})
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {/* Liste des critères */}
      {!catalogue ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item, index) => {
            const severity = SEVERITY_STYLES[item.severity] ?? SEVERITY_STYLES.info!;
            const recalibrated = Math.abs(item.effectiveWeight - item.weight) > 0.01;
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.01, 0.2) }}
                className="card p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      item.polarity === 'positive'
                        ? 'bg-safe'
                        : item.polarity === 'negative'
                          ? 'bg-danger'
                          : 'bg-faint',
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-ink">{item.label}</span>
                  <span className="chip">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                  {item.severity !== 'info' && (
                    <span className={cn('chip border-transparent', severity.bg, severity.text)}>
                      {severity.label}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-2 text-2xs text-faint">
                    <span title="Poids de base">poids {item.weight.toFixed(2)}</span>
                    {recalibrated && (
                      <span
                        className={cn(
                          'font-mono font-medium',
                          item.effectiveWeight > item.weight ? 'text-safe' : 'text-risky',
                        )}
                        title="Poids après apprentissage"
                      >
                        → {item.effectiveWeight.toFixed(2)}
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted text-pretty">
                  {item.rationale}
                </p>
                <code className="mt-1.5 block font-mono text-2xs text-faint">{item.id}</code>
              </motion.li>
            );
          })}
        </ul>
      )}

      {catalogue && filtered.length === 0 && (
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Layers className="h-7 w-7 text-faint" aria-hidden />
          <p className="text-sm text-muted">Aucun critère ne correspond à cette recherche.</p>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-2xs font-medium transition-colors',
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border text-muted hover:border-border-strong hover:text-ink',
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
