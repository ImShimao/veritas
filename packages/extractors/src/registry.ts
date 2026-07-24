import type { Platform } from '@veritas/core';
import type { ExtractorAdapter } from './types';
import { createAdapter, type PlatformSpec } from './adapters/spec';
import { PLATFORM_SPECS } from './adapters/platforms';
import { GenericAdapter } from './adapters/generic';

/**
 * Registre des adaptateurs.
 *
 * L'ordre compte : les adaptateurs spécialisés sont consultés en premier,
 * l'adaptateur générique clôt toujours la liste comme filet de sécurité.
 */
export class AdapterRegistry {
  private readonly adapters: ExtractorAdapter[];
  private readonly fallback: ExtractorAdapter;
  private readonly specsByPlatform = new Map<Platform, PlatformSpec>();

  constructor(specs: PlatformSpec[] = PLATFORM_SPECS) {
    this.adapters = specs.map(createAdapter);
    this.fallback = new GenericAdapter();
    for (const spec of specs) this.specsByPlatform.set(spec.platform, spec);
  }

  /** Enregistre une plateforme supplémentaire à chaud. */
  register(spec: PlatformSpec): void {
    this.adapters.unshift(createAdapter(spec));
    this.specsByPlatform.set(spec.platform, spec);
  }

  /** Adaptateur correspondant à une URL, ou l'adaptateur générique. */
  resolve(url: string | undefined): ExtractorAdapter {
    if (!url) return this.fallback;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return this.fallback;
    }
    return this.adapters.find((adapter) => adapter.matches(parsed)) ?? this.fallback;
  }

  /** Détecte la plateforme d'une URL sans réaliser d'extraction. */
  detectPlatform(url: string | undefined): Platform {
    const adapter = this.resolve(url);
    return adapter.platform;
  }

  spec(platform: Platform): PlatformSpec | undefined {
    return this.specsByPlatform.get(platform);
  }

  /** Catalogue exposé à l'interface et à l'API. */
  catalogue(): { platform: Platform; label: string; hosts: string[]; note?: string }[] {
    return [...this.specsByPlatform.values()].map((spec) => ({
      platform: spec.platform,
      label: spec.label,
      hosts: spec.hosts,
      note: spec.note,
    }));
  }

  get size(): number {
    return this.adapters.length;
  }
}

export const defaultRegistry = new AdapterRegistry();
