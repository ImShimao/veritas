import { useState } from 'react';
import {
  ClipboardCheck,
  Copy,
  ExternalLink,
  ImageOff,
  Search,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { formatMoney, type AnalysisReport } from '@veritas/core';
import { api } from '@/lib/api';
import { Button, Meter, Section } from '@/components/ui/primitives';
import { cn, CATEGORY_LABELS } from '@/lib/utils';

// ── Résumé ─────────────────────────────────────────────────────────────

export function SummaryPanel({ report }: { report: AnalysisReport }) {
  return (
    <Section title="Synthèse" description="Ce qu'il faut retenir, en quelques phrases.">
      <p className="prose-veritas text-pretty">{report.summary}</p>

      {report.warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-caution/25 bg-caution/10 px-3.5 py-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-caution">
            Limites de cette analyse
          </p>
          <ul className="mt-1.5 space-y-1 text-[0.8125rem] leading-relaxed text-muted">
            {report.warnings.map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

// ── Scores par catégorie ───────────────────────────────────────────────

export function CategoriesPanel({ report }: { report: AnalysisReport }) {
  return (
    <Section
      title="Par dimension"
      description="Une catégorie sans données n'est pas notée : elle est signalée comme telle."
    >
      <ul className="space-y-3">
        {report.categories.map((category) => (
          <li key={category.category}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[0.8125rem] font-medium text-ink">
                {CATEGORY_LABELS[category.category] ?? category.category}
              </span>
              {category.applicable ? (
                <span className="text-2xs tabular-nums text-muted">
                  {category.score} / 100
                  <span className="ml-2 text-faint">{category.triggered} constat(s)</span>
                </span>
              ) : (
                <span className="text-2xs text-faint">non évaluable</span>
              )}
            </div>
            {category.applicable ? (
              <Meter
                value={category.score}
                color={
                  category.score >= 70
                    ? 'rgb(var(--safe))'
                    : category.score >= 45
                      ? 'rgb(var(--caution))'
                      : 'rgb(var(--danger))'
                }
              />
            ) : (
              <p className="text-2xs leading-relaxed text-faint">{category.unavailableReason}</p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── Prix ───────────────────────────────────────────────────────────────

export function PricePanel({ report }: { report: AnalysisReport }) {
  const price = report.price;
  if (!price) return null;

  const currency = price.currency;
  const market = price.market;

  return (
    <Section title="Analyse du prix" description={market?.label}>
      <p className="prose-veritas text-pretty">{price.explanation}</p>

      {market && (
        <div className="mt-5 space-y-4">
          {/* Positionnement du prix demandé dans la fourchette de marché. */}
          <div>
            <div className="mb-2 flex items-baseline justify-between text-2xs text-faint">
              <span>{formatMoney(market.p10, currency)}</span>
              <span className="text-muted">médiane {formatMoney(market.median, currency)}</span>
              <span>{formatMoney(market.p90, currency)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-gradient-to-r from-danger/40 via-safe/40 to-caution/40">
              <div
                className="absolute -top-1 h-4 w-1 rounded-full bg-ink shadow-soft"
                style={{
                  left: `${positionInRange(price.observed, market.p10, market.p90)}%`,
                }}
                title={`Prix demandé : ${formatMoney(price.observed, currency)}`}
              />
            </div>
            <p className="mt-2 text-center text-2xs text-muted">
              Prix demandé :{' '}
              <strong className="font-semibold text-ink">
                {formatMoney(price.observed, currency)}
              </strong>
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Médiane', value: formatMoney(market.median, currency) },
              { label: 'Moyenne', value: formatMoney(market.mean, currency) },
              {
                label: 'Écart',
                value:
                  price.deviation !== undefined
                    ? `${price.deviation > 0 ? '+' : ''}${Math.round(price.deviation * 100)} %`
                    : '—',
              },
              {
                label: 'Décote inexpliquée',
                value:
                  price.unexplainedDiscount !== undefined
                    ? `${Math.round(price.unexplainedDiscount * 100)} %`
                    : '—',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-border bg-elevated/50 px-3 py-2.5"
              >
                <dt className="text-2xs text-faint">{item.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Section>
  );
}

function positionInRange(value: number, min: number, max: number): number {
  if (max <= min) return 50;
  return Math.max(2, Math.min(98, ((value - min) / (max - min)) * 100));
}

// ── Photos ─────────────────────────────────────────────────────────────

const FLAG_LABELS: Record<string, string> = {
  screenshot: "Capture d'écran",
  low_resolution: 'Basse définition',
  heavy_compression: 'Très compressée',
  border_bands: 'Bandes ajoutées',
  uniform_regions: 'Zones uniformes',
  ela_anomaly: 'Anomalie ELA',
  editing_software: 'Logiciel de retouche',
  no_metadata: 'Sans métadonnées',
};

export function ImagesPanel({ report }: { report: AnalysisReport }) {
  if (report.images.length === 0) {
    return (
      <Section title="Photos" description="La forensique visuelle n'a pas pu être menée.">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-elevated/50 px-4 py-4">
          <ImageOff className="h-5 w-5 shrink-0 text-faint" aria-hidden />
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Aucune image n'a été analysée. Relancez l'analyse en important les photos de l'annonce :
            c'est souvent la partie la plus décisive du rapport.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Photos"
      description={`${report.images.length} image(s) analysées : définition, compression, métadonnées, retouches.`}
    >
      <ul className="space-y-3">
        {report.images.map((image, index) => {
          const original = report.listing.images.find((item) => item.id === image.imageId);
          const preview = original?.url ?? original?.dataUri;

          return (
            <li
              key={image.imageId}
              className="flex gap-3 rounded-xl border border-border bg-elevated/40 p-3"
            >
              {preview ? (
                <img
                  src={preview}
                  alt={`Photo ${index + 1}`}
                  className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-faint">
                  <ImageOff className="h-5 w-5" aria-hidden />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-medium text-ink">
                  Photo {index + 1}
                  {image.width && image.height && (
                    <span className="ml-2 font-normal text-faint">
                      {image.width} × {image.height} · {image.megapixels} Mpx
                    </span>
                  )}
                </p>

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {image.flags.length === 0 ? (
                    <span className="chip border-safe/25 bg-safe/10 text-safe">
                      Rien à signaler
                    </span>
                  ) : (
                    image.flags.map((flag) => (
                      <span
                        key={flag}
                        className={cn(
                          'chip',
                          flag === 'no_metadata'
                            ? ''
                            : 'border-caution/25 bg-caution/10 text-caution',
                        )}
                      >
                        {FLAG_LABELS[flag] ?? flag}
                      </span>
                    ))
                  )}
                </div>

                {image.reverseSearch.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-2xs text-faint">Recherche inversée :</span>
                    {image.reverseSearch.map((engine) => (
                      <a
                        key={engine.engine}
                        href={engine.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-2xs font-medium text-accent hover:underline"
                      >
                        {engine.engine}
                        <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                      </a>
                    ))}
                  </div>
                )}

                {image.notes.length > 0 && (
                  <p className="mt-1.5 text-2xs leading-relaxed text-faint">
                    {image.notes.join(' ')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-accent/20 bg-accent-soft/40 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-muted">
        <Search className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span>
          La recherche d'image inversée est la vérification la plus décisive, et la seule que
          Veritas ne peut pas faire à votre place. Trente secondes suffisent à savoir si ces photos
          existent ailleurs sur Internet.
        </span>
      </p>
    </Section>
  );
}

// ── Recommandations ────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'border-danger/30 bg-danger/10',
  high: 'border-risky/25 bg-risky/10',
  medium: 'border-border bg-elevated/50',
  low: 'border-border bg-elevated/30',
};

export function RecommendationsPanel({ report }: { report: AnalysisReport }) {
  if (report.recommendations.length === 0) return null;

  return (
    <Section
      title="Que faire"
      description="Par ordre de priorité, avec la raison de chaque conseil."
    >
      <ol className="space-y-2.5">
        {report.recommendations.map((recommendation) => (
          <li
            key={recommendation.id}
            className={cn(
              'rounded-xl border px-4 py-3.5',
              PRIORITY_STYLES[recommendation.priority],
            )}
          >
            <p className="text-sm font-semibold text-ink">{recommendation.title}</p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted text-pretty">
              {recommendation.detail}
            </p>
            {recommendation.because.length > 0 && (
              <p className="mt-2 text-2xs text-faint">
                Parce que : {recommendation.because.join(', ')}.
              </p>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ── Questions au vendeur ───────────────────────────────────────────────

export function QuestionsPanel({ report }: { report: AnalysisReport }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = report.questionsForSeller.map((q, index) => `${index + 1}. ${q}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Presse-papiers refusé (contexte non sécurisé) : l'utilisateur peut sélectionner à la main. */
    }
  };

  return (
    <Section
      title="Questions à poser"
      description="Choisies d'après les zones d'ombre de cette annonce précise."
      action={
        <Button
          size="sm"
          variant="ghost"
          icon={
            copied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
          }
          onClick={() => void copy()}
        >
          {copied ? 'Copié' : 'Copier'}
        </Button>
      }
    >
      <ol className="space-y-2">
        {report.questionsForSeller.map((question, index) => (
          <li key={index} className="flex gap-2.5 text-[0.8125rem] leading-relaxed text-muted">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-elevated text-2xs font-semibold text-faint">
              {index + 1}
            </span>
            <span className="text-pretty">{question}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-2xs leading-relaxed text-faint">
        Ce qui compte n'est pas seulement la réponse, mais la façon de répondre. Une esquive répétée
        sur une question triviale en dit plus long que n'importe quelle explication.
      </p>
    </Section>
  );
}

// ── Retour utilisateur ─────────────────────────────────────────────────

/**
 * Boucle d'apprentissage.
 *
 * C'est le seul endroit où l'utilisateur peut corriger le moteur. Le libellé
 * insiste sur l'issue réelle constatée, et non sur un simple « d'accord / pas
 * d'accord » — c'est cette information factuelle qui a une valeur statistique.
 */
export function FeedbackPanel({ report }: { report: AnalysisReport }) {
  const [sent, setSent] = useState<'scam' | 'legitimate' | null>(null);
  const [sending, setSending] = useState(false);

  const send = async (outcome: 'scam' | 'legitimate') => {
    setSending(true);
    try {
      await api.sendFeedback({
        analysisId: report.id,
        outcome,
        agreedFindings:
          outcome === 'scam'
            ? report.findings.filter((f) => f.polarity === 'negative').map((f) => f.criterionId)
            : [],
        disputedFindings:
          outcome === 'legitimate'
            ? report.findings
                .filter((f) => f.polarity === 'negative' && f.severity === 'critical')
                .map((f) => f.criterionId)
            : [],
      });
      setSent(outcome);
    } catch {
      /* L'échec d'un retour n'a pas à interrompre la lecture du rapport. */
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Section title="Merci" description="Votre retour a été intégré.">
        <p className="prose-veritas">
          {sent === 'scam'
            ? 'Les critères qui se sont déclenchés sur cette annonce voient leur poids renforcé. La prochaine annonce du même type sera détectée plus tôt.'
            : "Les critères qui ont déclenché une alerte à tort voient leur influence réduite. C'est ainsi que le moteur s'affine sur vos usages réels."}
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="Aidez Veritas à s'améliorer"
      description="Si vous savez ce qu'il en était réellement, dites-le : le moteur recalibre ses critères."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={sending}
          icon={<ThumbsDown className="h-3.5 w-3.5" />}
          onClick={() => void send('scam')}
        >
          C'était bien une arnaque
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={sending}
          icon={<ThumbsUp className="h-3.5 w-3.5" />}
          onClick={() => void send('legitimate')}
        >
          L'annonce était honnête
        </Button>
      </div>
    </Section>
  );
}
