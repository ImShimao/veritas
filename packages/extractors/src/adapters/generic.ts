import { sanitize, truncate, type Listing } from '@veritas/core';
import type { ExtractionInput, ExtractorAdapter, ParsedDocument } from '../types';
import { extractStructured, toListingImages } from '../structured';

/**
 * Adaptateur générique.
 *
 * Il ne connaît aucune plateforme : il exploite uniquement les données
 * structurées et quelques heuristiques universelles. C'est ce qui permet
 * d'analyser une annonce sur un site jamais rencontré — de nombreux sites de
 * petites annonces exposent correctement JSON-LD et Open Graph.
 *
 * Il sert aussi de repli quand un adaptateur spécialisé ne trouve rien, par
 * exemple après une refonte du HTML de la plateforme.
 */
export class GenericAdapter implements ExtractorAdapter {
  readonly platform = 'generic' as const;
  readonly label = 'Extraction générique';

  matches(): boolean {
    // Toujours applicable : c'est le dernier recours du registre.
    return true;
  }

  extract(document: ParsedDocument, context: ExtractionInput): Partial<Listing> {
    const structured = extractStructured(document);

    const title =
      structured.title ??
      document.text(['h1', '[itemprop="name"]', '.title', '#title']) ??
      document.meta('og:title');

    const description =
      structured.description ??
      document.text([
        '[itemprop="description"]',
        '#description',
        '.description',
        '[class*="description"]',
        'article',
      ]) ??
      this.guessDescription(document);

    const images = new Set(structured.images);
    for (const url of document.attrAll(
      ['[itemprop="image"]', 'article img', 'main img', '.gallery img', 'picture img'],
      'src',
    )) {
      if (/^https?:\/\//.test(url)) images.add(url);
    }

    return {
      title: title ? sanitize(title) : undefined,
      description: description ? sanitize(description) : undefined,
      price: structured.price,
      location: structured.location,
      condition: structured.condition,
      category: structured.category,
      publishedAt: structured.publishedAt,
      attributes: structured.attributes,
      images: toListingImages([...images]),
      domain: context.domainHint,
      seller: structured.seller?.displayName
        ? { displayName: structured.seller.displayName }
        : undefined,
    };
  }

  /**
   * Repli ultime : le texte visible de la page, tronqué.
   *
   * Grossier par construction — il capture aussi la navigation et les
   * mentions légales — mais il vaut mieux analyser un texte bruité que ne
   * rien analyser du tout. Le rapport signale l'extraction comme dégradée.
   */
  private guessDescription(document: ParsedDocument): string | undefined {
    const text = document.plainText();
    if (text.length < 80) return undefined;
    return truncate(text, 6000);
  }
}
