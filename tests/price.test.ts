import { describe, expect, it } from 'vitest';
import { VeritasEngine, estimateCategoryPrice, buildMarketSearchLinks } from '@veritas/engine';
import { makeListing } from './fixtures/listings';

const engine = new VeritasEngine();

const bike = makeListing({
  title: 'Specialized Diverge Comp Carbon - Shimano GRX',
  domain: 'sport_leisure',
  description:
    'Je me sépare de mon gravel Specialized Diverge Comp Carbon. Environ 1000 km. Équipé Shimano GRX. Année 2023, taille 54. Très bon état, entretenu régulièrement.',
  price: { amount: 2400, currency: 'EUR' },
  publishedAt: new Date().toISOString(),
});

describe('estimation de prix par catégorie', () => {
  it('estime un ordre de grandeur pour un vélo premium carbone', () => {
    const estimate = estimateCategoryPrice(bike);
    expect(estimate).toBeDefined();
    // Un gravel carbone premium neuf tourne autour de 3000–5000 €.
    expect(estimate!.newPrice).toBeGreaterThan(2500);
    expect(estimate!.basis).toContain('premium');
    expect(estimate!.basis).toContain('carbone');
    expect(estimate!.usedLow).toBeLessThan(estimate!.usedHigh);
  });

  it('fournit toujours des recherches de comparaison', () => {
    const links = buildMarketSearchLinks(bike);
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((l) => l.url.includes('leboncoin'))).toBe(true);
    expect(links.some((l) => l.engine.toLowerCase().includes('neuf'))).toBe(true);
  });
});

describe('rapport de prix toujours renseigné', () => {
  it('donne des repères chiffrés même sans modèle exact en base', async () => {
    const report = await engine.analyze(bike);
    const price = report.price!;
    // Le prix doit avoir une référence (estimée), pas « aucune idée ».
    expect(price.referenceQuality).toBe('estimated');
    expect(price.newPrice).toBeGreaterThan(0);
    expect(price.usedRange).toBeDefined();
    expect(price.searchLinks?.length).toBeGreaterThan(0);
    // Un vélo à 2400 € correctement estimé n'est pas classé « dangereux ».
    expect(['safe', 'likely_safe', 'caution']).toContain(report.verdict);
  });

  it('reste prudent : une estimation ne déclenche pas un signal fort', async () => {
    // Prix cassé (600 €) sur un vélo estimé bien plus cher : signalé, mais
    // atténué car la référence n'est qu'une estimation.
    const cheap = makeListing({
      ...bike,
      price: { amount: 600, currency: 'EUR' },
    });
    const report = await engine.analyze(cheap);
    expect(report.price?.verdict).toBe('suspicious_low');
    const priceFinding = report.findings.find(
      (f) => f.criterionId === 'price.deviation.extreme_low',
    );
    expect(priceFinding).toBeDefined();
    // Atténué (facteur 0,5) par rapport à une référence exacte.
    expect(priceFinding!.strength).toBeLessThanOrEqual(0.5);
  });

  it('ne confond pas le paiement sécurisé légitime avec un faux séquestre', async () => {
    // Régression : « Paiement sécurisé Leboncoin » est le dispositif LÉGITIME
    // de la plateforme, pas une arnaque au faux séquestre.
    const legit = makeListing({
      ...bike,
      description: `${bike.description} Paiement sécurisé Leboncoin accepté.`,
    });
    const report = await engine.analyze(legit);
    expect(report.findings.map((f) => f.criterionId)).not.toContain('text.payment.fake_escrow');
    expect(report.verdict).not.toBe('dangerous');
  });

  it('détecte le vrai faux séquestre (transporteur qui garde les fonds)', async () => {
    const scam = makeListing({
      ...bike,
      description:
        "Envoi uniquement. L'argent est bloqué chez le transporteur jusqu'à réception, agence de livraison agréée qui garde le paiement.",
    });
    const report = await engine.analyze(scam);
    expect(report.findings.map((f) => f.criterionId)).toContain('text.payment.fake_escrow');
  });

  it('fournit des recherches quand aucune estimation n’est possible', async () => {
    const obscure = makeListing({
      title: 'Objet artisanal unique',
      domain: 'other',
      description: 'Pièce faite main, sans équivalent connu.',
      price: { amount: 180, currency: 'EUR' },
    });
    const report = await engine.analyze(obscure);
    // Pas de référence, mais des liens de comparaison sont fournis.
    expect(report.price?.searchLinks?.length).toBeGreaterThan(0);
  });
});
