import type { AnalysisReport } from './analysis';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Constats cités par l'assistant, pour surligner le rapport en regard. */
  citedFindings?: string[];
  /** Intention détectée, exposée pour le débogage et la transparence. */
  intent?: string;
  /** Suggestions de questions suivantes. */
  suggestions?: string[];
  /** Contenu prêt à copier (message au vendeur, liste de questions…). */
  attachment?: { kind: 'draft_message' | 'checklist' | 'comparison'; title: string; body: string };
}

export interface ChatSession {
  id: string;
  analysisId: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

/** Tout ce dont le cerveau conversationnel dispose pour répondre. */
export interface BrainContext {
  report: AnalysisReport;
  history: ChatMessage[];
  question: string;
}

export interface BrainReply {
  content: string;
  intent: string;
  citedFindings: string[];
  suggestions: string[];
  attachment?: ChatMessage['attachment'];
}

/**
 * Contrat du cerveau conversationnel.
 *
 * L'implémentation par défaut est 100 % locale et déterministe. Toute autre
 * implémentation (modèle auto-hébergé) se branche ici sans toucher au reste
 * du logiciel — et sans jamais requérir de clé d'API tierce.
 */
export interface Brain {
  readonly name: string;
  readonly requiresNetwork: boolean;
  reply(context: BrainContext): Promise<BrainReply>;
}
