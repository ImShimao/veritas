import {
  daysBetween,
  ramp,
  type Evidence,
  type ImageAssessment,
  type ImageMetadata,
} from '@veritas/core';
import type { Analyzer, AnalyzerContext, AnalyzerResult, SignalDraft } from './types';
import {
  perceptualSimilarity,
  probeImage,
  reverseSearchLinks,
  SAME_IMAGE_THRESHOLD,
  type ImageProbe,
} from '../vision';

/** Au-delà, l'analyse d'image coûterait plus que ce qu'elle apporte. */
const MAX_IMAGES = 10;

/** Résolutions d'écran fréquentes : une image à ces dimensions est une capture. */
const SCREEN_RESOLUTIONS = new Set([
  '1170x2532',
  '1179x2556',
  '1284x2778',
  '1290x2796',
  '1080x1920',
  '1080x2340',
  '1080x2400',
  '828x1792',
  '750x1334',
  '640x1136',
  '1440x3200',
  '1440x2960',
  '1125x2436',
  '1920x1080',
  '2560x1440',
  '1366x768',
  '1440x900',
  '1536x864',
  '1280x720',
  '2880x1800',
]);

export class ImageAnalyzer implements Analyzer {
  readonly name = 'image';
  readonly category = 'image' as const;

  async run(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { listing } = context;
    const signals: SignalDraft[] = [];
    const warnings: string[] = [];

    if (listing.images.length === 0) {
      /*
       * Distinction essentielle : « l'annonce n'a pas de photo » et « aucune
       * photo ne nous a été transmise » sont deux situations opposées. Quand
       * l'utilisateur colle un texte, l'annonce d'origine comporte
       * probablement des photos que nous n'avons simplement pas reçues :
       * pénaliser l'annonce reviendrait à sanctionner notre propre cécité.
       */
      const sawFullListing =
        listing.source.inputMode === 'url' || listing.source.inputMode === 'extension';

      if (!sawFullListing) {
        return {
          name: this.name,
          category: this.category,
          applicable: false,
          unavailableReason:
            "Aucune photo ne nous a été fournie. Importez les images de l'annonce pour activer la forensique visuelle.",
          evaluated: 1,
          signals: [
            {
              criterionId: 'image.unavailable',
              strength: 1,
              explanation:
                "Aucune image n'a été transmise avec cette annonce. L'analyse visuelle — détection de captures d'écran, de photos réutilisées, de retouches — n'a donc pas pu être menée. Importez les photos de l'annonce pour débloquer cette partie du rapport, qui est souvent la plus décisive.",
              evidence: [{ kind: 'image', label: 'Images fournies', value: 'aucune' }],
            },
          ],
          images: [],
          completeness: { available: 0, expected: 1 },
        };
      }

      return {
        name: this.name,
        category: this.category,
        applicable: true,
        evaluated: 1,
        signals: [
          {
            criterionId: 'image.count.none',
            strength: 1,
            explanation:
              "L'annonce ne comporte aucune photo. C'est très rare sur une vente sincère : la photo est le premier argument d'un vendeur qui possède réellement le bien. Réclamez des clichés récents, sous plusieurs angles, avant tout échange.",
            evidence: [{ kind: 'image', label: 'Photos', value: 'aucune' }],
          },
        ],
        images: [],
        completeness: { available: 0, expected: 1 },
      };
    }

    const selected = listing.images.slice(0, MAX_IMAGES);
    const probes: { imageId: string; probe: ImageProbe; metadata?: ImageMetadata; url?: string }[] =
      [];

    for (const image of selected) {
      const buffer = await this.resolveBuffer(image.dataUri, image.url, context);
      if (!buffer) {
        warnings.push(`Image ${image.id} inaccessible : elle n'a pas pu être téléchargée.`);
        continue;
      }
      const probe = await probeImage(buffer);
      if (probe.degradedReason) warnings.push(probe.degradedReason);
      const metadata = await readExif(buffer);
      probes.push({ imageId: image.id, probe, metadata, url: image.url });
    }

    if (probes.length === 0) {
      return {
        name: this.name,
        category: this.category,
        applicable: false,
        unavailableReason:
          "Aucune image n'a pu être récupérée ni décodée : l'analyse visuelle n'a pas pu être menée.",
        evaluated: 1,
        signals: [
          {
            criterionId: 'image.unavailable',
            strength: 1,
            explanation:
              "Les photos de l'annonce n'ont pas pu être analysées. Importez-les manuellement dans Veritas pour débloquer la forensique visuelle et la détection de réutilisation.",
            evidence: [{ kind: 'image', label: 'Images analysées', value: '0' }],
          },
        ],
        images: [],
        warnings,
        completeness: { available: 0, expected: 1 },
      };
    }

    const assessments = probes.map(({ imageId, probe, metadata, url }) =>
      this.buildAssessment(imageId, probe, metadata, url),
    );

    signals.push(...this.analyzeCount(listing.images.length));
    signals.push(...this.analyzeQuality(assessments, probes));
    signals.push(...this.analyzeMetadata(context, probes));
    signals.push(...this.analyzeManipulation(probes));
    signals.push(...this.analyzeGalleryConsistency(probes));
    signals.push(...this.analyzeReuse(context, probes));

    return {
      name: this.name,
      category: this.category,
      applicable: true,
      evaluated: 26,
      signals,
      images: assessments,
      warnings,
      completeness: { available: probes.length, expected: selected.length },
    };
  }

