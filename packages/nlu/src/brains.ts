import type { Brain, BrainContext, BrainReply } from '@veritas/core';
import { detectIntent } from './intents';
import { RESPONDERS } from './responders';
import { draftMessageReply } from './drafts';

/**
 * Cerveau local — implémentation par défaut.
 *
 * Il n'appelle aucun service, ne requiert aucune clé et fonctionne hors ligne.
 * Sa force ne vient pas d'un modèle de langage mais du fait que le rapport
 * d'analyse contient déjà toute la matière : des constats nommés, expliqués et
 * appuyés sur des preuves. Répondre consiste alors à sélectionner et
 * reformuler ce qui existe — pas à générer une opinion.
 *
 * Cela produit un assistant qui ne peut structurellement pas halluciner sur
 * une annonce, au prix d'une conversation moins libre qu'un modèle génératif.
 * Pour ce cas d'usage — où une affirmation inventée peut coûter de l'argent à
 * l'utilisateur — c'est le bon compromis.
 */
export class LocalBrain implements Brain {
  readonly name = 'Veritas Local';
  readonly requiresNetwork = false;

  async reply(context: BrainContext): Promise<BrainReply> {
    const { intent } = detectIntent(context.question);

    if (intent === 'draft_message') {
      return draftMessageReply(context.report, { buyerName: extractName(context) });
    }

    const responder = RESPONDERS[intent] ?? RESPONDERS.fallback;
    return responder({ report: context.report, question: context.question });
  }
}

/**
 * Cerveau branché sur un modèle auto-hébergé (Ollama, llama.cpp, LM Studio).
 *
 * Fourni pour montrer que la couche conversationnelle est enfichable, sans
 * jamais introduire de dépendance à un service payant : le modèle tourne sur
 * la machine de l'utilisateur, aucune clé n'est requise, aucune donnée ne sort
 * du réseau local.
 *
 * Point de conception important : **le scoring n'est jamais délégué au modèle.**
 * Celui-ci ne reçoit que le rapport déjà calculé et reformule ; les verdicts,
 * les scores et les constats restent produits par le moteur déterministe. Si
 * le modèle est indisponible, on retombe silencieusement sur le cerveau local.
 */
export class SelfHostedBrain implements Brain {
  readonly name: string;
  readonly requiresNetwork = true;
  private readonly fallbackBrain = new LocalBrain();

  constructor(
    private readonly options: {
      /** URL du serveur local, par exemple http://127.0.0.1:11434 */
      baseUrl: string;
      model: string;
      timeoutMs?: number;
    },
  ) {
    this.name = `Veritas + ${options.model}`;
  }

  async reply(context: BrainContext): Promise<BrainReply> {
    // Le cerveau local fournit la substance ; le modèle ne fait que la reformuler.
    const grounded = await this.fallbackBrain.reply(context);

    try {
      const rephrased = await this.generate(context, grounded);
      if (rephrased && rephrased.length > 40) {
        return { ...grounded, content: rephrased };
      }
    } catch {
      // Modèle absent, arrêté ou trop lent : la réponse locale reste valable.
    }

    return grounded;
  }

  private async generate(context: BrainContext, grounded: BrainReply): Promise<string | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 20_000);

    try {
      const response = await fetch(`${this.options.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          prompt: buildPrompt(context, grounded),
        }),
      });

      if (!response.ok) return undefined;
      const data = (await response.json()) as { response?: string };
      return data.response?.trim();
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Invite transmise au modèle local.
 *
 * Elle lui interdit explicitement d'ajouter des faits : son rôle se limite à
 * la formulation. C'est ce cadrage qui permet de brancher un modèle sans
 * réintroduire le risque d'hallucination que toute l'architecture évite.
 */
function buildPrompt(context: BrainContext, grounded: BrainReply): string {
  const { report } = context;
  return [
    "Tu es Veritas, un assistant d'analyse d'annonces en ligne. Tu réponds en français, avec précision et sobriété.",
    '',
    'RÈGLE ABSOLUE : tu ne dois ajouter AUCUN fait qui ne figure pas dans la réponse de référence ci-dessous. Tu peux reformuler, condenser, réordonner. Tu ne peux pas inventer un chiffre, un constat ou une recommandation.',
    '',
    `CONTEXTE : annonce « ${report.listing.title} », verdict ${report.verdict}, risque ${report.scores.risk} %, confiance ${report.scores.trust} %.`,
    '',
    `QUESTION DE L'UTILISATEUR : ${context.question}`,
    '',
    'RÉPONSE DE RÉFÉRENCE (à reformuler, sans rien y ajouter) :',
    grounded.content,
    '',
    'Réponds maintenant, directement, sans préambule ni méta-commentaire :',
  ].join('\n');
}

/** Repère un prénom donné par l'utilisateur, pour personnaliser la photo datée. */
function extractName(context: BrainContext): string | undefined {
  const patterns = [
    /\bje m'appelle\s+([A-Za-zÀ-ÿ-]{2,20})\b/i,
    /\bmon (?:pr[ée]nom|nom) (?:est|c'est)\s+([A-Za-zÀ-ÿ-]{2,20})\b/i,
  ];
  const haystack = [context.question, ...context.history.map((m) => m.content)].join('\n');
  for (const pattern of patterns) {
    const match = pattern.exec(haystack);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Fabrique le cerveau demandé par la configuration, avec repli sur le local. */
export function createBrain(config: {
  driver: 'local' | 'ollama';
  baseUrl?: string;
  model?: string;
}): Brain {
  if (config.driver === 'ollama' && config.baseUrl && config.model) {
    return new SelfHostedBrain({ baseUrl: config.baseUrl, model: config.model });
  }
  return new LocalBrain();
}
