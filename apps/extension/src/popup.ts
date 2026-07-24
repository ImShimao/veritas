/**
 * Popup de l'extension — l'interface complète, en autonome.
 *
 * Elle capture la page ouverte, demande au service worker de l'analyser
 * (moteur embarqué, aucun serveur), puis affiche le rapport : verdict, scores,
 * constats, recommandations, questions à poser, et un assistant conversationnel.
 * Tout se passe dans le navigateur, rien ne sort de la machine.
 */
import { formatMoney, type AnalysisReport, type ChatMessage, type Finding } from '@veritas/core';
import { renderMarkdown, sendMessage, VERDICT_COLOR, verdictLabel, escapeHtml } from './shared';
import type { UpdateState } from './version-check';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Élément #${id} introuvable`);
  return el;
};

function show(state: 'idle' | 'loading' | 'error' | 'report'): void {
  for (const id of ['idle', 'loading', 'error', 'report']) {
    $(id).classList.toggle('hidden', id !== state);
  }
}

// ── Capture de la page active ──────────────────────────────────────────

async function capturePage(): Promise<{ url: string; html: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Aucun onglet actif.');

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'VERITAS_CAPTURE' });
    if (response?.ok) return response.payload;
  } catch {
    // Content script non injecté (page hors des domaines déclarés) : injection ponctuelle.
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ url: location.href, html: document.documentElement.outerHTML }),
  });
  const result = results[0]?.result;
  if (!result) throw new Error('Impossible de lire le contenu de la page.');
  return result as { url: string; html: string };
}

// ── Analyse ────────────────────────────────────────────────────────────

let currentReport: AnalysisReport | null = null;

async function analyze(): Promise<void> {
  show('loading');
  try {
    const page = await capturePage();
    const response = await sendMessage<{ ok: boolean; report?: AnalysisReport; error?: string }>({
      type: 'CAPTURE_AND_ANALYZE',
      payload: page,
    });
    if (!response.ok || !response.report) throw new Error(response.error ?? 'Analyse impossible.');
    currentReport = response.report;
    renderReport(response.report);
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  }
}

function renderError(message: string): void {
  show('error');
  $('error-message').textContent = message;
}

// ── Rendu du rapport ───────────────────────────────────────────────────

function renderReport(report: AnalysisReport): void {
  show('report');
  const color = VERDICT_COLOR[report.verdict];

  // En-tête verdict + scores.
  const ring = $('risk-ring');
  ring.style.borderColor = color;
  ring.style.color = color;
  $('risk-value').textContent = String(report.scores.risk);

  const badge = $('verdict-badge');
  badge.textContent = verdictLabel(report.verdict);
  badge.style.background = `color-mix(in srgb, ${color} 15%, transparent)`;
  badge.style.color = color;

  $('report-title').textContent = report.listing.title || 'Annonce sans titre';
  $('report-trust').textContent = `${report.scores.trust}`;
  $('report-auth').textContent = `${report.scores.authenticity}`;
  $('report-meta').textContent =
    `${report.criteriaEvaluated} critères · ${report.findings.length} constats · fiabilité ${Math.round(report.metaConfidence * 100)} %`;

  $('report-summary').textContent = report.summary;

  renderPrice(report);
  renderFindings(report.findings);
  renderRecommendations(report);
  renderQuestions(report.questionsForSeller);
  setupFeedback(report.id);
  setupChat(report);

  $('report').scrollTop = 0;
}

