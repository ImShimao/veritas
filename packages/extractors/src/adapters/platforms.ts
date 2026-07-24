import type { PlatformSpec } from './spec';

/**
 * Catalogue des plateformes prises en charge.
 *
 * ## Ajouter une plateforme
 *
 * Ajoutez une entrée à ce tableau. Aucun autre fichier n'est à modifier :
 * le registre, l'API, l'interface et l'extension la découvrent automatiquement.
 *
 * ## Sur la fragilité des sélecteurs CSS
 *
 * Les sélecteurs ci-dessous sont un filet de sécurité, pas le mécanisme
 * principal. Les plateformes remanient leur HTML régulièrement et ces classes
 * finiront par changer. C'est pourquoi l'extraction repose d'abord sur les
 * données structurées (JSON-LD, Open Graph), qui sont publiées pour être lues
 * par des tiers et évoluent bien plus lentement. Un sélecteur qui casse dégrade
 * l'extraction ; il ne la fait pas échouer.
 *
 * ## Sur les protections anti-robot
 *
 * Plusieurs de ces plateformes bloquent les requêtes serveur. C'est leur droit,
 * et Veritas ne cherche pas à le contourner : lorsque la récupération échoue,
 * l'utilisateur est invité à passer par l'extension navigateur — qui lit la page
 * déjà ouverte dans son propre navigateur, sous sa propre session — ou à coller
 * le texte de l'annonce. Le champ `note` porte cette information jusqu'à
 * l'interface.
 */
