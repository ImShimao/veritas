/**
 * Script de contenu Veritas.
 *
 * Il s'exécute dans la page ouverte par l'utilisateur. Deux rôles :
 *   1. fournir le HTML de la page au reste de l'extension (message VERITAS_CAPTURE) ;
 *   2. proposer un bouton flottant « Analyser » qui déclenche une analyse
 *      **entièrement locale** (le moteur tourne dans l'extension, aucun serveur)
 *      et affiche le verdict directement sur la page.
 *
 * L'affichage utilise un Shadow DOM pour être totalement isolé du style du site.
 */

(function () {
  'use strict';
  if (window.__veritasInjected) return;
  window.__veritasInjected = true;

  const BUTTON_ID = 'veritas-fab-host';

  function capturePage() {
    return { url: location.href, html: document.documentElement.outerHTML };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'VERITAS_CAPTURE') {
      try {
        sendResponse({ ok: true, payload: capturePage() });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    }
  });

  const VERDICTS = {
    safe: { label: 'Fiable', color: '#159160' },
    likely_safe: { label: 'Probablement fiable', color: '#159160' },
    caution: { label: 'Prudence', color: '#c1800c' },
    risky: { label: 'Risqué', color: '#d66018' },
    dangerous: { label: 'Danger', color: '#ce2e2e' },
  };

  // Conteneur isolé pour le bouton et la carte de résultat.
  const host = document.createElement('div');
  host.id = BUTTON_ID;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .fab {
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
        display: inline-flex; align-items: center; gap: 8px;
        padding: 10px 16px; border-radius: 9999px; border: none;
        background: #3b5cf6; color: #fff; cursor: pointer;
        font: 600 14px system-ui, sans-serif;
        box-shadow: 0 8px 24px -6px rgba(59,92,246,.5);
        transition: transform .15s ease;
      }
      .fab:hover { transform: translateY(-2px); }
      .fab:disabled { opacity: .7; cursor: default; }
      .card {
        position: fixed; bottom: 72px; right: 20px; z-index: 2147483647;
        width: 300px; padding: 14px; border-radius: 14px;
        background: #16181e; color: #f1f3f7;
        font: 13px/1.5 system-ui, sans-serif;
        box-shadow: 0 16px 48px -12px rgba(0,0,0,.5);
        border: 1px solid #262a33;
      }
      .card.hidden { display: none; }
      .row { display: flex; align-items: center; gap: 10px; }
      .ring {
        width: 48px; height: 48px; flex-shrink: 0; border-radius: 50%;
        border: 4px solid; display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 16px;
      }
      .badge { font-weight: 700; font-size: 13px; }
      .title { font-size: 12px; color: #9aa1af; margin-top: 2px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .hl { margin-top: 10px; font-size: 12px; }
      .hl div { display: flex; gap: 6px; margin-top: 4px; color: #c5cad4; }
      .actions { margin-top: 12px; display: flex; gap: 8px; }
      .btn { flex: 1; padding: 7px; border-radius: 8px; border: none; cursor: pointer;
        font: 600 12px system-ui, sans-serif; }
      .btn-p { background: #3b5cf6; color: #fff; }
      .btn-s { background: #1f232b; color: #f1f3f7; border: 1px solid #262a33; }
      .close { position: absolute; top: 8px; right: 10px; cursor: pointer; color: #6a7180;
        background: none; border: none; font-size: 16px; }
    </style>
    <button class="fab" id="fab">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span id="fab-label">Analyser</span>
    </button>
    <div class="card hidden" id="card"></div>
  `;

  const fab = root.getElementById('fab');
  const fabLabel = root.getElementById('fab-label');
  const card = root.getElementById('card');

  fab.addEventListener('click', () => {
    fab.disabled = true;
    fabLabel.textContent = 'Analyse…';
    chrome.runtime.sendMessage(
      { type: 'CAPTURE_AND_ANALYZE', payload: capturePage() },
      (response) => {
        fab.disabled = false;
        fabLabel.textContent = 'Analyser';
        if (chrome.runtime.lastError || !response?.ok || !response.report) {
          renderCard(null, chrome.runtime.lastError?.message || response?.error);
        } else {
          renderCard(response.report);
        }
      },
    );
  });

  function renderCard(report, error) {
    card.classList.remove('hidden');
    if (!report) {
      card.innerHTML = `<button class="close">×</button><b>Analyse impossible</b><p class="title">${escapeHtml(error || 'Erreur inconnue.')}</p>`;
      card.querySelector('.close').addEventListener('click', () => card.classList.add('hidden'));
      return;
    }
    const v = VERDICTS[report.verdict] || VERDICTS.caution;
    const negatives = report.findings.filter((f) => f.polarity === 'negative').slice(0, 3);
    card.innerHTML = `
      <button class="close">×</button>
      <div class="row">
        <div class="ring" style="border-color:${v.color};color:${v.color}">${report.scores.risk}</div>
        <div>
          <div class="badge" style="color:${v.color}">${v.label}</div>
          <div class="title">${escapeHtml(report.listing.title || 'Annonce')}</div>
        </div>
      </div>
      <div class="hl">${negatives.map((f) => `<div>⚠️ ${escapeHtml(f.label)}</div>`).join('') || '<div>✓ Aucun signal négatif majeur</div>'}</div>
      <div class="actions">
        <button class="btn btn-s" id="c-close">Fermer</button>
      </div>`;
    card.querySelector('.close').addEventListener('click', () => card.classList.add('hidden'));
    card.querySelector('#c-close').addEventListener('click', () => card.classList.add('hidden'));
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  if (document.body) document.body.appendChild(host);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(host));
})();
