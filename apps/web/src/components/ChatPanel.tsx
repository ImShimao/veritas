import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, RotateCcw, Send, Shield } from 'lucide-react';
import type { ChatMessage } from '@veritas/core';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/primitives';
import { cn, renderMarkdown } from '@/lib/utils';

interface ChatPanelProps {
  analysisId: string;
  /** Permet au rapport de surligner les constats cités par l'assistant. */
  onCiteFindings?: (criterionIds: string[]) => void;
}

export function ChatPanel({ analysisId, onCiteFindings }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [starters, setStarters] = useState<readonly string[]>([]);
  const [brain, setBrain] = useState('Veritas Local');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .chatHistory(analysisId)
      .then((result) => {
        if (cancelled) return;
        setMessages(result.session?.messages ?? []);
        setSessionId(result.session?.id);
        setStarters(result.starters);
        setBrain(result.brain);
      })
      .catch(() => {
        /* Conversation indisponible : le rapport reste consultable. */
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    setInput('');
    setSending(true);

    // Message optimiste : la conversation ne doit jamais paraître figée.
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const result = await api.chat({ analysisId, question: trimmed, sessionId });
      setSessionId(result.sessionId);
      setMessages((current) => [...current, result.message]);
      if (result.message.citedFindings?.length) onCiteFindings?.(result.message.citedFindings);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            "Je n'ai pas pu répondre : le serveur est injoignable. Vérifiez que l'API Veritas tourne, puis réessayez.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const reset = async () => {
    await api.resetChat(analysisId).catch(() => undefined);
    setMessages([]);
    setSessionId(undefined);
  };

  const suggestions =
    messages.length === 0 ? starters : (messages[messages.length - 1]?.suggestions ?? []);

  return (
    <div className="card flex h-[36rem] flex-col overflow-hidden lg:h-[calc(100vh-8rem)] lg:max-h-[52rem]">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Shield className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Veritas</p>
          <p className="truncate text-2xs text-faint">
            {brain} · aucune donnée ne sort de votre machine
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => void reset()}
          >
            <span className="sr-only">Réinitialiser la conversation</span>
          </Button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-ink">Posez-moi vos questions</p>
            <p className="mx-auto mt-1 max-w-xs text-[0.8125rem] leading-relaxed text-muted text-pretty">
              Je ne réponds que sur la base de ce rapport. Si je n'ai pas l'information, je vous le
              dirai plutôt que d'inventer.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[0.875rem] leading-relaxed',
                  message.role === 'user'
                    ? 'bg-accent text-white'
                    : 'border border-border bg-elevated/60 text-ink',
                )}
              >
                {message.role === 'assistant' ? (
                  <div
                    className="chat-markdown space-y-2"
                    // Le contenu est produit par le moteur local et échappé dans
                    // `renderMarkdown` avant toute transformation : aucun texte
                    // d'annonce ne peut injecter de balise ici.
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                  />
                ) : (
                  message.content
                )}

                {message.attachment && <AttachmentCard attachment={message.attachment} />}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {sending && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl border border-border bg-elevated/60 px-4 py-3">
              {[0, 1, 2].map((index) => (
                <motion.span
                  key={index}
                  className="h-1.5 w-1.5 rounded-full bg-faint"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {suggestions.length > 0 && !sending && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-border px-4 py-2.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void ask(suggestion)}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-2xs font-medium text-muted transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Votre question
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              // Entrée envoie, Maj+Entrée passe à la ligne : convention attendue.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void ask(input);
              }
            }}
            placeholder="Est-ce que tu achèterais ce produit ?"
            rows={1}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <Button
            variant="primary"
            size="md"
            disabled={!input.trim()}
            loading={sending}
            onClick={() => void ask(input)}
            aria-label="Envoyer"
            className="px-3"
          >
            {!sending && <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AttachmentCard({ attachment }: { attachment: NonNullable<ChatMessage['attachment']> }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(attachment.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Presse-papiers indisponible : le texte reste sélectionnable. */
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-faint">
          {attachment.title}
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 text-2xs font-medium text-accent hover:underline"
        >
          <Copy className="h-3 w-3" aria-hidden />
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-[0.8125rem] leading-relaxed text-muted">
        {attachment.body}
      </pre>
    </div>
  );
}
