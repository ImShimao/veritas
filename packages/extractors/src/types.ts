import type { Listing, ListingDomain, Platform } from '@veritas/core';

/** Réponse d'une récupération HTTP, fournie par l'hôte. */
export interface FetchedPage {
  html: string;
  finalUrl: string;
  status: number;
  /** Vrai si la page semble être un mur anti-robot plutôt que l'annonce. */
  blocked?: boolean;
}

export type PageFetcher = (url: string) => Promise<FetchedPage>;

export interface ExtractionInput {
  url?: string;
  /** HTML déjà en main : fourni par l'extension navigateur, ou récupéré par l'hôte. */
  html?: string;
  /** Texte collé par l'utilisateur. */
  text?: string;
  /** Images importées, en data-URI. */
  images?: string[];
  platformHint?: Platform;
  domainHint?: ListingDomain;
  /** Récupération réseau. Absente = aucune sortie réseau n'est tentée. */
  fetchPage?: PageFetcher;
}

/** Résultat d'une extraction, avec la traçabilité de ce qui a réellement été obtenu. */
export interface ExtractionResult {
  listing: Listing;
  /** Adaptateur ayant produit le résultat. */
  adapter: string;
  /** Champs effectivement extraits, pour diagnostic. */
  extractedFields: string[];
  /** Champs attendus mais absents. */
  missingFields: string[];
  degraded: boolean;
  degradedReason?: string;
  warnings: string[];
}

/**
 * Contrat d'un adaptateur de plateforme.
 *
 * Un adaptateur ne fait que traduire une page en `Listing` canonique. Il ne
 * porte aucune logique d'analyse : c'est ce cloisonnement qui permet d'ajouter
 * une plateforme sans toucher au moteur, et de faire évoluer le moteur sans
 * toucher aux plateformes.
 */
export interface ExtractorAdapter {
  readonly platform: Platform;
  readonly label: string;
  /** Vrai si cet adaptateur sait traiter cette URL. */
  matches(url: URL): boolean;
  /** Traduit le document en annonce partielle. */
  extract(document: ParsedDocument, context: ExtractionInput): Partial<Listing>;
}

/** Document analysé, exposé aux adaptateurs sous une forme neutre. */
export interface ParsedDocument {
  /** Sélecteur CSS renvoyant le premier texte trouvé. */
  text(selectors: string[]): string | undefined;
  /** Attribut du premier élément trouvé. */
  attr(selectors: string[], attribute: string): string | undefined;
  /** Tous les attributs correspondants, dédupliqués. */
  attrAll(selectors: string[], attribute: string): string[];
  /** Tous les textes correspondants. */
  textAll(selectors: string[]): string[];
  /** Paires clé/valeur extraites d'un conteneur de caractéristiques. */
  pairs(container: string, key: string, value: string): Record<string, string>;
  /** Objets JSON-LD présents dans la page. */
  jsonLd(): Record<string, unknown>[];
  /** Contenu JSON d'une balise script identifiée (`__NEXT_DATA__`, etc.). */
  embeddedJson(selector: string): unknown;
  /** Balises Open Graph et méta nommées. */
  meta(property: string): string | undefined;
  /** Texte brut du document, balises retirées. */
  plainText(): string;
  /** URL canonique déclarée par la page. */
  canonicalUrl(): string | undefined;
}