export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    platform: 'leboncoin',
    label: 'Leboncoin',
    hosts: ['leboncoin.fr'],
    currency: 'EUR',
    note: "Leboncoin bloque les requêtes automatisées. Utilisez l'extension navigateur ou collez le texte de l'annonce.",
    selectors: {
      title: ['h1[data-qa-id="adview_title"]', 'h1'],
      price: ['[data-qa-id="adview_price"]', '[data-test-id="price"]'],
      description: ['[data-qa-id="adview_description_container"]', '[data-test-id="description"]'],
      location: ['[data-qa-id="adview_location_informations"]'],
      sellerName: ['[data-qa-id="adview_profile_name"]', '[data-test-id="profile-name"]'],
      images: [
        { selectors: ['[data-qa-id="adview_gallery"] img', 'picture img'], attribute: 'src' },
      ],
      attributes: {
        container: '[data-qa-id="criteria_container"] > div',
        key: 'div:first-child',
        value: 'div:last-child',
      },
    },
    embeddedJson: {
      selector: 'script#__NEXT_DATA__',
      pick: (data) => pickLeboncoin(data),
    },
  },

  {
    platform: 'vinted',
    label: 'Vinted',
    hosts: ['vinted.fr', 'vinted.com', 'vinted.be', 'vinted.de', 'vinted.es', 'vinted.it'],
    domainGuess: 'fashion',
    currency: 'EUR',
    selectors: {
      title: ['[data-testid="item-page-summary-plugin"] h1', 'h1'],
      price: ['[data-testid="item-price"]', '[itemprop="price"]'],
      description: ['[itemprop="description"]', '[data-testid="item-description"]'],
      sellerName: ['[data-testid="profile-username"]', '.details-list__item-value a'],
      images: [
        { selectors: ['[data-testid="item-photo"] img', '.item-photo img'], attribute: 'src' },
      ],
      attributes: {
        container: '[data-testid="item-details-list"] .details-list__item',
        key: '.details-list__item-title',
        value: '.details-list__item-value',
      },
    },
  },

  {
    platform: 'ebay',
    label: 'eBay',
    hosts: ['ebay.fr', 'ebay.com', 'ebay.de', 'ebay.co.uk', 'ebay.it', 'ebay.es', 'benl.ebay.be'],
    selectors: {
      title: ['h1.x-item-title__mainTitle span', 'h1#itemTitle', 'h1'],
      price: ['.x-price-primary span', '#prcIsum', '[itemprop="price"]'],
      description: ['#desc_ifr', '.d-item-description', '[data-testid="ux-layout-section"]'],
      location: ['.ux-textspans--SECONDARY', '#itemLocation'],
      sellerName: ['.x-sellercard-atf__info__about-seller a span', '#mbgLink span'],
      sellerReviews: ['.x-sellercard-atf__data-item span'],
      images: [{ selectors: ['.ux-image-carousel-item img', '#icImg'], attribute: 'src' }],
      attributes: {
        container: '.ux-layout-section--features .ux-labels-values',
        key: '.ux-labels-values__labels',
        value: '.ux-labels-values__values',
      },
    },
  },

  {
    platform: 'etsy',
    label: 'Etsy',
    hosts: ['etsy.com'],
    selectors: {
      title: ['h1[data-buy-box-listing-title]', 'h1'],
      price: ['[data-buy-box-region="price"] p', '[data-selector="price-only"]'],
      description: ['[data-id="description-text"]', '#wt-content-toggle-product-details-read-more'],
      sellerName: ['[data-shop-name]', '.wt-text-body-01 a[href*="/shop/"]'],
      images: [
        { selectors: ['.carousel-image', '[data-palette-listing-image]'], attribute: 'src' },
      ],
    },
  },

  {
    platform: 'backmarket',
    label: 'Back Market',
    hosts: ['backmarket.fr', 'backmarket.com', 'backmarket.be', 'backmarket.de'],
    domainGuess: 'electronics',
    selectors: {
      title: ['h1'],
      price: ['[data-qa="productpage-product-price"]', '[data-test="price"]'],
      description: ['[data-qa="product-description"]'],
      images: [{ selectors: ['[data-qa="product-images"] img', 'main img'], attribute: 'src' }],
    },
  },

  {
    platform: 'rakuten',
    label: 'Rakuten',
    hosts: ['rakuten.com', 'fr.shopping.rakuten.com', 'rakuten.fr'],
    selectors: {
      title: ['h1'],
      price: ['.price', '[itemprop="price"]'],
      description: ['#description', '[itemprop="description"]'],
      images: [{ selectors: ['.pdp-gallery img', 'img[itemprop="image"]'], attribute: 'src' }],
    },
  },

  {
    platform: 'amazon',
    label: 'Amazon',
    hosts: ['amazon.fr', 'amazon.com', 'amazon.de', 'amazon.co.uk', 'amazon.es', 'amazon.it'],
    note: "Analyse pertinente sur les offres d'occasion et de vendeurs tiers ; les produits neufs vendus par Amazon ne présentent pas de risque de fraude entre particuliers.",
    selectors: {
      title: ['#productTitle', 'h1'],
      price: ['.a-price .a-offscreen', '#priceblock_ourprice'],
      description: ['#feature-bullets', '#productDescription'],
      sellerName: ['#sellerProfileTriggerId', '#merchant-info a'],
      images: [{ selectors: ['#imgTagWrapperId img', '#landingImage'], attribute: 'src' }],
      attributes: {
        container: '#productDetails_techSpec_section_1 tr',
        key: 'th',
        value: 'td',
      },
    },
  },

  {
    platform: 'autoscout24',
    label: 'AutoScout24',
    hosts: ['autoscout24.fr', 'autoscout24.com', 'autoscout24.de', 'autoscout24.be'],
    domainGuess: 'vehicle',
    selectors: {
      title: ['h1', '[data-testid="listing-title"]'],
      price: ['[data-testid="price-section"] span', '.PriceInfo_price__XU0aF'],
      description: ['[data-testid="description"]', '.DetailsSection_description__Nd5lc'],
      location: ['[data-testid="sellerinfo-address"]'],
      sellerName: ['[data-testid="sellerinfo-company-name"]'],
      images: [
        { selectors: ['[data-testid="gallery"] img', '.image-gallery img'], attribute: 'src' },
      ],
      attributes: {
        container: '[data-testid="VehicleOverview"] div',
        key: 'div:first-child',
        value: 'div:last-child',
      },
    },
  },

  {
    platform: 'mobile_de',
    label: 'mobile.de',
    hosts: ['mobile.de'],
    domainGuess: 'vehicle',
    selectors: {
      title: ['h1', '#ad-title'],
      price: ['[data-testid="prime-price"]', '.h3.u-text-bold'],
      description: ['[data-testid="listing-description"]', '#descriptionElement'],
      images: [{ selectors: ['.gallery-img', '#gallery img'], attribute: 'src' }],
    },
  },

  {
    platform: 'lacentrale',
    label: 'La Centrale',
    hosts: ['lacentrale.fr'],
    domainGuess: 'vehicle',
    selectors: {
      title: ['h1'],
      price: ['.priceContainer', '[class*="Price"]'],
      description: ['.descriptionContainer', '[class*="description"]'],
      images: [{ selectors: ['.carousel img', 'picture img'], attribute: 'src' }],
    },
  },

  {
    platform: 'airbnb',
    label: 'Airbnb',
    hosts: ['airbnb.fr', 'airbnb.com', 'airbnb.be', 'airbnb.ca'],
    domainGuess: 'rental_stay',
    note: "Sur Airbnb, la fraude passe presque toujours par une demande de paiement hors plateforme. Tant que la réservation reste sur le site, la couverture s'applique.",
    selectors: {
      title: ['h1'],
      price: ['[data-testid="book-it-default"] span', '._1jo4hgw'],
      description: ['[data-section-id="DESCRIPTION_DEFAULT"]'],
      location: ['[data-section-id="LOCATION_DEFAULT"] h2'],
      sellerName: ['[data-section-id="HOST_PROFILE_DEFAULT"] h2'],
      images: [
        { selectors: ['[data-testid="photo-viewer"] img', 'picture img'], attribute: 'src' },
      ],
    },
  },

  {
    platform: 'booking',
    label: 'Booking.com',
    hosts: ['booking.com'],
    domainGuess: 'rental_stay',
    selectors: {
      title: ['h2.pp-header__title', 'h1'],
      price: ['[data-testid="price-and-discounted-price"]', '.prco-valign-middle-helper'],
      description: ['[data-testid="property-description"]', '#property_description_content'],
      location: ['[data-testid="address"]', '.hp_address_subtitle'],
      images: [
        {
          selectors: ['[data-testid="property-gallery"] img', '.bh-photo-grid img'],
          attribute: 'src',
        },
      ],
    },
  },

  {
    platform: 'selency',
    label: 'Selency',
    hosts: ['selency.fr', 'selency.com'],
    domainGuess: 'furniture',
    selectors: {
      title: ['h1'],
      price: ['[class*="price"]'],
      description: ['[class*="description"]'],
      images: [{ selectors: ['picture img', 'main img'], attribute: 'src' }],
    },
  },

  {
    platform: 'facebook_marketplace',
    label: 'Facebook Marketplace',
    hosts: ['facebook.com', 'fb.com', 'm.facebook.com'],
    note: "Facebook exige une session authentifiée : la récupération automatique est impossible. Utilisez l'extension navigateur ou collez le texte et les captures de l'annonce.",
    selectors: {
      title: ['h1', '[role="main"] h1'],
      price: ['[role="main"] span[dir="auto"]'],
      description: ['[role="main"] div[data-ad-preview]'],
    },
  },

  {
    platform: 'paruvendu',
    label: 'ParuVendu',
    hosts: ['paruvendu.fr'],
    selectors: {
      title: ['h1'],
      price: ['.price', '[class*="prix"]'],
      description: ['[class*="description"]'],
      images: [{ selectors: ['.photo img', 'main img'], attribute: 'src' }],
    },
  },

  {
    platform: 'gumtree',
    label: 'Gumtree',
    hosts: ['gumtree.com', 'gumtree.co.za'],
    currency: 'GBP',
    selectors: {
      title: ['h1'],
      price: ['[data-q="ad-price"]', '.ad-price'],
      description: ['[data-q="ad-description"]', '.ad-description'],
      images: [{ selectors: ['.gallery-image img', 'picture img'], attribute: 'src' }],
    },
  },

  {
    platform: 'marktplaats',
    label: 'Marktplaats',
    hosts: ['marktplaats.nl'],
    selectors: {
      title: ['h1'],
      price: ['[data-testid="price"]', '.Listing-price'],
      description: ['[data-testid="description"]', '.Description-description'],
      images: [{ selectors: ['.Gallery-image img', 'picture img'], attribute: 'src' }],
    },
  },

  {
    platform: 'wallapop',
    label: 'Wallapop',
    hosts: ['wallapop.com'],
    selectors: {
      title: ['h1'],
      price: ['.item-detail-price_ItemDetailPrice--standard__TxPXr', '[class*="price"]'],
      description: ['[class*="description"]'],
      images: [{ selectors: ['.item-detail-image img', 'picture img'], attribute: 'src' }],
    },
  },

  {
    platform: 'subito',
    label: 'Subito',
    hosts: ['subito.it'],
    selectors: {
      title: ['h1'],
      price: ['[class*="price"]'],
      description: ['[class*="description"]'],
      images: [{ selectors: ['picture img', 'main img'], attribute: 'src' }],
    },
  },
];

