# Analytics & tracking

`index.html` (post-event page) uses `tracking-after.js`, which only emits `share_click` and `schedule_view`.

Audience is measured with [Umami Cloud](https://cloud.umami.is/) (free tier, no cookies). The Umami snippet is loaded on `index.html`, `live.html` and `embed.html`; custom events are centralised in [`tracking.js`](../tracking.js) (vanilla JS, classic script, loaded `defer` right after the Umami snippet on each page).

## Hosting & privacy

Umami runs on **Umami Cloud (free tier)**, not self-hosted. The client snippet is loaded from `https://cloud.umami.is/script.js`.

**Structural privacy guarantees** (by design — not configurable):

- **Cookieless**: a per-day visitor hash is derived from IP + User-Agent + salt + domain, rotated at 00:00 UTC. No cross-day tracking, no persistent identifier.
- **IP never stored**: used only at collection time to generate the hash, then discarded.
- **No extended session tracking** on the free tier.
- **GDPR / CCPA compliant without a cookie banner**, by absence of cookies.

**Partner pitch** (short reusable wording, French — primary audience):

> « On mesure combien de personnes écoutent depuis votre site, pas qui. Pas de cookie, pas d'identifiant, pas de profil utilisateur — juste un compteur d'écoutes agrégé. »

## Event plan

| Event | Trigger | Properties |
|---|---|---|
| `player_play` | First play click (deduped per session) | `source` |
| `player_listen_30s` | 30 s of effective cumulated listening | `source` |
| `player_listen_5min` | 300 s of effective cumulated listening | `source` |
| `stream_url_copy` | Click on MP3 stream URL copy button | `source`, `context` |
| `embed_code_copy` | Click on iframe snippet copy button | `source` |
| `schedule_view` | Schedule day section 50 % in viewport | `source`, `day` |
| `share_click` | Click on a share button | `source`, `channel` |

## Property taxonomy

- `source` — `site` when loaded directly, `embed` when loaded in an iframe (detected once via `window.self !== window.top`, injected automatically by the `track()` wrapper).
- `context` — free-form context for copy events, e.g. `page_partenaires`.
- `day` — `samedi` or `dimanche` only (other days are not tagged).
- `channel` — one of `facebook`, `instagram`, `whatsapp`, `mail`.

## Fail-safe

`track()` is a thin wrapper around `umami.track()`: if `umami` is undefined (ad-blocker, offline, blocked domain) it returns silently. No tracking call can throw into the page.

## Umami configuration

Umami's free plan enforces a domain allow-list on the website settings. Add every origin that may load the snippet:

| Origin | Why |
|---|---|
| `radio.salonbrutes.com` | Main site + embed iframe |
| `salonbrutes.com` | Parent domain (redirects, shared links) |
| `localhost` | Local dev / manual testing |
| Partner origins | One line per partner site embedding the iframe |

> The free tier **does not support wildcards**. Each partner that integrates the iframe must be added explicitly; otherwise Umami rejects the events silently.

## Partner integration — important

Partners must embed `embed.html` **as-is** via the iframe snippet provided on the main site. Copying the internal markup into their own page would:

- break the `source: embed` detection (no iframe boundary)
- bypass the `data-track="player"` attribute if they rewire the `<audio>`
- dilute analytics with their own site's pageviews

The iframe boundary is what makes the tracking boundary meaningful.

## Testing procedure

1. **Local dev** — serve the site (`python3 -m http.server 8080`), open the Umami realtime dashboard, then:
   - Click play → expect `player_play`
   - Let audio run ≥ 30 s / ≥ 5 min → expect `player_listen_30s` / `player_listen_5min`
   - Scroll to the schedule → expect `schedule_view` once per day
   - Click each share button → expect `share_click` with matching `channel`
   - Open the embed modal, click both copy buttons → expect `embed_code_copy` and `stream_url_copy`
2. **Iframe** — embed `embed.html` on a different origin (added to Umami's allow-list), play the stream, confirm events carry `source: embed`.
3. **Fail-safe** — block `cloud.umami.is` in DevTools network tab, reload, interact with the page: no console errors, no uncaught promise rejections.
