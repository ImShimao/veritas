import { createId, parseMoney, sanitize, type Listing, type ListingImage } from '@veritas/core';
import type { ParsedDocument } from './types';

/**
 * Extraction depuis les données structurées.
 *
 * JSON-LD (schema.org) et Open Graph sont publiés volontairement par les sites
 * pour être lus par des tiers — moteurs de recherche, réseaux sociaux, agrégateurs.
 * Les exploiter est donc à la fois la voie la plus robuste (elles changent
 * beaucoup moins souvent que le HTML) et la plus respectueuse : ce sont
 * précisément les métadonnées destinées à la consommation automatisée.
 *
 * C'est pour cette raison que le socle générique est construit sur ces
 * données, les sélecteurs CSS ne venant qu'en complément.
 */

const PRODUCT_TYPES = new Set([
  'Product',
  'IndividualProduct',
  'Vehicle',
  'Car',
  'Offer',
  'Accommodation',
  'Apartment',
  'House',
  'LodgingBusiness',
  'RealEstateListing',
  'Residence',
  'Event',
]);

function typeOf(node: Record<string, unknown>): string[] {
  const raw = node['@type'];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string');
  return [];
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return sanitize(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = asString(item);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return asString(record.name ?? record['@value'] ?? record.value);
  }
  return undefined;
}

function collectImageUrls(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageUrls(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    collectImageUrls(record.url ?? record.contentUrl ?? record.image, out);
  }
}

export interface StructuredExtraction {
  title?: string;
  description?: string;
  price?: { amount: number; currency: string };
  images: string[];
  location?: { raw?: string; city?: string; postalCode?: string; country?: string };
  condition?: string;
  category?: string;
  publishedAt?: string;
  attributes: Record<string, string>;
  seller?: { displayName?: string; ratingAverage?: number; ratingCount?: number };
  fields: string[];
}

