# Veritas — Application de bureau

Veritas empaqueté en application Windows native : un installeur `.exe`, une
icône dans le menu Démarrer, une fenêtre autonome. Aucun terminal, aucun Node à
installer — Electron embarque tout.

Comme le reste de Veritas, **tout tourne en local** : le moteur d'analyse
s'exécute à l'intérieur de l'application, sur la boucle locale (`127.0.0.1`).
Rien ne sort de la machine.

## Pour l'utilisateur final

1. Double-cliquez sur **`Veritas-Setup-0.1.0.exe`**.
2. Suivez l'installeur (vous pouvez choisir le dossier d'installation).
3. Lancez **Veritas** depuis le menu Démarrer ou le raccourci du bureau.

Les analyses sont stockées, chiffrées, dans `%APPDATA%\Veritas`.

## Construire l'installeur

Depuis la racine du dépôt, une seule fois pour installer Electron :

```bash
npm run desktop:setup
```

Puis, pour produire l'installeur :

```bash
npm run desktop:dist
```

Le résultat apparaît dans `apps/desktop/release/` :

- `Veritas-Setup-<version>.exe` — l'installeur NSIS (ce que vous distribuez).

Variantes :

```bash
npm run desktop:portable   # exécutable portable, sans installation
npm run desktop            # lance l'app en développement (build + Electron)
```

## Comment ça marche

```
Veritas.exe (Electron)
├─ processus principal (main.js)
│  ├─ démarre le serveur Veritas dans son propre processus
│  │   (resources/server.cjs — tout le backend bundlé en un fichier)
│  └─ ouvre une fenêtre sur http://127.0.0.1:<port libre>
└─ resources/web — l'interface, servie par le serveur embarqué
```

Le serveur complet (Fastify + moteur + extracteurs + assistant) est pré-bundlé
en **un seul fichier** `server.cjs` par tsup. L'empaquetage n'embarque donc
aucune arborescence `node_modules`.

**Note sur la forensique d'image.** Le module natif `sharp` n'est pas embarqué
dans l'application (un binaire natif complique l'empaquetage et n'est pas
indispensable). L'analyse d'image tourne alors en mode dégradé — empreintes,
dimensions, métadonnées EXIF — ce qui couvre l'essentiel : détection de
captures d'écran, de photos réutilisées et de doublons. L'analyse ELA fine
reste disponible en mode développement (`npm run dev`, avec `sharp` installé).

## Signature de code

L'installeur n'est pas signé numériquement. Au premier lancement, Windows
SmartScreen peut afficher un avertissement « Éditeur inconnu » : cliquez sur
« Informations complémentaires » puis « Exécuter quand même ». Pour une
distribution large, il faudra acquérir un certificat de signature de code et le
renseigner dans la configuration `build.win` de `package.json`.
