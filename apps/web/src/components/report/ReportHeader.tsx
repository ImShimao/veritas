import { motion } from 'framer-motion';
import { Bell, ExternalLink, Printer, Star, Trash2 } from 'lucide-react';
import { formatMoney, VERDICT_PRESENTATION, type AnalysisReport } from '@veritas/core';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { Button, VerdictBadge } from '@/components/ui/primitives';
import { cn, exportReportJson, formatRelative, VERDICT_STYLES } from '@/lib/utils';

interface ReportHeaderProps {
  report: AnalysisReport;
  favorite: boolean;
  watching: boolean;
  onToggleFavorite: () => void;
  onWatch: () => void;
  onDelete: () => void;
}

export function ReportHeader({
  report,
  favorite,
  watching,
  onToggleFavorite,
  onWatch,
  onDelete,
}: ReportHeaderProps) {
  const presentation = VERDICT_PRESENTATION[report.verdict];
  const styles = VERDICT_STYLES[report.verdict];
  const thumbnail = report.listing.images.find((image) => image.url ?? image.dataUri);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
      className={cn('card overflow-hidden border-l-4', styles.border)}
      style={{ borderLeftColor: styles.stroke }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Identité de l'annonce */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={report.verdict} size="lg" />
              <span className="chip capitalize">
                {report.listing.source.platform.replace('_', ' ')}
              </span>
              <span className="text-2xs text-faint">{formatRelative(report.createdAt)}</span>
            </div>

            <div className="mt-3 flex gap-4">
              {thumbnail && (
                <img
                  src={thumbnail.url ?? thumbnail.dataUri}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-snug tracking-tight text-ink text-balance">
                  {report.listing.title || 'Annonce sans titre'}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
                  {report.listing.price && (
                    <span className="font-semibold text-ink">
                      {formatMoney(report.listing.price.amount, report.listing.price.currency)}
                    </span>
                  )}
                  {report.listing.location?.raw && <span>{report.listing.location.raw}</span>}
                  {report.listing.source.url && (
                    <a
                      href={report.listing.source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      Voir l'annonce
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <p className="prose-veritas mt-4 text-pretty">{presentation.headline}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={favorite ? 'primary' : 'secondary'}
                icon={<Star className={cn('h-3.5 w-3.5', favorite && 'fill-current')} />}
                onClick={onToggleFavorite}
              >
                {favorite ? 'Favori' : 'Ajouter aux favoris'}
              </Button>
              {report.listing.source.url && (
                <Button
                  size="sm"
                  variant={watching ? 'primary' : 'secondary'}
                  icon={<Bell className="h-3.5 w-3.5" />}
                  onClick={onWatch}
                  disabled={watching}
                >
                  {watching ? 'Sous surveillance' : 'Surveiller'}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={<Printer className="h-3.5 w-3.5" />}
                onClick={() => window.print()}
                title="Imprimer ou enregistrer en PDF — utile pour un signalement"
              >
                Exporter
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => exportReportJson(report)}
                title="Télécharger les données brutes du rapport (JSON)"
              >
                JSON
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={onDelete}
                className="print-hide"
              >
                Supprimer
              </Button>
            </div>
          </div>

          {/* Scores */}
          <div className="flex shrink-0 items-start justify-center gap-6 sm:gap-8">
            <ScoreRing
              value={report.scores.risk}
              label="Risque"
              color={styles.stroke}
              size={132}
              inverted
            />
            <div className="flex flex-col gap-4 pt-1">
              <ScoreRing
                value={report.scores.trust}
                label="Confiance"
                color="rgb(var(--accent))"
                size={78}
                sublabel=""
              />
              <ScoreRing
                value={report.scores.authenticity}
                label="Authenticité"
                color="rgb(var(--muted))"
                size={78}
                sublabel=""
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bandeau de fiabilité de l'analyse : distinct du verdict, et il compte. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-border bg-elevated/50 px-5 py-3 text-2xs text-muted sm:px-6">
        <span>
          <strong className="font-semibold text-ink">{report.criteriaEvaluated}</strong> critères
          évalués
        </span>
        <span>
          <strong className="font-semibold text-ink">{report.findings.length}</strong> déclenchés
        </span>
        <span>
          Fiabilité de l'analyse :{' '}
          <strong
            className={cn(
              'font-semibold',
              report.metaConfidence < 0.5 ? 'text-caution' : 'text-ink',
            )}
          >
            {Math.round(report.metaConfidence * 100)} %
          </strong>
        </span>
        <span>{report.timings.totalMs} ms</span>
      </div>
    </motion.section>
  );
}
