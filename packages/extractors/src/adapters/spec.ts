import {
  parseMoney,
  sanitize,
  type Listing,
  type ListingDomain,
  type Platform,
} from '@veritas/core';
import type { ExtractionInput, ExtractorAdapter, ParsedDocument } from '../types';
import { extractStructured, normalizeDate, toListingImages } from '../structured';

/**
 * Adaptateur déclaratif.
 *
 * L'immense majorité des plateformes ne diffère que par ses sélecteurs CSS et
 * ses noms d'hôtes. Les décrire par des données plutôt que par du code rend
 * l'ajout d'une plateforme trivial — une entrée de plus dans un tableau — et
 * évite la duplication de quatorze fichiers quasi identiques.
 *
 * Les cas réellement particuliers (données dans un blob JSON embarqué) sont
 * couverts par `embeddedJson`, sans sortir du même modèle.
 */

export interface PlatformSpec {
  platform: Platform;
  label: string;
  /** Noms d'hôtes gérés, sans « www. ». Le suffixe suffit : `leboncoin.fr` couvre `m.leboncoin.fr`. */
  hosts: string[];
  /** Famille de biens présumée quand la plateforme est spécialisée. */
  domainGuess?: ListingDomain;
  selectors?: {
    title?: string[];
    price?: string[];
    description?: string[];
    location?: string[];
    publishedAt?: string[];
    images?: { selectors: string[]; attribute?: string }[];
    sellerName?: string[];
    sellerRating?: string[];
    sellerReviews?: string[];
    sellerMemberSince?: string[];
    attributes?: { container: string; key: string; value: string };
  };
  /**
   * Extraction depuis un blob JSON embarqué dans la page
   * (`__NEXT_DATA__`, `window.__DATA__`…), fréquent sur les applications React.
   */
  embeddedJson?: {
    selector: string;
    pick: (data: unknown) => Partial<Listing> | undefined;
  };
  /** Devise par défaut si la page ne la précise pas. */
  currency?: string;
  /** Note affichée aux utilisateurs sur les limites de cet adaptateur. */
  note?: string;
}

export function createAdapter(spec: PlatformSpec): ExtractorAdapter {
  return {
    platform: spec.platform,
    label: spec.label,

    matches(url: URL): boolean {
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      return spec.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
    },

    extract(document: ParsedDocument, context: ExtractionInput): Partial<Listing> {
      // 1. Socle : données structurées, les plus stables dans le temps.
      const structured = extractStructured(document);
      const selectors = spec.selectors ?? {};
      const currency = spec.currency ?? structured.price?.currency ?? 'EUR';

      // 2. Sélecteurs propres à la plateforme, en complément.
      const title = pick(selectors.title, document) ?? structured.title;
      const description = pick(selectors.description, document) ?? structured.description;

      const priceText = pick(selectors.price, document);
      const price = priceText ? parseMoney(priceText, currency) : structured.price;

      const locationText = pick(selectors.location, document);
      const location = locationText ? { raw: locationText } : structured.location;

      const imageUrls = new Set(structured.images);
      for (const source of selectors.images ?? []) {
        for (const url of document.attrAll(source.selectors, source.attribute ?? 'src')) {
          if (/^https?:\/\//.test(url)) imageUrls.add(url);
        }
      }

      const attributes = { ...structured.attributes };
      if (selectors.attributes) {
        Object.assign(
          attributes,
          document.pairs(
            selectors.attributes.container,
            selectors.attributes.key,
            selectors.attributes.value,
          ),
        );
      }

      const sellerName = pick(selectors.sellerName, document) ?? structured.seller?.displayName;
      const ratingAverage =
        parseNumber(pick(selectors.sellerRating, document)) ?? structured.seller?.ratingAverage;
      const ratingCount =
        parseNumber(pick(selectors.sellerReviews, document)) ?? structured.seller?.ratingCount;
      const memberSince = pick(selectors.sellerMemberSince, document);

      const publishedRaw = pick(selectors.publishedAt, document);
      const publishedAt = publishedRaw ? normalizeDate(publishedRaw) : structured.publishedAt;

      let listing: Partial<Listing> = {
        title,
        description,
        price: price ? { amount: price.amount, currency: price.currency } : undefined,
        location,
        attributes,
        images: toListingImages([...imageUrls]),
        condition: structured.condition,
        category: structured.category,
        publishedAt,
        domain: spec.domainGuess ?? context.domainHint,
        seller:
          sellerName || ratingAverage !== undefined || ratingCount !== undefined || memberSince
            ? {
                displayName: sellerName,
                ratingAverage,
                ratingCount,
                memberSince: memberSince ? normalizeDate(memberSince) : undefined,
              }
            : undefined,
      };

      // 3. Blob JSON embarqué : prioritaire, car c'est la source dont le site
      //    se sert lui-même pour afficher la page.
      if (spec.embeddedJson) {
        const data = document.embeddedJson(spec.embeddedJson.selector);
        if (data !== undefined) {
          try {
            const enriched = spec.embeddedJson.pick(data);
            if (enriched) listing = mergePreferring(enriched, listing);
          } catch {
            // La structure du blob a changé : on conserve l'extraction classique.
          }
        }
      }

      return listing;
    },
  };
}

function pick(selectors: string[] | undefined, document: ParsedDocument): string | undefined {
  if (!selectors || selectors.length === 0) return undefined;
  const value = document.text(selectors);
  return value ? sanitize(value) : undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.replace(',', '.').match(/\d+(\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Fusion où `preferred` gagne champ par champ, sans écraser par du vide. */
function mergePreferring(
  preferred: Partial<Listing>,
  fallback: Partial<Listing>,
): Partial<Listing> {
  const merged: Partial<Listing> = { ...fallback };
  for (const [key, value] of Object.entries(preferred)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  if (preferred.attributes || fallback.attributes) {
    merged.attributes = { ...fallback.attributes, ...preferred.attributes };
  }
  return merged;
}
