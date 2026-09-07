import { describe, expect, it } from 'vitest';
import { VeritasEngine } from '@veritas/engine';
import { makeListing } from './fixtures/listings';

const engine = new VeritasEngine();

// Corpus factice : trois entrées sans rapport, juste pour activer l'analyseur
// de recoupement (inactif en dessous de trois analyses en mémoire).
const corpus = [1, 2, 3].map((n) => ({
  analysisId: `an_dummy${n}`,
  titleHash: `title-hash-${n}`,
  descriptionHash: `desc-hash-${n}`,
  imageHashes: [],
  riskScore: 10,
  createdAt: new Date().toISOString(),
}));

describe('vérification de réputation externe', () => {
  it('prépare des recherches cliquables à partir du pseudonyme du vendeur', async () => {
    const report = await engine.analyze(
      makeListing({
        title: 'Sac à dos de randonnée bleu modèle unique',
        domain: 'sport_leisure',
        description:
          'Sac à dos de randonnée, coloris bleu, description entièrement originale et suffisamment longue pour ne recouper aucune entrée du corpus factice utilisé par ce test.',
        price: { amount: 60, currency: 'EUR' },
        seller: { displayName: 'VELEOS' },
      }),
      { corpus },
    );

    const check = report.findings.find((f) => f.criterionId === 'web.reputation.check_pending');
    expect(check).toBeDefined();
    // La promesse « requêtes préparées » doit être tenue : de vrais liens.
    const links = check!.evidence.filter(
      (e) => e.kind === 'link' && e.value.startsWith('https://'),
    );
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.some((l) => decodeURIComponent(l.value).includes('VELEOS'))).toBe(true);
  });

  it('reste générique et sans lien mort quand le vendeur est inconnu', async () => {
    const report = await engine.analyze(
      makeListing({
        title: 'Lampe de bureau articulée',
        domain: 'furniture',
        description:
          'Lampe de bureau articulée en métal, parfaitement fonctionnelle, texte original et assez long pour éviter tout recoupement accidentel avec le corpus de test.',
        price: { amount: 25, currency: 'EUR' },
      }),
      { corpus },
    );
    const check = report.findings.find((f) => f.criterionId === 'web.reputation.check_pending');
    expect(check).toBeDefined();
    // Pas de pseudonyme → aucun lien http (donc aucun lien cassé promis).
    const links = check!.evidence.filter(
      (e) => e.kind === 'link' && e.value.startsWith('https://'),
    );
    expect(links.length).toBe(0);
  });
});
