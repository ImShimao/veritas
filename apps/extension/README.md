# Extension Veritas

Analyse d'annonces en un clic, directement depuis la page — Chrome, Edge et Firefox.

**Entièrement autonome.** Le moteur d'analyse Veritas est embarqué dans
l'extension : elle fonctionne **toute seule**, sans installer ni lancer aucun
serveur. Tout se passe dans votre navigateur, aucune donnée ne quitte votre
machine.

## Installation

### Depuis une Release (recommandé)

1. Téléchargez `veritas-extension-chrome-x.y.z.zip` (ou `-firefox-`) depuis la
   page des [Releases](https://github.com/ImShimao/veritas/releases).
2. Décompressez-le.
3. Chargez-le (voir ci-dessous).

### Depuis les sources

```bash
npm install
npm run extension:build
```

Cela produit `apps/extension/dist/chrome/` et `apps/extension/dist/firefox/`.

### Charger l'extension

- **Chrome / Edge** : `chrome://extensions` → activez le **mode développeur** →
  **« Charger l'extension non empaquetée »** → dossier `apps/extension/dist/chrome`.
- **Firefox** : `about:debugging#/runtime/this-firefox` → **« Charger un module
  temporaire »** → `apps/extension/dist/firefox/manifest.json`.

## Utilisation

- Sur une page d'annonce reconnue (Leboncoin, Vinted, eBay, Airbnb, AutoScout24,
  Back Market…), un bouton flottant **« Analyser »** apparaît en bas à droite.
  Un clic affiche le verdict directement sur la page.
- Ou cliquez sur l'icône Veritas dans la barre d'outils, puis **« Analyser cette
  annonce »** : le popup montre le rapport complet (verdict, constats,
  recommandations, questions à poser) et un **assistant conversationnel**.
- Votre historique, vos favoris et l'apprentissage sont stockés localement, par
  navigateur.

## Mises à jour

À l'ouverture, l'extension vérifie discrètement (une fois par jour) s'il existe
une version plus récente sur GitHub. Le cas échéant, une pastille apparaît sur
l'icône et un bandeau propose de télécharger la nouvelle version.

> Une extension chargée « non empaquetée » ne peut pas se remplacer toute seule
> — c'est une protection du navigateur. L'extension **signale** donc la mise à
> jour et fournit le lien ; il suffit de recharger le dossier mis à jour.

## Architecture

```
src/
  background.ts   Service worker — héberge le moteur, réalise l'analyse
  engine-host.ts  Extraction + analyse + assistant + apprentissage (@veritas/*)
  store.ts        Persistance dans chrome.storage.local
  popup.ts        Interface du popup (rapport complet + chat)
  version-check.ts Détection de nouvelle version (API GitHub)
public/           HTML, CSS, content script, statique
build.mjs         Bundle (esbuild) → dist/chrome et dist/firefox
```

Le moteur (`@veritas/engine`, `@veritas/extractors`, `@veritas/nlu`) est **le
même** que celui de l'application de bureau. Il est bundlé en JavaScript pur —
aucune dépendance Node, aucun serveur. La forensique d'image fine (analyse ELA)
n'est pas disponible dans le navigateur ; le reste du pipeline (texte, prix,
vendeur, recoupements, paiement) tourne pleinement.