// ── Extractions spécifiques ────────────────────────────────────────────

/**
 * Leboncoin publie l'intégralité de l'annonce dans le blob `__NEXT_DATA__`.
 * C'est la source la plus fiable quand la page est accessible — bien plus
 * stable que les classes CSS générées automatiquement.
 */
function pickLeboncoin(data: unknown): Partial<import('@veritas/core').Listing> | undefined {
  const ad = navigate(data, ['props', 'pageProps', 'ad']);
  if (!ad || typeof ad !== 'object') return undefined;
  const record = ad as Record<string, unknown>;

  const attributes: Record<string, string> = {};
  const rawAttributes = record.attributes;
  if (Array.isArray(rawAttributes)) {
    for (const entry of rawAttributes) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const label = typeof item.key_label === 'string' ? item.key_label : undefined;
      const value = typeof item.value_label === 'string' ? item.value_label : undefined;
      if (label && value) attributes[label] = value;
    }
  }

  const price = Array.isArray(record.price) ? Number(record.price[0]) : Number(record.price);
  const location = record.location as Record<string, unknown> | undefined;
  const owner = record.owner as Record<string, unknown> | undefined;
  const images = navigate(record, ['images', 'urls_large']) ?? navigate(record, ['images', 'urls']);

  return {
    title: typeof record.subject === 'string' ? record.subject : undefined,
    description: typeof record.body === 'string' ? record.body : undefined,
    price: Number.isFinite(price) && price > 0 ? { amount: price, currency: 'EUR' } : undefined,
    publishedAt:
      typeof record.first_publication_date === 'string'
        ? new Date(record.first_publication_date.replace(' ', 'T')).toISOString()
        : undefined,
    attributes,
    location: location
      ? {
          raw: [location.city, location.zipcode].filter(Boolean).join(' '),
          city: typeof location.city === 'string' ? location.city : undefined,
          postalCode: typeof location.zipcode === 'string' ? location.zipcode : undefined,
          latitude: typeof location.lat === 'number' ? location.lat : undefined,
          longitude: typeof location.lng === 'number' ? location.lng : undefined,
          country: 'France',
        }
      : undefined,
    seller: owner
      ? {
          displayName: typeof owner.name === 'string' ? owner.name : undefined,
          proAccount: owner.type === 'pro',
          id: typeof owner.user_id === 'string' ? owner.user_id : undefined,
        }
      : undefined,
    images: Array.isArray(images)
      ? images
          .filter((url): url is string => typeof url === 'string')
          .slice(0, 12)
          .map((url, index) => ({ id: `lbc-${index}`, url, position: index }))
      : undefined,
  };
}

/** Descend dans une structure JSON par chemin, sans lever d'exception. */
function navigate(source: unknown, path: string[]): unknown {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
