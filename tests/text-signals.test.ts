import { describe, expect, it } from 'vitest';
import type { ListingDomain } from '@veritas/core';
import { VeritasEngine } from '@veritas/engine';
import { makeListing } from './fixtures/listings';

const engine = new VeritasEngine();

async function criteria(description: string): Promise<Set<string>> {
  const report = await engine.analyze(
    makeListing({
      title: 'Vélo de ville',
      domain: 'sport_leisure',
      description,
      price: { amount: 150, currency: 'EUR' },
    }),
  );
  return new Set(report.findings.map((f) => f.criterionId));
}

describe('pression / non-négociation : ne pas confondre avec des arguments de vente', () => {
  it('ne signale pas « prix ferme » + « envoi rapide » comme de la pression', async () => {
    // Régression : « rapide » dans « envoi rapide » est un argument de vente
    // banal, pas une échéance imposée.
    const ids = await criteria('Vélo en bon état. Prix ferme. Envoi rapide et soigné.');
    expect(ids.has('text.pressure.no_negotiation')).toBe(false);
  });

  it('ne signale pas « prix ferme » + « réponse rapide »', async () => {
    const ids = await criteria('Prix ferme, réponse rapide assurée. Bon vélo.');
    expect(ids.has('text.pressure.no_negotiation')).toBe(false);
  });

  it('signale bien une vraie pression (« prix ferme urgent »)', async () => {
    const ids = await criteria('Prix ferme urgent, doit partir vite, je déménage.');
    expect(ids.has('text.pressure.no_negotiation')).toBe(true);
  });
});

describe('« envoi uniquement » : selon le type de bien', () => {
  async function criteriaFor(domain: ListingDomain, description: string) {
    const report = await engine.analyze(
      makeListing({
        title: 'Article',
        domain,
        description,
        price: { amount: 40, currency: 'EUR' },
      }),
    );
    return new Set(report.findings.map((f) => f.criterionId));
  }

  it("n'alerte pas pour un petit objet expédiable (mode, la norme sur Vinted)", async () => {
    const ids = await criteriaFor(
      'fashion',
      'Veste en cuir taille M, très bon état. Envoi uniquement, bien emballé.',
    );
    expect(ids.has('text.excuse.no_visit')).toBe(false);
    expect(ids.has('text.logistics.shipping_only')).toBe(false);
  });

  it('signale « envoi uniquement » pour une voiture (retrait normalement en personne)', async () => {
    const ids = await criteriaFor(
      'vehicle',
      'Renault Clio 2018, 90000 km. Envoi uniquement, pas de visite.',
    );
    expect(ids.has('text.logistics.shipping_only')).toBe(true);
  });
});
