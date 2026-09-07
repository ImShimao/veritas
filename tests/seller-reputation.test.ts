import { describe, expect, it } from 'vitest';
import { VeritasEngine } from '@veritas/engine';
import { makeListing } from './fixtures/listings';

const engine = new VeritasEngine();

const DAY = 86_400_000;

/** IDs de critères déclenchés dans un rapport. */
async function firedCriteria(listing: Parameters<typeof engine.analyze>[0]) {
  const report = await engine.analyze(listing);
  return {
    report,
    ids: new Set(report.findings.map((f) => f.criterionId)),
  };
}

describe('réputation vendeur : ne pas confondre « inconnu » et « zéro »', () => {
  it("ne dit pas « aucun avis » pour un pro dont la note n'est pas récupérée", async () => {
    // Cas VELEOS : boutique pro, note visible sur la plateforme (4,9 · 11 avis)
    // mais absente des données extraites. On ne doit pas fabriquer un risque.
    const pro = makeListing({
      title: 'Specialized Diverge Comp Carbon - Gravel carbone taille 56',
      domain: 'sport_leisure',
      description: 'Gravel Specialized Diverge Comp Carbon, taille 56, révisé en boutique.',
      price: { amount: 3199, currency: 'EUR' },
      seller: {
        displayName: 'VELEOS',
        proAccount: true,
        listingsCount: 28,
        // ratingAverage / ratingCount non récupérés depuis la source.
      },
      publishedAt: new Date().toISOString(),
    });

    const { report, ids } = await firedCriteria(pro);
    expect(ids.has('seller.reputation.no_reviews')).toBe(false);
    expect(ids.has('seller.reputation.unknown')).toBe(true);
    // Le statut pro reste un point positif ; le verdict n'est pas dégradé.
    expect(ids.has('seller.pro.declared')).toBe(true);
    expect(report.verdict).not.toBe('dangerous');
  });

  it('traite une réputation non récupérée comme neutre, sans peser sur le score', async () => {
    const unknown = makeListing({
      title: 'Table basse en chêne',
      domain: 'furniture',
      description: 'Table basse en chêne massif, très bon état.',
      price: { amount: 120, currency: 'EUR' },
      seller: {
        displayName: 'atelier-bois',
        memberSince: new Date(Date.now() - 900 * DAY).toISOString(),
      },
    });

    const { ids } = await firedCriteria(unknown);
    expect(ids.has('seller.reputation.unknown')).toBe(true);
    expect(ids.has('seller.reputation.no_reviews')).toBe(false);
  });

  it('conserve « aucun avis » quand un zéro est réellement constaté (particulier)', async () => {
    const zero = makeListing({
      title: 'iPhone 14',
      domain: 'electronics',
      description: 'iPhone 14 à vendre.',
      price: { amount: 500, currency: 'EUR' },
      seller: { displayName: 'kevin', ratingCount: 0 },
    });

    const { ids } = await firedCriteria(zero);
    expect(ids.has('seller.reputation.no_reviews')).toBe(true);
    expect(ids.has('seller.reputation.unknown')).toBe(false);
  });

  it('surface une bonne note sur un volume modeste (ni silence, ni « solide »)', async () => {
    // Cas VELEOS réel : 4,9 sur 11 avis. Trop peu pour « réputation solide »
    // (≥ 20), mais il ne faut pas rester muet : le bon avis doit apparaître.
    const modest = makeListing({
      title: 'Vélo',
      domain: 'sport_leisure',
      description: 'Vélo à vendre.',
      price: { amount: 400, currency: 'EUR' },
      seller: { displayName: 'VELEOS', proAccount: true, ratingAverage: 4.9, ratingCount: 11 },
    });
    const { ids } = await firedCriteria(modest);
    expect(ids.has('seller.reputation.favorable')).toBe(true);
    expect(ids.has('seller.reputation.strong')).toBe(false);
    expect(ids.has('seller.reputation.no_reviews')).toBe(false);
    expect(ids.has('seller.reputation.unknown')).toBe(false);
  });

  it('exploite la note quand elle est bien présente', async () => {
    const rated = makeListing({
      title: 'Ordinateur portable',
      domain: 'electronics',
      description: 'PC portable en bon état.',
      price: { amount: 400, currency: 'EUR' },
      seller: { displayName: 'techstore', ratingAverage: 4.9, ratingCount: 11 },
    });

    const { ids } = await firedCriteria(rated);
    expect(ids.has('seller.reputation.no_reviews')).toBe(false);
    expect(ids.has('seller.reputation.unknown')).toBe(false);
  });
});