/** Bloc « prix » : repères chiffrés (neuf / occasion) et recherches de comparaison. */
function renderPrice(report: AnalysisReport): void {
  const el = $('price');
  const price = report.price;
  if (!price || (!price.newPrice && !price.usedRange && !price.searchLinks?.length)) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const c = price.currency;
  const estimated = price.referenceQuality === 'estimated';

  const tiles: string[] = [
    `<div class="ptile accent"><span>Prix demandé</span><b>${escapeHtml(formatMoney(price.observed, c))}</b></div>`,
  ];
  if (price.newPrice) {
    tiles.push(
      `<div class="ptile"><span>Neuf ${estimated ? '~' : 'réf.'}</span><b>${escapeHtml(formatMoney(price.newPrice, c))}</b></div>`,
    );
  }
  if (price.usedRange) {
    tiles.push(
      `<div class="ptile"><span>Occasion</span><b>${escapeHtml(formatMoney(price.usedRange.low, c))}–${escapeHtml(formatMoney(price.usedRange.high, c))}</b></div>`,
    );
  }

  const links = (price.searchLinks ?? [])
    .map(
      (l) =>
        `<a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.engine)}</a>`,
    )
    .join('');

  el.innerHTML =
    `<div class="price-head"><h3 class="section-title">Prix</h3>${estimated ? '<span class="est-badge">estimation</span>' : ''}</div>` +
    `<div class="ptiles">${tiles.join('')}</div>` +
    (links ? `<div class="price-links"><span>Comparer :</span>${links}</div>` : '');
}

function renderFindings(findings: Finding[]): void {
  const container = $('findings');
  container.innerHTML = '';
  const negatives = findings.filter((f) => f.polarity === 'negative');
  const positives = findings.filter((f) => f.polarity === 'positive').slice(0, 4);

  for (const finding of [...negatives, ...positives]) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `finding sev-${finding.severity} pol-${finding.polarity}`;
    const icon =
      finding.polarity === 'positive'
        ? '✓'
        : finding.severity === 'critical'
          ? '✕'
          : finding.severity === 'high'
            ? '!'
            : '·';
    item.innerHTML =
      `<span class="fi-icon">${icon}</span>` +
      `<span class="fi-body"><span class="fi-label">${escapeHtml(finding.label)}</span>` +
      `<span class="fi-explain">${escapeHtml(finding.explanation)}</span></span>`;
    item.addEventListener('click', () => item.classList.toggle('expanded'));
    container.appendChild(item);
  }
}

function renderRecommendations(report: AnalysisReport): void {
  const container = $('recommendations');
  container.innerHTML = '';
  for (const rec of report.recommendations.slice(0, 5)) {
    const item = document.createElement('div');
    item.className = `reco prio-${rec.priority}`;
    item.innerHTML = `<strong>${escapeHtml(rec.title)}</strong><p>${escapeHtml(rec.detail)}</p>`;
    container.appendChild(item);
  }
}

