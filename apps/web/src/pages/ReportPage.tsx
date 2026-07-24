import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import type { AnalysisReport } from '@veritas/core';
import { api, ApiError } from '@/lib/api';
import { Button, EmptyState } from '@/components/ui/primitives';
import { ReportHeader } from '@/components/report/ReportHeader';
import { FindingsList } from '@/components/report/FindingsList';
import {
  CategoriesPanel,
  FeedbackPanel,
  ImagesPanel,
  PricePanel,
  QuestionsPanel,
  RecommendationsPanel,
  SummaryPanel,
} from '@/components/report/ReportPanels';
import { ChatPanel } from '@/components/ChatPanel';

export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void api
      .getAnalysis(id)
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'Cette analyse est introuvable.');
      });

    void api
      .listWatches()
      .then((result) => {
        if (!cancelled)
          setWatching(result.items.some((watch) => watch.analysisId === id && watch.active));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggleFavorite = useCallback(async () => {
    if (!id) return;
    const result = await api.toggleFavorite(id).catch(() => null);
    if (result) setFavorite(result.favorite);
  }, [id]);

  const watch = useCallback(async () => {
    if (!id) return;
    await api.createWatch(id).catch(() => undefined);
    setWatching(true);
  }, [id]);

  const remove = useCallback(async () => {
    if (!id) return;
    await api.deleteAnalysis(id).catch(() => undefined);
    navigate('/historique');
  }, [id, navigate]);

  if (error) {
    return (
      <div className="card">
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="Analyse introuvable"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
              Lancer une nouvelle analyse
            </Button>
          }
        />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-56 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            <div className="skeleton h-32 rounded-2xl" />
            <div className="skeleton h-64 rounded-2xl" />
          </div>
          <div className="skeleton h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-2xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Retour
      </button>

      <ReportHeader
        report={report}
        favorite={favorite}
        watching={watching}
        onToggleFavorite={() => void toggleFavorite()}
        onWatch={() => void watch()}
        onDelete={() => void remove()}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-4">
          <SummaryPanel report={report} />
          <FindingsList findings={report.findings} />
          <PricePanel report={report} />
          <ImagesPanel report={report} />
          <RecommendationsPanel report={report} />
          <QuestionsPanel report={report} />
          <FeedbackPanel report={report} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <ChatPanel analysisId={report.id} />
          <CategoriesPanel report={report} />
        </aside>
      </div>
    </div>
  );
}
