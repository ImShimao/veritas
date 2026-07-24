import { describe, expect, it } from 'vitest';
import {
  contentHash,
  isNegated,
  money,
  normalize,
  parseMoney,
  stats,
  textSimilarity,
  textUtils,
  findAllPrices,
} from '@veritas/core';

const { parseDecimal } = money;
const { hasInvisibleCharacters, sentenceLengthVariance, uppercaseRatio } = textUtils;
const { bayesianAverage, quantile, robustZScore, sigmoid, logit } = stats;

describe('normalisation du texte', () => {
  it('retire les accents et harmonise la casse', () => {
    expect(normalize('Téléphone À VENDRE')).toBe('telephone a vendre');
  });

  it('neutralise les caractères invisibles', () => {
    // Un « e » suivi d'un espace de largeur nulle au milieu d'un mot.
    const trapped = 'pai​ement';
    expect(hasInvisibleCharacters(trapped)).toBe(true);
    expect(normalize(trapped)).toBe('paiement');
  });

  it('mesure la proportion de majuscules', () => {
    expect(uppercaseRatio('URGENT VENTE RAPIDE')).toBeGreaterThan(0.9);
    expect(uppercaseRatio('vente normale tranquille')).toBeLessThan(0.1);
  });

  it('détecte un rythme de phrases mécanique', () => {
    const mechanical = 'Le produit est bon. Le produit est beau. Le produit est neuf.';
    const human =
      "Je vends ce vélo acheté il y a deux ans. Franchement il roule encore très bien, juste quelques traces d'usure sur la selle que vous verrez sur les photos. À débattre.";
    expect(sentenceLengthVariance(mechanical)).toBeLessThan(sentenceLengthVariance(human));
  });
});

describe('détection de négation', () => {
  it('reconnaît une expression niée', () => {
    const text = normalize('pas de remise en main propre possible');
    const index = text.indexOf('remise en main propre');
    expect(isNegated(text, index)).toBe(true);
  });

  it("n'inverse pas une expression affirmée", () => {
    const text = normalize('remise en main propre uniquement, paiement especes');
    const index = text.indexOf('remise en main propre');
    expect(isNegated(text, index)).toBe(false);
  });

  it('gère plusieurs marqueurs de négation', () => {
    for (const marker of ['aucune', 'jamais de', 'sans']) {
      const text = normalize(`${marker} facture disponible`);
      expect(isNegated(text, text.indexOf('facture'))).toBe(true);
    }
  });
});

describe('analyse des montants', () => {
  it("lève l'ambiguïté point/virgule selon le format", () => {
    expect(parseDecimal('1.250,50')).toBe(1250.5); // format français
    expect(parseDecimal('1,250.50')).toBe(1250.5); // format anglais
    expect(parseDecimal('1250')).toBe(1250);
    expect(parseDecimal('1.250')).toBe(1250); // millier, pas décimale
  });

  it('extrait montant et devise', () => {
    expect(parseMoney('950 €')).toEqual({ amount: 950, currency: 'EUR' });
    expect(parseMoney('$1,299.99')).toEqual({ amount: 1299.99, currency: 'USD' });
    expect(parseMoney('1 250,50 EUR')).toEqual({ amount: 1250.5, currency: 'EUR' });
  });

  it("trouve tous les prix d'un texte", () => {
    const prices = findAllPrices('Prix 320€, valeur neuve 1200 euros, port 15€');
    const amounts = prices.map((p) => p.amount).sort((a, b) => a - b);
    expect(amounts).toContain(320);
    expect(amounts).toContain(1200);
  });

  it('capture un montant collé à son symbole de devise', () => {
    // Régression : le `\b` après « € » ne matche jamais et faisait rater « 250€ ».
    const prices = findAllPrices('À vendre 250€ ferme, port offert.');
    expect(prices.map((p) => p.amount)).toContain(250);
  });
});

describe('similarité textuelle', () => {
  it('rapproche deux textes quasi identiques', () => {
    const a = 'iPhone 13 128 Go bleu très bon état avec facture';
    const b = 'iPhone 13 128Go bleu, tres bon etat, avec facture';
    expect(textSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it('sépare deux textes différents', () => {
    const a = 'iPhone 13 128 Go bleu';
    const b = 'Canapé trois places en tissu gris';
    expect(textSimilarity(a, b)).toBeLessThan(0.2);
  });

  it('produit une empreinte stable insensible à la mise en forme', () => {
    expect(contentHash('Bonjour le monde')).toBe(contentHash('  bonjour   LE Monde  '));
    expect(contentHash('texte a')).not.toBe(contentHash('texte b'));
  });
});

describe('statistiques', () => {
  it('calcule les quantiles par interpolation', () => {
    const values = [1, 2, 3, 4, 5];
    expect(quantile(values, 0.5)).toBe(3);
    expect(quantile(values, 0)).toBe(1);
    expect(quantile(values, 1)).toBe(5);
  });

  it('résiste aux valeurs aberrantes via le z-score robuste', () => {
    const values = [100, 102, 98, 101, 99, 5000];
    // La valeur aberrante ne doit pas écraser l'échelle : 100 reste normal.
    expect(Math.abs(robustZScore(100, values))).toBeLessThan(2);
    expect(robustZScore(5000, values)).toBeGreaterThan(3);
  });

  it('lisse une moyenne sur petit échantillon', () => {
    // 5,0 sur 1 avis doit être tiré vers l'a priori, pas rester à 5.
    const smoothed = bayesianAverage(5, 1, 4.2, 8);
    expect(smoothed).toBeLessThan(4.4);
    expect(smoothed).toBeGreaterThan(4.2);
  });

  it('sigmoid et logit sont réciproques', () => {
    for (const p of [0.1, 0.3, 0.5, 0.8, 0.95]) {
      expect(sigmoid(logit(p))).toBeCloseTo(p, 5);
    }
  });
});
