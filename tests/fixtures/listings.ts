import type { Listing, ListingDomain, Platform } from '@veritas/core';

/**
 * Jeu d'annonces de référence.
 *
 * Ces fixtures servent de garde-fou au calibrage : elles décrivent des cas dont
 * le verdict attendu ne devrait jamais changer silencieusement. Si une
 * modification du moteur fait basculer l'annonce manifestement frauduleuse en
 * « prudence », les tests doivent échouer.
 */

const DAY = 86_400_000;

export function makeListing(partial: Partial<Listing> = {}): Listing {
  return {
    id: 'fixture',
    source: {
      platform: (partial.source?.platform ?? 'leboncoin') as Platform,
      inputMode: 'text',
      capturedAt: new Date().toISOString(),
      ...partial.source,
    },
    title: '',
    description: '',
    domain: (partial.domain ?? 'other') as ListingDomain,
    attributes: {},
    images: [],
    ...partial,
  };
}

/** Annonce cumulant les schémas de fraude les plus documentés. */
export const blatantScam = makeListing({
  title: 'IPHONE 15 PRO MAX 256GO NEUF!!! URGENT DEPART',
  domain: 'electronics',
  description: `Bonjour, je vends mon iPhone 15 Pro Max 256 Go, NEUF sous blister, jamais servi.
Je suis actuellement à l'étranger pour une mission militaire, donc pas de remise en main propre possible, envoi uniquement.
Je dois partir demain, dernière chance !!! Plusieurs personnes sont intéressées, premier arrivé premier servi.
Paiement par carte cadeau PCS ou Transcash uniquement, ou virement Western Union.
Contactez-moi directement sur WhatsApp au 06 12 34 56 78, je ne réponds pas au téléphone.
Faites-moi confiance, je suis une personne honnête, pas d'arnaque.
L'appareil est encore sous garantie. Quelques rayures légères visibles.`,
  price: { amount: 320, currency: 'EUR' },
  seller: {
    displayName: 'jean4821',
    memberSince: new Date(Date.now() - 3 * DAY).toISOString(),
    ratingCount: 0,
    listingsCount: 14,
    verified: false,
  },
  publishedAt: new Date().toISOString(),
});

/** Annonce saine : prix cohérent, vendeur établi, transparence sur les défauts. */
export const cleanListing = makeListing({
  title: 'iPhone 13 128 Go bleu - très bon état avec facture',
  domain: 'electronics',
  description: `Je vends mon iPhone 13 128 Go coloris bleu, acheté en mars 2022 à la Fnac, facture d'origine disponible.
Très bon état général, quelques micro-rayures sur la tranche visibles sur les photos, l'écran est nickel car toujours protégé.
Santé de la batterie : 87 %. Débloqué tout opérateur. Numéro de série : F17GX8K2LM communiqué sur demande.
Livré avec sa boîte d'origine et un câble neuf. Je le vends car je suis passé sur un modèle plus récent.
Remise en main propre à Lyon 3e, paiement en espèces sur place ou paiement sécurisé.
Essai possible sur place, vous pouvez venir le voir en semaine après 18h.`,
  price: { amount: 340, currency: 'EUR' },
  seller: {
    displayName: 'Marc',
    memberSince: new Date(Date.now() - 1900 * DAY).toISOString(),
    ratingAverage: 4.9,
    ratingCount: 63,
    listingsCount: 3,
    verified: true,
  },
  publishedAt: new Date(Date.now() - 2 * DAY).toISOString(),
  location: { raw: 'Lyon 3e', city: 'Lyon', postalCode: '69003', country: 'France' },
  attributes: {
    Modèle: 'iPhone 13',
    Capacité: '128 Go',
    État: 'Très bon état',
    Garantie: 'Facture fournie',
    Batterie: '87 %',
    Opérateur: 'Débloqué',
  },
});

/** Cas ambigu : bonne affaire plausible mais vendeur sans historique. */
export const ambiguousListing = makeListing({
  title: 'Canapé 3 places tissu gris',
  domain: 'furniture',
  description: `Canapé 3 places en tissu gris, dimensions 210 x 90 cm. Acheté il y a 4 ans chez Maisons du Monde.
Bon état général, quelques traces d'usure sur l'accoudoir droit. Enlèvement sur place uniquement, il faudra prévoir un utilitaire.
Disponible en semaine.`,
  price: { amount: 180, currency: 'EUR' },
  seller: {
    displayName: 'sophie_l',
    memberSince: new Date(Date.now() - 45 * DAY).toISOString(),
    ratingCount: 1,
    ratingAverage: 5,
    listingsCount: 2,
  },
  publishedAt: new Date(Date.now() - 5 * DAY).toISOString(),
  location: { raw: 'Nantes', city: 'Nantes', postalCode: '44000', country: 'France' },
});

/** Fausse location saisonnière : caution disproportionnée, aucune visite. */
export const rentalScam = makeListing({
  title: 'Superbe villa avec piscine - location vacances',
  domain: 'rental_stay',
  source: {
    platform: 'facebook_marketplace',
    inputMode: 'text',
    capturedAt: new Date().toISOString(),
  },
  description: `Magnifique villa 6 personnes avec piscine privée. Disponible tout l'été.
Je suis actuellement expatrié, la visite n'est pas possible avant la réservation.
Pour réserver, il faut verser une caution de 3000 euros par virement bancaire, les clés vous seront envoyées par courrier.
Nous sommes heureux de vous offrir ce séjour exceptionnel. N'hésitez pas à me contacter pour plus d'information.
Contactez-moi sur Telegram.`,
  price: { amount: 450, currency: 'EUR', unit: 'semaine' },
  seller: {
    displayName: 'villa.location2024',
    memberSince: new Date(Date.now() - 9 * DAY).toISOString(),
    ratingCount: 0,
  },
  publishedAt: new Date(Date.now() - 1 * DAY).toISOString(),
});

/** Annonce minimale : peu d'information, mais rien de suspect. */
export const sparseListing = makeListing({
  title: 'Vélo',
  domain: 'sport_leisure',
  description: 'Vélo à vendre, bon état.',
  price: { amount: 90, currency: 'EUR' },
});
