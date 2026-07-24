import { defineCriteria } from '../registry';

/**
 * Critères de forensique visuelle.
 *
 * L'objectif n'est pas de « prouver » une retouche — aucune méthode passive
 * ne le permet avec certitude — mais de mesurer l'écart entre ce que l'on
 * observe et ce qu'on attendrait de photos prises par un particulier avec son
 * téléphone. C'est cet écart qui est rapporté à l'utilisateur.
 */
export const IMAGE_CRITERIA = defineCriteria('image', [
  // ── Disponibilité ────────────────────────────────────────────────────
  {
    id: 'image.count.none',
    label: 'Aucune photo',
    rationale:
      "Une annonce sans visuel ne permet aucune vérification et n'inspire aucune confiance. C'est rarissime sur une vente sincère.",
    severity: 'high',
  },
  {
    id: 'image.count.single',
    label: 'Photo unique',
    rationale:
      'Une seule image empêche de vérifier la cohérence entre les vues. Les annonces frauduleuses reposent souvent sur une image isolée trouvée en ligne.',
    severity: 'medium',
  },
  {
    id: 'image.count.rich_gallery',
    label: 'Galerie fournie',
    rationale:
      "Photographier un objet sous de nombreux angles suppose de le posséder physiquement. C'est un signal positif solide.",
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'image.unavailable',
    label: 'Images non analysables',
    rationale:
      "Les images n'ont pas pu être téléchargées ou décodées : la dimension visuelle de l'analyse est indisponible.",
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },

  // ── Qualité et provenance ────────────────────────────────────────────
  {
    id: 'image.quality.very_low_resolution',
    label: 'Résolution très faible',
    rationale:
      "Une définition inférieure à celle de n'importe quel téléphone récent trahit une image récupérée en ligne, redimensionnée par une capture ou compressée pour masquer des détails.",
    severity: 'medium',
  },
  {
    id: 'image.quality.heavy_compression',
    label: 'Compression excessive',
    rationale:
      "Un taux de compression très élevé est le résultat de recompressions successives : l'image a transité par plusieurs services avant d'arriver ici.",
    severity: 'medium',
  },
  {
    id: 'image.quality.native_capture',
    label: 'Caractéristiques de prise de vue native',
    rationale:
      "Dimensions, ratio et métadonnées correspondent à une photo prise directement par un appareil : c'est ce que produit un vendeur qui possède le bien.",
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'image.source.screenshot',
    label: "Capture d'écran plutôt que photo",
    rationale:
      "Les dimensions correspondent à un écran de téléphone ou d'ordinateur : l'image a été capturée depuis une autre annonce ou un site marchand.",
    severity: 'high',
  },
  {
    id: 'image.source.photo_of_screen',
    label: "Photographie d'un écran",
    rationale:
      "Les artefacts détectés évoquent une photo prise en direction d'un écran, procédé utilisé pour contourner la détection de doublons.",
    severity: 'high',
  },
  {
    id: 'image.source.stock_or_catalogue',
    label: 'Visuel de catalogue',
    rationale:
      "Fond uniforme, cadrage centré et éclairage studio caractérisent une photo promotionnelle du fabricant, pas l'exemplaire mis en vente.",
    severity: 'high',
  },
  {
    id: 'image.source.watermark',
    label: "Filigrane d'un tiers",
    rationale:
      "La présence d'un filigrane appartenant à un autre site indique une image reprise sans autorisation à sa source d'origine.",
    severity: 'high',
  },

  // ── Métadonnées ──────────────────────────────────────────────────────
  {
    id: 'image.metadata.stripped',
    label: 'Métadonnées absentes',
    rationale:
      "Les plateformes suppriment souvent les EXIF ; leur absence n'est donc pas accablante, mais elle prive l'analyse d'un point de vérification.",
    severity: 'info',
    weight: 0.15,
  },
  {
    id: 'image.metadata.editing_software',
    label: 'Logiciel de retouche déclaré',
    rationale:
      "Les métadonnées nomment un logiciel d'édition. Une retouche cosmétique est banale ; sur une annonce, elle mérite d'être rapprochée du reste des signaux.",
    severity: 'medium',
  },
  {
    id: 'image.metadata.date_inconsistent',
    label: 'Date de prise de vue incohérente',
    rationale:
      "La date de la photo est nettement antérieure à la publication ou postérieure à celle-ci : l'image ne documente pas l'état actuel du bien.",
    severity: 'medium',
  },
  {
    id: 'image.metadata.gps_mismatch',
    label: 'Localisation GPS divergente',
    rationale:
      "Les coordonnées inscrites dans la photo sont éloignées de la localisation annoncée. Le bien n'est pas là où le vendeur le prétend.",
    severity: 'high',
  },
  {
    id: 'image.metadata.consistent',
    label: 'Métadonnées cohérentes',
    rationale:
      "Appareil, date et localisation concordent avec l'annonce : cet alignement est difficile à fabriquer.",
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'image.metadata.multiple_devices',
    label: 'Appareils photo multiples',
    rationale:
      "Les photos proviennent d'appareils différents. Légitime si le vendeur a réutilisé d'anciennes photos, suspect si elles sont censées dater du même moment.",
    severity: 'low',
  },

  // ── Manipulation ─────────────────────────────────────────────────────
  {
    id: 'image.manipulation.ela_anomaly',
    label: "Anomalie de niveau d'erreur",
    rationale:
      "L'analyse ELA révèle des zones dont le niveau de compression diffère nettement du reste de l'image, ce qui accompagne fréquemment un ajout ou un effacement d'élément.",
    severity: 'high',
  },
  {
    id: 'image.manipulation.uniform_region',
    label: 'Zone anormalement uniforme',
    rationale:
      "Une région parfaitement lisse au milieu d'une photo texturée évoque un effacement au tampon ou un remplissage automatique.",
    severity: 'medium',
  },
  {
    id: 'image.manipulation.borders_added',
    label: 'Bandes ajoutées',
    rationale:
      'Des bandes uniformes sur les bords indiquent un recadrage destiné à supprimer un filigrane ou un élément identifiant.',
    severity: 'medium',
  },

  // ── Cohérence de la galerie ──────────────────────────────────────────
  {
    id: 'image.consistency.mixed_sources',
    label: "Photos d'origines hétérogènes",
    rationale:
      "Résolutions, taux de compression et proportions très disparates suggèrent des images collectées à plusieurs endroits plutôt qu'une série prise en une fois.",
    severity: 'high',
  },
  {
    id: 'image.consistency.duplicate_in_gallery',
    label: 'Photo dupliquée dans la galerie',
    rationale:
      "La même image apparaît plusieurs fois, parfois légèrement modifiée, pour donner l'illusion d'une galerie fournie.",
    severity: 'medium',
  },
  {
    id: 'image.consistency.coherent_series',
    label: 'Série de photos cohérente',
    rationale:
      'Éclairage, appareil et arrière-plan communs à toutes les vues correspondent à une séance photo unique sur un objet réellement détenu.',
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'image.consistency.background_mismatch',
    label: 'Arrière-plans incompatibles',
    rationale:
      'Les décors des différentes photos sont incompatibles entre eux, ce qui est difficile à expliquer pour un même objet photographié en une fois.',
    severity: 'medium',
  },

  // ── Réutilisation ────────────────────────────────────────────────────
  {
    id: 'image.reuse.known_listing',
    label: 'Photo déjà vue dans une autre annonce',
    rationale:
      'Cette image a déjà été analysée dans une annonce distincte. La réutilisation de photos est le mode opératoire dominant des annonces fictives.',
    severity: 'critical',
    weight: 2.4,
  },
  {
    id: 'image.reuse.reverse_search_pending',
    label: 'Recherche inversée à effectuer',
    rationale:
      "Les liens de recherche inversée sont prêts : une vérification manuelle sur Google, Bing, Yandex ou TinEye tranchera définitivement l'origine des photos.",
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },
]);
