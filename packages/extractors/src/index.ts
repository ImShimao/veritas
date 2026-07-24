import {
  createId,
  nowIso,
  sanitize,
  VeritasError,
  type Listing,
  type ListingImage,
  type Platform,
} from '@veritas/core';
import { parseDocument } from './document';
import { AdapterRegistry, defaultRegistry } from './registry';
import { assembleListing } from './structured';
import { guessPlatformFromText, parseFreeText } from './freetext';
import type { ExtractionInput, ExtractionResult } from './types';

export type {
  ExtractionInput,
  ExtractionResult,
  ExtractorAdapter,
  ParsedDocument,
  PageFetcher,
  FetchedPage,
} from './types';
export { AdapterRegistry, defaultRegistry } from './registry';
export { createAdapter } from './adapters/spec';
export type { PlatformSpec } from './adapters/spec';
export { PLATFORM_SPECS } from './adapters/platforms';
export { GenericAdapter } from './adapters/generic';
export { parseDocument } from './document';
export { parseFreeText, guessPlatformFromText } from './freetext';
export { extractStructured, assembleListing, toListingImages } from './structured';

/** Champs dont l'absence dégrade sensiblement la qualité de l'analyse. */
const IMPORTANT_FIELDS = ['title', 'description', 'price', 'images'] as const;

/**
 * Construit une annonce canonique à partir de n'importe quelle entrée.
 *
 * Les quatre modes d'entrée convergent ici :
 *   • URL — récupération puis adaptateur de plateforme ;
 *   • HTML — même chemin, sans sortie réseau (cas de l'extension) ;
 *   • texte — analyse du texte collé ;
 *   • images — enrichissement de l'un des trois précédents, ou entrée seule.
 *
 * La fonction ne lève jamais pour une extraction incomplète : elle retourne
 * une annonce marquée `degraded` avec la raison. C'est délibéré — une annonce
 * partiellement lue reste analysable, et l'utilisateur mérite une réponse
 * utile assortie d'un avertissement plutôt qu'une page d'erreur.
 */
export async function extractListing(
  input: ExtractionInput,
  registry: AdapterRegistry = defaultRegistry,
): Promise<ExtractionResult> {
  if (!input.url && !input.html && !input.text && !input.images?.length) {
    throw new VeritasError(
      'INVALID_INPUT',
      'Fournissez au moins une URL, un texte, une capture ou des photos.',
    );
  }

  const warnings: string[] = [];
  const importedImages = toImportedImages(input.images ?? []);

  // ── Chemin 1 : page HTML (fournie ou récupérée) ─────────────────────
  let html = input.html;
  let finalUrl = input.url;
  let blocked = false;

  if (!html && input.url && input.fetchPage) {
    try {
      const page = await input.fetchPage(input.url);
      html = page.html;
      finalUrl = page.finalUrl;
      blocked = page.blocked ?? false;
    } catch (error) {
      warnings.push(
        `La page n'a pas pu être récupérée : ${error instanceof Error ? error.message : 'erreur réseau'}.`,
      );
    }
  }

  const platform = resolvePlatform(input, registry, finalUrl);

  if (html && !blocked) {
    const adapter = registry.resolve(finalUrl);
    const document = parseDocument(html);
    let partial: Partial<Listing>;

    try {
      partial = adapter.extract(document, input);
    } catch (error) {
      warnings.push(
        `L'adaptateur ${adapter.label} a échoué : ${error instanceof Error ? error.message : 'erreur inconnue'}.`,
      );
      partial = {};
    }

    // Si l'adaptateur spécialisé n'a rien tiré de la page — refonte du site,
    // page inattendue — on retente avec l'extraction générique.
    if (!partial.title && !partial.description && adapter.platform !== 'generic') {
      warnings.push(
        `L'adaptateur ${adapter.label} n'a rien extrait ; extraction générique utilisée en repli.`,
      );
      partial = registry.resolve(undefined).extract(document, input);
    }

    const listing = finalizeListing(partial, {
      platform,
      url: finalUrl,
      inputMode: input.html ? 'extension' : 'url',
      importedImages,
      domainHint: input.domainHint,
    });

    const extracted = describeExtracted(listing);
    const missing = IMPORTANT_FIELDS.filter((field) => !extracted.includes(field));
    const degraded = missing.length > 0;

    if (degraded) {
      listing.source.degraded = true;
      listing.source.degradedReason = `Champs non extraits : ${missing.join(', ')}.`;
    }

    return {
      listing,
      adapter: adapter.label,
      extractedFields: extracted,
      missingFields: missing,
      degraded,
      degradedReason: listing.source.degradedReason,
      warnings,
    };
  }

  // ── Chemin 2 : texte collé ──────────────────────────────────────────
  if (input.text && sanitize(input.text).length > 0) {
    const parsed = parseFreeText(input.text, platform);
    const listing = finalizeListing(parsed.listing, {
      platform,
      url: finalUrl,
      inputMode: 'text',
      importedImages,
      domainHint: input.domainHint,
    });

    const extracted = describeExtracted(listing);
    const missing = IMPORTANT_FIELDS.filter((field) => !extracted.includes(field));

    return {
      listing,
      adapter: 'Analyse de texte',
      extractedFields: extracted,
      missingFields: missing,
      degraded: false,
      warnings,
    };
  }

  // ── Chemin 3 : images seules ────────────────────────────────────────
  if (importedImages.length > 0) {
    const listing = finalizeListing(
      { title: 'Annonce importée en images', description: '' },
      {
        platform,
        url: finalUrl,
        inputMode: 'photos',
        importedImages,
        domainHint: input.domainHint,
      },
    );
    listing.source.degraded = true;
    listing.source.degradedReason =
      "Seules des images ont été fournies : l'analyse du texte, du prix et du vendeur est impossible.";

    return {
      listing,
      adapter: 'Import de photos',
      extractedFields: ['images'],
      missingFields: ['title', 'description', 'price'],
      degraded: true,
      degradedReason: listing.source.degradedReason,
      warnings,
    };
  }

  // ── Échec : URL fournie, mais rien n'a pu être lu ───────────────────
  const spec = registry.spec(platform);
  throw new VeritasError(
    blocked ? 'FETCH_BLOCKED' : 'EXTRACTION_FAILED',
    blocked
      ? `${spec?.label ?? 'Cette plateforme'} bloque les requêtes automatisées : la page n'a pas pu être lue.`
      : "Le contenu de l'annonce n'a pas pu être récupéré.",
    {
      hint:
        spec?.note ??
        "Utilisez l'extension navigateur sur la page ouverte, ou collez le texte de l'annonce et importez ses photos.",
      details: { platform, url: finalUrl, warnings },
    },
  );
}

