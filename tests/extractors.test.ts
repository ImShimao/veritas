import { describe, expect, it } from 'vitest';
import {
  AdapterRegistry,
  defaultRegistry,
  extractListing,
  guessPlatformFromText,
  parseFreeText,
} from '@veritas/extractors';

describe('détection de plateforme', () => {
  it('reconnaît les plateformes majeures par leur URL', () => {
    expect(defaultRegistry.detectPlatform('https://www.leboncoin.fr/voitures/123.htm')).toBe(
      'leboncoin',
    );
    expect(defaultRegistry.detectPlatform('https://www.vinted.fr/items/456')).toBe('vinted');
    expect(defaultRegistry.detectPlatform('https://www.ebay.fr/itm/789')).toBe('ebay');
    expect(defaultRegistry.detectPlatform('https://m.leboncoin.fr/ad/1')).toBe('leboncoin');
  });

  it("retombe sur l'extracteur générique pour un site inconnu", () => {
    expect(defaultRegistry.detectPlatform('https://petites-annonces-locales.example/1')).toBe(
      'generic',
    );
  });

  it('devine la plateforme depuis un texte collé', () => {
    expect(guessPlatformFromText('Vu sur Leboncoin, super affaire')).toBe('leboncoin');
    expect(guessPlatformFromText('annonce Vinted taille M')).toBe('vinted');
  });

  it('expose un catalogue de plateformes non vide', () => {
    const catalogue = defaultRegistry.catalogue();
    expect(catalogue.length).toBeGreaterThan(10);
    expect(catalogue.every((entry) => entry.label && entry.hosts.length > 0)).toBe(true);
  });
});

describe('extensibilité du registre', () => {
  it("permet d'ajouter une plateforme sans modifier le moteur", () => {
    const registry = new AdapterRegistry();
    registry.register({
      platform: 'generic',
      label: 'Ma Plateforme',
      hosts: ['ma-plateforme.test'],
      selectors: { title: ['h1'] },
    });
    expect(registry.resolve('https://ma-plateforme.test/annonce/1').label).toBe('Ma Plateforme');
  });
});

describe('analyse de texte libre', () => {
  it("extrait titre, prix et localisation d'une annonce collée", () => {
    const text = `iPhone 13 128 Go
Prix : 340 €
Très bon état, avec facture.
Disponible à 69003 Lyon`;
    const { listing, extractedFields } = parseFreeText(text);
    expect(listing.title).toContain('iPhone 13');
    expect(listing.price).toEqual({ amount: 340, currency: 'EUR' });
    expect(listing.location?.postalCode).toBe('69003');
    expect(extractedFields).toContain('price');
  });

  it('retient le montant le plus élevé comme prix probable', () => {
    // Le prix de vente est presque toujours supérieur aux frais de port.
    const { listing } = parseFreeText('Vends console. Frais de port 12€. Prix 250€.');
    expect(listing.price?.amount).toBe(250);
  });

  it('ne promeut pas un paragraphe entier au rang de titre', () => {
    // Annonce collée d'un seul bloc : le titre doit rester une accroche courte,
    // pas les 400 caractères de la description.
    const paragraph =
      "iPhone 15 Pro Max 256Go neuf sous blister à vendre rapidement. Je suis à l'étranger " +
      'pour le travail donc envoi uniquement, paiement par virement, contactez-moi vite car ' +
      "plusieurs personnes sont intéressées et l'offre ne durera pas longtemps.";
    const { listing } = parseFreeText(paragraph);
    expect(listing.title!.length).toBeLessThanOrEqual(95);
    expect(listing.title!.toLowerCase()).toContain('iphone');
    // La description, elle, conserve le texte intégral pour l'analyse.
    expect(listing.description!.length).toBeGreaterThan(200);
  });
});

describe('extraction depuis données structurées', () => {
  it('lit un produit JSON-LD', async () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Vélo de route carbone",
        "description": "Vélo de route en excellent état, très peu servi.",
        "image": ["https://cdn.example/velo1.jpg"],
        "offers": { "@type": "Offer", "price": "850", "priceCurrency": "EUR" }
      }
      </script>
      </head><body><h1>Ignoré</h1></body></html>`;

    const result = await extractListing({ url: 'https://boutique.example/velo', html });
    expect(result.listing.title).toBe('Vélo de route carbone');
    expect(result.listing.price).toEqual({ amount: 850, currency: 'EUR' });
    expect(result.listing.images.length).toBeGreaterThan(0);
  });

  it('exploite Open Graph à défaut de JSON-LD', async () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Canapé d'angle gris" />
      <meta property="og:description" content="Canapé confortable, dimensions 250x180." />
      <meta property="product:price:amount" content="300" />
      <meta property="product:price:currency" content="EUR" />
      <meta property="og:image" content="https://cdn.example/canape.jpg" />
      </head><body></body></html>`;

    const result = await extractListing({ url: 'https://site.example/canape', html });
    expect(result.listing.title).toBe("Canapé d'angle gris");
    expect(result.listing.price?.amount).toBe(300);
  });

  it("marque l'extraction comme dégradée quand des champs manquent", async () => {
    const html = '<!doctype html><html><body><p>Page presque vide</p></body></html>';
    const result = await extractListing({ url: 'https://site.example/vide', html });
    expect(result.degraded).toBe(true);
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it('rejette une entrée totalement vide', async () => {
    await expect(extractListing({})).rejects.toThrow();
  });
});

describe('note vendeur Leboncoin (aria-label)', () => {
  // La note n'est ni dans le blob __NEXT_DATA__ ni dans une balise stable :
  // Leboncoin ne l'expose que via l'aria-label du widget de note.
  const leboncoinHtml = (ariaWidget: string) => `<!doctype html><html><head>
    <script id="__NEXT_DATA__" type="application/json">
    {"props":{"pageProps":{"ad":{
      "subject":"Specialized Diverge Comp Carbon",
      "body":"Gravel carbone taille 56, révisé en boutique.",
      "price":[3199],
      "owner":{"name":"VELEOS","type":"pro","user_id":"u-42"}
    }}}}
    </script>
    </head><body>
      <h1 data-qa-id="adview_title">Specialized Diverge Comp Carbon</h1>
      <span data-qa-id="adview_price">3 199 €</span>
      <div data-qa-id="adview_profile_name">VELEOS</div>
      ${ariaWidget}
    </body></html>`;

  it('extrait la note et le nombre d’avis, et préserve le vendeur pro du blob', async () => {
    const html = leboncoinHtml(
      '<span aria-label="Utilisateur noté 4,9 sur cinq, sur la base de 11 avis">4,9(11)</span>',
    );
    const result = await extractListing({ url: 'https://www.leboncoin.fr/ad/velos/123', html });
    const seller = result.listing.seller!;
    expect(seller.displayName).toBe('VELEOS');
    expect(seller.proAccount).toBe(true); // provient du blob, non écrasé
    expect(seller.ratingAverage).toBeCloseTo(4.9, 5);
    expect(seller.ratingCount).toBe(11);
  });

  it("laisse la note vide quand le vendeur n'en a pas (aucun widget)", async () => {
    const result = await extractListing({
      url: 'https://www.leboncoin.fr/ad/velos/124',
      html: leboncoinHtml(''),
    });
    const seller = result.listing.seller!;
    expect(seller.displayName).toBe('VELEOS');
    expect(seller.proAccount).toBe(true);
    expect(seller.ratingAverage).toBeUndefined();
    expect(seller.ratingCount).toBeUndefined();
  });
});
