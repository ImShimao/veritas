/**
 * Utilitaires partagés entre le popup et le service worker de l'extension.
 */
import { VERDICT_PRESENTATION, type Verdict } from '@veritas/core';

/** Envoie un message typé au service worker et attend sa réponse. */
export function sendMessage<T = unknown>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response as T);
    });
  });
}

export const VERDICT_COLOR: Record<Verdict, string> = {
  safe: 'var(--safe)',
  likely_safe: 'var(--safe)',
  caution: 'var(--caution)',
  risky: 'var(--risky)',
  dangerous: 'var(--danger)',
};

export function verdictLabel(verdict: Verdict): string {
  return VERDICT_PRESENTATION[verdict].label;
}

/** Échappe le HTML pour tout texte issu d'une annonce. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rendu Markdown minimal (gras, listes, séparateurs), avec échappement
 * préalable. Identique à celui de l'application web : l'assistant produit
 * exactement ces trois motifs.
 */
export function renderMarkdown(input: string): string {
  const inline = (text: string): string =>
    escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, '<em>$1</em>');

  const lines = input.split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushP = () => {
    if (paragraph.length) {
      html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const flushL = () => {
    if (list.length) {
      html.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^[•—-]\s+(.*)$/.exec(line);
    if (line.trim() === '') {
      flushP();
      flushL();
    } else if (line.trim() === '---') {
      flushP();
      flushL();
      html.push('<hr>');
    } else if (bullet) {
      flushP();
      list.push(bullet[1] ?? '');
    } else {
      flushL();
      paragraph.push(line);
    }
  }
  flushP();
  flushL();
  return html.join('');
}
