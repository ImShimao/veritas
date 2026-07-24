import { isNegated, normalize, ramp } from '@veritas/core';
import type { Analyzer, AnalyzerContext, AnalyzerResult, SignalDraft } from './types';
import { getPlatformProfile } from '../knowledge/platforms';

/**
 * Analyseur de sécurité transactionnelle.
 *
 * Il répond à une question différente de celle de l'analyseur textuel :
 * non pas « le vendeur emploie-t-il un vocabulaire d'escroc ? » mais
 * « si cette transaction se déroule comme annoncée, que perd l'acheteur en
 * cas de problème ? ». Deux annonces au texte irréprochable n'ont pas la même
 * exposition selon qu'un paiement protégé est mobilisable ou non.
 */
export class TransactionAnalyzer implements Analyzer {
  readonly name = 'transaction';
  readonly category = 'payment' as const;

  async run(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { listing } = context;
    const signals: SignalDraft[] = [];
    const text = normalize(`${listing.title} ${listing.description} ${context.notes ?? ''}`);
    const platform = getPlatformProfile(listing.source.platform);

    // ── Demandes de données sensibles ────────────────────────────────
    if (
      /\b(rib|iban|coordonnees bancaires|numero de carte|cvv|code de confirmation|code recu par sms|3d ?secure)\b/.test(
        text,
      )
    ) {
      signals.push({
        criterionId: 'payment.identity.bank_details_requested',
        strength: 0.95,
        explanation:
          "L'annonce sollicite des coordonnées bancaires ou un code de confirmation. Aucune vente légitime ne le nécessite : un vendeur reçoit un paiement, il ne demande jamais votre numéro de carte ni le code reçu par SMS. Ce schéma relève de l'hameçonnage caractérisé — n'envoyez rien et signalez l'annonce.",
        evidence: [
          {
            kind: 'text',
            label: 'Demande détectée',
            value: 'coordonnées bancaires ou code de sécurité',
          },
        ],
      });
    }

    if (
      /\b(carte d'identite|piece d'identite|passeport|permis de conduire|justificatif de domicile)\b/.test(
        text,
      )
    ) {
      signals.push({
        criterionId: 'payment.identity.documents_requested',
        strength: 0.9,
        explanation:
          "Une pièce d'identité ou un justificatif de domicile est réclamé. Une vente entre particuliers ne le justifie jamais. Ces documents alimentent l'usurpation d'identité et l'ouverture de crédits frauduleux : ne les transmettez sous aucun prétexte.",
        evidence: [
          { kind: 'text', label: 'Document réclamé', value: "pièce d'identité ou justificatif" },
        ],
      });
    }

    // ── PayPal « entre proches » ─────────────────────────────────────
    if (
      /\b(paypal)\b/.test(text) &&
      /\b(amis? et famille|entre proches|friends and family|cadeau|don)\b/.test(text)
    ) {
      signals.push({
        criterionId: 'payment.method.friends_and_family',
        strength: 0.95,
        explanation:
          'Un paiement PayPal « entre proches » est demandé. Cette option supprime volontairement la protection acheteur et rend le remboursement impossible. Aucun vendeur honnête ne la réclame : sa seule fonction, dans une vente, est de vous priver de tout recours.',
        evidence: [{ kind: 'text', label: 'Mode de paiement', value: 'PayPal entre proches' }],
      });
    }

    /*
     * Un vendeur qui exige un moyen de paiement irrécupérable contourne de fait
     * la protection de la plateforme, même sans jamais le dire explicitement.
     * Se fier aux seules formules d'évitement (« hors du site ») laisserait
     * passer le cas le plus fréquent — et le plus grave.
     */
    const demandsUnprotectedMethod =
      /\b(carte|cartes|coupon|bon)s? (cadeaux?|prepayees?)\b|\b(pcs|transcash|neosurf|paysafecard)\b|\bwestern union\b|\bmoney ?gram\b|\bmandat cash\b|\b(bitcoin|btc|ethereum|usdt|crypto ?monnaie)\b/.test(
        text,
      );

    // ── Contournement de la protection plateforme ────────────────────
    if (platform.protectedPayment) {
      const bypasses =
        demandsUnprotectedMethod ||
        /\b(pas de paiement securise|sans passer par|hors (du )?site|directement entre nous|eviter les frais|desactiver la protection)\b/.test(
          text,
        );
      if (bypasses) {
        signals.push({
          criterionId: 'payment.protection.waived',
          strength: 0.9,
          explanation: `${platform.label} propose un paiement protégé${platform.protectionName ? ` (${platform.protectionName})` : ''}, et le vendeur impose un mode de règlement qui l'écarte${demandsUnprotectedMethod ? " (carte prépayée, transfert d'argent ou cryptomonnaie)" : ''}. C'est le point de bascule de la quasi-totalité des fraudes sur cette plateforme : la protection existe, il vous demande d'y renoncer.`,
          evidence: [
            {
              kind: 'metadata',
              label: 'Protection disponible',
              value: platform.protectionName ?? 'oui',
            },
            { kind: 'text', label: 'Comportement', value: 'contournement demandé' },
          ],
        });
      } else {
        signals.push({
          criterionId: 'payment.protection.available',
          strength: 0.9,
          explanation: `Vous pouvez régler via ${platform.protectionName ?? 'le paiement sécurisé de la plateforme'}. Tant que la transaction reste intégralement dans ce cadre, votre exposition financière est très faible : c'est la mesure de protection la plus efficace à votre disposition.`,
          evidence: [
            {
              kind: 'metadata',
              label: 'Protection',
              value: platform.protectionName ?? 'disponible',
            },
          ],
        });
      }
    }

    // ── Paiement à la remise ─────────────────────────────────────────
    // La négation doit être prise en compte : « pas de remise en main propre »
    // contient littéralement le motif recherché et signifie exactement l'inverse.
    const handoverMatch =
      /\b(remise en main propre|main propre|paiement (a la remise|sur place|en especes sur place)|contre especes)\b/.exec(
        text,
      );
    const handover = Boolean(handoverMatch) && !isNegated(text, handoverMatch!.index);
    if (handover) {
      signals.push({
        criterionId: 'payment.method.cash_on_delivery',
        strength: 0.9,
        explanation:
          "Une remise en main propre avec paiement sur place est envisageable. C'est de très loin la configuration la plus sûre : vous voyez le bien, vous le testez, et vous ne payez qu'ensuite. Le risque financier devient alors quasi nul.",
        evidence: [{ kind: 'text', label: 'Modalité', value: 'remise en main propre' }],
      });
    }

    // ── Paiement intégral d'avance ───────────────────────────────────
    const prepayment =
      /\b(paiement (integral|complet|total|d'avance|avant)|payer avant|regler avant (la |l')?(livraison|reception|envoi)|100 ?% a la commande)\b/.test(
        text,
      );
    if (prepayment && !handover) {
      signals.push({
        criterionId: 'payment.exposure.full_prepayment',
        strength: 0.85,
        explanation:
          "La transaction impose de régler l'intégralité avant de disposer du bien. Vous portez alors seul l'intégralité du risque : si rien n'arrive, vous n'avez aucun levier. Exigez au minimum un paiement protégé, ou un règlement à la remise.",
        evidence: [{ kind: 'text', label: 'Structure de paiement', value: 'prépaiement intégral' }],
      });
    }

    // ── Modalités non précisées ──────────────────────────────────────
    const mentionsPayment = /\b(paiement|payer|regler|virement|especes|paypal|cheque|carte)\b/.test(
      text,
    );
    if (!mentionsPayment && !handover) {
      signals.push({
        criterionId: 'payment.method.unspecified',
        strength: 0.5,
        explanation:
          "Aucune modalité de paiement ni de remise n'est précisée dans l'annonce. C'est le premier point à clarifier : la réponse du vendeur sur ce sujet vous en apprendra davantage que le reste de l'annonce.",
        evidence: [{ kind: 'text', label: 'Modalités', value: 'non précisées' }],
      });
    }

    // ── Exposition liée au montant ───────────────────────────────────
    const amount = listing.price?.amount ?? 0;
    if (amount > 0 && !platform.protectedPayment && !handover) {
      signals.push({
        criterionId: 'payment.exposure.high_amount',
        strength: ramp(amount, 300, 5000) * 0.8,
        explanation: `Sur ${platform.label}, aucun dispositif de protection n'est mobilisable, et l'annonce ne prévoit pas de remise en main propre. La totalité du montant est donc exposée sans recours en cas de défaillance.`,
        evidence: [{ kind: 'metadata', label: 'Protection plateforme', value: 'aucune' }],
      });
    }

    return {
      name: this.name,
      category: this.category,
      applicable: true,
      evaluated: 9,
      signals,
    };
  }
}
