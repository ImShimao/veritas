/**
 * Stockage local de l'extension.
 *
 * Tout vit dans `chrome.storage.local` — aucun serveur, aucune base externe.
 * C'est l'équivalent, côté extension, du stockage chiffré de l'application de
 * bureau : les données restent sur la machine de l'utilisateur, dans le
 * bac à sable de l'extension, propres à chaque personne.
 *
 * On borne chaque collection pour ne jamais saturer le quota, et on conserve
 * séparément les empreintes légères (corpus) qui alimentent la détection de
 * doublons — elles survivent bien plus longtemps que les rapports complets.
 */
import type { AnalysisReport, ChatSession } from '@veritas/core';
import type { CorpusEntry, CalibrationSnapshot } from '@veritas/engine';

const KEYS = {
  reports: 'veritas.reports',
  corpus: 'veritas.corpus',
  calibration: 'veritas.calibration',
  chats: 'veritas.chats',
  settings: 'veritas.settings',
  favorites: 'veritas.favorites',
} as const;

const LIMITS = {
  reports: 60,
  corpus: 3000,
  chats: 60,
} as const;

export interface ExtensionSettings {
  /** Cerveau conversationnel : local (défaut) ou modèle auto-hébergé. */
  brainDriver: 'local' | 'ollama';
  ollamaUrl: string;
  ollamaModel: string;
  /** Vérification des mises à jour au démarrage. */
  checkUpdates: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  brainDriver: 'local',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.1',
  checkUpdates: true,
};

async function get<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? fallback;
}

async function set(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

// ── Réglages ───────────────────────────────────────────────────────────

export async function getSettings(): Promise<ExtensionSettings> {
  return { ...DEFAULT_SETTINGS, ...(await get(KEYS.settings, {})) };
}

export async function saveSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await getSettings()), ...patch };
  await set(KEYS.settings, next);
  return next;
}

// ── Rapports ───────────────────────────────────────────────────────────

export async function listReports(): Promise<AnalysisReport[]> {
  return get<AnalysisReport[]>(KEYS.reports, []);
}

export async function getReport(id: string): Promise<AnalysisReport | undefined> {
  return (await listReports()).find((report) => report.id === id);
}

export async function saveReport(report: AnalysisReport): Promise<void> {
  const reports = await listReports();
  const filtered = reports.filter((r) => r.id !== report.id);
  filtered.unshift(report);
  // Les identifiants sont triables : on garde simplement les N plus récents.
  await set(KEYS.reports, filtered.slice(0, LIMITS.reports));
}

export async function deleteReport(id: string): Promise<void> {
  const reports = (await listReports()).filter((r) => r.id !== id);
  await set(KEYS.reports, reports);
  const favorites = (await getFavorites()).filter((f) => f !== id);
  await set(KEYS.favorites, favorites);
}

// ── Favoris ────────────────────────────────────────────────────────────

export async function getFavorites(): Promise<string[]> {
  return get<string[]>(KEYS.favorites, []);
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const favorites = await getFavorites();
  const index = favorites.indexOf(id);
  if (index >= 0) {
    favorites.splice(index, 1);
    await set(KEYS.favorites, favorites);
    return false;
  }
  favorites.push(id);
  await set(KEYS.favorites, favorites);
  return true;
}

// ── Corpus (empreintes pour la détection de doublons) ──────────────────

export async function getCorpus(): Promise<CorpusEntry[]> {
  return get<CorpusEntry[]>(KEYS.corpus, []);
}

export async function addCorpusEntry(entry: CorpusEntry): Promise<void> {
  const corpus = (await getCorpus()).filter((e) => e.analysisId !== entry.analysisId);
  corpus.push(entry);
  await set(KEYS.corpus, corpus.slice(-LIMITS.corpus));
}

// ── Calibration (apprentissage) ────────────────────────────────────────

export async function getCalibration(): Promise<CalibrationSnapshot | undefined> {
  return get<CalibrationSnapshot | undefined>(KEYS.calibration, undefined);
}

export async function saveCalibration(snapshot: CalibrationSnapshot): Promise<void> {
  await set(KEYS.calibration, snapshot);
}

// ── Conversations ──────────────────────────────────────────────────────

export async function getChat(analysisId: string): Promise<ChatSession | undefined> {
  const chats = await get<ChatSession[]>(KEYS.chats, []);
  return chats.find((c) => c.analysisId === analysisId);
}

export async function saveChat(session: ChatSession): Promise<void> {
  const chats = (await get<ChatSession[]>(KEYS.chats, [])).filter(
    (c) => c.analysisId !== session.analysisId,
  );
  chats.unshift(session);
  await set(KEYS.chats, chats.slice(0, LIMITS.chats));
}
