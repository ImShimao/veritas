import {
  createId,
  nowIso,
  VeritasError,
  type Brain,
  type ChatMessage,
  type ChatSession,
} from '@veritas/core';
import type { Store } from '../store';
import type { AnalysisService } from './analysis.service';

/** Nombre de messages transmis au cerveau comme contexte de conversation. */
const HISTORY_WINDOW = 12;
/** Longueur maximale conservée par session, pour borner le stockage. */
const MAX_MESSAGES = 200;

export class ChatService {
  constructor(
    private readonly store: Store,
    private readonly analyses: AnalysisService,
    private readonly brain: Brain,
  ) {}

  get brainName(): string {
    return this.brain.name;
  }

  /** Récupère la session existante ou en ouvre une nouvelle pour cette analyse. */
  session(analysisId: string, sessionId?: string): ChatSession {
    if (sessionId) {
      const existing = this.store.chats.get(sessionId);
      if (!existing) throw new VeritasError('NOT_FOUND', "Cette conversation n'existe plus.");
      if (existing.analysisId !== analysisId) {
        throw new VeritasError('INVALID_INPUT', 'Cette conversation porte sur une autre analyse.');
      }
      return existing;
    }

    const existing = this.store.chats.findOne((chat) => chat.analysisId === analysisId);
    if (existing) return existing;

    return this.store.chats.put({
      id: createId('chat'),
      analysisId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
    });
  }

  async ask(
    analysisId: string,
    question: string,
    sessionId?: string,
  ): Promise<{
    session: ChatSession;
    message: ChatMessage;
  }> {
    const report = this.analyses.get(analysisId);
    const session = this.session(analysisId, sessionId);

    const userMessage: ChatMessage = {
      id: createId('msg'),
      role: 'user',
      content: question,
      createdAt: nowIso(),
    };

    const reply = await this.brain.reply({
      report,
      history: session.messages.slice(-HISTORY_WINDOW),
      question,
    });

    const assistantMessage: ChatMessage = {
      id: createId('msg'),
      role: 'assistant',
      content: reply.content,
      createdAt: nowIso(),
      citedFindings: reply.citedFindings,
      intent: reply.intent,
      suggestions: reply.suggestions,
      attachment: reply.attachment,
    };

    const messages = [...session.messages, userMessage, assistantMessage].slice(-MAX_MESSAGES);
    const updated = this.store.chats.put({ ...session, messages, updatedAt: nowIso() });

    return { session: updated, message: assistantMessage };
  }

  history(analysisId: string): ChatSession | undefined {
    return this.store.chats.findOne((chat) => chat.analysisId === analysisId);
  }

  reset(analysisId: string): void {
    const session = this.store.chats.findOne((chat) => chat.analysisId === analysisId);
    if (session) this.store.chats.delete(session.id);
  }
}
