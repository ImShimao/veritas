import { describe, expect, it } from 'vitest';
import { sha256, hammingDistance, perceptualSimilarity } from '@veritas/engine';

const encoder = new TextEncoder();

describe('SHA-256 pur (compatible navigateur)', () => {
  it('correspond aux vecteurs de référence', () => {
    // Vecteurs officiels FIPS 180-4.
    expect(sha256(encoder.encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256(encoder.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256(encoder.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('produit une empreinte stable et sensible au contenu', () => {
    const a = sha256(encoder.encode('Veritas'));
    const b = sha256(encoder.encode('Veritas'));
    const c = sha256(encoder.encode('veritas'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe('empreinte perceptuelle', () => {
  it('mesure la distance de Hamming entre empreintes hexadécimales', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
  });

  it('rapproche deux empreintes identiques', () => {
    expect(perceptualSimilarity('1a2b3c4d5e6f7080', '1a2b3c4d5e6f7080')).toBe(1);
  });
});
