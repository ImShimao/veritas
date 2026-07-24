import type { Platform } from '@veritas/core';

/**
 * Caractéristiques de sécurité par plateforme.
 *
 * Ces informations déterminent l'exposition structurelle de l'acheteur : une
 * même annonce ne présente pas le même risque selon qu'un paiement protégé
 * existe ou non. Elles doivent être revues périodiquement, les plateformes
 * faisant évoluer leurs dispositifs.
 */

export interface PlatformProfile {
  platform: Platform;
  label: string;
  /** Paiement sécurisé avec protection acheteur intégrée. */
  protectedPayment: boolean;
  /** Nom commercial du dispositif, cité dans les recommandations. */
  protectionName?: string;
  /** Vérification d'identité imposée aux vendeurs. */
  identityVerification: boolean;
  /** Système d'avis publics. */
  publicReviews: boolean;
  /** Messagerie interne conservant une trace des échanges. */
  internalMessaging: boolean;
  /** Exposition résiduelle de l'acheteur, 0 (faible) à 1 (élevée). */
  baselineExposure: number;
  notes?: string;
}

const DEFAULT_PROFILE: Omit<PlatformProfile, 'platform' | 'label'> = {
  protectedPayment: false,
  identityVerification: false,
  publicReviews: false,
  internalMessaging: false,
  baselineExposure: 0.6,
};

export const PLATFORM_PROFILES: Partial<Record<Platform, PlatformProfile>> = {
  leboncoin: {
    platform: 'leboncoin',
    label: 'Leboncoin',
    protectedPayment: true,
    protectionName: 'Paiement sécurisé Leboncoin',
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.35,
    notes:
      "Le paiement sécurisé n'est pas obligatoire : la majorité des fraudes survient hors de ce dispositif.",
  },
  vinted: {
    platform: 'vinted',
    label: 'Vinted',
    protectedPayment: true,
    protectionName: 'Protection Acheteurs Vinted',
    identityVerification: false,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.3,
    notes: 'La protection ne joue que si la transaction reste intégralement sur la plateforme.',
  },
  ebay: {
    platform: 'ebay',
    label: 'eBay',
    protectedPayment: true,
    protectionName: 'Garantie client eBay',
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.28,
  },
  etsy: {
    platform: 'etsy',
    label: 'Etsy',
    protectedPayment: true,
    protectionName: 'Protection des achats Etsy',
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.3,
  },
  backmarket: {
    platform: 'backmarket',
    label: 'Back Market',
    protectedPayment: true,
    protectionName: 'Garantie Back Market',
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.2,
    notes: 'Vendeurs professionnels contrôlés, garantie commerciale de douze mois minimum.',
  },
  rakuten: {
    platform: 'rakuten',
    label: 'Rakuten',
    protectedPayment: true,
    protectionName: 'Garantie Rakuten',
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.28,
  },
  amazon: {
    platform: 'amazon',
    label: 'Amazon',
    protectedPayment: true,
    protectionName: 'Garantie A à Z',
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.22,
  },
  airbnb: {
    platform: 'airbnb',
    label: 'Airbnb',
    protectedPayment: true,
    protectionName: 'AirCover',
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.25,
    notes:
      "Toute demande de paiement hors de la plateforme annule la protection : c'est le scénario de fraude dominant.",
  },
  booking: {
    platform: 'booking',
    label: 'Booking.com',
    protectedPayment: true,
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.25,
  },
  selency: {
    platform: 'selency',
    label: 'Selency',
    protectedPayment: true,
    identityVerification: true,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.3,
  },
  facebook_marketplace: {
    platform: 'facebook_marketplace',
    label: 'Facebook Marketplace',
    protectedPayment: false,
    identityVerification: false,
    publicReviews: false,
    internalMessaging: true,
    baselineExposure: 0.72,
    notes:
      "Aucun paiement sécurisé pour les ventes locales et aucune vérification d'identité : la plateforme la plus exposée du panel.",
  },
  autoscout24: {
    platform: 'autoscout24',
    label: 'AutoScout24',
    protectedPayment: false,
    identityVerification: false,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.55,
  },
  mobile_de: {
    platform: 'mobile_de',
    label: 'mobile.de',
    protectedPayment: false,
    identityVerification: false,
    publicReviews: true,
    internalMessaging: true,
    baselineExposure: 0.55,
  },
  lacentrale: {
    platform: 'lacentrale',
    label: 'La Centrale',
    protectedPayment: false,
    identityVerification: false,
    publicReviews: false,
    internalMessaging: true,
    baselineExposure: 0.55,
  },
  craigslist: {
    platform: 'craigslist',
    label: 'Craigslist',
    protectedPayment: false,
    identityVerification: false,
    publicReviews: false,
    internalMessaging: false,
    baselineExposure: 0.8,
  },
};

export function getPlatformProfile(platform: Platform): PlatformProfile {
  return (
    PLATFORM_PROFILES[platform] ?? {
      platform,
      label: 'Plateforme non répertoriée',
      ...DEFAULT_PROFILE,
    }
  );
}
