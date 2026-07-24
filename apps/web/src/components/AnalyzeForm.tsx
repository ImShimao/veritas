import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ImagePlus, Link2, Sparkles, Trash2, Type as TypeIcon, X } from 'lucide-react';
import type { AnalysisInputDto } from '@veritas/core';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Mode = 'url' | 'text';

/** Limites alignées sur celles du serveur, pour échouer côté client sans aller-retour. */
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

interface AnalyzeFormProps {
  onAnalyzed: (analysisId: string) => void;
}

export function AnalyzeForm({ onAnalyzed }: AnalyzeFormProps) {
  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [images, setImages] = useState<{ id: string; dataUri: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const accepted = [...files].filter((file) => file.type.startsWith('image/'));

      if (accepted.length === 0) {
        setError({ message: 'Seules les images sont acceptées (PNG, JPEG, WebP).' });
        return;
      }

      const room = MAX_IMAGES - images.length;
      if (room <= 0) {
        setError({ message: `Maximum ${MAX_IMAGES} images par analyse.` });
        return;
      }

      const loaded = await Promise.all(
        accepted.slice(0, room).map(
          (file) =>
            new Promise<{ id: string; dataUri: string; name: string } | null>((resolve) => {
              if (file.size > MAX_IMAGE_BYTES) {
                resolve(null);
                return;
              }
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
                  dataUri: String(reader.result),
                  name: file.name,
                });
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(file);
            }),
        ),
      );

      const valid = loaded.filter((item): item is NonNullable<typeof item> => item !== null);
      if (valid.length < accepted.length) {
        setError({ message: 'Certaines images dépassent 12 Mo et ont été ignorées.' });
      }
      setImages((current) => [...current, ...valid].slice(0, MAX_IMAGES));
    },
    [images.length],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = '';
  };

  const canSubmit =
    (mode === 'url' && url.trim().length > 8) ||
    (mode === 'text' && text.trim().length > 20) ||
    images.length > 0;

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);

    const input: AnalysisInputDto = {
      ...(mode === 'url' && url.trim() ? { url: url.trim() } : {}),
      ...(mode === 'text' && text.trim() ? { text: text.trim() } : {}),
      ...(images.length > 0 ? { images: images.map((image) => image.dataUri) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      const report = await api.analyze(input);
      onAnalyzed(report.id);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError({ message: caught.message, hint: caught.hint });
      } else {
        setError({ message: "L'analyse a échoué pour une raison inattendue." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Sélecteur de mode */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-2.5">
        {[
          { id: 'url' as const, label: 'Lien', icon: Link2 },
          { id: 'text' as const, label: 'Texte', icon: TypeIcon },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            className={cn(
              'relative rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
              mode === tab.id ? 'text-ink' : 'text-muted hover:text-ink',
            )}
            aria-pressed={mode === tab.id}
          >
            {mode === tab.id && (
              <motion.span
                layoutId="analyze-tab"
                className="absolute inset-0 rounded-lg bg-elevated"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <tab.icon className="h-3.5 w-3.5" aria-hidden />
              {tab.label}
            </span>
          </button>
        ))}

        <span className="ml-auto text-2xs text-faint">
          {images.length > 0 && `${images.length} photo${images.length > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Zone de saisie */}
      <div
        className={cn(
          'relative p-4 transition-colors sm:p-5',
          dragging && 'bg-accent-soft/40 ring-2 ring-inset ring-accent/40',
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {mode === 'url' ? (
          <div className="space-y-2">
            <label htmlFor="analyze-url" className="sr-only">
              Lien de l'annonce
            </label>
            <input
              id="analyze-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) void submit();
              }}
              placeholder="https://www.leboncoin.fr/…"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-border bg-canvas px-4 py-3 text-[0.9375rem] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            <p className="px-1 text-2xs leading-relaxed text-faint">
              Leboncoin, Vinted, eBay, Airbnb, AutoScout24, Back Market et une vingtaine d'autres.
              Si le site bloque la lecture automatique, basculez sur l'onglet Texte ou utilisez
              l'extension navigateur.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="analyze-text" className="sr-only">
              Texte de l'annonce
            </label>
            <textarea
              id="analyze-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Collez ici le titre, le prix et la description de l'annonce…"
              rows={7}
              className="w-full resize-y rounded-xl border border-border bg-canvas px-4 py-3 text-[0.9375rem] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            <p className="px-1 text-2xs text-faint">
              {text.trim().length > 0 && `${text.trim().split(/\s+/).length} mots · `}
              Plus le texte est complet, plus l'analyse est fiable.
            </p>
          </div>
        )}

        {/* Photos importées */}
        <AnimatePresence initial={false}>
          {images.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 flex flex-wrap gap-2">
                {images.map((image) => (
                  <div key={image.id} className="group relative">
                    <img
                      src={image.dataUri}
                      alt={image.name}
                      className="h-16 w-16 rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setImages((current) => current.filter((item) => item.id !== image.id))
                      }
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-danger p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Retirer ${image.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contexte libre */}
        <AnimatePresence initial={false}>
          {showNotes && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-1.5">
                <label htmlFor="analyze-notes" className="block text-2xs font-medium text-muted">
                  Vos échanges avec le vendeur
                </label>
                <textarea
                  id="analyze-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ce qu'il vous a dit en privé, ce qu'il a refusé, la pression exercée…"
                  rows={3}
                  className="w-full resize-y rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
                <p className="text-2xs text-faint">
                  C'est souvent l'information la plus décisive : une fraude se révèle en messagerie
                  privée, jamais dans l'annonce publiée.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl">
            <span className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-lifted">
              Déposez les images ici
            </span>
          </div>
        )}
      </div>

      {/* Erreur */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-3 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3 sm:mx-5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 text-[0.8125rem]">
                <p className="font-medium text-danger">{error.message}</p>
                {error.hint && <p className="mt-1 leading-relaxed text-muted">{error.hint}</p>}
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-auto shrink-0 text-danger/60 hover:text-danger"
                aria-label="Fermer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-5">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<ImagePlus className="h-3.5 w-3.5" />}
          onClick={() => fileInput.current?.click()}
        >
          Photos
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNotes((current) => !current)}
          className={cn(showNotes && 'text-accent')}
        >
          Contexte
        </Button>
        {images.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => setImages([])}
          >
            Vider
          </Button>
        )}

        <Button
          variant="primary"
          size="md"
          className="ml-auto"
          loading={loading}
          disabled={!canSubmit}
          onClick={() => void submit()}
          icon={loading ? undefined : <Sparkles className="h-4 w-4" />}
        >
          {loading ? 'Analyse en cours…' : 'Analyser'}
        </Button>
      </div>
    </div>
  );
}
