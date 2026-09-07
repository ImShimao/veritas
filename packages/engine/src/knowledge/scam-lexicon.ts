/**
 * Lexique de signaux textuels.
 *
 * IMPORTANT : tous les motifs sont appliqués sur du texte **normalisé** par
 * `normalize()` — minuscules, sans accents, espaces compactés. Les motifs
 * s'écrivent donc sans accent (`cheque`, `securise`, `verifie`), ce qui les
 * rend insensibles aux variations d'orthographe et aux claviers sans accents.
 *
 * Chaque entrée est rattachée à un critère du registre : ajouter un motif ne
 * change jamais la structure du score, seulement sa sensibilité.
 */

export interface LexiconEntry {
  criterionId: string;
  patterns: RegExp[];
  /**
   * Nombre de correspondances distinctes à partir duquel la force du signal
   * atteint 1. Par défaut 1 : une seule occurrence suffit.
   */
  saturateAt?: number;
  /** Force minimale attribuée dès la première correspondance. */
  baseStrength?: number;
  /** Construit l'explication contextualisée affichée à l'utilisateur. */
  explain: (matches: string[]) => string;
}

const quote = (matches: string[], limit = 3): string =>
  matches
    .slice(0, limit)
    .map((m) => `« ${m.trim()} »`)
    .join(', ');

