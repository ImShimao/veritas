import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import type { Finding } from '@veritas/core';
import { cn, CATEGORY_LABELS, SEVERITY_STYLES } from '@/lib/utils';

const ICONS = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: Info,
  info: Info,
} as const;

/**
 * Liste des constats.
 *
 * Chaque constat est repliable et expose ses preuves. C'est le cœur de la
 * promesse d'explicabilité : l'utilisateur doit toujours pouvoir remonter du
 * score à la phrase exacte de l'annonce qui l'a produit.
 */
export function FindingsList({ findings }: { findings: Finding[] }) {
  const [filter, setFilter] = useState<'all' | 'negative' | 'positive'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(
    // Les constats critiques sont dépliés d'emblée : ce sont ceux qu'il ne
    // faut surtout pas manquer.
    () => new Set(findings.filter((f) => f.severity === 'critical').map((f) => f.criterionId)),
  );

  // Avant une impression, on déplie tout : un rapport exporté en PDF doit
  // contenir chaque explication, pas seulement les constats déjà ouverts.
  useEffect(() => {
    const expandAll = () => setExpanded(new Set(findings.map((f) => f.criterionId)));
    window.addEventListener('beforeprint', expandAll);
    return () => window.removeEventListener('beforeprint', expandAll);
  }, [findings]);

  const visible = findings.filter((finding) => {
    if (filter === 'negative') return finding.polarity === 'negative';
    if (filter === 'positive') return finding.polarity === 'positive';
    return true;
  });

  const counts = {
    all: findings.length,
    negative: findings.filter((f) => f.polarity === 'negative').length,
    positive: findings.filter((f) => f.polarity === 'positive').length,
  };

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">Constats détaillés</h2>
          <p className="mt-0.5 text-2xs text-muted">
            Chaque point est rattaché à un critère documenté et à une preuve citable.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-elevated p-0.5">
          {[
            { id: 'all' as const, label: 'Tous' },
            { id: 'negative' as const, label: 'Alertes' },
            { id: 'positive' as const, label: 'En faveur' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-2xs font-medium transition-colors',
                filter === tab.id ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink',
              )}
              aria-pressed={filter === tab.id}
            >
              {tab.label}
              <span className="ml-1 text-faint">{counts[tab.id]}</span>
            </button>
          ))}
        </div>
      </header>

      <ul className="divide-y divide-border">
        {visible.map((finding, index) => {
          const isOpen = expanded.has(finding.criterionId);
          const severity = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.info!;
          const positive = finding.polarity === 'positive';
          const Icon = positive ? CheckCircle2 : (ICONS[finding.severity] ?? Info);

          return (
            <motion.li
              key={finding.criterionId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.3 }}
            >
              <button
                type="button"
                onClick={() => toggle(finding.criterionId)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-elevated/50"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
                    positive ? 'bg-safe/10 text-safe' : cn(severity.bg, severity.text),
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-ink">{finding.label}</span>
                    <span className="chip">
                      {CATEGORY_LABELS[finding.category] ?? finding.category}
                    </span>
                    {!positive && finding.severity !== 'info' && (
                      <span className={cn('chip border-transparent', severity.bg, severity.text)}>
                        {severity.label}
                      </span>
                    )}
                  </span>
                  {!isOpen && (
                    <span className="mt-1 line-clamp-1 block text-[0.8125rem] text-muted">
                      {finding.explanation}
                    </span>
                  )}
                </span>

                <ChevronDown
                  className={cn(
                    'mt-1 h-4 w-4 shrink-0 text-faint transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 px-5 pb-4 pl-14">
                      <p className="prose-veritas text-pretty">{finding.explanation}</p>

                      {finding.evidence.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-2xs font-medium uppercase tracking-wide text-faint">
                            Preuves
                          </p>
                          <ul className="space-y-1.5">
                            {finding.evidence.map((evidence, evidenceIndex) => (
                              <li
                                key={`${finding.criterionId}-${evidenceIndex}`}
                                className="rounded-lg border border-border bg-elevated/60 px-3 py-2 text-[0.8125rem]"
                              >
                                <span className="text-faint">{evidence.label} : </span>
                                <span className="text-ink">{evidence.value}</span>
                                {evidence.excerpt && (
                                  <p className="mt-1 border-l-2 border-border-strong pl-2 italic text-muted">
                                    {evidence.excerpt}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-faint">
                        <span>
                          Certitude du signal :{' '}
                          <strong className="font-medium text-muted">
                            {Math.round(finding.strength * 100)} %
                          </strong>
                        </span>
                        <span>
                          Poids :{' '}
                          <strong className="font-medium text-muted">
                            {finding.weight.toFixed(2)}
                          </strong>
                        </span>
                        <code className="font-mono text-faint">{finding.criterionId}</code>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>

      {visible.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Aucun constat dans cette catégorie.
        </p>
      )}
    </section>
  );
}
