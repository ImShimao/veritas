import type { Criterion, CriterionCategory, Severity } from '@veritas/core';

/**
 * Registre des critères d'analyse.
 *
 * Le registre est la source de vérité du moteur : un analyseur ne peut émettre
 * de signal que pour un critère déclaré ici. Cette contrainte garantit qu'aucun
 * point de score n'existe sans définition, libellé et justification associés.
 */
export class CriterionRegistry {
  private readonly byId = new Map<string, Criterion>();

  constructor(criteria: Criterion[] = []) {
    for (const criterion of criteria) this.register(criterion);
  }

  register(criterion: Criterion): void {
    if (this.byId.has(criterion.id)) {
      throw new Error(`Critère dupliqué dans le registre : ${criterion.id}`);
    }
    this.byId.set(criterion.id, criterion);
  }

  get(id: string): Criterion | undefined {
    return this.byId.get(id);
  }

  /** Lève si le critère est inconnu : une faute de frappe ne doit jamais passer silencieusement. */
  require(id: string): Criterion {
    const criterion = this.byId.get(id);
    if (!criterion) throw new Error(`Critère inconnu : ${id}`);
    return criterion;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): Criterion[] {
    return [...this.byId.values()];
  }

  byCategory(category: CriterionCategory): Criterion[] {
    return this.all().filter((c) => c.category === category);
  }

  get size(): number {
    return this.byId.size;
  }

  /** Statistiques exposées par l'API, pour afficher « N critères évalués ». */
  stats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const criterion of this.byId.values()) {
      byCategory[criterion.category] = (byCategory[criterion.category] ?? 0) + 1;
      bySeverity[criterion.severity] = (bySeverity[criterion.severity] ?? 0) + 1;
    }
    return { total: this.byId.size, byCategory, bySeverity };
  }
}

/**
 * Fabrique de critères avec valeurs par défaut par catégorie.
 * Réduit le bruit dans les fichiers de définition sans masquer les réglages.
 */
export interface CriterionSpec {
  id: string;
  label: string;
  rationale: string;
  severity?: Severity;
  polarity?: Criterion['polarity'];
  weight?: number;
  impact?: Criterion['impact'];
  domains?: string[];
  platforms?: string[];
  learnable?: boolean;
  references?: string[];
}

/** Poids implicite déduit de la gravité, surchargeable au cas par cas. */
const WEIGHT_BY_SEVERITY: Record<Severity, number> = {
  info: 0.2,
  low: 0.45,
  medium: 0.8,
  high: 1.3,
  critical: 2.1,
};

/**
 * Impact par défaut : un signal négatif dégrade la confiance et augmente le
 * risque proportionnellement à sa gravité ; l'authenticité n'est touchée que
 * par les catégories qui la concernent réellement (texte, image, web).
 */
function defaultImpact(
  category: CriterionCategory,
  polarity: Criterion['polarity'],
): Criterion['impact'] {
  const sign = polarity === 'positive' ? 1 : polarity === 'negative' ? -1 : 0;
  if (sign === 0) return {};

  const touchesAuthenticity =
    category === 'text' || category === 'image' || category === 'web' || category === 'listing';

  return {
    ...(touchesAuthenticity ? { authenticity: sign * 1 } : {}),
    trust: sign * 1,
    // Le risque évolue en sens inverse de la confiance.
    risk: -sign * 1,
  };
}

export function defineCriteria(category: CriterionCategory, specs: CriterionSpec[]): Criterion[] {
  return specs.map((spec) => {
    const severity = spec.severity ?? 'medium';
    const polarity = spec.polarity ?? 'negative';
    return {
      id: spec.id,
      category,
      label: spec.label,
      rationale: spec.rationale,
      severity,
      polarity,
      weight: spec.weight ?? WEIGHT_BY_SEVERITY[severity],
      impact: spec.impact ?? defaultImpact(category, polarity),
      domains: spec.domains,
      platforms: spec.platforms,
      learnable: spec.learnable ?? true,
      references: spec.references,
    } satisfies Criterion;
  });
}