  /** Récupère le contenu binaire d'une image, depuis un data-URI ou le réseau. */
  private async resolveBuffer(
    dataUri: string | undefined,
    url: string | undefined,
    context: AnalyzerContext,
  ): Promise<Buffer | undefined> {
    if (dataUri) {
      const commaIndex = dataUri.indexOf(',');
      if (commaIndex === -1) return undefined;
      try {
        return Buffer.from(dataUri.slice(commaIndex + 1), 'base64');
      } catch {
        return undefined;
      }
    }
    if (url && context.fetchImage) {
      try {
        return await context.fetchImage(url);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private buildAssessment(
    imageId: string,
    probe: ImageProbe,
    metadata: ImageMetadata | undefined,
    url: string | undefined,
  ): ImageAssessment {
    const flags: string[] = [];
    const notes: string[] = [];

    const width = probe.width ?? 0;
    const height = probe.height ?? 0;
    const megapixels = width && height ? (width * height) / 1_000_000 : 0;

    if (looksLikeScreenshot(width, height)) flags.push('screenshot');
    if (megapixels > 0 && megapixels < 0.35) flags.push('low_resolution');
    if (probe.bytesPerPixel !== undefined && probe.bytesPerPixel < 0.12)
      flags.push('heavy_compression');
    if (probe.borderBands) flags.push('border_bands');
    if ((probe.uniformRatio ?? 0) > 0.45) flags.push('uniform_regions');
    if ((probe.elaScore ?? 0) > 0.22) flags.push('ela_anomaly');
    if (metadata?.software) flags.push('editing_software');
    if (!metadata || metadata.stripped) flags.push('no_metadata');
    if (probe.degraded) notes.push(probe.degradedReason ?? 'Analyse fine indisponible.');

    if (megapixels >= 2 && !flags.includes('screenshot') && metadata?.cameraModel) {
      notes.push(
        'Caractéristiques compatibles avec une prise de vue par appareil photo ou téléphone.',
      );
    }

    return {
      imageId,
      perceptualHash: probe.perceptualHash,
      sha256: probe.sha256,
      width: probe.width,
      height: probe.height,
      megapixels: Number(megapixels.toFixed(2)),
      qualityEstimate:
        probe.bytesPerPixel !== undefined ? Number(probe.bytesPerPixel.toFixed(3)) : undefined,
      elaScore: probe.elaScore !== undefined ? Number(probe.elaScore.toFixed(3)) : undefined,
      flags,
      metadataPresent: Boolean(metadata && !metadata.stripped),
      reverseSearch: url ? reverseSearchLinks(url) : [],
      notes,
    };
  }

  private analyzeCount(total: number): SignalDraft[] {
    if (total === 1) {
      return [
        {
          criterionId: 'image.count.single',
          strength: 0.75,
          explanation:
            "L'annonce ne contient qu'une seule photo. Impossible dans ces conditions de vérifier la cohérence entre les vues, ni de constater l'état réel du bien. Les annonces fictives reposent très souvent sur une image unique récupérée en ligne — demandez des photos supplémentaires prises sur le moment.",
          evidence: [{ kind: 'image', label: 'Nombre de photos', value: '1' }],
        },
      ];
    }
    if (total >= 5) {
      return [
        {
          criterionId: 'image.count.rich_gallery',
          strength: ramp(total, 5, 12),
          explanation: `L'annonce comporte ${total} photos. Photographier un bien sous autant d'angles suppose de l'avoir physiquement sous la main : c'est un signal favorable solide.`,
          evidence: [{ kind: 'image', label: 'Nombre de photos', value: String(total) }],
        },
      ];
    }
    return [];
  }

  private analyzeQuality(
    assessments: ImageAssessment[],
    probes: { imageId: string; probe: ImageProbe }[],
  ): SignalDraft[] {
    const signals: SignalDraft[] = [];

    const screenshots = assessments.filter((a) => a.flags.includes('screenshot'));
    if (screenshots.length > 0) {
      signals.push({
        criterionId: 'image.source.screenshot',
        strength: Math.min(1, 0.6 + screenshots.length * 0.15),
        explanation: `${screenshots.length} photo${screenshots.length > 1 ? 's ont' : ' a'} exactement les dimensions d'un écran de téléphone ou d'ordinateur. Ce ne sont donc pas des prises de vue directes mais des captures, vraisemblablement récupérées depuis une autre annonce ou un site marchand.`,
        evidence: screenshots.slice(0, 3).map((a) => ({
          kind: 'image' as const,
          label: 'Dimensions de capture',
          value: `${a.width}×${a.height}`,
          imageId: a.imageId,
        })),
      });
    }

    const lowRes = assessments.filter((a) => a.flags.includes('low_resolution'));
    if (lowRes.length > 0) {
      signals.push({
        criterionId: 'image.quality.very_low_resolution',
        strength: ramp(lowRes.length / assessments.length, 0.2, 1),
        explanation: `${lowRes.length} photo${lowRes.length > 1 ? 's affichent' : ' affiche'} une définition inférieure à 0,35 mégapixel, très en dessous de ce que produit n'importe quel téléphone depuis dix ans. Une définition aussi faible résulte généralement d'une image récupérée en ligne puis redimensionnée, ou volontairement dégradée pour masquer des détails.`,
        evidence: lowRes.slice(0, 3).map((a) => ({
          kind: 'image' as const,
          label: 'Définition',
          value: `${a.width}×${a.height} (${a.megapixels} Mpx)`,
          imageId: a.imageId,
        })),
      });
    }

    const compressed = assessments.filter((a) => a.flags.includes('heavy_compression'));
    if (compressed.length >= Math.max(2, assessments.length * 0.5)) {
      signals.push({
        criterionId: 'image.quality.heavy_compression',
        strength: ramp(compressed.length / assessments.length, 0.5, 1),
        explanation: `La majorité des photos présente un taux de compression très élevé. C'est la signature de recompressions successives : l'image a transité par plusieurs services — capture, partage, republication — avant d'aboutir dans cette annonce.`,
        evidence: compressed.slice(0, 3).map((a) => ({
          kind: 'image' as const,
          label: 'Densité de données',
          value: `${a.qualityEstimate} octet/pixel`,
          imageId: a.imageId,
        })),
      });
    }

    // Signal positif : photos natives de bonne facture.
    const native = assessments.filter(
      (a) =>
        (a.megapixels ?? 0) >= 1.5 &&
        !a.flags.includes('screenshot') &&
        !a.flags.includes('heavy_compression'),
    );
    if (native.length >= Math.max(2, assessments.length * 0.6)) {
      signals.push({
        criterionId: 'image.quality.native_capture',
        strength: ramp(native.length / assessments.length, 0.6, 1),
        explanation: `${native.length} photo${native.length > 1 ? 's présentent' : ' présente'} les caractéristiques d'une prise de vue directe : définition suffisante, compression normale, aucune dimension d'écran. C'est ce que produit un vendeur qui photographie lui-même son bien.`,
        evidence: native.slice(0, 3).map((a) => ({
          kind: 'image' as const,
          label: 'Photo native',
          value: `${a.width}×${a.height} (${a.megapixels} Mpx)`,
          imageId: a.imageId,
        })),
      });
    }

    void probes;
    return signals;
  }

  private analyzeMetadata(
    context: AnalyzerContext,
    probes: { imageId: string; probe: ImageProbe; metadata?: ImageMetadata }[],
  ): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const withMetadata = probes.filter((p) => p.metadata && !p.metadata.stripped);

    if (withMetadata.length === 0) {
      signals.push({
        criterionId: 'image.metadata.stripped',
        strength: 0.5,
        explanation:
          "Aucune photo ne conserve ses métadonnées EXIF. Ce n'est pas accablant : la plupart des plateformes les suppriment automatiquement à la publication pour protéger la vie privée des vendeurs. Cela prive simplement l'analyse d'un point de vérification supplémentaire.",
        evidence: [
          { kind: 'metadata', label: 'Métadonnées EXIF', value: 'absentes sur toutes les photos' },
        ],
      });
      return signals;
    }

    // Logiciel de retouche déclaré.
    const edited = withMetadata.filter((p) => p.metadata?.software);
    if (edited.length > 0) {
      const names = [...new Set(edited.map((p) => p.metadata!.software!))];
      signals.push({
        criterionId: 'image.metadata.editing_software',
        strength: 0.55,
        explanation: `Les métadonnées mentionnent un logiciel d'édition (${names.slice(0, 2).join(', ')}). Retoucher la luminosité d'une photo d'annonce est banal ; à rapprocher toutefois des autres signaux visuels avant d'en tirer une conclusion.`,
        evidence: names.slice(0, 3).map((name) => ({
          kind: 'metadata' as const,
          label: 'Logiciel déclaré',
          value: name,
        })),
      });
    }

    // Cohérence des dates de prise de vue avec la publication.
    const publishedAt = context.listing.publishedAt;
    if (publishedAt) {
      const stale = withMetadata.filter((p) => {
        if (!p.metadata?.takenAt) return false;
        const gap = daysBetween(p.metadata.takenAt, publishedAt);
        return Number.isFinite(gap) && (gap > 400 || gap < -2);
      });
      if (stale.length > 0) {
        const first = stale[0]!;
        signals.push({
          criterionId: 'image.metadata.date_inconsistent',
          strength: 0.6,
          explanation: `La date de prise de vue d'au moins une photo (${new Date(first.metadata!.takenAt!).toLocaleDateString('fr-FR')}) est très éloignée de la publication de l'annonce. Les photos ne documentent donc pas l'état actuel du bien : demandez des clichés récents.`,
          evidence: stale.slice(0, 3).map((p) => ({
            kind: 'metadata' as const,
            label: 'Prise de vue',
            value: new Date(p.metadata!.takenAt!).toLocaleDateString('fr-FR'),
            imageId: p.imageId,
          })),
        });
      }
    }

    // Appareils multiples.
    const devices = new Set(
      withMetadata
        .map((p) => [p.metadata?.cameraMake, p.metadata?.cameraModel].filter(Boolean).join(' '))
        .filter((d) => d.length > 0),
    );
    if (devices.size > 2) {
      signals.push({
        criterionId: 'image.metadata.multiple_devices',
        strength: ramp(devices.size, 2, 5),
        explanation: `Les photos proviennent de ${devices.size} appareils différents (${[...devices].slice(0, 3).join(', ')}). C'est légitime si le vendeur a réutilisé d'anciennes photos, plus difficile à expliquer si elles sont censées avoir été prises lors d'une même séance.`,
        evidence: [...devices].slice(0, 3).map((d) => ({
          kind: 'metadata' as const,
          label: 'Appareil',
          value: d,
        })),
      });
    } else if (devices.size === 1 && withMetadata.length >= 3) {
      signals.push({
        criterionId: 'image.metadata.consistent',
        strength: 0.8,
        explanation: `Toutes les photos porteuses de métadonnées proviennent du même appareil (${[...devices][0]}). Cette cohérence correspond à une séance photo unique sur un bien réellement détenu, et elle est difficile à fabriquer.`,
        evidence: [{ kind: 'metadata', label: 'Appareil unique', value: [...devices][0]! }],
      });
    }

    // Écart entre GPS et localisation annoncée.
    const geo = withMetadata.find((p) => p.metadata?.gps);
    if (
      geo?.metadata?.gps &&
      context.listing.location?.latitude &&
      context.listing.location?.longitude
    ) {
      const distance = haversineKm(
        geo.metadata.gps.latitude,
        geo.metadata.gps.longitude,
        context.listing.location.latitude,
        context.listing.location.longitude,
      );
      if (distance > 150) {
        signals.push({
          criterionId: 'image.metadata.gps_mismatch',
          strength: ramp(distance, 150, 800),
          explanation: `Les coordonnées GPS inscrites dans une photo situent la prise de vue à environ ${Math.round(distance)} km de la localisation annoncée. Le bien n'est vraisemblablement pas là où le vendeur l'indique.`,
          evidence: [
            {
              kind: 'metadata',
              label: 'Écart de localisation',
              value: `${Math.round(distance)} km`,
              imageId: geo.imageId,
            },
          ],
        });
      }
    }

    return signals;
  }

  private analyzeManipulation(probes: { imageId: string; probe: ImageProbe }[]): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const analyzable = probes.filter((p) => !p.probe.degraded);
    if (analyzable.length === 0) return signals;

    const suspicious = analyzable.filter((p) => (p.probe.elaScore ?? 0) > 0.22);
    if (suspicious.length > 0) {
      const worst = suspicious.reduce((a, b) =>
        (a.probe.elaScore ?? 0) > (b.probe.elaScore ?? 0) ? a : b,
      );
      signals.push({
        criterionId: 'image.manipulation.ela_anomaly',
        strength: ramp(worst.probe.elaScore ?? 0, 0.22, 0.5),
        explanation: `L'analyse du niveau d'erreur révèle sur ${suspicious.length} photo${suspicious.length > 1 ? 's' : ''} des zones dont la compression diffère nettement du reste de l'image (score maximal ${(worst.probe.elaScore ?? 0).toFixed(2)}). Cela accompagne souvent un ajout ou un effacement d'élément — mais un logo net ou un texte incrusté produisent le même effet. À croiser avec le reste du rapport plutôt qu'à prendre comme preuve.`,
        evidence: suspicious.slice(0, 3).map((p) => ({
          kind: 'image' as const,
          label: 'Score ELA',
          value: (p.probe.elaScore ?? 0).toFixed(2),
          imageId: p.imageId,
        })),
      });
    }

    const uniform = analyzable.filter((p) => (p.probe.uniformRatio ?? 0) > 0.45);
    if (uniform.length > 0) {
      signals.push({
        criterionId: 'image.manipulation.uniform_region',
        strength: 0.45,
        explanation: `${uniform.length} photo${uniform.length > 1 ? 's présentent' : ' présente'} une large proportion de surface parfaitement lisse. C'est typique d'un fond artificiel, d'un détourage ou d'un effacement au tampon — mais aussi, plus banalement, d'un objet photographié sur un mur uni.`,
        evidence: uniform.slice(0, 3).map((p) => ({
          kind: 'image' as const,
          label: 'Surface uniforme',
          value: `${Math.round((p.probe.uniformRatio ?? 0) * 100)} %`,
          imageId: p.imageId,
        })),
      });
    }

    const cropped = analyzable.filter((p) => p.probe.borderBands);
    if (cropped.length > 0) {
      signals.push({
        criterionId: 'image.manipulation.borders_added',
        strength: 0.5,
        explanation: `${cropped.length} photo${cropped.length > 1 ? 's comportent' : ' comporte'} des bandes uniformes sur les bords. Ce type de recadrage sert fréquemment à supprimer un filigrane, un logo de site marchand ou un élément identifiant la source réelle de l'image.`,
        evidence: cropped.slice(0, 3).map((p) => ({
          kind: 'image' as const,
          label: 'Bandes détectées',
          value: 'bords uniformes',
          imageId: p.imageId,
        })),
      });
    }

    return signals;
  }

  private analyzeGalleryConsistency(
    probes: { imageId: string; probe: ImageProbe }[],
  ): SignalDraft[] {
    const signals: SignalDraft[] = [];
    if (probes.length < 2) return signals;

    // Doublons internes.
    const duplicates: string[] = [];
    for (let i = 0; i < probes.length; i++) {
      for (let j = i + 1; j < probes.length; j++) {
        const a = probes[i]!;
        const b = probes[j]!;
        if (a.probe.sha256 === b.probe.sha256) {
          duplicates.push(`${a.imageId} / ${b.imageId}`);
          continue;
        }
        if (a.probe.perceptualHash && b.probe.perceptualHash) {
          const similarity = perceptualSimilarity(a.probe.perceptualHash, b.probe.perceptualHash);
          if (similarity >= SAME_IMAGE_THRESHOLD) duplicates.push(`${a.imageId} / ${b.imageId}`);
        }
      }
    }

    if (duplicates.length > 0) {
      signals.push({
        criterionId: 'image.consistency.duplicate_in_gallery',
        strength: ramp(duplicates.length, 1, 4),
        explanation: `${duplicates.length} paire${duplicates.length > 1 ? 's' : ''} de photos identiques ou quasi identiques figure${duplicates.length > 1 ? 'nt' : ''} dans la galerie. Republier la même image sous un léger recadrage donne l'illusion d'une galerie fournie sans avoir à photographier le bien davantage.`,
        evidence: duplicates.slice(0, 3).map((pair) => ({
          kind: 'image' as const,
          label: 'Photos identiques',
          value: pair,
        })),
      });
    }

    // Hétérogénéité des sources.
    const analyzable = probes.filter((p) => p.probe.width && p.probe.height);
    if (analyzable.length >= 3) {
      const megapixels = analyzable.map((p) => (p.probe.width! * p.probe.height!) / 1_000_000);
      const min = Math.min(...megapixels);
      const max = Math.max(...megapixels);
      const ratios = analyzable.map((p) => p.probe.width! / p.probe.height!);
      const distinctRatios = new Set(ratios.map((r) => r.toFixed(2))).size;

      if (max > 0 && min > 0 && max / min > 6 && distinctRatios >= 3) {
        signals.push({
          criterionId: 'image.consistency.mixed_sources',
          strength: ramp(max / min, 6, 20),
          explanation: `Les photos vont de ${min.toFixed(1)} à ${max.toFixed(1)} mégapixels avec ${distinctRatios} proportions différentes. Une série prise en une fois avec le même appareil produit des images homogènes : cette disparité suggère des visuels collectés à plusieurs endroits.`,
          evidence: [
            {
              kind: 'image',
              label: 'Amplitude de définition',
              value: `${min.toFixed(1)} → ${max.toFixed(1)} Mpx`,
            },
            { kind: 'image', label: 'Proportions distinctes', value: String(distinctRatios) },
          ],
        });
      } else if (max / min < 2 && distinctRatios <= 2) {
        signals.push({
          criterionId: 'image.consistency.coherent_series',
          strength: 0.7,
          explanation: `Les photos partagent une définition et des proportions homogènes, ce qui correspond à une série prise en une seule fois avec le même appareil sur un bien réellement détenu.`,
          evidence: [
            {
              kind: 'image',
              label: 'Définition homogène',
              value: `${min.toFixed(1)} → ${max.toFixed(1)} Mpx`,
            },
          ],
        });
      }
    }

    return signals;
  }

  /** Recoupe les empreintes visuelles avec les analyses déjà réalisées. */
  private analyzeReuse(
    context: AnalyzerContext,
    probes: { imageId: string; probe: ImageProbe }[],
  ): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const hashes = probes.map((p) => p.probe.perceptualHash).filter((h): h is string => Boolean(h));
    if (hashes.length === 0 || context.corpus.length === 0) return signals;

    const matches: { analysisId: string; url?: string; similarity: number }[] = [];

    for (const entry of context.corpus) {
      if (entry.listingUrl && entry.listingUrl === context.listing.source.url) continue;
      for (const candidate of entry.imageHashes) {
        for (const hash of hashes) {
          const similarity = perceptualSimilarity(hash, candidate);
          if (similarity >= SAME_IMAGE_THRESHOLD) {
            matches.push({ analysisId: entry.analysisId, url: entry.listingUrl, similarity });
          }
        }
      }
    }

    if (matches.length > 0) {
      const unique = [...new Map(matches.map((m) => [m.analysisId, m])).values()];
      const evidence: Evidence[] = unique.slice(0, 3).map((m) => ({
        kind: 'link',
        label: 'Annonce déjà analysée',
        value: m.url ?? m.analysisId,
      }));

      signals.push({
        criterionId: 'image.reuse.known_listing',
        strength: Math.min(1, 0.75 + unique.length * 0.1),
        explanation: `Au moins une photo de cette annonce apparaît déjà dans ${unique.length} annonce${unique.length > 1 ? 's' : ''} que vous avez analysée${unique.length > 1 ? 's' : ''} précédemment, sur une URL différente. La réutilisation de photos entre annonces est le mode opératoire dominant des annonces fictives : la même image sert plusieurs fraudes successives.`,
        evidence,
      });
    }

    // Rappel systématique de la vérification manuelle, qui reste la plus décisive.
    const withUrl = context.listing.images.filter((i) => i.url).length;
    if (withUrl > 0) {
      signals.push({
        criterionId: 'image.reuse.reverse_search_pending',
        strength: 1,
        explanation:
          "Les liens de recherche d'image inversée sont préparés dans le rapport. Une vérification manuelle sur Google Images, Bing, Yandex ou TinEye reste la méthode la plus décisive pour savoir si ces photos existent ailleurs sur Internet : elle prend trente secondes et tranche définitivement la question.",
        evidence: [
          { kind: 'link', label: 'Recherche inversée', value: `${withUrl} image(s) prêtes` },
        ],
      });
    }

    return signals;
  }
}