/** Lit tout ce qui est exploitable dans les données structurées de la page. */
export function extractStructured(document: ParsedDocument): StructuredExtraction {
  const result: StructuredExtraction = { images: [], attributes: {}, fields: [] };
  const imageUrls = new Set<string>();

  // ── JSON-LD ────────────────────────────────────────────────────────
  const nodes = document.jsonLd();
  const product = nodes.find((node) => typeOf(node).some((type) => PRODUCT_TYPES.has(type)));

  if (product) {
    result.title = asString(product.name);
    result.description = asString(product.description);
    result.category = asString(product.category);
    collectImageUrls(product.image, imageUrls);

    const offers = normalizeOffers(product.offers);
    if (offers) {
      const amount = Number(offers.price);
      if (Number.isFinite(amount) && amount > 0) {
        result.price = { amount, currency: asString(offers.priceCurrency) ?? 'EUR' };
      }
      const condition = asString(offers.itemCondition);
      if (condition) result.condition = condition.replace(/^https?:\/\/schema\.org\//, '');
      const seller = offers.seller;
      if (seller && typeof seller === 'object') {
        const sellerRecord = seller as Record<string, unknown>;
        // La note du vendeur est celle attachée au vendeur lui-même, pas au
        // produit (voir plus bas). On la lit donc sur ce nœud.
        result.seller = {
          displayName: asString(sellerRecord.name),
          ...parseAggregateRating(sellerRecord.aggregateRating),
        };
      }
    }

    // Caractéristiques structurées de schema.org.
    for (const [key, label] of [
      ['brand', 'Marque'],
      ['model', 'Modèle'],
      ['color', 'Couleur'],
      ['sku', 'Référence'],
      ['mileageFromOdometer', 'Kilométrage'],
      ['vehicleModelDate', 'Année'],
      ['fuelType', 'Carburant'],
      ['vehicleTransmission', 'Boîte de vitesses'],
      ['numberOfRooms', 'Nombre de pièces'],
      ['floorSize', 'Surface'],
    ] as const) {
      const value = asString(product[key]);
      if (value) result.attributes[label] = value;
    }

    const additional = product.additionalProperty;
    if (Array.isArray(additional)) {
      for (const entry of additional) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as Record<string, unknown>;
        const name = asString(record.name);
        const value = asString(record.value);
        if (name && value) result.attributes[name] = value;
      }
    }

    // NB : `product.aggregateRating` est la note du PRODUIT (avis sur l'objet),
    // pas celle du vendeur. Les confondre présenterait les avis d'un article
    // comme un historique de confiance du vendeur — un signal fabriqué. La note
    // vendeur ne provient donc que du nœud vendeur (ci-dessus) ou, à défaut,
    // des sélecteurs de la plateforme.

    const address =
      product.address ?? (product.location as Record<string, unknown> | undefined)?.address;
    if (address && typeof address === 'object') {
      const record = address as Record<string, unknown>;
      result.location = {
        city: asString(record.addressLocality),
        postalCode: asString(record.postalCode),
        country: asString(record.addressCountry),
        raw:
          [
            asString(record.streetAddress),
            asString(record.addressLocality),
            asString(record.postalCode),
          ]
            .filter(Boolean)
            .join(', ') || undefined,
      };
    }

    const published = asString(product.datePublished ?? product.dateCreated);
    if (published) result.publishedAt = normalizeDate(published);

    result.fields.push('json-ld');
  }

  // ── Open Graph, en complément ou à défaut ──────────────────────────
  if (!result.title) {
    result.title = document.meta('og:title') ?? document.meta('twitter:title');
    if (result.title) result.fields.push('og:title');
  }
  if (!result.description) {
    result.description = document.meta('og:description') ?? document.meta('description');
    if (result.description) result.fields.push('og:description');
  }
  if (!result.price) {
    const raw =
      document.meta('product:price:amount') ??
      document.meta('og:price:amount') ??
      document.meta('twitter:data1');
    const currency =
      document.meta('product:price:currency') ?? document.meta('og:price:currency') ?? 'EUR';
    if (raw) {
      const parsed = parseMoney(`${raw} ${currency}`, currency);
      if (parsed) {
        result.price = parsed;
        result.fields.push('og:price');
      }
    }
  }

  for (const url of document.attrAll(
    [
      'meta[property="og:image"]',
      'meta[property="og:image:secure_url"]',
      'meta[name="twitter:image"]',
    ],
    'content',
  )) {
    if (/^https?:\/\//.test(url)) imageUrls.add(url);
  }

  if (imageUrls.size > 0) {
    result.images = [...imageUrls];
    result.fields.push('images');
  }

  return result;
}

/** Lit une note (`ratingValue`) et un volume d'avis depuis un nœud `AggregateRating`. */
function parseAggregateRating(value: unknown): { ratingAverage?: number; ratingCount?: number } {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const average = Number(record.ratingValue);
  const count = Number(record.reviewCount ?? record.ratingCount);
  return {
    ...(Number.isFinite(average) ? { ratingAverage: average } : {}),
    ...(Number.isFinite(count) ? { ratingCount: count } : {}),
  };
}

function normalizeOffers(offers: unknown): Record<string, unknown> | undefined {
  if (!offers) return undefined;
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const normalized = normalizeOffers(offer);
      if (normalized) return normalized;
    }
    return undefined;
  }
  if (typeof offers === 'object') return offers as Record<string, unknown>;
  return undefined;
}

/** Ramène une date à l'ISO 8601, ou l'écarte si elle est inexploitable. */
export function normalizeDate(value: string): string | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/** Convertit une liste d'URLs en images du modèle canonique. */
export function toListingImages(urls: string[], limit = 12): ListingImage[] {
  return urls.slice(0, limit).map((url, index) => ({
    id: createId('img'),
    url,
    position: index,
  }));
}

/** Assemble un `Listing` complet à partir de fragments, en comblant les valeurs par défaut. */
export function assembleListing(partial: Partial<Listing>, base: Partial<Listing>): Listing {
  return {
    id: partial.id ?? base.id ?? createId('lst'),
    source: { ...base.source!, ...partial.source },
    title: partial.title ?? base.title ?? '',
    description: partial.description ?? base.description ?? '',
    domain: partial.domain ?? base.domain ?? 'other',
    category: partial.category ?? base.category,
    condition: partial.condition ?? base.condition,
    price: partial.price ?? base.price,
    location: partial.location ?? base.location,
    attributes: { ...base.attributes, ...partial.attributes },
    images: partial.images?.length ? partial.images : (base.images ?? []),
    seller: partial.seller ?? base.seller,
    publishedAt: partial.publishedAt ?? base.publishedAt,
    updatedAt: partial.updatedAt ?? base.updatedAt,
    viewCount: partial.viewCount ?? base.viewCount,
    favoriteCount: partial.favoriteCount ?? base.favoriteCount,
    raw: partial.raw ?? base.raw,
  };
}
