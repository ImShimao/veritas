/**
 * Schémas de validation partagés entre l'API, l'interface web et l'extension.
 *
 * Ces schémas sont la seule frontière de confiance : toute donnée entrante
 * traverse l'un d'eux avant d'atteindre le moteur.
 */
import { z } from 'zod';
import { PLATFORMS, LISTING_DOMAINS } from './types/listing';

export const platformSchema = z.enum(PLATFORMS);
export const listingDomainSchema = z.enum(LISTING_DOMAINS);

/** Limites dimensionnées pour éviter tout épuisement mémoire côté serveur. */
export const LIMITS = {
  urlLength: 2048,
  textLength: 60_000,
  notesLength: 2_000,
  htmlLength: 4_000_000,
  images: 12,
  imageDataUriLength: 12_000_000,
  questionLength: 2_000,
} as const;

const dataUriSchema = z
  .string()
  .max(LIMITS.imageDataUriLength, 'Image trop volumineuse (12 Mo maximum).')
  .refine(
    (value) => /^data:image\/(png|jpe?g|webp|gif|avif|heic);base64,[A-Za-z0-9+/=\s]+$/i.test(value),
    'Format attendu : data:image/<type>;base64,<données>.',
  );

const httpUrlSchema = z
  .string()
  .trim()
  .max(LIMITS.urlLength)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'URL invalide : seuls http et https sont acceptés.');

export const analysisInputSchema = z
  .object({
    url: httpUrlSchema.optional(),
    text: z.string().max(LIMITS.textLength).optional(),
    images: z.array(dataUriSchema).max(LIMITS.images).optional(),
    html: z.string().max(LIMITS.htmlLength).optional(),
    platformHint: platformSchema.optional(),
    domainHint: listingDomainSchema.optional(),
    notes: z.string().max(LIMITS.notesLength).optional(),
  })
  .refine(
    (input) => Boolean(input.url || input.text || input.html || input.images?.length),
    'Fournissez au moins une URL, un texte, une capture ou des photos.',
  );

export type AnalysisInputDto = z.infer<typeof analysisInputSchema>;

export const chatRequestSchema = z.object({
  analysisId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64).optional(),
  question: z.string().trim().min(1).max(LIMITS.questionLength),
});

export type ChatRequestDto = z.infer<typeof chatRequestSchema>;

export const feedbackSchema = z.object({
  analysisId: z.string().min(1).max(64),
  outcome: z.enum(['scam', 'legitimate', 'unknown']),
  agreedFindings: z.array(z.string().max(120)).max(400).optional(),
  disputedFindings: z.array(z.string().max(120)).max(400).optional(),
  comment: z.string().max(2000).optional(),
});

export type FeedbackDto = z.infer<typeof feedbackSchema>;

export const watchRequestSchema = z.object({
  analysisId: z.string().min(1).max(64),
  intervalMs: z
    .number()
    .int()
    .min(300_000, 'Intervalle minimum : 5 minutes.')
    .max(604_800_000)
    .optional(),
});

export type WatchRequestDto = z.infer<typeof watchRequestSchema>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(200).optional(),
  verdict: z.enum(['safe', 'likely_safe', 'caution', 'risky', 'dangerous']).optional(),
  favoritesOnly: z.coerce.boolean().optional(),
});

export type ListQueryDto = z.infer<typeof listQuerySchema>;

export const compareRequestSchema = z.object({
  analysisIds: z.array(z.string().min(1).max(64)).min(2).max(5),
});

export type CompareRequestDto = z.infer<typeof compareRequestSchema>;