// ── Fonctions internes ─────────────────────────────────────────────────

function resolvePlatform(
  input: ExtractionInput,
  registry: AdapterRegistry,
  url: string | undefined,
): Platform {
  if (input.platformHint) return input.platformHint;
  if (url) {
    const detected = registry.detectPlatform(url);
    if (detected !== 'generic') return detected;
    return 'generic';
  }
  if (input.text) return guessPlatformFromText(input.text) ?? 'unknown';
  return 'unknown';
}

interface FinalizeContext {
  platform: Platform;
  url?: string;
  inputMode: Listing['source']['inputMode'];
  importedImages: ListingImage[];
  domainHint?: Listing['domain'];
}

/** Complète l'annonce : identité, source, famille de bien, fusion des images. */
function finalizeListing(partial: Partial<Listing>, context: FinalizeContext): Listing {
  const base: Partial<Listing> = {
    id: createId('lst'),
    source: {
      platform: context.platform,
      url: context.url,
      inputMode: context.inputMode,
      capturedAt: nowIso(),
    },
    attributes: {},
    images: [],
    domain: 'other',
  };

  const listing = assembleListing(partial, base);

  // Les images importées par l'utilisateur complètent celles de la page :
  // elles sont analysables en profondeur, contrairement aux URLs distantes.
  if (context.importedImages.length > 0) {
    listing.images = [...context.importedImages, ...listing.images].slice(0, 12);
  }

  /*
   * La famille de bien n'est délibérément pas déduite ici. La taxonomie et les
   * mots-clés qui la définissent appartiennent au moteur, avec les référentiels
   * de prix et les critères qui en dépendent. Les extracteurs se contentent de
   * transmettre ce que la page déclare ; le moteur complète si nécessaire.
   */
  if (context.domainHint) {
    listing.domain = context.domainHint;
  }

  listing.title = sanitize(listing.title);
  listing.description = sanitize(listing.description);

  return listing;
}

function toImportedImages(dataUris: string[]): ListingImage[] {
  return dataUris.slice(0, 12).map((dataUri, index) => ({
    id: createId('img'),
    dataUri,
    position: index,
  }));
}

function describeExtracted(listing: Listing): string[] {
  const fields: string[] = [];
  if (listing.title.length > 2) fields.push('title');
  if (listing.description.length > 30) fields.push('description');
  if (listing.price?.amount) fields.push('price');
  if (listing.images.length > 0) fields.push('images');
  if (listing.location?.raw || listing.location?.city) fields.push('location');
  if (listing.seller) fields.push('seller');
  if (listing.publishedAt) fields.push('publishedAt');
  if (Object.keys(listing.attributes).length > 0) fields.push('attributes');
  return fields;
}
