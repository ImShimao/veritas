import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/Shell';
import { HomePage } from '@/pages/HomePage';

/*
 * Les pages secondaires sont chargées à la demande : l'écran d'analyse, point
 * d'entrée de l'immense majorité des visites, ne paie pas le coût du reste.
 */
const ReportPage = lazy(() =>
  import('@/pages/ReportPage').then((m) => ({ default: m.ReportPage })),
);
const HistoryPage = lazy(() =>
  import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const CriteriaPage = lazy(() =>
  import('@/pages/CriteriaPage').then((m) => ({ default: m.CriteriaPage })),
);
const AlertsPage = lazy(() =>
  import('@/pages/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="skeleton h-40 rounded-2xl" />
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}

export function App() {
  return (
    <Shell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analyse/:id" element={<ReportPage />} />
          <Route path="/historique" element={<HistoryPage />} />
          <Route path="/criteres" element={<CriteriaPage />} />
          <Route path="/alertes" element={<AlertsPage />} />
          <Route
            path="*"
            element={
              <div className="card px-6 py-16 text-center">
                <p className="text-lg font-semibold text-ink">Page introuvable</p>
                <p className="mt-1 text-sm text-muted">
                  Cette adresse ne correspond à aucune page.
                </p>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </Shell>
  );
}
