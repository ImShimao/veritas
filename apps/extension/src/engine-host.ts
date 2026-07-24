/**
 * Hôte du moteur, côté extension.
 *
 * C'est ici que Veritas tourne **entièrement dans le navigateur** : extraction,
 * analyse, assistant conversationnel, apprentissage. Aucun serveur, aucune
 * requête réseau sortante. C'est la même logique que l'application de bureau,
 * mais exécutée dans le service worker de l'extension.
 *
 * Le moteur est mis en cache au niveau du module ; si le service worker est
 * recyclé par le navigateur, il se réinitialise à la première sollicitation en
 * rechargeant la calibration depuis le stockage.
 */
import {
  createId,
  nowIso,
  type AnalysisInputDto,
  type AnalysisReport,
  type ChatMessage,
} from '@veritas/core';
import { buildCorpusEntry, CalibrationTable, VeritasEngine } from '@veritas/engine';
import { extractListing } from '@veritas/extractors';
import { createBrain } from '@veritas/nlu';
import * as store from './store';

let engine: VeritasEngine | undefined;
let calibrationLoaded = false;

/** Construit (ou réutilise) le moteur, avec la calibration persistée. */
async function getEngine(): Promise<VeritasEngine> {
  if (!engine) {
    const snapshot = await store.getCalibration();
    engine = new VeritasEngine({ calibration: new CalibrationTable(snapshot) });
    calibrationLoaded = true;
  } else if (!calibrationLoaded) {
    calibrationLoaded = true;
  }
  return engine;
}

/**
 * Analyse une annonce à partir de son HTML (capturé sur la page), de son texte,
 * ou de son URL. Dans l'extension, l'entrée normale est le HTML de la page
 * ouverte : on le lit sous la session de l'utilisateur, ce qui contourne
 * proprement les protections anti-robot.
 */
export async function analyze(input: AnalysisInputDto): Promise<AnalysisReport> {
  const currentEngine = await getEngine();

  const extraction = await extractListing({
    url: input.url,
    html: input.html,
    text: input.text,
    images: input.images,
    platformHint: input.platformHint,
    domainHint: input.domainHint,
    // Pas de récupération réseau dans l'extension : le HTML est déjà fourni.
  });

  const corpus = await store.getCorpus();
  const report = await currentEngine.analyze(extraction.listing, {
    corpus,
    notes: input.notes,
    // Pas de fetchImage : l'analyse d'image reste en mode dégradé (liens de
    // recherche inversée fournis), le reste du pipeline tourne pleinement.
  });

  report.warnings.push(...extraction.warnings);

  await store.saveReport(report);
  const entry = buildCorpusEntry(report);
  await store.addCorpusEntry(entry);

  return report;
}

/** Répond à une question sur un rapport, via le cerveau conversationnel local. */
export async function chat(
  analysisId: string,
  question: string,
): Promise<{ message: ChatMessage } | { error: string }> {
  const report = await store.getReport(analysisId);
  if (!report) return { error: "Cette analyse n'existe plus." };

  const settings = await store.getSettings();
  const brain = createBrain({
    driver: settings.brainDriver,
    baseUrl: settings.ollamaUrl,
    model: settings.ollamaModel,
  });

  const session = (await store.getChat(analysisId)) ?? {
    id: createId('chat'),
    analysisId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
  };

  const reply = await brain.reply({
    report,
    history: session.messages.slice(-12),
    question,
  });

  const userMessage: ChatMessage = {
    id: createId('msg'),
    role: 'user',
    content: question,
    createdAt: nowIso(),
  };
  const assistantMessage: ChatMessage = {
    id: createId('msg'),
    role: 'assistant',
    content: reply.content,
    createdAt: nowIso(),
    citedFindings: reply.citedFindings,
    intent: reply.intent,
    suggestions: reply.suggestions,
    attachment: reply.attachment,
  };

  session.messages.push(userMessage, assistantMessage);
  session.updatedAt = nowIso();
  await store.saveChat(session);

  return { message: assistantMessage };
}

/** Enregistre un retour utilisateur et met à jour la calibration persistée. */
export async function feedback(
  analysisId: string,
  outcome: 'scam' | 'legitimate' | 'unknown',
  agreed: string[] = [],
  disputed: string[] = [],
): Promise<{ samples: number } | { error: string }> {
  const report = await store.getReport(analysisId);
  if (!report) return { error: "Cette analyse n'existe plus." };

  const currentEngine = await getEngine();
  const snapshot = currentEngine.learn(report, outcome, {
    agreedFindings: agreed,
    disputedFindings: disputed,
  });
  await store.saveCalibration(snapshot);
  return { samples: snapshot.samples };
}

/** Carte d'identité du moteur, pour la page « à propos » de l'extension. */
export async function identity(): Promise<{ name: string; criteria: number; brain: string }> {
  const currentEngine = await getEngine();
  const settings = await store.getSettings();
  return {
    name: 'Veritas',
    criteria: currentEngine.registry.size,
    brain:
      settings.brainDriver === 'ollama' ? `Veritas + ${settings.ollamaModel}` : 'Veritas Local',
  };
}
