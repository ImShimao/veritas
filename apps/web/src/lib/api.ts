import type {
  AnalysisInputDto,
  AnalysisReport,
  ChatMessage,
  ChatSession,
  Criterion,
  Scores,
  Verdict,
  Watch,
  WatchAlert,
} from '@veritas/core';

/**
 * Client HTTP typé.
 *
 * Les types viennent de `@veritas/core`, partagés avec le serveur : un
 * changement de contrat casse la compilation du frontend au lieu de produire
 * une erreur silencieuse à l'exécution. C'est le principal bénéfice du
 * monorepo TypeScript de bout en bout.
 */

const BASE = '/api/v1';

export interface ApiErrorBody {
  error: { code: string; message: string; hint?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      'NETWORK',
      'Le serveur Veritas est injoignable.',
      "Vérifiez que l'API est démarrée (npm run dev:api).",
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const body = payload as ApiErrorBody | undefined;
    throw new ApiError(
      body?.error.code ?? 'UNKNOWN',
      body?.error.message ?? `Erreur ${response.status}`,
      body?.error.hint,
      response.status,
    );
  }

  return payload as T;
}

export interface AnalysisSummary {
  id: string;
  createdAt: string;
  title: string;
  platform: string;
  url?: string;
  price?: { amount: number; currency: string };
  thumbnail?: string;
  scores: Scores;
  verdict: Verdict;
  metaConfidence: number;
  findingCount: number;
  favorite: boolean;
}

export interface Identity {
  name: string;
  version: string;
  engineVersion: string;
  criteria: number;
  brain: string;
  externalServices: string[];
  requiresApiKey: boolean;
  dataStaysLocal: boolean;
}

export interface LearningStats {
  samples: number;
  feedbackCount: number;
  topDiscriminators: {
    criterionId: string;
    label: string;
    category?: string;
    multiplier: number;
    samples: number;
  }[];
}

export interface CriteriaCatalogue {
  stats: { total: number; byCategory: Record<string, number>; bySeverity: Record<string, number> };
  categories: readonly string[];
  items: (Pick<
    Criterion,
    'id' | 'category' | 'label' | 'rationale' | 'severity' | 'polarity' | 'weight'
  > & {
    effectiveWeight: number;
  })[];
}

export interface PlatformInfo {
  platform: string;
  label: string;
  hosts: string[];
  note?: string;
}

export interface ComparisonResult {
  reports: {
    id: string;
    title: string;
    url?: string;
    platform: string;
    price?: { amount: number; currency: string };
    scores: Scores;
    verdict: Verdict;
    metaConfidence: number;
    thumbnail?: string;
  }[];
  differentiators: { criterionId: string; label: string; presentIn: string[] }[];
  recommendation?: { analysisId: string; reason: string };
}

export const api = {
  identity: () => request<Identity>('/identity'),

  criteria: () => request<CriteriaCatalogue>('/criteria'),

  platforms: () => request<{ items: PlatformInfo[] }>('/platforms'),

  learning: () => request<LearningStats>('/learning'),

  analyze: (input: AnalysisInputDto) =>
    request<AnalysisReport>('/analyses', { method: 'POST', body: JSON.stringify(input) }),

  getAnalysis: (id: string) => request<AnalysisReport>(`/analyses/${id}`),

  listAnalyses: (
    params: {
      limit?: number;
      offset?: number;
      search?: string;
      verdict?: string;
      favoritesOnly?: boolean;
    } = {},
  ) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    const suffix = query.toString();
    return request<{ total: number; items: AnalysisSummary[] }>(
      `/analyses${suffix ? `?${suffix}` : ''}`,
    );
  },

  deleteAnalysis: (id: string) => request<void>(`/analyses/${id}`, { method: 'DELETE' }),

  toggleFavorite: (id: string) =>
    request<{ favorite: boolean }>(`/analyses/${id}/favorite`, { method: 'POST' }),

  compare: (analysisIds: string[]) =>
    request<ComparisonResult>('/analyses/compare', {
      method: 'POST',
      body: JSON.stringify({ analysisIds }),
    }),

  sendFeedback: (input: {
    analysisId: string;
    outcome: 'scam' | 'legitimate' | 'unknown';
    agreedFindings?: string[];
    disputedFindings?: string[];
    comment?: string;
  }) => request<{ samples: number }>('/feedback', { method: 'POST', body: JSON.stringify(input) }),

  chat: (input: { analysisId: string; question: string; sessionId?: string }) =>
    request<{ sessionId: string; message: ChatMessage }>('/chat', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  chatHistory: (analysisId: string) =>
    request<{ session: ChatSession | null; starters: readonly string[]; brain: string }>(
      `/chat/${analysisId}`,
    ),

  resetChat: (analysisId: string) => request<void>(`/chat/${analysisId}`, { method: 'DELETE' }),

  createWatch: (analysisId: string, intervalMs?: number) =>
    request<Watch>('/watches', {
      method: 'POST',
      body: JSON.stringify({ analysisId, intervalMs }),
    }),

  listWatches: () => request<{ items: Watch[] }>('/watches'),

  stopWatch: (id: string) => request<void>(`/watches/${id}`, { method: 'DELETE' }),

  alerts: (unreadOnly = false) =>
    request<{ items: WatchAlert[]; unread: number }>(`/alerts?unread=${unreadOnly}`),

  markAlertRead: (id: string) => request<void>(`/alerts/${id}/read`, { method: 'POST' }),
};