export const SCAM_LEXICON: LexiconEntry[] = [
  // ── Urgence et pression ────────────────────────────────────────────────
  {
    criterionId: 'text.urgency.artificial_deadline',
    patterns: [
      /\b(depart|demenagement|deces|deces? dans la famille)\s+(imminent|urgent|demain|ce soir)/,
      /\bje pars (demain|ce soir|dans \d+ (heures?|jours?))\b/,
      /\b(derniere?s?|dernier) (chance|jour|heure|occasion)\b/,
      /\bdoit partir (aujourd'hui|ce soir|avant|rapidement|vite)\b/,
      /\bvente? (urgente|rapide|immediate) (obligatoire|imperative)?\b/,
      /\boffre valable (que |uniquement )?(aujourd'hui|jusqu'a ce soir|\d+ ?h)\b/,
      /\bplus que \d+ (heures?|minutes?) pour\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `L'annonce impose une échéance artificielle (${quote(m)}). L'urgence sert à empêcher toute vérification avant paiement : c'est le levier le plus utilisé dans les arnaques entre particuliers.`,
  },
  {
    criterionId: 'text.urgency.multiple_buyers',
    patterns: [
      /\b(plusieurs|beaucoup de|nombreux) (personnes|acheteurs|interesses) (sont |m'ont |me )?(interesses|contacte|attendent)/,
      /\bpremier (arrive|venu),? premier servi\b/,
      /\bje donne au premier qui (paye|verse|envoie)\b/,
      /\bdeja \d+ personnes? interessees?\b/,
      /\bfile d'attente\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Le vendeur affirme qu'une concurrence entre acheteurs existe (${quote(m)}). Cette rareté fabriquée pousse à payer avant d'avoir vu le bien.`,
  },
  {
    criterionId: 'text.pressure.no_negotiation',
    patterns: [
      // « prix ferme » suivi de près d'une pression réelle. On borne la distance
      // (pas de fin de phrase entre les deux) et on exclut « rapide »/« vite »,
      // qui, dans « envoi rapide » ou « réponse rapide », sont de simples
      // arguments de vente parfaitement légitimes.
      /\bprix (ferme|non negociable|fixe et definitif)[^.!\n]{0,20}\b(urgent|imperatif|imperative)\b/,
      /\bpas de (questions?|blabla|curieux|perte de temps)\b/,
      /\bs'abstenir\b.*\b(curieux|negociateurs?|plaisantins?)\b/,
      /\bje ne repondrai (pas|plus) aux questions\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Le vendeur décourage explicitement les questions (${quote(m)}). Un vendeur honnête accepte d'être interrogé sur son bien.`,
  },

  // ── Moyens de paiement ─────────────────────────────────────────────────
  {
    criterionId: 'text.payment.gift_cards',
    patterns: [
      /\b(carte|cartes|coupon|bon)s? (cadeaux?|prepayees?|pcs|transcash|neosurf|steam|google play|amazon)\b/,
      /\bpaysafecard\b/,
      /\bticket premium\b/,
      /\brecharge (transcash|neosurf|pcs)\b/,
    ],
    baseStrength: 1,
    explain: (m) =>
      `Un paiement par carte prépayée ou carte cadeau est demandé (${quote(m)}). Ces moyens sont irrécupérables et n'ont aucune raison d'être dans une vente entre particuliers : c'est un marqueur d'arnaque quasi certain.`,
  },
  {
    criterionId: 'text.payment.wire_transfer',
    patterns: [
      /\b(virement|transfert) (bancaire )?(uniquement|obligatoire|exclusivement|avant|immediat)\b/,
      /\bwestern union\b/,
      /\bmoney ?gram\b/,
      /\bria money\b/,
      /\bmandat cash\b/,
      /\benvoyer? l'argent par\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Le paiement se fait par transfert non traçable ou irréversible (${quote(m)}). Aucun recours n'est possible une fois l'argent envoyé.`,
  },
  {
    criterionId: 'text.payment.crypto',
    patterns: [
      /\b(bitcoin|btc|ethereum|eth|usdt|crypto ?monnaie|paiement en crypto)\b/,
      /\bwallet (crypto|bitcoin)\b/,
    ],
    explain: (m) =>
      `Un paiement en cryptomonnaie est proposé (${quote(m)}). Les transferts sont définitifs et intraçables : hors contexte spécialisé, c'est un signal très défavorable.`,
  },
  {
    criterionId: 'text.payment.advance_deposit',
    patterns: [
      /\b(acompte|arrhes|caution|reservation) (obligatoire|requis|demande|avant|prealable)\b/,
      /\bverser (un acompte|des arrhes|\d+ ?%) avant (de |la |toute )?(voir|visite|livraison|reception)\b/,
      /\bpour reserver,? (il faut|merci de|veuillez) (payer|verser|envoyer)\b/,
      /\bfrais de (dossier|reservation|blocage)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Un versement est exigé avant toute vérification du bien (${quote(m)}). Le schéma « acompte pour réserver » est la mécanique centrale des fausses locations et des faux véhicules.`,
  },
  {
    criterionId: 'text.payment.fake_escrow',
    // ATTENTION : ne jamais matcher « paiement sécurisé Leboncoin/Vinted/PayPal »,
    // qui désigne le dispositif LÉGITIME de la plateforme (un signal positif).
    // Le faux séquestre, lui, prétend qu'un TRANSPORTEUR ou un tiers inhabituel
    // détient les fonds — ce qu'aucun transporteur ne fait réellement.
    patterns: [
      /\b(service|systeme) (de )?(sequestre|escrow) (de |par )?(la poste|dhl|ups|fedex|chronopost|mondial ?relay|colissimo|tnt|dpd)\b/,
      /\b(sequestre|escrow) (de |par )?(la poste|dhl|ups|fedex|chronopost|mondial ?relay|colissimo)\b/,
      /\bl'argent est bloque (chez|par|sur) (le transporteur|le livreur|un notaire|la societe de (transport|livraison))\b/,
      /\bprotection (acheteur )?(garantie|assuree) par (le transporteur|le livreur|la societe de (transport|livraison))\b/,
      /\bagence de (transport|livraison) (partenaire|agreee)? ?qui (garde|conserve|bloque) (l'argent|le paiement|les fonds)\b/,
      /\b(le|via le) transporteur (garde|conserve|bloque|debloque) (l'argent|le paiement|les fonds)\b/,
    ],
    baseStrength: 0.9,
    explain: (m) =>
      `L'annonce évoque un séquestre ou une « protection » gérée par un transporteur ou un tiers inhabituel (${quote(m)}). Les transporteurs ne conservent jamais les fonds d'une transaction : c'est un faux service monté par l'escroc. (Le paiement sécurisé propre à la plateforme, lui, est légitime.)`,
  },
  {
    criterionId: 'text.payment.overpayment',
    patterns: [
      /\bje vous envoie (un cheque|un montant) (superieur|plus eleve|de trop)\b/,
      /\bvous me (rembourserez|renverrez) la difference\b/,
      /\btrop percu\b/,
      /\bcheque de banque\b/,
    ],
    explain: (m) =>
      `Le montage évoque un paiement excédentaire à rembourser (${quote(m)}). Le chèque se révèle ensuite sans provision, après que le remboursement a été envoyé.`,
  },
  {
    criterionId: 'text.payment.off_platform',
    patterns: [
      /\b(en dehors|hors) (du site|de la plateforme|de leboncoin|de vinted)\b/,
      /\bpour eviter les (frais|commissions) (du site|de la plateforme)\b/,
      /\bon fait ca (entre nous|directement|en direct)\b/,
      /\bne passez pas par (le site|la plateforme|l'application)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Le vendeur cherche à sortir du cadre de la plateforme (${quote(m)}). Vous perdez alors toute protection acheteur et toute trace de la transaction.`,
  },

  // ── Canal de contact ───────────────────────────────────────────────────
  {
    criterionId: 'text.contact.external_channel',
    patterns: [
      /\bwhat'?s ?app\b/,
      /\bwa\.me\b/,
      /\btelegram\b/,
      /\bt\.me\b/,
      /\bsignal\b(?! (fort|faible|de))/,
      /\bcontactez[- ]moi (directement )?(au|sur|par) (le )?\+?\d/,
      /\bmon (numero|mail|email) (direct|perso)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Le vendeur redirige la conversation vers un canal externe (${quote(m)}). La messagerie de la plateforme est le seul endroit où vos échanges restent vérifiables en cas de litige.`,
  },
  {
    criterionId: 'text.contact.email_only',
    patterns: [
      /\b(uniquement|seulement) par (mail|email|courriel)\b/,
      /\bpas d'appel\b/,
      /\bje ne reponds pas au telephone\b/,
    ],
    explain: (m) =>
      `Le contact est restreint à l'écrit (${quote(m)}). Refuser tout appel est un moyen classique de dissimuler une localisation ou une identité.`,
  },

  // ── Prétextes d'indisponibilité ────────────────────────────────────────
  {
    criterionId: 'text.excuse.abroad',
    patterns: [
      /\bje (suis|me trouve|reside) (actuellement )?(a l'etranger|en (angleterre|espagne|allemagne|italie|belgique|suisse|afrique|cote d'ivoire|benin|senegal))\b/,
      /\bexpatrie\b/,
      /\bje (travaille|habite) (a|en) l'etranger\b/,
      /\ble bien (est|se trouve) (deja )?(a l'etranger|dans un autre pays)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Le vendeur se déclare à l'étranger (${quote(m)}). Ce prétexte sert systématiquement à justifier l'impossibilité d'une remise en main propre et l'obligation de payer d'avance.`,
  },
  {
    criterionId: 'text.excuse.military_or_mission',
    patterns: [
      /\bje suis (militaire|en mission|marin|sur une plateforme petroliere|humanitaire)\b/,
      /\b(mission|deploiement) (humanitaire|militaire|a l'etranger)\b/,
      /\bposte a l'etranger par mon (employeur|entreprise)\b/,
    ],
    baseStrength: 0.85,
    explain: (m) =>
      `Le prétexte du militaire ou de la mission à l'étranger apparaît (${quote(m)}). C'est un scénario d'arnaque documenté et très répandu, destiné à rendre toute rencontre impossible.`,
  },
  {
    criterionId: 'text.excuse.no_visit',
    patterns: [
      /\b(pas|aucune) (de )?(visite|remise en main propre|rencontre) (possible)?\b/,
      /\bvisite impossible\b/,
      /\bje ne peux pas (vous )?(recevoir|faire visiter|rencontrer)\b/,
      /\benvoi (uniquement|seulement|obligatoire)\b/,
      /\bexpedition (uniquement|obligatoire)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Toute rencontre ou visite est exclue (${quote(m)}). Vous n'aurez donc jamais l'occasion de constater que le bien existe avant de payer.`,
  },
  {
    criterionId: 'text.excuse.family_story',
    patterns: [
      /\b(deces|divorce|separation|maladie|hospitalisation) (de |d'un |de ma |de mon )?(pere|mere|mari|femme|parent|proche)\b/,
      /\bj'ai (perdu|besoin d'argent) (pour|a cause)\b/,
      /\bsituation (difficile|financiere compliquee)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Un récit personnel dramatique justifie la vente (${quote(m)}). Isolé, ce n'est pas suspect ; combiné à un prix très bas ou à un paiement d'avance, c'est un ressort d'ingénierie sociale.`,
  },

  // ── Promesses irréalistes ──────────────────────────────────────────────
  {
    criterionId: 'text.promise.too_good',
    patterns: [
      /\bcomme neuf\b.*\b(jamais servi|jamais utilise|encore emballe)\b/,
      /\bneuf sous blister\b.*\b-\d+ ?%/,
      /\bgarantie (a vie|illimitee)\b/,
      /\b100 ?% (garanti|authentique|securise|fiable)\b/,
      /\bsatisfait ou rembourse\b/,
      /\baucun (defaut|probleme|rayure|souci)\b.*\b(\d+ ?ans?|\d{2,} ?000 ?km)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `L'annonce formule des promesses absolues (${quote(m)}). Un particulier ne peut garantir ni l'authenticité ni un remboursement : ces formules sont importées du vocabulaire publicitaire.`,
  },
  {
    criterionId: 'text.promise.unverifiable_warranty',
    patterns: [
      /\bencore sous garantie\b(?!.*\b(facture|justificatif|preuve|numero de serie)\b)/,
      /\bgarantie (constructeur|apple|samsung) (jusqu'en|jusqu'au)?\b/,
    ],
    explain: (m) =>
      `Une garantie est mise en avant sans justificatif mentionné (${quote(m)}). Demandez la facture d'origine : sans elle, la garantie est invérifiable et souvent inexistante.`,
  },

  // ── Manipulation et sollicitation de confiance ─────────────────────────
  {
    criterionId: 'text.emotional.trust_begging',
    patterns: [
      /\bje suis (une personne )?(honnete|serieuse|de confiance|reglo)\b/,
      /\bfaites?[- ]moi confiance\b/,
      /\bje ne suis pas (un )?(arnaqueur|escroc|voleur)\b/,
      /\bpas (d')?arnaque\b/,
      /\bvente (100 ?% )?(serieuse|sans arnaque)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Le vendeur proclame lui-même son honnêteté (${quote(m)}). Un vendeur légitime n'a pas besoin de se défendre d'une accusation que personne n'a formulée.`,
  },
  {
    criterionId: 'text.emotional.charity_appeal',
    patterns: [
      /\bpour (aider|sauver|financer) (mon|ma|mes|un|une)\b/,
      /\bcagnotte\b/,
      /\bje donne (le|la|les) .{0,30}\b(gratuit|gratuitement|contre frais de port)\b/,
      /\badoption (gratuite|contre bons soins)\b.*\b(frais|transport|vaccin)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `L'annonce mobilise un registre caritatif (${quote(m)}). Le schéma « don gratuit contre frais de transport » est une arnaque classique, notamment sur les animaux.`,
  },

  // ── Logistique et livraison ────────────────────────────────────────────
  {
    criterionId: 'text.shipping.impossible_logistics',
    patterns: [
      /\blivraison (gratuite|offerte) (partout|dans toute l'europe|a l'etranger)\b/,
      /\bexpedition (le jour meme|en 24 ?h) (partout|international)\b/,
      /\bje (livre|expedie) (moi[- ]meme )?(partout|dans toute la france) gratuitement\b/,
      /\btransporteur (prive|personnel|agree) (qui|va) (livre|livrer|s'occupe)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Les conditions de livraison annoncées sont économiquement irréalistes (${quote(m)}). Elles servent à justifier un paiement anticipé pour une expédition qui n'aura jamais lieu.`,
  },
  {
    criterionId: 'text.shipping.fake_carrier_link',
    patterns: [
      /\b(mondial ?relay|colissimo|chronopost|dhl|ups|tnt|dpd)\b.*\bhttps?:\/\//,
      /\bsuivi (de )?(colis|livraison)\b.*\bhttps?:\/\/(?!www\.(laposte|mondialrelay|chronopost|dhl|ups)\.)/,
    ],
    explain: (m) =>
      `Un lien de suivi est fourni depuis un domaine qui n'appartient pas au transporteur (${quote(m)}). Ces pages imitent le transporteur pour collecter vos coordonnées bancaires.`,
  },

  // ── Liens et domaines ──────────────────────────────────────────────────
  {
    criterionId: 'text.link.shortened_url',
    patterns: [
      /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|ow\.ly)\b/,
    ],
    explain: (m) =>
      `L'annonce contient un lien raccourci (${quote(m)}). La destination réelle est masquée : ne l'ouvrez pas sans l'avoir résolue au préalable.`,
  },
  {
    criterionId: 'text.link.lookalike_domain',
    patterns: [
      /\b[a-z0-9-]*(leboncoin|vinted|paypal|lebon-coin|le-bon-coin|paypa1|amaz0n|1eboncoin)[a-z0-9-]*\.(?!fr\b|com\b)[a-z]{2,}\b/,
      /\b(leboncoin|vinted|paypal)[-.][a-z0-9-]+\.[a-z]{2,}\b/,
    ],
    baseStrength: 0.9,
    explain: (m) =>
      `Un domaine imite celui d'une plateforme connue (${quote(m)}). C'est une page d'hameçonnage destinée à capturer vos identifiants ou votre carte bancaire.`,
  },

  // ── Obfuscation ────────────────────────────────────────────────────────
  {
    criterionId: 'text.obfuscation.leetspeak',
    patterns: [
      /\b[a-z]*[0-9]{1,2}[a-z]+[0-9]{1,2}[a-z]*\b(?![0-9])/,
      /\bwh4ts?app\b/,
      /\bp4iement\b/,
      /\bv1rement\b/,
      /\bc0ntact\b/,
    ],
    saturateAt: 3,
    explain: (m) =>
      `Des mots sont volontairement déformés (${quote(m)}). Cette substitution de caractères sert à passer sous les filtres automatiques de la plateforme.`,
  },
  {
    criterionId: 'text.obfuscation.spelled_contact',
    patterns: [
      /\b(zero|un|deux|trois|quatre|cinq|six|sept|huit|neuf)([ .-]?(zero|un|deux|trois|quatre|cinq|six|sept|huit|neuf)){6,}\b/,
      /\b\w+ ?\(a\) ?\w+ ?\(point\) ?\w+\b/,
      /\barobase\b/,
      /\b\w+ ?at ?\w+ ?dot ?\w+\b/,
    ],
    explain: (m) =>
      `Des coordonnées sont écrites en toutes lettres pour contourner la détection (${quote(m)}). Un vendeur qui n'a rien à cacher utilise la messagerie intégrée.`,
  },

  // ── Signaux positifs ───────────────────────────────────────────────────
  {
    criterionId: 'text.positive.invoice_available',
    patterns: [
      /\b(facture|ticket de caisse|justificatif d'achat|bon de garantie) (d'origine |originale |disponible|fournie?|incluse?|sur demande)\b/,
      /\bavec (sa |la )?facture\b/,
    ],
    explain: (m) =>
      `Le vendeur mentionne un justificatif d'achat (${quote(m)}). C'est un élément vérifiable qui joue nettement en faveur de l'annonce.`,
  },
  {
    criterionId: 'text.positive.serial_number',
    patterns: [
      /\b(numero de serie|imei|vin|numero de chassis|serial)\b\s*:?\s*[a-z0-9]{6,}/,
      /\bnumero de serie (visible|communique|sur demande)\b/,
    ],
    explain: (m) =>
      `Un identifiant unique du bien est communiqué (${quote(m)}). Il permet de vérifier l'objet auprès du constructeur ou dans les bases de matériel volé.`,
  },
  {
    criterionId: 'text.positive.defects_disclosed',
    patterns: [
      /\b(petite|legere|quelques) (rayure|trace|usure|marque|eraflure)s?\b/,
      /\b(defaut|defauts) (visible|signale|a noter|sur les photos)\b/,
      /\betat d'usage\b/,
      /\bvisible sur (la|les) photos?\b/,
      /\bhonnetement,? (il y a|le|la)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Le vendeur signale spontanément des défauts (${quote(m)}). Les annonces frauduleuses décrivent presque toujours un bien parfait : cette transparence est rassurante.`,
  },
  {
    criterionId: 'text.positive.meeting_offered',
    patterns: [
      /\b(remise en main propre|main propre|sur place|a domicile)\b/,
      /\b(visite|essai|essayer) (possible|sur rendez-vous|bienvenue)\b/,
      /\bvous pouvez (venir|passer) (le |la )?(voir|essayer|tester)\b/,
      /\bpaiement (a la remise|lors de la remise|sur place)\b/,
    ],
    saturateAt: 2,
    explain: (m) =>
      `Une rencontre physique est proposée (${quote(m)}). C'est la meilleure protection possible : l'escroc l'évite systématiquement.`,
  },
  {
    criterionId: 'text.positive.technical_detail',
    patterns: [
      /\b(reference|modele|version|generation)\s*:?\s*[a-z0-9-]{3,}/,
      /\b(achete|acquis) (en|le) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|\d{4})\b/,
      /\b(revision|entretien|carnet|controle technique) (effectue|a jour|fait|ok)\b/,
    ],
    saturateAt: 3,
    explain: (m) =>
      `L'annonce donne des détails techniques précis et vérifiables (${quote(m)}). Ce niveau de précision est rare dans les annonces fabriquées.`,
  },
];

/**
 * Termes signalant que la description a été recopiée d'une fiche produit
 * constructeur plutôt que rédigée par un particulier possédant l'objet.
 */
export const MARKETING_BOILERPLATE: RegExp[] = [
  /\bdecouvrez (le|la|les|notre|un)\b/,
  /\bprofitez d'une experience\b/,
  /\bcombine? (elegance|performance|design) et\b/,
  /\bgrace a (son|sa|ses) (technologie|processeur|systeme)\b/,
  /\bconcu pour (vous|durer|offrir)\b/,
  /\bune experience (utilisateur|immersive|unique)\b/,
  /\ble compagnon ideal\b/,
  /\brepondre a tous vos besoins\b/,
  /\bn'attendez plus\b/,
  /\bcaracteristiques principales\s*:/,
];

/** Tournures typiques d'une traduction automatique depuis l'anglais. */
export const MACHINE_TRANSLATION_MARKERS: RegExp[] = [
  /\bs'il vous plait de\b/,
  /\bje veux vendre mon\b.{0,20}\bparce que je\b/,
  /\bil est en tres bon etat de travail\b/,
  /\bcondition parfaite\b/,
  /\bcontactez moi pour plus d'information\b(?!s)/,
  /\bmerci pour votre comprehension et votre patience\b/,
  /\bje suis desole pour le derangement\b/,
  /\bnous sommes heureux de vous offrir\b/,
  /\bl'article est disponible pour la vente\b/,
];

/**
 * Formules d'ouverture et de transition caractéristiques d'un texte produit
 * par un modèle de langage. Prises isolément elles ne prouvent rien ; c'est
 * leur accumulation, croisée avec la régularité du rythme, qui fait signal.
 */
export const AI_STYLE_MARKERS: RegExp[] = [
  /\bil est important de noter que\b/,
  /\ben resume,?\b/,
  /\bque demander de plus\b/,
  /\bn'hesitez pas a me contacter pour (toute|plus d')\b/,
  /\bcet article (allie|combine|offre) (a la fois )?\b/,
  /\bideal pour (les amateurs|ceux qui|toute personne)\b/,
  /\bque vous soyez .{3,30} ou .{3,30},\b/,
  /\bpoints? forts? ?:/,
  /\ben conclusion\b/,
  /\bplongez dans\b/,
];

export type ConditionLevel = 'new' | 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Mots-clés d'état, utilisés pour croiser l'état déclaré avec le prix et
 * détecter les contradictions internes (« neuf » + « quelques rayures »).
 */
export const CONDITION_TERMS: Record<ConditionLevel, RegExp[]> = {
  new: [
    /\bneuf\b/,
    /\bjamais (servi|utilise|porte)\b/,
    /\bsous blister\b/,
    /\bemballage d'origine\b/,
  ],
  excellent: [/\bcomme neuf\b/, /\bexcellent etat\b/, /\bparfait etat\b/, /\bimpeccable\b/],
  good: [/\btres bon etat\b/, /\bbon etat\b/, /\bbien entretenu\b/],
  fair: [/\betat correct\b/, /\betat d'usage\b/, /\bquelques (rayures|traces|marques)\b/],
  poor: [/\bpour pieces\b/, /\bhs\b/, /\bne fonctionne pas\b/, /\ba reparer\b/, /\bendommage\b/],
};
