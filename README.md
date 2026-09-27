# Radio Extra-BRUT(es)

![GitHub Pages](https://img.shields.io/badge/hosted_on-GitHub_Pages-222222?logo=github&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

The website of Radio Extra-BRUT(es), an ephemeral web radio broadcast live from a natural wine and cider fair in Normandy, built with plain HTML and JavaScript.

Open the page, press play, listen live.

## Features

- **Live player**: streams the radio and shows what is on air, from the AzuraCast Now Playing API
- Schedule loaded from a published Google Sheet, grouped by day
- Embeddable player for partner sites, with one-click iframe code and stream URL
- One page per phase: countdown before the event, live player during, recap after
- Off air state when the stream is down, keyboard and screen reader support, reduced motion support
- Cookieless audience measurement with Umami

## Requirements

- A modern browser
- [Python 3](https://www.python.org/downloads/), or any static file server, to run the site locally

## Installation

```sh
git clone https://github.com/nearmint/radio-brutes.git
cd radio-brutes
python3 -m http.server 8080
```

This serves the site at `http://localhost:8080`. There is no build step. Serve from the repository root, as scripts are loaded with absolute paths.

In production, GitHub Pages serves the repository on the domain set in `CNAME`.

## Usage

| Page | Purpose |
| --- | --- |
| `waiting.html` | Before the event: countdown and schedule |
| `live.html` | During the event: player, schedule, sharing and partner embed |
| `index.html` | After the event: recap and broadcast schedule |
| `embed.html` | Standalone player for partner sites |

To embed the player:

```html
<iframe src="https://radio.salonbrutes.com/embed.html" width="100%" height="144" frameborder="0" title="Radio Extra-BRUT(es) — Lecteur" loading="lazy" allow="autoplay"></iframe>
```

Architecture and analytics are documented in [`docs/architecture.md`](docs/architecture.md) and [`docs/analytics.md`](docs/analytics.md).

## Configuration

Constants are defined at the top of `app.js` and `waiting.js`, and in the inline script of `embed.html`.

| Name | Role | Default |
| --- | --- | --- |
| `STREAM_URL` | MP3 stream played by the player | Radio stream |
| `NOWPLAYING_API_URL` | AzuraCast Now Playing endpoint (`NOWPLAYING_URL` in `embed.html`) | Radio station |
| `SCHEDULE_CSV_URL` | Published Google Sheet, with columns `date`, `begin`, `end`, `type`, `guest`, `description` | Event schedule |
| `NOWPLAYING_POLL_MS` | Now Playing refresh interval in `app.js` | `20000` |
| `POLL_MS` | Now Playing refresh interval in `embed.html` | `60000` |
| `COUNTDOWN_TARGET` | Opening time shown on `waiting.html` | `2026-05-16T11:00:00+02:00` |

## Privacy

- Audience is measured with Umami Cloud: no cookies, no persistent identifier.
- Audio comes from the radio's AzuraCast server, and the schedule from Google Sheets.
- Fonts and Tailwind CSS load from Google Fonts and the Tailwind CDN.

## Contributing

This project is no longer maintained.

## License

[MIT](LICENSE) © 2026 nearmint
