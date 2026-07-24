import { describe, expect, it } from 'vitest';
import { VeritasEngine, buildCorpusEntry } from '@veritas/engine';
import {
  ambiguousListing,
  blatantScam,
  cleanListing,
  rentalScam,
  sparseListing,
} from './fixtures/listings';

const engine = new VeritasEngine();

describe('registre de critères', () => {
  it('déclare un ensemble substantiel de critères sans doublon', () => {
    const stats = engine.registry.stats();
    expect(stats.total).toBeGreaterThan(120);
    const ids = engine.registry.all().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('documente chaque critère : libellé et justification non vides', () => {
    for (const criterion of engine.registry.all()) {
      expect(criterion.label.length, criterion.id).toBeGreaterThan(3);
      expect(criterion.rationale.length, criterion.id).toBeGreaterThan(30);
    }
  });

  it('couvre toutes les catégories déclarées', () => {
    const stats = engine.registry.stats();
    for (const category of [
      'listing',
      'text',
      'price',
      'seller',
      'image',
      'web',
      'payment',
      'behavior',
    ]) {
      expect(stats.byCategory[category], category).toBeGreaterThan(0);
    }
  });
});

describe('classement des annonces', () => {
  it('classe une annonce manifestement frauduleuse comme dangereuse', async () => {
    const report = await engine.analyze(blatantScam);
    expect(report.scores.risk).toBeGreaterThan(75);
    expect(report.verdict).toBe('dangerous');
    expect(report.scores.trust).toBeLessThan(25);
  });

  it('classe une annonce saine comme fiable', async () => {
    const report = await engine.analyze(cleanListing);
    expect(report.scores.risk).toBeLessThan(15);
    expect(['safe', 'likely_safe']).toContain(report.verdict);
    expect(report.scores.trust).toBeGreaterThan(80);
  });

  it('sépare nettement les deux extrêmes', async () => {
    const [scam, clean] = await Promise.all([
      engine.analyze(blatantScam),
      engine.analyze(cleanListing),
    ]);
    expect(scam.scores.risk - clean.scores.risk).toBeGreaterThan(55);
  });

  it('ne confond pas « aucune photo fournie » et « annonce sans photo »', async () => {
    // Texte collé : l'annonce d'origine a probablement des photos que nous
    // n'avons pas reçues. La pénaliser reviendrait à sanctionner notre cécité.
    const pasted = await engine.analyze(cleanListing);
    expect(pasted.findings.map((f) => f.criterionId)).not.toContain('image.count.none');

    // Extraction depuis l'URL : là, l'absence de photo est un fait constaté.
    const extracted = await engine.analyze({
      ...cleanListing,
      source: { ...cleanListing.source, inputMode: 'url', url: 'https://exemple.test/annonce' },
    });
    expect(extracted.findings.map((f) => f.criterionId)).toContain('image.count.none');
  });

  it('tient compte de la négation dans les signaux positifs', async () => {
    // L'arnaque contient « pas de remise en main propre possible » : le motif
    // « remise en main propre » y figure littéralement mais signifie l'inverse.
    const report = await engine.analyze(blatantScam);
    const ids = report.findings.map((f) => f.criterionId);
    expect(ids).not.toContain('text.positive.meeting_offered');
    expect(ids).not.toContain('payment.method.cash_on_delivery');
    expect(ids).toContain('text.excuse.no_visit');
  });

  it('signale le contournement du paiement protégé sans formule explicite', async () => {
    // Le vendeur ne dit jamais « hors plateforme » : il impose simplement
    // un moyen de paiement qui écarte de fait toute protection.
    const report = await engine.analyze(blatantScam);
    const ids = report.findings.map((f) => f.criterionId);
    expect(ids).toContain('payment.protection.waived');
    expect(ids).not.toContain('payment.protection.available');
  });

  it('reste mesuré sur un cas ambigu', async () => {
    const report = await engine.analyze(ambiguousListing);
    expect(report.scores.risk).toBeGreaterThan(8);
    expect(report.scores.risk).toBeLessThan(60);
  });

  it('détecte le schéma de la fausse location', async () => {
    const report = await engine.analyze(rentalScam);
    const ids = report.findings.map((f) => f.criterionId);
    expect(ids).toContain('text.excuse.abroad');
    expect(ids).toContain('text.payment.advance_deposit');
    expect(report.scores.risk).toBeGreaterThan(60);
  });

  it("n'affirme rien avec assurance quand les données manquent", async () => {
    const report = await engine.analyze(sparseListing);
    // Peu de données : le moteur doit reconnaître sa propre incertitude
    // et s'interdire d'annoncer « fiable ».
    expect(report.metaConfidence).toBeLessThan(0.7);
    expect(report.verdict).not.toBe('safe');
  });
});

describe('explicabilité', () => {
  it('rattache chaque constat à un critère déclaré', async () => {
    const report = await engine.analyze(blatantScam);
    for (const finding of report.findings) {
      expect(engine.registry.has(finding.criterionId), finding.criterionId).toBe(true);
    }
  });

  it('fournit une explication rédigée pour chaque constat', async () => {
    const report = await engine.analyze(blatantScam);
    expect(report.findings.length).toBeGreaterThan(5);
    for (const finding of report.findings) {
      expect(finding.explanation.length, finding.criterionId).toBeGreaterThan(40);
    }
  });

  it('produit des preuves citables sur les constats négatifs graves', async () => {
    const report = await engine.analyze(blatantScam);
    const serious = report.findings.filter(
      (f) => f.polarity === 'negative' && (f.severity === 'critical' || f.severity === 'high'),
    );
    expect(serious.length).toBeGreaterThan(3);
    for (const finding of serious) {
      expect(finding.evidence.length, finding.criterionId).toBeGreaterThan(0);
    }
  });

  it('ne produit aucun avertissement de critère manquant', async () => {
    const report = await engine.analyze(blatantScam);
    const unknownCriteria = report.warnings.filter((w) => w.includes('absent du registre'));
    expect(unknownCriteria).toEqual([]);
  });

  it('rédige un résumé et des recommandations actionnables', async () => {
    const report = await engine.analyze(blatantScam);
    expect(report.summary.length).toBeGreaterThan(80);
    expect(report.recommendations.length).toBeGreaterThan(2);
    expect(report.questionsForSeller.length).toBeGreaterThan(4);
    // Une recommandation critique doit citer les constats qui la motivent.
    const critical = report.recommendations.find((r) => r.priority === 'critical');
    expect(critical?.because.length).toBeGreaterThan(0);
  });
});

describe('déterminisme', () => {
  it('produit des scores identiques pour une entrée identique', async () => {
    const [first, second] = await Promise.all([
      engine.analyze(cleanListing),
      engine.analyze(cleanListing),
    ]);
    expect(first.scores).toEqual(second.scores);
    expect(first.findings.map((f) => f.criterionId)).toEqual(
      second.findings.map((f) => f.criterionId),
    );
  });
});

describe('robustesse', () => {
  it("n'échoue pas sur une annonce vide", async () => {
    const report = await engine.analyze({
      id: 'empty',
      source: { platform: 'unknown', inputMode: 'text', capturedAt: new Date().toISOString() },
      title: '',
      description: '',
      domain: 'other',
      attributes: {},
      images: [],
    });
    expect(report.id).toBeTruthy();
    expect(report.verdict).toBeTruthy();
  });

  it("isole la panne d'un analyseur sans interrompre l'analyse", async () => {
    const broken = new VeritasEngine({
      analyzers: [
        ...VeritasEngine.defaultAnalyzers(),
        {
          name: 'defaillant',
          category: 'text' as const,
          async run() {
            throw new Error('panne simulée');
          },
        },
      ],
    });
    const report = await broken.analyze(cleanListing);
    expect(report.warnings.some((w) => w.includes('panne simulée'))).toBe(true);
    expect(report.scores.risk).toBeGreaterThanOrEqual(0);
  });
});

describe('détection de contenus recyclés', () => {
  it('repère une description réutilisée entre deux annonces', async () => {
    const first = await engine.analyze(blatantScam);
    const corpus = [
      buildCorpusEntry({
        ...first,
        listing: {
          ...first.listing,
          source: { ...first.listing.source, url: 'https://exemple.test/a' },
        },
      }),
      // Le corpus doit dépasser le seuil minimal pour que la détection s'active.
      buildCorpusEntry(await engine.analyze(cleanListing)),
      buildCorpusEntry(await engine.analyze(ambiguousListing)),
      buildCorpusEntry(await engine.analyze(rentalScam)),
    ];

    const republished = {
      ...blatantScam,
      source: { ...blatantScam.source, url: 'https://exemple.test/b' },
    };
    const report = await engine.analyze(republished, { corpus });

    const ids = report.findings.map((f) => f.criterionId);
    expect(ids).toContain('web.duplicate.text_exact');
  });
});

describe('apprentissage par retours', () => {
  it('renforce un critère confirmé et affaiblit un critère contesté', async () => {
    const learner = new VeritasEngine();
    const report = await learner.analyze(blatantScam);
    const criterionId = 'text.payment.gift_cards';
    expect(report.findings.some((f) => f.criterionId === criterionId)).toBe(true);

    const before = learner.calibration.multiplier(criterionId);
    for (let i = 0; i < 40; i++) {
      learner.learn(report, 'scam', { agreedFindings: [criterionId] });
    }
    const after = learner.calibration.multiplier(criterionId);
    expect(after).toBeGreaterThan(before);

    const disputed = new VeritasEngine();
    for (let i = 0; i < 40; i++) {
      disputed.learn(report, 'legitimate', { disputedFindings: [criterionId] });
    }
    expect(disputed.calibration.multiplier(criterionId)).toBeLessThan(1);
  });

  it('borne le multiplicateur pour empêcher un critère de dominer le score', () => {
    const learner = new VeritasEngine();
    const criterionId = 'text.payment.gift_cards';
    for (let i = 0; i < 500; i++) {
      learner.calibration.learn([criterionId], 'scam', [criterionId]);
    }
    expect(learner.calibration.multiplier(criterionId)).toBeLessThanOrEqual(2.2);
  });
});
