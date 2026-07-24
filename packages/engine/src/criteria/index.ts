import { CriterionRegistry } from './registry';
import { TEXT_CRITERIA } from './definitions/text';
import { PRICE_CRITERIA } from './definitions/price';
import { SELLER_CRITERIA } from './definitions/seller';
import { IMAGE_CRITERIA } from './definitions/image';
import { LISTING_CRITERIA } from './definitions/listing';
import { WEB_CRITERIA } from './definitions/web';
import { PAYMENT_CRITERIA } from './definitions/payment';
import { BEHAVIOR_CRITERIA } from './definitions/behavior';

export { CriterionRegistry, defineCriteria } from './registry';
export type { CriterionSpec } from './registry';

/**
 * Registre par défaut du moteur.
 *
 * Un déploiement peut construire son propre registre — par exemple pour
 * désactiver une famille de critères sur un marché donné — sans modifier
 * le moteur : `new VeritasEngine({ registry: monRegistre })`.
 */
export function createDefaultRegistry(): CriterionRegistry {
  return new CriterionRegistry([
    ...LISTING_CRITERIA,
    ...TEXT_CRITERIA,
    ...PRICE_CRITERIA,
    ...SELLER_CRITERIA,
    ...IMAGE_CRITERIA,
    ...WEB_CRITERIA,
    ...PAYMENT_CRITERIA,
    ...BEHAVIOR_CRITERIA,
  ]);
}

export {
  TEXT_CRITERIA,
  PRICE_CRITERIA,
  SELLER_CRITERIA,
  IMAGE_CRITERIA,
  LISTING_CRITERIA,
  WEB_CRITERIA,
  PAYMENT_CRITERIA,
  BEHAVIOR_CRITERIA,
};
