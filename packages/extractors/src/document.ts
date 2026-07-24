import * as cheerio from 'cheerio';
import { sanitize } from '@veritas/core';
import type { ParsedDocument } from './types';

/**
 * Enveloppe cheerio exposée aux adaptateurs.
 *
 * Les adaptateurs ne manipulent jamais cheerio directement : ils passent par
 * cette interface réduite. Cela permet de remplacer l'implémentation
 * — un autre parseur, un DOM réel côté extension — sans réécrire les
 * quatorze adaptateurs de plateformes.
 */
export function parseDocument(html: string): ParsedDocument {
  const $ = cheerio.load(html);

  const firstNonEmpty = (values: (string | undefined)[]): string | undefined => {
    for (const value of values) {
      const cleaned = value ? sanitize(value) : '';
      if (cleaned.length > 0) return cleaned;
    }
    return undefined;
  };

  return {
    text(selectors) {
      return firstNonEmpty(selectors.map((selector) => $(selector).first().text()));
    },

    attr(selectors, attribute) {
      for (const selector of selectors) {
        const value = $(selector).first().attr(attribute);
        if (value && value.trim().length > 0) return value.trim();
      }
      return undefined;
    },

    attrAll(selectors, attribute) {
      const out = new Set<string>();
      for (const selector of selectors) {
        $(selector).each((_, element) => {
          const value = $(element).attr(attribute);
          if (value && value.trim().length > 0) out.add(value.trim());
        });
      }
      return [...out];
    },

    textAll(selectors) {
      const out: string[] = [];
      for (const selector of selectors) {
        $(selector).each((_, element) => {
          const value = sanitize($(element).text());
          if (value.length > 0) out.push(value);
        });
      }
      return out;
    },

    pairs(container, key, value) {
      const result: Record<string, string> = {};
      $(container).each((_, element) => {
        const label = sanitize($(element).find(key).first().text());
        const content = sanitize($(element).find(value).first().text());
        if (label && content) result[label.replace(/\s*:\s*$/, '')] = content;
      });
      return result;
    },

    jsonLd() {
      const blocks: Record<string, unknown>[] = [];
      $('script[type="application/ld+json"]').each((_, element) => {
        const raw = $(element).contents().text();
        if (!raw.trim()) return;
        try {
          const parsed: unknown = JSON.parse(raw);
          // Un même bloc peut contenir un tableau ou un @graph.
          for (const item of flattenJsonLd(parsed)) blocks.push(item);
        } catch {
          // Un JSON-LD malformé n'est pas une erreur fatale : on l'ignore.
        }
      });
      return blocks;
    },

    embeddedJson(selector) {
      const raw = $(selector).first().contents().text();
      if (!raw.trim()) return undefined;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined;
      }
    },

    meta(property) {
      const selectors = [
        `meta[property="${property}"]`,
        `meta[name="${property}"]`,
        `meta[itemprop="${property}"]`,
      ];
      for (const selector of selectors) {
        const value = $(selector).first().attr('content');
        if (value && value.trim().length > 0) return sanitize(value);
      }
      return undefined;
    },

    plainText() {
      const clone = cheerio.load($.html());
      clone('script, style, noscript, svg, header, footer, nav').remove();
      return sanitize(clone('body').text());
    },

    canonicalUrl() {
      return $('link[rel="canonical"]').first().attr('href')?.trim();
    },
  };
}

/** Aplatit les structures JSON-LD imbriquées (`@graph`, tableaux, listes d'items). */
function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nested = record['@graph'];
    if (nested) return flattenJsonLd(nested);
    return [record];
  }
  return [];
}
