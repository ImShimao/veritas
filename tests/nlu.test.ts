import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisReport } from '@veritas/core';
import { VeritasEngine } from '@veritas/engine';
import { detectIntent, LocalBrain, buildSellerMessage } from '@veritas/nlu';
import { blatantScam, cleanListing } from './fixtures/listings';

describe("détection d'intention", () => {
  it('reconnaît les questions canoniques', () => {
    expect(detectIntent('Est-ce que tu achèterais ce produit ?').intent).toBe('should_i_buy');
    expect(detectIntent('Pourquoi ce score ?').intent).toBe('explain_score');
    expect(detectIntent('Quels sont les risques ?').intent).toBe('list_risks');
    expect(detectIntent('Le prix est-il cohérent ?').intent).toBe('price_question');
    expect(detectIntent('Que sais-tu du vendeur ?').intent).toBe('seller_question');
    expect(detectIntent('Rédige un message au vendeur').intent).toBe('draft_message');
    expect(detectIntent('Quelles questions dois-je poser ?').intent).toBe('questions_to_ask');
  });

  it("tolère les fautes et l'absence d'accents", () => {
    expect(detectIntent('tu acheterais toi ?').intent).toBe('should_i_buy');
    expect(detectIntent('pourquoi ce score').intent).toBe('explain_score');
  });

  it('retombe sur « fallback » pour une question hors sujet', () => {
    expect(detectIntent('quelle est la météo à Paris ?').intent).toBe('fallback');
  });

  it('expose les expressions ayant motivé la décision', () => {
    const match = detectIntent('Quels sont les risques ?');
    expect(match.matched.length).toBeGreaterThan(0);
    expect(match.confidence).toBeGreaterThan(0);
  });
});

describe('cerveau local', () => {
  const engine = new VeritasEngine();
  const brain = new LocalBrain();
  let scamReport: AnalysisReport;
  let cleanReport: AnalysisReport;

  beforeAll(async () => {
    scamReport = await engine.analyze(blatantScam);
    cleanReport = await engine.analyze(cleanListing);
  });

  it('ne requiert aucun réseau', () => {
    expect(brain.requiresNetwork).toBe(false);
  });

  it("déconseille l'achat d'une annonce dangereuse en citant des constats", async () => {
    const reply = await brain.reply({
      report: scamReport,
      history: [],
      question: 'Est-ce que tu achèterais ce produit ?',
    });
    expect(reply.content.toLowerCase()).toContain('non');
    expect(reply.citedFindings.length).toBeGreaterThan(0);
    // Chaque constat cité doit exister dans le rapport : aucune invention.
    const ids = new Set(scamReport.findings.map((f) => f.criterionId));
    expect(reply.citedFindings.every((id) => ids.has(id))).toBe(true);
  });

  it('valide une annonce saine', async () => {
    const reply = await brain.reply({
      report: cleanReport,
      history: [],
      question: 'Est-ce que tu achèterais ce produit ?',
    });
    expect(reply.content.toLowerCase()).toMatch(/oui|tient la route/);
  });

  it('explique le score à partir des contributions réelles', async () => {
    const reply = await brain.reply({
      report: scamReport,
      history: [],
      question: 'Pourquoi ce score ?',
    });
    expect(reply.content).toContain(String(scamReport.criteriaEvaluated));
    expect(reply.intent).toBe('explain_score');
  });

  it("reconnaît son fonctionnement local sans clé d'API", async () => {
    const reply = await brain.reply({
      report: cleanReport,
      history: [],
      question: 'Qui es-tu ? Tu utilises ChatGPT ?',
    });
    expect(reply.content).toMatch(/local|aucun service/i);
    expect(reply.content).not.toMatch(/j'utilise chatgpt|via l'api openai/i);
  });

  it('génère un message au vendeur avec une pièce jointe', async () => {
    const reply = await brain.reply({
      report: scamReport,
      history: [],
      question: 'Rédige un message au vendeur',
    });
    expect(reply.attachment?.kind).toBe('draft_message');
    expect(reply.attachment?.body).toContain('Bonjour');
  });

  it("admet son incompréhension plutôt que d'inventer", async () => {
    const reply = await brain.reply({
      report: cleanReport,
      history: [],
      question: 'azerty qwerty douze mille sept',
    });
    // Le fallback propose les sujets qu'il maîtrise vraiment.
    expect(reply.content).toMatch(/verdict|risques|prix/i);
  });
});

describe('rédaction de message vendeur', () => {
  it('reste courtois et demande une preuve datée', async () => {
    const report = await new VeritasEngine().analyze(blatantScam);
    const message = buildSellerMessage(report, { buyerName: 'Camille' });
    expect(message).toContain('Bonjour');
    expect(message).toContain('Camille');
    expect(message.toLowerCase()).toContain('photo');
  });
});
