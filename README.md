# Veritas

**Analyse de confiance des annonces en ligne.** Collez un lien, un texte ou des
photos ; Veritas passe l'annonce au crible de **150 critères pondérés**, attribue
un score de risque, et **explique chacune de ses conclusions** avec une preuve
citable. Détection d'arnaques, d'incohérences et de risques avant l'achat.

> **100 % local, aucune clé d'API.** Le moteur d'analyse tourne intégralement sur
> votre machine. Aucune annonce, aucune photo, aucune question ne transite par un
> service tiers. C'est un choix d'architecture, pas une option.

## Télécharger

Depuis la page [**Releases**](https://github.com/ImShimao/veritas/releases) :

| Format                    | Fichier                               | Pour                                    |
| ------------------------- | ------------------------------------- | --------------------------------------- |
| **Installeur Windows**    | `Veritas-Setup-x.y.z.exe`             | Installer l'application (menu Démarrer) |
| **Portable Windows**      | `Veritas-Portable-x.y.z.exe`          | Lancer sans installer                   |
| **Extension Chrome/Edge** | `veritas-extension-chrome-x.y.z.zip`  | Charger dans le navigateur              |
| **Extension Firefox**     | `veritas-extension-firefox-x.y.z.zip` | Charger dans Firefox                    |

**Mises à jour automatiques.** L'application installée vérifie GitHub au
lancement et propose d'installer toute nouvelle version. L'extension signale les
nouvelles versions par une pastille sur son icône. Chacun a ses propres données,
localement.

---

## Ce que Veritas analyse

| Dimension        | Exemples de signaux                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rédaction**    | Urgence artificielle, prétextes récurrents (militaire à l'étranger…), contradictions internes, texte généré ou traduit automatiquement, coordonnées masquées, manipulation psychologique |
| **Prix**         | Comparaison au marché après correction de l'âge et de l'état, décote inexpliquée, prix incohérent avec le kilométrage, devise incohérente                                                |
| **Photos**       | Captures d'écran déguisées, recompressions, retouches (analyse ELA), métadonnées EXIF, photos réutilisées d'une annonce à l'autre, liens de recherche inversée prêts à l'emploi          |
| **Vendeur**      | Ancienneté du compte, avis lissés statistiquement, rythme de publication, cohérence du catalogue, divergences de localisation                                                            |
| **Paiement**     | Moyens irrécupérables, faux séquestres, contournement de la protection plateforme, demandes de données bancaires                                                                         |
| **Recoupements** | Descriptions et photos déjà vues, pseudonymes et coordonnées déjà rencontrés dans votre historique                                                                                       |

Chaque signal produit **un constat expliqué et prouvé** — jamais un score opaque.

## L'IA : Veritas

Veritas n'est pas un habillage de ChatGPT. C'est un **moteur d'analyse
propriétaire, déterministe et explicable** :

- **Il comprend l'annonce** via une chaîne d'analyseurs spécialisés (texte, prix,
  vendeur, image, recoupements, paiement, contexte).
- **Il évalue plusieurs centaines de critères** nommés, documentés et pondérés.
- **Il apprend** de vos retours : chaque « c'était une arnaque » / « c'était
  honnête » recalibre le poids des critères concernés, localement.
- **Il explique chaque décision** : tout point de score remonte à un critère
  précis, appuyé sur un extrait exact de l'annonce.
- **Il conserve un historique** chiffré, qui alimente la détection de contenus
  recyclés.

L'assistant conversationnel s'appuie **intégralement** sur le rapport déjà
calculé : il sélectionne et met en mots des constats qui existent, il n'invente
rien. Il ne peut donc pas halluciner sur une annonce. Une couche facultative
permet de brancher un modèle **auto-hébergé** (Ollama) pour reformuler les
réponses — toujours sans clé, sans réseau externe, et sans jamais déléguer le
scoring au modèle.

Pourquoi ce nom : _veritas_, « la vérité » en latin.

## Trois façons d'utiliser Veritas

### 1. Application de bureau (recommandé) — un `.exe`, aucun terminal

```bash
npm install
npm run desktop:setup   # installe Electron (une seule fois)
npm run desktop:dist    # produit l'installeur
```

L'installeur apparaît dans `apps/desktop/release/Veritas-Setup-<version>.exe`.
Double-cliquez dessus, suivez l'assistant, et lancez **Veritas** depuis le menu
Démarrer. Tout est embarqué — le moteur d'analyse tourne dans l'application, sur
la boucle locale. Détails : [`apps/desktop/README.md`](apps/desktop/README.md).

### 2. Développement — rechargement à chaud

Prérequis : **Node.js 18.18+** et **npm**.

```bash
npm install
npm run dev
```

- API : http://127.0.0.1:4000/api/v1
- Interface : http://localhost:5173

### 3. Serveur unique — l'API sert aussi l'interface

```bash
npm run start:full      # build web + API auto-suffisante sur un seul port
```

Ouvrez ensuite http://127.0.0.1:4000. Pratique pour un poste partagé ou pour
utiliser l'extension navigateur sans lancer deux serveurs.

Aucune configuration n'est nécessaire dans les trois cas : le serveur démarre
sans fichier `.env`, génère sa clé de chiffrement locale au premier lancement,
et ne requiert **aucune clé d'API**. Pour personnaliser, copiez `.env.example`
vers `.env`.

## Extension navigateur

Analyse en un clic depuis la page d'annonce ouverte, sur Chrome, Edge et Firefox.
**Entièrement autonome** : le moteur d'analyse est embarqué dans l'extension, qui
fonctionne toute seule, sans lancer aucun serveur. Elle lit la page sous votre
propre session — la réponse aux plateformes qui bloquent les robots.

1. Construisez-la : `npm run extension:build` (ou téléchargez le `.zip` depuis
   les [Releases](https://github.com/ImShimao/veritas/releases)).
2. Chargez-la :
   - **Chrome / Edge** : `chrome://extensions` → mode développeur → « Charger
     l'extension non empaquetée » → dossier `apps/extension/dist/chrome`.
   - **Firefox** : `about:debugging` → « Charger un module temporaire » →
     `apps/extension/dist/firefox/manifest.json`.
3. Sur une annonce (Leboncoin, Vinted, eBay, Airbnb…), un bouton **« Analyser »**
   apparaît en bas à droite. Ou cliquez l'icône Veritas dans la barre d'outils
   pour le rapport complet et l'assistant.

Guide complet : [`apps/extension/README.md`](apps/extension/README.md).

## Architecture

Monorepo TypeScript de bout en bout (npm workspaces). Les types sont partagés du
moteur jusqu'à l'interface : un changement de contrat casse la compilation plutôt
que de produire une erreur silencieuse à l'exécution.

```
packages/
  core/         Types, schémas de validation (zod), erreurs, primitives (texte, stats, monnaie)
  engine/       Le moteur Veritas : registre de critères, analyseurs, scoring, apprentissage, vision
  extractors/   Adaptateurs de plateformes (déclaratifs), extraction JSON-LD/OpenGraph, texte libre
  nlu/          Assistant conversationnel local : intentions, réponses ancrées, cerveaux enfichables
apps/
  api/          Serveur Fastify : routes, stockage chiffré, journalisation, surveillance, robots.txt
  web/          Interface React (Vite + Tailwind + Framer Motion), mode clair/sombre
  extension/    Extension MV3 Chrome/Edge/Firefox : bouton « Analyser », popup de rapport
  desktop/      Application de bureau Electron + installeur Windows (.exe)
tests/          Tests Vitest : moteur, extracteurs, NLU, primitives du noyau
```

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour les décisions de
conception détaillées (pourquoi des log-cotes, comment l'apprentissage reste
explicable, comment ajouter une plateforme).

### Principes directeurs

1. **Déterminisme.** À entrée et calibration identiques, sortie identique. C'est
   ce qui rend le produit auditable, testable, et permet de répondre précisément
   à « pourquoi ce score ? ».
2. **Explicabilité.** Aucun point de score n'existe sans un critère nommé et une
   preuve citable. Le registre est la source de vérité.
3. **Isolation des pannes.** L'échec d'un analyseur dégrade l'analyse, il ne
   l'interrompt jamais. Une image inaccessible ne prive pas de l'analyse du prix.
4. **Extensibilité.** Ajouter une plateforme, un critère ou un analyseur ne
   demande aucune modification du cœur.
5. **Honnêteté sur l'incertitude.** Une « fiabilité de l'analyse » distincte du
   verdict indique quand les données sont trop partielles pour conclure.

## Ajouter une plateforme

Une seule entrée dans un tableau — aucun autre fichier à toucher :

```ts
// packages/extractors/src/adapters/platforms.ts
{
  platform: 'ma_plateforme',
  label: 'Ma Plateforme',
  hosts: ['ma-plateforme.fr'],
  selectors: {
    title: ['h1.titre'],
    price: ['.prix'],
    description: ['.description'],
  },
}
```

L'API, l'interface et l'extension la découvrent automatiquement. L'extraction
repose d'abord sur les données structurées (JSON-LD, Open Graph), stables dans le
temps ; les sélecteurs CSS ne sont qu'un filet de sécurité.

## Sécurité et vie privée

- **Traitement local.** Rien ne quitte la machine de l'utilisateur.
- **Chiffrement au repos.** Les analyses sont chiffrées en AES-256-GCM.
- **Journaux expurgés.** Numéros, emails et descriptions sont masqués avant écriture.
- **Politique réseau centralisée.** Délais, taille maximale, refus des adresses
  internes (anti-SSRF), respect de `robots.txt`. Aucun contournement des
  protections anti-robot : l'extension navigateur lit la page sous la session de
  l'utilisateur.

## Scripts

```bash
npm run dev              # API + interface en parallèle
npm run build            # Build de production (API + web)
npm test                 # Tests
npm run typecheck        # Vérification des types (tous les paquets)
npm run lint             # ESLint

npm run extension:build  # Construit l'extension (Chrome + Firefox)
npm run desktop:setup    # Installe Electron (une fois)
npm run desktop:dist     # Installeur + portable Windows
```

## Publier une nouvelle version

Tout est automatisé par GitHub Actions. Pour publier :

```bash
npm run version:set 0.2.0   # aligne toutes les versions
git add -A && git commit -m "Version 0.2.0"
git tag v0.2.0
git push && git push --tags
```

Le workflow [`release.yml`](.github/workflows/release.yml) construit alors
l'installeur, le portable et les extensions, puis les publie dans la Release
GitHub avec le `latest.yml` nécessaire aux mises à jour automatiques. Rien
d'autre à faire.

## Périmètre et limites

Veritas est un **assistant d'aide à la décision**, pas un oracle. Il réduit
fortement le risque, il ne le supprime pas. Deux vérifications restent
irremplaçables et lui échappent par nature : la **recherche d'image inversée**
(les liens sont préparés, la vérification est manuelle) et la **rencontre
physique** avec paiement à la remise. Le moteur le rappelle systématiquement.

Le référentiel de prix embarqué couvre les biens les plus concernés par la
fraude ; il gagne en précision à mesure que votre historique s'étoffe, la
comparaison au marché réel prenant alors le relais.

## Licence

Propriétaire. Tous droits réservés.
