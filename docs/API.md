# API Veritas

Base : `http://127.0.0.1:4000/api/v1`

Toutes les entrées sont validées par un schéma zod (`packages/core/src/schemas.ts`)
avant d'atteindre un service. Les erreurs suivent un format unique :

```json
{
  "error": {
    "code": "FETCH_BLOCKED",
    "message": "Message destiné à l'utilisateur, en français.",
    "hint": "Piste d'action concrète.",
    "details": {}
  }
}
```

Codes de statut : `400` entrée invalide, `404` introuvable, `422` extraction
impossible, `429` débit dépassé, `451` robots.txt, `502/504` récupération,
`503` cerveau indisponible, `500` interne.

---

## Analyses

### `POST /analyses`

Lance une analyse. Fournir **au moins un** de : `url`, `text`, `html`, `images`.

```jsonc
{
  "url": "https://www.leboncoin.fr/...", // optionnel
  "text": "Titre, prix, description...", // optionnel (max 60 000 car.)
  "html": "<html>...</html>", // optionnel (fourni par l'extension)
  "images": ["data:image/jpeg;base64,..."], // optionnel (max 12)
  "platformHint": "leboncoin", // optionnel
  "domainHint": "electronics", // optionnel
  "notes": "Le vendeur veut être payé en cartes cadeaux", // optionnel — contexte
}
```

Réponse `201` : un `AnalysisReport` complet (scores, verdict, constats,
prix, images, recommandations, questions, résumé). Voir le type dans
`packages/core/src/types/analysis.ts`.

### `GET /analyses`

Historique paginé. Query : `limit` (1–100), `offset`, `search`, `verdict`,
`favoritesOnly`. Retourne `{ total, items[] }` (résumés).

### `GET /analyses/:id`

Rapport complet.

### `DELETE /analyses/:id`

Supprime l'analyse, son empreinte, ses conversations et surveillances liées.

### `POST /analyses/:id/favorite`

Bascule le marque-page. Retourne `{ favorite: boolean }`.

### `POST /analyses/compare`

```json
{ "analysisIds": ["an_...", "an_..."] }
```

Deux à cinq analyses. Retourne les tableaux comparatifs, les critères
différenciants, et une recommandation.

### `POST /feedback`

Alimente l'apprentissage.

```json
{
  "analysisId": "an_...",
  "outcome": "scam", // scam | legitimate | unknown
  "agreedFindings": ["text.payment.gift_cards"],
  "disputedFindings": []
}
```

---

## Assistant conversationnel

### `POST /chat`

```json
{
  "analysisId": "an_...",
  "question": "Est-ce que tu achèterais ce produit ?",
  "sessionId": "chat_..."
}
```

`sessionId` est optionnel (une session est créée ou réutilisée). Retourne
`{ sessionId, message }`, le message portant `content`, `intent`,
`citedFindings`, `suggestions`, et éventuellement une `attachment`
(message au vendeur, checklist).

### `GET /chat/:analysisId`

Historique de la conversation : `{ session, starters[], brain }`.

### `DELETE /chat/:analysisId`

Réinitialise la conversation.

---

## Surveillance et alertes

### `POST /watches`

```json
{ "analysisId": "an_...", "intervalMs": 1800000 }
```

Met une annonce (analysée depuis une URL) sous surveillance. Minimum 5 min.

### `GET /watches` · `DELETE /watches/:id` · `POST /watches/run`

Liste, arrête, ou déclenche manuellement un tour de vérification.

### `GET /alerts?unread=true`

Alertes de surveillance : `{ items[], unread }`.

### `POST /alerts/:id/read`

Marque une alerte comme lue.

---

## Métadonnées

### `GET /identity`

Carte d'identité de l'IA : nom, version, nombre de critères, cerveau actif, et
surtout `externalServices: []`, `requiresApiKey: false`, `dataStaysLocal: true`.

### `GET /criteria`

Référentiel complet des critères, avec poids de base et poids effectif après
apprentissage. Alimente la page « Comment ça marche ».

### `GET /platforms`

Plateformes prises en charge.

### `GET /stats` · `GET /learning`

Statistiques de stockage et état de l'apprentissage (échantillons, critères les
plus discriminants).

### `GET /health`

`{ status: "ok", uptimeSeconds }`.

---

## Limitation de débit

60 requêtes par minute par défaut (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`). Les
analyses étant coûteuses en réseau et en calcul, cette limite protège autant le
serveur que les sites interrogés.
