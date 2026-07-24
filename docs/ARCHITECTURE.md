# Architecture de Veritas

Ce document explique les décisions de conception qui ne se lisent pas dans le
code. Il s'adresse à quelqu'un qui reprend le projet et se demande _pourquoi_
c'est fait ainsi.

## Vue d'ensemble

```
                 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   URL / texte   │              │     │              │     │              │
   photos / HTML │  extractors  │────▶│    engine    │────▶│     nlu      │
        ─────────▶│  (→ Listing) │     │ (→ Report)   │     │  (→ Réponses)│
                 └──────────────┘     └──────────────┘     └──────────────┘
                         ▲                    ▲                    ▲
                         └────────────────────┴────────────────────┘
                                       core (types partagés)
```

Le flux est unidirectionnel. Chaque étage ne connaît que le contrat de données
défini dans `core` : les extracteurs produisent un `Listing`, le moteur produit
un `AnalysisReport`, l'assistant consomme ce rapport. Aucun étage ne connaît
l'implémentation d'un autre.

## Le moteur : pourquoi ces choix

### Un registre de critères comme source de vérité

Un analyseur ne peut émettre un signal que pour un critère **déclaré** dans le
registre (`packages/engine/src/criteria`). Cette contrainte, vérifiée à
l'exécution et par les tests, garantit qu'aucun point de score n'existe sans une
définition, un libellé et une justification. C'est ce qui rend l'explicabilité
structurelle plutôt que cosmétique : on ne peut pas produire un score sans
produire son explication.

### Agrégation en log-cotes, pas en moyenne pondérée

Le scoring (`packages/engine/src/scoring/aggregator.ts`) accumule les
contributions des signaux en **log-cotes** (log-odds), puis convertit par une
sigmoïde. Deux raisons :

1. **Saturation naturelle.** Le dixième signal négatif d'une annonce déjà
   catastrophique doit peser moins que le premier. Une moyenne pondérée ne
   capture pas cela ; la sigmoïde produit des rendements décroissants aux
   extrêmes, ce qui correspond à la façon dont des indices se combinent
   réellement.
2. **Composition d'indices indépendants.** Ajouter une preuve revient à déplacer
   la conviction d'une quantité fixe en log-cotes — la sémantique correcte pour
   « chaque signal supplémentaire renforce ou affaiblit l'hypothèse ».

Les totaux positifs et négatifs sont en plus **compressés logarithmiquement**
avant agrégation, car les signaux d'une même famille (prix bas + décote
inexpliquée + urgence) sont corrélés : les additionner brutalement surestimerait
la preuve.

### Trois scores, et un quatrième distinct

- **Authenticité** — le bien décrit est-il réel, non copié, non fabriqué ?
- **Confiance** — peut-on se fier à la transaction et au vendeur ?
- **Risque** — probabilité d'issue défavorable.

Ces trois dimensions sont calculées indépendamment. À côté, une **méta-confiance**
mesure la fiabilité de _l'analyse elle-même_ : elle chute quand les données
manquent. Confondre « annonce fiable » et « analyse fiable » serait une faute
grave — une annonce sur laquelle on ne sait presque rien ne peut pas obtenir
97 % de confiance. La méta-confiance basse rétracte les scores vers leur valeur
a priori et interdit un verdict « fiable ».

### Planchers de gravité

Un signal critique isolé — carte cadeau, faux séquestre, domaine sosie — impose
un plancher de risque, quel que soit le reste. Ces schémas n'admettent aucune
explication légitime ; il serait absurde qu'un vendeur bien noté puisse les
compenser.

### La négation

Les motifs du lexique s'appliquent sur du texte normalisé. « Remise en main
propre » figure littéralement dans « **pas de** remise en main propre » et
signifie l'inverse. La fonction `isNegated` (dans `core`) inspecte le contexte
gauche de chaque correspondance ; sans elle, le moteur conclurait le contraire de
ce que dit l'annonce. C'est un bug qu'on n'anticipe qu'après l'avoir vu — les
tests le verrouillent désormais.

## L'apprentissage : léger, local, explicable

`packages/engine/src/learning/calibration.ts` ne contient aucun réseau de
neurones. C'est une **table de comptage** : pour chaque critère, combien de fois
il s'est déclenché sur une annonce confirmée frauduleuse, combien sur une annonce
confirmée légitime. Le rapport de vraisemblance qui en découle multiplie le poids
de base, borné dans `[0.35, 2.2]`.

Conséquences :

- Un critère qui se déclenche autant sur les annonces honnêtes que frauduleuses
  voit son influence **fondre** — il ne discrimine rien.
- On peut toujours répondre à « pourquoi ce poids ? » par un décompte lisible.
- L'ajustement est **atténué** tant que l'échantillon est petit : deux retours ne
  bouleversent pas le modèle.
