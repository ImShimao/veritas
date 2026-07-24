/**
 * Modèle canonique d'une annonce.
 *
 * Toutes les sources (URL, texte collé, captures d'écran, extension navigateur)
 * convergent vers ce modèle unique. Les analyseurs ne connaissent que ce type,
 * ce qui rend l'ajout d'une plateforme totalement transparent pour le moteur.
 */

export const PLATFORMS = [
  'leboncoin',
  'facebook_marketplace',
  'vinted',
  'ebay',
  'etsy',
  'autoscout24',
  'mobile_de',
  'airbnb',
  'booking',
  'selency',
  'backmarket',
  'rakuten',
  'amazon',
  'lacentrale',
  'paruvendu',
  'gumtree',
  'craigslist',
  'marktplaats',
  'wallapop',
  'subito',
  'generic',
  'unknown',
] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Familles de biens : conditionnent les référentiels de prix et certains critères. */
export const LISTING_DOMAINS = [
  'vehicle',
  'electronics',
  'fashion',
  'furniture',
  'real_estate',
  'rental_stay',
  'collectible',
  'sport_leisure',
  'baby_kids',
  'diy_garden',
  'service',
  'other',
] as const;

export type ListingDomain = (typeof LISTING_DOMAINS)[number];

export type InputMode = 'url' | 'text' | 'screenshot' | 'photos' | 'extension' | 'manual';

export interface ImageMetadata {
  /** Fabricant / modèle d'appareil déclarés en EXIF. */
  cameraMake?: string;
  cameraModel?: string;
  /** Logiciel déclaré : révèle souvent une retouche (Photoshop, GIMP…). */
  software?: string;
  takenAt?: string;
  gps?: { latitude: number; longitude: number };
  orientation?: number;
  /** Vrai lorsque le fichier ne contient plus aucun bloc EXIF (capture, re-upload, nettoyage). */
  stripped?: boolean;
  /** Champs bruts conservés pour l'affichage détaillé. */
  raw?: Record<string, unknown>;
}

export interface ListingImage {
  id: string;
  /** URL distante lorsque l'image provient d'une annonce en ligne. */
  url?: string;
  /** Contenu binaire encodé lorsqu'elle est importée par l'utilisateur. */
  dataUri?: string;
  width?: number;
  height?: number;
  bytes?: number;
  mime?: string;
  /** Position dans la galerie de l'annonce. */
  position?: number;
  metadata?: ImageMetadata;
}

export interface SellerProfile {
  id?: string;
  displayName?: string;
  profileUrl?: string;
  /** Date d'inscription sur la plateforme, ISO 8601. */
  memberSince?: string;
  listingsCount?: number;
  soldCount?: number;
  ratingAverage?: number;
  ratingCount?: number;
  /** Identité vérifiée par la plateforme. */
  verified?: boolean;
  proAccount?: boolean;
  location?: string;
  responseRate?: number;
  badges?: string[];
  /** Coordonnées présentes dans l'annonce, utiles au recoupement de signalements. */
  phone?: string;
  email?: string;
}

export interface ListingPrice {
  amount: number;
  currency: string;
  /** Prix barré / prix neuf annoncé par le vendeur. */
  original?: number;
  negotiable?: boolean;
  /** Unité pour les locations : « nuit », « mois »… */
  unit?: string;
}

export interface ListingLocation {
  raw?: string;
  city?: string;
  postalCode?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface ListingSource {
  platform: Platform;
  url?: string;
  inputMode: InputMode;
  capturedAt: string;
  /** Vrai si l'extraction a été partielle (page protégée, contenu dynamique…). */
  degraded?: boolean;
  /** Message lisible expliquant une extraction partielle. */
  degradedReason?: string;
}

export interface ListingHistoryEntry {
  observedAt: string;
  price?: number;
  title?: string;
  descriptionHash?: string;
  imageHashes?: string[];
  available?: boolean;
}

export interface Listing {
  id: string;
  source: ListingSource;
  title: string;
  description: string;
  domain: ListingDomain;
  category?: string;
  condition?: string;
  price?: ListingPrice;
  location?: ListingLocation;
  /** Caractéristiques structurées : kilométrage, taille, marque, année… */
  attributes: Record<string, string>;
  images: ListingImage[];
  seller?: SellerProfile;
  publishedAt?: string;
  updatedAt?: string;
  viewCount?: number;
  favoriteCount?: number;
  /** Payload brut de l'extracteur, conservé pour le débogage et l'audit. */
  raw?: Record<string, unknown>;
}

/** Entrée utilisateur avant normalisation. */
export interface AnalysisInput {
  url?: string;
  text?: string;
  /** Images en data-URI (captures d'écran ou photos de l'annonce). */
  images?: string[];
  /** HTML fourni par l'extension navigateur quand la page est déjà ouverte. */
  html?: string;
  platformHint?: Platform;
  domainHint?: ListingDomain;
  /** Contexte facultatif fourni par l'utilisateur (« le vendeur veut être payé en cartes cadeaux »). */
  notes?: string;
}
