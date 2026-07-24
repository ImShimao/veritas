/**
 * Service worker de l'extension — l'hôte du moteur.
 *
 * Il embarque tout Veritas et réalise l'analyse **localement**, sans serveur.
 * C'est ce qui rend l'extension autonome : elle fonctionne toute seule, sur
 * n'importe quel navigateur, sans rien installer d'autre.
 *
 * Toutes les opérations lourdes vivent ici (le popup, éphémère, ne fait
 * qu'afficher). La communication passe par des messages typés.
 */
import type { AnalysisInputDto } from '@veritas/core';
import * as host from './engine-host';
import * as store from './store';
import { checkForUpdate } from './version-check';

type Message =
  | { type: 'ANALYZE'; input: AnalysisInputDto }
  | { type: 'CHAT'; analysisId: string; question: string }
  | {
      type: 'FEEDBACK';
      analysisId: string;
      outcome: 'scam' | 'legitimate' | 'unknown';
      agreed?: string[];
      disputed?: string[];
    }
  | { type: 'GET_REPORT'; analysisId: string }
  | { type: 'GET_CHAT'; analysisId: string }
  | { type: 'LIST_REPORTS' }
  | { type: 'DELETE_REPORT'; analysisId: string }
  | { type: 'TOGGLE_FAVORITE'; analysisId: string }
  | { type: 'IDENTITY' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; patch: Record<string, unknown> }
  | { type: 'CHECK_UPDATE'; force?: boolean }
  | { type: 'CAPTURE_AND_ANALYZE'; payload: { url: string; html: string } };

/** Route un message vers le bon traitement et renvoie un résultat sérialisable. */
async function handle(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'ANALYZE':
      return { ok: true, report: await host.analyze(message.input) };

    case 'CAPTURE_AND_ANALYZE': {
      const report = await host.analyze({ url: message.payload.url, html: message.payload.html });
      return { ok: true, report };
    }

    case 'CHAT':
      return host.chat(message.analysisId, message.question);

    case 'FEEDBACK':
      return host.feedback(message.analysisId, message.outcome, message.agreed, message.disputed);

    case 'GET_REPORT':
      return { report: (await store.getReport(message.analysisId)) ?? null };

    case 'GET_CHAT':
      return { session: (await store.getChat(message.analysisId)) ?? null };

    case 'LIST_REPORTS': {
      const [reports, favorites] = await Promise.all([store.listReports(), store.getFavorites()]);
      return {
        items: reports.map((report) => ({
          id: report.id,
          createdAt: report.createdAt,
          title: report.listing.title,
          platform: report.listing.source.platform,
          url: report.listing.source.url,
          price: report.listing.price,
          scores: report.scores,
          verdict: report.verdict,
          findingCount: report.findings.length,
          favorite: favorites.includes(report.id),
        })),
      };
    }

    case 'DELETE_REPORT':
      await store.deleteReport(message.analysisId);
      return { ok: true };

    case 'TOGGLE_FAVORITE':
      return { favorite: await store.toggleFavorite(message.analysisId) };

    case 'IDENTITY':
      return host.identity();

    case 'GET_SETTINGS':
      return store.getSettings();

    case 'SAVE_SETTINGS':
      return store.saveSettings(message.patch);

    case 'CHECK_UPDATE':
      return checkForUpdate(message.force);

    default:
      return { error: 'Message inconnu.' };
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handle(message)
    .then((result) => sendResponse(result))
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: detail });
    });
  // Réponse asynchrone : on garde le canal ouvert.
  return true;
});

// Vérifie les mises à jour à l'installation et au démarrage du navigateur.
chrome.runtime.onInstalled.addListener(() => void checkForUpdate(true));
chrome.runtime.onStartup?.addListener(() => void checkForUpdate());