// ── Fonctions utilitaires ──────────────────────────────────────────────

/** Lecture EXIF, isolée pour que son échec n'interrompe jamais l'analyse. */
async function readExif(buffer: Buffer): Promise<ImageMetadata | undefined> {
  try {
    const exifr = await import('exifr');
    const parse = (exifr.default?.parse ?? exifr.parse) as
      | ((input: Buffer, options?: unknown) => Promise<Record<string, unknown> | undefined>)
      | undefined;
    if (!parse) return { stripped: true };

    const data = await parse(buffer, { gps: true, tiff: true, exif: true });
    if (!data || Object.keys(data).length === 0) return { stripped: true };

    const gps =
      typeof data.latitude === 'number' && typeof data.longitude === 'number'
        ? { latitude: data.latitude, longitude: data.longitude }
        : undefined;

    const takenAtRaw = data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate;
    const takenAt = takenAtRaw instanceof Date ? takenAtRaw.toISOString() : undefined;

    return {
      cameraMake: typeof data.Make === 'string' ? data.Make.trim() : undefined,
      cameraModel: typeof data.Model === 'string' ? data.Model.trim() : undefined,
      software: typeof data.Software === 'string' ? data.Software.trim() : undefined,
      takenAt,
      gps,
      orientation: typeof data.Orientation === 'number' ? data.Orientation : undefined,
      stripped: false,
    };
  } catch {
    return { stripped: true };
  }
}

function looksLikeScreenshot(width: number, height: number): boolean {
  if (!width || !height) return false;
  if (SCREEN_RESOLUTIONS.has(`${width}x${height}`)) return true;
  if (SCREEN_RESOLUTIONS.has(`${height}x${width}`)) return true;
  return false;
}

/** Distance orthodromique en kilomètres. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
