/**
 * Vérification des mises à jour depuis GitHub.
 *
 * Une extension chargée « non empaquetée » ne peut pas se remplacer toute seule
 * — c'est une protection du navigateur. Ce que l'on peut faire, honnêtement,
 * c'est **détecter** qu'une version plus récente existe et le signaler à
 * l'utilisateur avec un lien de téléchargement. C'est ce que fait ce module.
 *
 * Aucune donnée personnelle n'est envoyée : un simple GET public sur l'API des
 * releases GitHub, au plus une fois par jour.
 */

/** Dépôt GitHub officiel du projet. */
export const GITHUB_REPO = 'ImShimao/veritas';

const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // une fois par jour
const STATE_KEY = 'veritas.updateState';

export interface UpdateState {
  lastCheck: number;
  latestVersion?: string;
  updateAvailable: boolean;
  releaseUrl: string;
}

/** Compare deux versions sémantiques « x.y.z ». Retourne >0 si a est plus récent. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Vérifie s'il existe une version plus récente. Ne sollicite GitHub qu'une fois
 * par jour ; sinon renvoie l'état mémorisé.
 */
export async function checkForUpdate(force = false): Promise<UpdateState> {
  const current = chrome.runtime.getManifest().version;
  const stored = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] as UpdateState | undefined;

  if (!force && stored && Date.now() - stored.lastCheck < CHECK_INTERVAL_MS) {
    return stored;
  }

  const state: UpdateState = {
    lastCheck: Date.now(),
    updateAvailable: false,
    releaseUrl: RELEASES_PAGE,
    latestVersion: stored?.latestVersion,
  };

  try {
    const response = await fetch(RELEASES_API, {
      headers: { accept: 'application/vnd.github+json' },
    });
    if (response.ok) {
      const data = (await response.json()) as { tag_name?: string; html_url?: string };
      const latest = data.tag_name?.replace(/^v/, '');
      if (latest) {
        state.latestVersion = latest;
        state.updateAvailable = compareVersions(latest, current) > 0;
        if (data.html_url) state.releaseUrl = data.html_url;
      }
    }
  } catch {
    // Hors ligne ou API indisponible : on garde l'état précédent, sans bruit.
  }

  await chrome.storage.local.set({ [STATE_KEY]: state });

  // Pastille sur l'icône si une mise à jour est disponible.
  try {
    await chrome.action.setBadgeText({ text: state.updateAvailable ? '↑' : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#3b5cf6' });
  } catch {
    /* setBadge indisponible dans certains contextes : sans conséquence. */
  }

  return state;
}
