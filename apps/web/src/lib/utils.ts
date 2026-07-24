import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Verdict } from '@veritas/core';

/** Fusionne des classes Tailwind en résolvant les conflits (`p-2` + `p-4` → `p-4`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Jetons de couleur par verdict, pour rester cohérent d'un composant à l'autre. */
export const VERDICT_STYLES: Record<
  Verdict,
  { text: string; bg: string; border: string; ring: string; stroke: string }
> = {
  safe: {
    text: 'text-safe',
    bg: 'bg-safe/10',
    border: 'border-safe/30',
    ring: 'ring-safe/30',
    stroke: 'rgb(var(--safe))',
  },
  likely_safe: {
    text: 'text-safe',
    bg: 'bg-safe/10',
    border: 'border-safe/25',
    ring: 'ring-safe/25',
    stroke: 'rgb(var(--safe))',
  },
  caution: {
    text: 'text-caution',
    bg: 'bg-caution/10',
    border: 'border-caution/30',
    ring: 'ring-caution/30',
    stroke: 'rgb(var(--caution))',
  },
  risky: {
    text: 'text-risky',
    bg: 'bg-risky/10',
    border: 'border-risky/30',
    ring: 'ring-risky/30',
    stroke: 'rgb(var(--risky))',
  },
  dangerous: {
    text: 'text-danger',
    bg: 'bg-danger/10',
    border: 'border-danger/30',
    ring: 'ring-danger/30',
    stroke: 'rgb(var(--danger))',
  },
};

export const SEVERITY_STYLES: Record<string, { text: string; bg: string; label: string }> = {
  critical: { text: 'text-danger', bg: 'bg-danger/10', label: 'Critique' },
  high: { text: 'text-risky', bg: 'bg-risky/10', label: 'Élevé' },
  medium: { text: 'text-caution', bg: 'bg-caution/10', label: 'Moyen' },
  low: { text: 'text-muted', bg: 'bg-elevated', label: 'Faible' },
  info: { text: 'text-faint', bg: 'bg-elevated', label: 'Info' },
};

export const CATEGORY_LABELS: Record<string, string> = {
  listing: "Structure de l'annonce",
  text: 'Rédaction',
  price: 'Prix',
  seller: 'Vendeur',
  image: 'Photos',
  web: 'Recoupements',
  payment: 'Paiement',
  behavior: 'Comportement',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Télécharge le rapport complet en JSON.
 *
 * Un export machine-lisible sert de trace durable — pour un signalement, une
 * plainte, ou simplement pour conserver une preuve de l'état de l'annonce à un
 * instant donné, indépendamment de l'application.
 */
export function exportReportJson(report: { id: string; listing: { title: string } }): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const slug = report.listing.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const link = document.createElement('a');
  link.href = url;
  link.download = `veritas-${slug || 'rapport'}-${report.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Libère l'URL objet après un court délai, le temps que le téléchargement démarre.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Rendu Markdown minimal.
 *
 * L'assistant produit du gras, des listes à puces et des séparateurs — rien de
 * plus. Embarquer une bibliothèque complète pour trois motifs serait
 * disproportionné ; en revanche l'échappement HTML est fait **avant** toute
 * transformation, pour qu'aucun contenu d'annonce ne puisse injecter de balise.
 */
export function renderMarkdown(input: string): string {
  const escape = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Le gras et l'italique sont appliqués APRÈS échappement, donc sur du texte
  // sûr : aucun contenu d'annonce ne peut introduire de balise.
  const inline = (text: string): string =>
    escape(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, '<em>$1</em>');

  const lines = input.split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${paragraph.map(inline).join('<br />')}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bullet = /^[•—-]\s+(.*)$/.exec(line);

    if (line.trim() === '') {
      // Ligne vide : ferme le bloc courant.
      flushParagraph();
      flushList();
    } else if (line.trim() === '---') {
      flushParagraph();
      flushList();
      html.push('<hr />');
    } else if (bullet) {
      flushParagraph();
      list.push(bullet[1] ?? '');
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  return html.join('');
}