- L'apprentissage est borné : un critère ne peut ni disparaître ni dominer. Il
  affine, il ne réécrit pas.

La page « Critères » de l'interface expose cette recalibration : l'utilisateur
voit quels critères son usage a renforcés ou affaiblis.

## La vision : dégradation gracieuse

`sharp` (traitement d'image natif) est une dépendance **optionnelle**. Sa
compilation échoue sur certaines plateformes, et il serait absurde qu'une analyse
d'annonce devienne impossible pour cette raison. `packages/engine/src/vision`
charge `sharp` paresseusement ; s'il est absent, l'analyse bascule sur un mode
dégradé (empreinte cryptographique, dimensions lues dans les en-têtes, EXIF) au
lieu d'échouer, et le rapport le signale.

L'empreinte perceptuelle (dHash) est robuste au redimensionnement et à la
recompression — exactement les transformations que subit une photo réutilisée
d'une annonce à l'autre. L'analyse ELA repère les zones recompressées
différemment, mais est rapportée comme un **indice à vérifier**, jamais comme une
preuve : un logo net sur fond lisse produit le même effet qu'un montage.

## Les extracteurs : déclaratifs par défaut

L'immense majorité des plateformes ne diffèrent que par leurs sélecteurs CSS et
leurs noms d'hôtes. Les décrire par des **données** (`PlatformSpec`) plutôt que
par du code rend l'ajout d'une plateforme trivial et évite quatorze fichiers
quasi identiques. Les cas particuliers (données dans un blob JSON embarqué comme
`__NEXT_DATA__` de Leboncoin) sont couverts par une fonction `embeddedJson` sans
sortir du modèle.

L'extraction privilégie **toujours** les données structurées (JSON-LD, Open
Graph) : elles sont publiées volontairement pour la consommation automatisée,
changent bien moins souvent que le HTML, et les exploiter est la voie la plus
respectueuse. Les sélecteurs CSS ne sont qu'un filet de sécurité — un sélecteur
cassé dégrade l'extraction, il ne la fait pas échouer.

## L'assistant : incapable d'halluciner sur une annonce

`packages/nlu` ne génère pas d'opinion. La reconnaissance d'intention est un
score de correspondance pondéré (pas de modèle statistique : domaine fermé,
reconnaissance instantanée, décision explicable). Chaque réponse est produite par
un _responder_ qui **sélectionne et reformule des constats du rapport**. La règle
est absolue : aucune affirmation qui ne provienne du rapport. Quand l'information
n'existe pas, l'assistant le dit — c'est ce qui le distingue d'un modèle qui
improvise avec assurance.

Le `SelfHostedBrain` montre que la couche est enfichable : il transmet à un
modèle local (Ollama) le rapport déjà calculé **et** la réponse de référence, en
lui interdisant d'ajouter des faits. Le scoring n'est jamais délégué au modèle.
Aucune clé, aucun réseau externe, repli silencieux sur le cerveau local si le
modèle est indisponible.

## L'API : politique réseau centralisée

`apps/api/src/services/fetcher.ts` concentre toute la sortie réseau. Le moteur et
les extracteurs ne touchent jamais le réseau eux-mêmes : ils reçoivent une
fonction de récupération. Cela rend la politique (délais, taille maximale, refus
des adresses internes contre le SSRF, `robots.txt`) modifiable en un seul endroit
et testable sans réseau.

Veritas ne contourne **aucune** protection anti-robot. Quand un site bloque, la
réponse est de rediriger vers l'extension navigateur (qui lit la page sous la
session de l'utilisateur) ou le collage de texte. Moins spectaculaire qu'un
contournement, mais tenable et défendable vis-à-vis des plateformes.

## Le stockage : JSON chiffré, interface de dépôt

`apps/api/src/store` persiste en JSON chiffré (AES-256-GCM), avec écriture
atomique (fichier temporaire renommé). Pas de base de données : Veritas tourne
sur la machine de l'utilisateur, imposer un moteur SQL coûterait plus que cela ne
rapporte à cette échelle. L'interface est celle d'un dépôt (`JsonCollection`) :
basculer vers SQLite n'exigera qu'une nouvelle implémentation, sans toucher aux
services.

Seules des **empreintes** alimentent la détection de doublons — jamais le contenu
intégral des annonces précédentes.

## Ce que garantissent les tests

Les tests (`tests/`) ne vérifient pas seulement que « ça marche » ; ils
**verrouillent les invariants** :

- Une annonce manifestement frauduleuse ne peut pas basculer en « prudence » sans
  faire échouer un test.
- Chaque constat est rattaché à un critère déclaré (aucun critère fantôme).
- Le moteur est déterministe (deux analyses identiques → scores identiques).
- La panne d'un analyseur n'interrompt pas l'analyse.
- L'assistant ne cite que des constats qui existent réellement.
- L'apprentissage renforce un critère confirmé, affaiblit un critère contesté, et
  reste borné.
