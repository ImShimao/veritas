import { describe, expect, it } from 'vitest';
import { VeritasEngine } from '@veritas/engine';
import { makeListing } from './fixtures/listings';

const engine = new VeritasEngine();

/**
 * Régression : une limite valable pour l'ensemble de l'analyse (ex. « module
 * d'analyse d'image non installé ») ne doit être affichée qu'une fois, même
 * lorsqu'elle est constatée sur chaque photo. Auparavant, trois photos
 * produisaient trois lignes identiques dans « Limites de cette analyse ».
 */
describe('limites du rapport', () => {
  // Trois photos identiques et non décodables : chacune remonte la même limite.
  const brokenImage = { dataUri: 'data:image/jpeg;base64,AAAAAAAAAAAA' };
  const listing = makeListing({
    title: 'Vélo de route carbone',
    domain: 'sport_leisure',
    description: 'Vélo à vendre, bon état, trois photos jointes.',
    price: { amount: 500, currency: 'EUR' },
    images: [
      { id: 'img-1', ...brokenImage },
      { id: 'img-2', ...brokenImage },
      { id: 'img-3', ...brokenImage },
    ],
  });

  it('ne répète pas une même limite', async () => {
    const report = await engine.analyze(listing);
    // Aucun doublon, quel que soit le nombre de photos concernées.
    expect(new Set(report.warnings).size).toBe(report.warnings.length);
  });

  it("affiche la limite d'analyse d'image au plus une fois", async () => {
    const report = await engine.analyze(listing);
    const imageLimits = report.warnings.filter((w) =>
      /analyse d'image|n'a pas pu être décodée/i.test(w),
    );
    expect(imageLimits.length).toBeLessThanOrEqual(1);
  });
});
