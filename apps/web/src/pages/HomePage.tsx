import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Camera, Eye, Lock, Scale, Sparkles, UserSearch } from 'lucide-react';
import { api, type AnalysisSummary, type Identity } from '@/lib/api';
import { AnalyzeForm } from '@/components/AnalyzeForm';
import { VerdictBadge } from '@/components/ui/primitives';
import { formatRelative } from '@/lib/utils';

const CAPABILITIES = [
  {
    icon: Scale,
    title: 'Cohérence du prix',
    body: "Comparaison au marché après correction de l'âge du modèle et de l'état déclaré. La décote inexpliquée est le signal le plus discriminant.",
  },
  {
    icon: Eye,
    title: 'Rédaction et incohérences',
    body: "Urgence fabriquée, prétextes récurrents, contradictions internes, texte recopié d'une fiche produit ou généré automatiquement.",
  },
  {
    icon: Camera,
    title: 'Forensique des photos',
    body: "Captures d'écran déguisées, recompressions successives, retouches, métadonnées, et photos déjà vues dans une autre annonce.",
  },
  {
    icon: UserSearch,
    title: 'Profil du vendeur',
    body: 'Ancienneté, avis lissés statistiquement, rythme de publication, cohérence du catalogue, divergences de localisation.',
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<AnalysisSummary[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    void api
      .listAnalyses({ limit: 4 })
      .then((result) => setRecent(result.items))
      .catch(() => undefined);
    void api
      .identity()
      .then(setIdentity)
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="mx-auto max-w-2xl text-center"
      >
        <span className="chip mx-auto border-accent/25 bg-accent-soft text-accent">
          <Lock className="h-3 w-3" aria-hidden />
          100 % local · aucune clé d'API
        </span>

        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-ink text-balance sm:text-4xl">
          Savoir à qui vous avez affaire, avant de payer
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-muted text-pretty">
          Collez un lien, un texte ou les photos d'une annonce.{' '}
          {identity ? (
            <>
              Veritas la passe au crible de{' '}
              <strong className="font-semibold text-ink">{identity.criteria} critères</strong> et
              vous explique chacune de ses conclusions.
            </>
          ) : (
            <>
              Veritas la passe au crible de plusieurs centaines de critères et vous explique chacune
              de ses conclusions.
            </>
          )}
        </p>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
        className="mx-auto max-w-3xl"
      >
        <AnalyzeForm onAnalyzed={(id) => navigate(`/analyse/${id}`)} />
      </motion.div>

      {recent.length > 0 && (
        <section className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-ink">Analyses récentes</h2>
            <button
              type="button"
              onClick={() => navigate('/historique')}
              className="inline-flex items-center gap-1 text-2xs font-medium text-accent hover:underline"
            >
              Tout voir
              <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {recent.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/analyse/${item.id}`)}
                  className="card-interactive flex w-full items-center gap-3 p-3 text-left"
                >
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-faint">
                      <Sparkles className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-[0.8125rem] font-medium text-ink">
                      {item.title || 'Annonce sans titre'}
                    </span>
                    <span className="mt-0.5 block text-2xs text-faint">
                      {formatRelative(item.createdAt)}
                    </span>
                  </span>
                  <VerdictBadge verdict={item.verdict} size="sm" showIcon={false} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto max-w-4xl">
        <h2 className="mb-4 text-center text-sm font-semibold tracking-tight text-ink">
          Ce que Veritas examine
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CAPABILITIES.map((capability, index) => (
            <motion.li
              key={capability.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + index * 0.05 }}
              className="card p-4"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <capability.icon className="h-4 w-4" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink">{capability.title}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted text-pretty">
                {capability.body}
              </p>
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}