function renderQuestions(questions: string[]): void {
  const list = $('questions');
  list.innerHTML = '';
  questions.forEach((q, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${q}`;
    list.appendChild(li);
  });
  const copyBtn = $('copy-questions') as HTMLButtonElement;
  copyBtn.onclick = () => {
    void navigator.clipboard
      .writeText(questions.map((q, i) => `${i + 1}. ${q}`).join('\n'))
      .then(() => {
        copyBtn.textContent = 'Copié';
        setTimeout(() => (copyBtn.textContent = 'Copier'), 1500);
      })
      .catch(() => undefined);
  };
}

function setupFeedback(analysisId: string): void {
  const wrap = $('feedback');
  wrap.classList.remove('hidden');
  wrap.innerHTML =
    '<span class="fb-label">C\'était :</span>' +
    '<button type="button" id="fb-scam" class="fb-btn">une arnaque</button>' +
    '<button type="button" id="fb-legit" class="fb-btn">honnête</button>';
  const done = (msg: string) => (wrap.innerHTML = `<span class="fb-thanks">${msg}</span>`);
  $('fb-scam').addEventListener('click', () => {
    void sendMessage({ type: 'FEEDBACK', analysisId, outcome: 'scam' });
    done('Merci — le moteur renforce les critères concernés.');
  });
  $('fb-legit').addEventListener('click', () => {
    void sendMessage({ type: 'FEEDBACK', analysisId, outcome: 'legitimate' });
    done('Merci — le moteur atténue les fausses alertes.');
  });
}

// ── Assistant conversationnel ──────────────────────────────────────────

function setupChat(report: AnalysisReport): void {
  const log = $('chat-log');
  log.innerHTML = '';
  const suggestionsBar = $('chat-suggestions');

  const starters = [
    'Est-ce que tu achèterais ?',
    'Quels sont les risques ?',
    'Pourquoi ce score ?',
    'Rédige un message au vendeur',
  ];
  renderSuggestions(starters);

  function renderSuggestions(items: readonly string[]): void {
    suggestionsBar.innerHTML = '';
    for (const s of items) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = s;
      chip.addEventListener('click', () => void ask(s));
      suggestionsBar.appendChild(chip);
    }
  }

  function appendMessage(
    role: 'user' | 'assistant',
    content: string,
    attachment?: ChatMessage['attachment'],
  ): void {
    const bubble = document.createElement('div');
    bubble.className = `msg ${role}`;
    bubble.innerHTML = role === 'assistant' ? renderMarkdown(content) : escapeHtml(content);
    if (attachment) {
      const box = document.createElement('div');
      box.className = 'attachment';
      box.innerHTML = `<div class="att-title">${escapeHtml(attachment.title)}</div><pre>${escapeHtml(attachment.body)}</pre><button type="button" class="att-copy">Copier</button>`;
      box.querySelector('.att-copy')?.addEventListener('click', () => {
        void navigator.clipboard.writeText(attachment.body).catch(() => undefined);
      });
      bubble.appendChild(box);
    }
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  }

  let busy = false;
  async function ask(question: string): Promise<void> {
    if (busy || !question.trim()) return;
    busy = true;
    input.value = '';
    appendMessage('user', question);

    const typing = document.createElement('div');
    typing.className = 'msg assistant typing';
    typing.textContent = '…';
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;

    try {
      const response = await sendMessage<{ message?: ChatMessage; error?: string }>({
        type: 'CHAT',
        analysisId: report.id,
        question,
      });
      typing.remove();
      if (response.message) {
        appendMessage('assistant', response.message.content, response.message.attachment);
        if (response.message.suggestions?.length) renderSuggestions(response.message.suggestions);
      } else {
        appendMessage('assistant', response.error ?? "Je n'ai pas pu répondre.");
      }
    } catch (error) {
      typing.remove();
      appendMessage('assistant', error instanceof Error ? error.message : 'Erreur.');
    } finally {
      busy = false;
    }
  }

  const input = $('chat-input') as HTMLTextAreaElement;
  const sendBtn = $('chat-send') as HTMLButtonElement;
  input.onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void ask(input.value);
    }
  };
  sendBtn.onclick = () => void ask(input.value);
}

// ── Bandeau de mise à jour ─────────────────────────────────────────────

async function checkUpdate(): Promise<void> {
  try {
    const state = await sendMessage<UpdateState>({ type: 'CHECK_UPDATE' });
    if (state.updateAvailable && state.latestVersion) {
      const banner = $('update-banner');
      banner.classList.remove('hidden');
      $('update-text').textContent = `Version ${state.latestVersion} disponible`;
      ($('update-link') as HTMLAnchorElement).href = state.releaseUrl;
    }
  } catch {
    /* Vérification silencieuse. */
  }
}

// ── Réglages ───────────────────────────────────────────────────────────

async function setupSettings(): Promise<void> {
  const panel = $('settings');
  $('settings-toggle').addEventListener('click', () => panel.classList.toggle('hidden'));

  const identity = await sendMessage<{ name: string; criteria: number; brain: string }>({
    type: 'IDENTITY',
  });
  $('about').textContent =
    `${identity.name} · ${identity.criteria} critères · ${identity.brain} · v${chrome.runtime.getManifest().version}`;

  $('check-update-now').addEventListener('click', async () => {
    const btn = $('check-update-now');
    btn.textContent = 'Vérification…';
    const state = await sendMessage<UpdateState>({ type: 'CHECK_UPDATE', force: true });
    btn.textContent = state.updateAvailable
      ? `Version ${state.latestVersion} disponible !`
      : 'Vous êtes à jour';
    if (state.updateAvailable) await checkUpdate();
  });
}

// ── Démarrage ──────────────────────────────────────────────────────────

$('analyze').addEventListener('click', () => void analyze());
$('retry').addEventListener('click', () => void analyze());

void setupSettings();
void checkUpdate();
show('idle');
