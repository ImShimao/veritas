// @ts-check
'use strict';

/**
 * Processus principal de l'application de bureau Veritas.
 *
 * Il démarre le serveur Veritas **à l'intérieur de son propre processus**
 * (aucun terminal, aucun Node système requis : Electron embarque le sien),
 * puis ouvre une fenêtre native sur l'interface servie localement.
 *
 * Conséquence directe du principe « 100 % local » : rien n'écoute sur le
 * réseau au-delà de la boucle locale, et aucune donnée ne sort de la machine.
 *
 * Ce fichier est en CommonJS volontairement : pas d'étape de compilation pour
 * le point d'entrée, une pièce mobile de moins dans l'empaquetage. Seul le
 * serveur est pré-bundlé (`build/server.mjs`).
 */

const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');

/**
 * Mise à jour automatique depuis les Releases GitHub (ImShimao/veritas).
 *
 * Au lancement, l'application vérifie discrètement s'il existe une version plus
 * récente. Si oui, elle la télécharge en arrière-plan et propose de l'installer :
 * l'utilisateur choisit « Redémarrer maintenant » ou « Plus tard » (installée au
 * prochain arrêt). Rien n'est imposé, rien ne se fait à son insu.
 */
function setupAutoUpdate() {
  // Jamais en développement (pas de version installée à comparer).
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return; // electron-updater absent : on ignore silencieusement.
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    void dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Redémarrer maintenant', 'Plus tard'],
        defaultId: 0,
        cancelId: 1,
        title: 'Mise à jour de Veritas',
        message: `La version ${info.version} est prête.`,
        detail: 'Redémarrez pour l’installer, ou elle s’installera au prochain arrêt.',
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
  });

  // Les erreurs de mise à jour (hors ligne, pas de release) ne doivent jamais
  // gêner l'utilisateur : on les journalise sans les afficher.
  autoUpdater.on('error', (error) => console.warn('Mise à jour :', error?.message ?? error));

  autoUpdater.checkForUpdates().catch(() => undefined);
}

/** Une seule instance : un second lancement ramène la fenêtre existante. */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {{ shutdown: () => Promise<void> } | null} */
let serverHandle = null;

/** Trouve un port libre sur la boucle locale. */
function findFreePort(preferred) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(findFreePort(0)));
    server.listen(preferred, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : preferred;
      server.close(() => resolve(port));
    });
  });
}

/** Démarre le serveur Veritas embarqué et retourne son port. */
async function startServer() {
  const port = await findFreePort(4317);
  const isPackaged = app.isPackaged;

  // En production empaquetée, le serveur bundlé et le build web vivent dans
  // les ressources en lecture seule ; les données vont dans le dossier
  // utilisateur, seul emplacement inscriptible.
  const resourcesRoot = isPackaged ? process.resourcesPath : path.join(__dirname, 'build');
  const webDir = path.join(resourcesRoot, 'web');
  const serverEntry = path.join(resourcesRoot, 'server.cjs');

  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  process.env.NODE_ENV = 'production';
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'data');
  process.env.WEB_DIR = webDir;
  process.env.CORS_ORIGINS = `http://127.0.0.1:${port}`;
  // Autorise la génération locale de la clé de chiffrement (voir config.ts).
  process.env.VERITAS_ALLOW_GENERATED_KEY = 'true';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

  // Import dynamique du serveur ESM pré-bundlé depuis ce module CommonJS.
  const { buildServer } = await import(pathToFileURL(serverEntry).href);
  const application = await buildServer();
  await application.app.listen({ port, host: '127.0.0.1' });
  serverHandle = application;

  return port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0d0e12',
    show: false,
    autoHideMenuBar: true,
    title: 'Veritas',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      // L'interface n'a besoin d'aucun pont Node : on garde l'isolation maximale.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Évite un flash blanc au démarrage : on n'affiche qu'une fois le rendu prêt.
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Les liens externes (annonces, recherche d'image inversée) s'ouvrent dans
  // le navigateur du système, jamais dans une fenêtre de l'application.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith(`http://localhost`)) {
      return { action: 'allow' };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Empêche une navigation qui quitterait l'application locale.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  // Menu minimal : l'interface porte sa propre navigation.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Veritas',
        submenu: [
          { role: 'reload', label: 'Recharger' },
          { role: 'toggleDevTools', label: 'Outils de développement' },
          { type: 'separator' },
          { role: 'quit', label: 'Quitter' },
        ],
      },
      {
        label: 'Édition',
        submenu: [
          { role: 'cut', label: 'Couper' },
          { role: 'copy', label: 'Copier' },
          { role: 'paste', label: 'Coller' },
          { role: 'selectAll', label: 'Tout sélectionner' },
        ],
      },
    ]),
  );

  try {
    const port = await startServer();
    createWindow(port);
    setupAutoUpdate();
  } catch (error) {
    dialog.showErrorBox(
      'Veritas — échec du démarrage',
      `Le moteur d'analyse n'a pas pu démarrer.\n\n${error instanceof Error ? error.stack || error.message : String(error)}`,
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverHandle) {
      // macOS : recréer la fenêtre si l'app est réactivée sans fenêtre.
      void findFreePort(4317).then(() => mainWindow || createWindow(Number(process.env.PORT)));
    }
  });
});

app.on('window-all-closed', () => {
  // Sur Windows/Linux, fermer la fenêtre quitte l'application.
  if (process.platform !== 'darwin') app.quit();
});

// Sauvegarde propre des données avant de quitter (écritures différées).
app.on('before-quit', async (event) => {
  if (serverHandle) {
    event.preventDefault();
    const handle = serverHandle;
    serverHandle = null;
    try {
      await handle.shutdown();
    } catch {
      /* On quitte de toute façon. */
    }
    app.quit();
  }
});
