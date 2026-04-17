// Radio Extra-BRUT(es) — logique player, programme et partage
// Tout est vanilla, ES module, sans dépendance.

// =============================================================
// Constantes à ajuster si les URLs changent
// =============================================================
const STREAM_URL         = 'https://stream.grandsoir.co/listen/radio-brutes/radio.mp3';
const NOWPLAYING_API_URL = 'https://stream.grandsoir.co/api/nowplaying/radio-brutes';
// URL de publication du Sheet (Fichier → Partager → Publier sur le Web → CSV).
// NB : on utilise le format /pub?output=csv et PAS /export?format=csv, car ce
// dernier exige que le Sheet soit partagé explicitement ; /pub fonctionne dès
// que le Sheet est publié sur le Web, sans toucher aux partages.
const SCHEDULE_CSV_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQA3QZiRSPpUib3F9v00-pItiXuT6yNuV4KaM-S2EPHpIFVZ4ICq2gAKfmYlEVn4SHhu8WzEPXlEiy/pub?output=csv';
const NOWPLAYING_POLL_MS = 20_000;

// URL publique de la radio (à utiliser pour tous les partages, quelle que soit
// l'URL d'origine) + message partagé sur WhatsApp, Mail et (en clipboard) Instagram.
const SHARE_URL     = 'https://salonbrutes.com/radio';
const SHARE_MESSAGE = `🎙️ Radio Extra-BRUT(es) — la radio en direct du Salon Extra-BRUT(es), le premier salon mi-vins nature / mi-cidres d’auteur·e·s. Les 16 & 17 mai à Regnéville-sur-Mer, face à la Baie de Sienne. À écouter ici : ${SHARE_URL}`;
const SHARE_SUBJECT = 'Radio Extra-BRUT(es) — en direct les 16 & 17 mai';

// =============================================================
// Player
// =============================================================
const audioEl      = document.getElementById('audio-el');
const playBtn      = document.getElementById('play-btn');
const iconPlay     = document.getElementById('icon-play');
const iconPause    = document.getElementById('icon-pause');
const retryBtn     = document.getElementById('retry-btn');
const onairBadge   = document.getElementById('onair-badge');
const onairDot     = document.getElementById('onair-dot');
const onairLabel   = document.getElementById('onair-label');
const npTitle      = document.getElementById('np-title');
const npArtist     = document.getElementById('np-artist');

let isPlaying = false;
let isLoading = false;
// Etat de la derniere reponse API : on l'expose pour que le gestionnaire
// d'erreur audio sache s'il peut proposer un "Reessayer" (uniquement si
// l'API repond — sinon le serveur entier est hors ligne).
let isApiOnAir = false;

function setPlayIcon(playingOrLoading) {
  iconPlay.classList.toggle('hidden', playingOrLoading);
  iconPause.classList.toggle('hidden', !playingOrLoading);
}

function setOnAir(on) {
  isApiOnAir = on;
  if (on) {
    onairBadge.classList.remove('bg-neutral-300');
    onairBadge.classList.add('bg-brutes-red', 'text-white', 'onair-pulse');
    onairDot.classList.remove('bg-neutral-500');
    onairDot.classList.add('bg-white');
    onairLabel.textContent = 'On air';
  } else {
    onairBadge.classList.add('bg-neutral-300');
    onairBadge.classList.remove('bg-brutes-red', 'text-white', 'onair-pulse');
    onairDot.classList.add('bg-neutral-500');
    onairDot.classList.remove('bg-white');
    onairLabel.textContent = 'Off air';
  }
}

function setLoading(loading) {
  isLoading = loading;
  playBtn.classList.toggle('play-loading', loading);
  // En Off Air, l'aria-label "La radio n'est pas en ligne" est maintenu par
  // setPlayDisabled → ne pas l'écraser depuis les événements audio.
  if (!playBtn.classList.contains('play-disabled')) {
    playBtn.setAttribute('aria-label', loading ? 'Connexion au flux…' : (isPlaying ? 'Mettre la radio en pause' : 'Lancer la radio'));
  }
}

function showRetry(show) {
  retryBtn.classList.toggle('hidden', !show);
}

/**
 * Etat visuel + a11y du bouton play en Off Air. CSS .play-disabled bloque
 * pointer-events et met opacity 0.4. aria-disabled + aria-label adaptes.
 */
function setPlayDisabled(disabled) {
  playBtn.classList.toggle('play-disabled', disabled);
  if (disabled) {
    playBtn.setAttribute('aria-disabled', 'true');
    playBtn.setAttribute('aria-label', "La radio n'est pas en ligne");
  } else {
    playBtn.removeAttribute('aria-disabled');
    // Restaure l'aria-label normal selon l'etat courant de lecture.
    playBtn.setAttribute('aria-label', isPlaying ? 'Mettre la radio en pause' : 'Lancer la radio');
  }
}

// =============================================================
// Now playing — affichage enrichi (cas live / playlist / erreur)
// =============================================================
// Liste des sessions du Sheet parsées, partagée entre le rendu du programme
// et le matching live ↔ créneau en cours. Mise à jour par loadSchedule().
let currentSchedule = [];

/**
 * Normalise un `type` de créneau pour l'affichage live (ligne 1).
 * Distinct du TYPE_META utilisé pour les badges de la grille programme.
 */
function formatTypeLive(type) {
  const t = (type || '').toLowerCase().trim();
  switch (t) {
    case 'interview': return 'Interview';
    case 'dj-set':    return 'DJ set';
    case 'concert':   return 'Concert';
    case 'autre':     return 'En direct';
    default:
      if (!t) return 'En direct';
      return t.charAt(0).toUpperCase() + t.slice(1);
  }
}

/**
 * Construit un Date à partir d'une date (YYYY-MM-DD ou DD/MM/YYYY) et d'une
 * heure (HH:MM), en forçant le fuseau Europe/Paris.
 *
 * Hypothèse projet : le salon a lieu en mai 2026 → UTC+2 (CEST). Hardcoder
 * l'offset est acceptable pour ce projet à durée limitée (pas de bascule
 * heure d'été / hiver à gérer).
 */
function buildParisDate(dateStr, timeStr) {
  const d = parseDateYmd(dateStr);
  const t = parseTime(timeStr);
  if (!d || !t) return null;
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const hh = String(t.h).padStart(2, '0');
  const mm = String(t.m).padStart(2, '0');
  return new Date(`${y}-${mo}-${da}T${hh}:${mm}:00+02:00`);
}

/**
 * Retourne le créneau en cours à l'heure `now`, ou null si aucun.
 * Gère le cas d'un créneau qui déborde après minuit (end < begin → +24h).
 */
function getCurrentProgram(schedule, now) {
  if (!Array.isArray(schedule) || schedule.length === 0) return null;
  const ts = now.getTime();
  for (const s of schedule) {
    const start = buildParisDate(s.date, s.begin);
    if (!start) continue;
    let end = s.end ? buildParisDate(s.date, s.end) : null;
    if (!end) continue;
    if (end.getTime() < start.getTime()) {
      // déborde minuit : +24h sur la fin
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
    if (ts >= start.getTime() && ts <= end.getTime()) {
      return { type: s.type, guest: s.guest };
    }
  }
  return null;
}

/**
 * Applique un défilement CSS à la ligne 2 si le texte dépasse la largeur
 * du conteneur. Respecte prefers-reduced-motion (fallback ellipsis via
 * `truncate`). Ne rebuilde le DOM que si le texte a changé, pour éviter
 * les ré-annonces aria-live et les relances d'animation.
 */
const lastMetaText = new Map();
function applyScrollIfNeeded(el, text) {
  const key = el.id || el;
  if (lastMetaText.get(key) === text) return;
  lastMetaText.set(key, text);

  el.classList.remove('np-scrolling');
  el.textContent = text;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return; // fallback ellipsis (truncate reste actif)

  // Mesure synchrone : truncate force overflow:hidden + white-space:nowrap,
  // donc scrollWidth > clientWidth ⇔ le texte déborde.
  const contentWidth = el.scrollWidth;
  if (contentWidth <= el.clientWidth) return;

  el.textContent = '';
  const span = document.createElement('span');
  span.textContent = text;
  span.className = 'np-marquee-track';
  el.appendChild(span);
  el.classList.add('np-scrolling');

  // Vitesse : 40 px/s. Distance totale = largeur conteneur + largeur texte
  // (le texte part de derrière le bord droit, sort par la gauche).
  const totalDistance = el.clientWidth + contentWidth;
  const duration = Math.max(8, totalDistance / 40);
  span.style.setProperty('--np-scroll-duration', `${duration}s`);
}

/**
 * Met à jour les deux lignes de métadonnées selon les règles A/B/C.
 * @param {object|null} data — réponse Azuracast ou null (erreur).
 */
/**
 * Met à jour l'affichage On Air (badge rouge + lecture libre). `data` est
 * garanti non-null : le Cas Off Air est géré directement par setOffAirState
 * depuis le catch de fetchNowPlaying.
 * Règle commune : ligne 1 (npTitle) = info dynamique (gras, peut scroller),
 * ligne 2 (npArtist) = contexte statique (gris).
 */
function updateMeta(data) {
  // Azuracast expose `is_live` au niveau racine (data.live.is_live) selon
  // la version de l'API ; on tolère aussi le niveau imbriqué par sécurité.
  const isLive = data?.live?.is_live === true
              || data?.now_playing?.live?.is_live === true;

  if (isLive) {
    // Cas A — flux live : ligne 1 = `{Type} : {Guest}`
    const program = getCurrentProgram(currentSchedule, new Date());
    if (program) {
      const label = formatTypeLive(program.type);
      applyScrollIfNeeded(npTitle, program.guest ? `${label} : ${program.guest}` : label);
    } else {
      applyScrollIfNeeded(npTitle, 'En direct');
    }
    npArtist.textContent = 'En direct de Regnéville-sur-Mer';
    return;
  }

  // Cas B — playlist AutoDJ : ligne 1 = `{artist} — {title}`
  const song   = data?.now_playing?.song;
  const title  = song?.title?.trim()  || '';
  const artist = song?.artist?.trim() || '';
  let line1;
  if (title && artist) line1 = `${artist} — ${title}`;
  else if (title)      line1 = title;
  else if (artist)     line1 = artist;
  else                 line1 = 'Radio Extra-BRUT(es)';
  applyScrollIfNeeded(npTitle, line1);
  // innerHTML exceptionnel : chaîne 100% statique (pas de donnée utilisateur),
  // on injecte un <a> vers l'Instagram de Grand Soir. Les autres cas (live,
  // off air) restent en textContent.
  npArtist.innerHTML = 'Sélection musicale de <a href="https://www.instagram.com/grandsoirdjs/" target="_blank" rel="noopener noreferrer" class="underline hover:no-underline rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brutes-ink/40">Grand Soir</a>';
}

/**
 * Etat Off Air complet : badge neutre, bouton play désactivé, bouton
 * Réessayer masqué, textes de repli. Appelé à l'init et à chaque échec
 * de polling.
 */
function setOffAirState() {
  setOnAir(false);
  setPlayDisabled(true);
  showRetry(false);
  applyScrollIfNeeded(npTitle, 'Radio Extra-BRUT(es)');
  npArtist.textContent = 'Petite pause, on revient très vite';
}

async function play() {
  try {
    if (!audioEl.src) audioEl.src = STREAM_URL;
    setLoading(true);
    showRetry(false);
    await audioEl.play();
    // onplaying handler prendra le relais
  } catch (err) {
    setLoading(false);
    isPlaying = false;
    setPlayIcon(false);
    playBtn.setAttribute('aria-pressed', 'false');
    // On Air/Off Air est gouverné par l'API, pas par l'audio. Ne pas basculer.
    if (isApiOnAir) showRetry(true);
  }
}

function pause() {
  audioEl.pause();
  // onpause handler prendra le relais
}

playBtn.addEventListener('click', () => {
  if (isPlaying) pause(); else play();
});

retryBtn.addEventListener('click', () => {
  // force un rechargement du flux
  audioEl.src = STREAM_URL + '?t=' + Date.now();
  play();
});

audioEl.addEventListener('playing', () => {
  isPlaying = true;
  setLoading(false);
  setPlayIcon(true);
  // On Air/Off Air géré par le polling API uniquement.
  showRetry(false);
  playBtn.setAttribute('aria-pressed', 'true');
  playBtn.setAttribute('aria-label', 'Mettre la radio en pause');
});

audioEl.addEventListener('pause', () => {
  if (isLoading) return; // pause liée au chargement, ignorer
  isPlaying = false;
  setPlayIcon(false);
  // on ne repasse pas Off air : la radio continue de diffuser,
  // l'utilisateur·rice a juste mis son écoute en pause.
  playBtn.setAttribute('aria-pressed', 'false');
  if (playBtn.classList.contains('play-disabled')) return;
  playBtn.setAttribute('aria-label', 'Lancer la radio');
});

audioEl.addEventListener('error', () => {
  setLoading(false);
  isPlaying = false;
  setPlayIcon(false);
  playBtn.setAttribute('aria-pressed', 'false');
  // On Air/Off Air est gouverné exclusivement par l'API now playing — ne
  // plus basculer sur erreur audio. En revanche, le bouton "Réessayer"
  // n'a de sens que si l'API repond encore (serveur joignable).
  if (isApiOnAir) showRetry(true);
});

audioEl.addEventListener('stalled', () => {
  if (isPlaying) setLoading(true);
});
audioEl.addEventListener('waiting', () => {
  if (isPlaying) setLoading(true);
});
audioEl.addEventListener('canplay', () => {
  if (isPlaying) setLoading(false);
});

// =============================================================
// Now playing (polling)
// =============================================================
async function fetchNowPlaying() {
  try {
    const res = await fetch(NOWPLAYING_API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    // API OK → On Air. Bouton play actif. Meta mises à jour selon is_live.
    setOnAir(true);
    setPlayDisabled(false);
    updateMeta(data);
  } catch {
    // API KO → Off Air complet (bouton grisé, textes de repli).
    setOffAirState();
  }
}

let npIntervalId = null;

function startNowPlayingPolling() {
  if (npIntervalId !== null) return; // déjà actif
  fetchNowPlaying();
  npIntervalId = setInterval(fetchNowPlaying, NOWPLAYING_POLL_MS);
}

function stopNowPlayingPolling() {
  if (npIntervalId === null) return;
  clearInterval(npIntervalId);
  npIntervalId = null;
}

// Le flux audio continue de jouer en arrière-plan : on pause seulement le
// polling de l'API now-playing pour économiser batterie et data 5G quand
// l'onglet est masqué.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stopNowPlayingPolling();
  else startNowPlayingPolling();
});

startNowPlayingPolling();

// =============================================================
// Programme — fetch CSV + parse + rendu
// =============================================================
const scheduleRoot = document.getElementById('schedule-root');

/**
 * Parse un CSV simple en tableau de lignes (chaque ligne = array de champs).
 * Gère les champs entre guillemets avec virgules et guillemets doublés.
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // strip BOM UTF-8 éventuel + normaliser les fins de ligne
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
  }
  // dernière cellule / ligne
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function csvToSessions(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const idx = {
    date:        headers.indexOf('date'),
    begin:       headers.indexOf('begin'),
    end:         headers.indexOf('end'),
    type:        headers.indexOf('type'),
    guest:       headers.indexOf('guest'),
    description: headers.indexOf('description'),
  };
  if (idx.date === -1 || idx.begin === -1) return [];

  return rows.slice(1).map(r => ({
    date:        (r[idx.date] ?? '').trim(),
    begin:       (r[idx.begin] ?? '').trim(),
    end:         idx.end !== -1 ? (r[idx.end] ?? '').trim() : '',
    type:        idx.type !== -1 ? (r[idx.type] ?? '').trim().toLowerCase() : '',
    guest:       idx.guest !== -1 ? (r[idx.guest] ?? '').trim() : '',
    description: idx.description !== -1 ? (r[idx.description] ?? '').trim() : '',
  })).filter(s => s.date && s.begin);
}

function parseDateYmd(s) {
  // accepte YYYY-MM-DD ou DD/MM/YYYY
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function formatDateLong(d) {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

function groupByDay(sessions) {
  const byKey = new Map();
  for (const s of sessions) {
    const d = parseDateYmd(s.date);
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    if (!byKey.has(key)) byKey.set(key, { date: d, items: [] });
    byKey.get(key).items.push(s);
  }
  // tri par jour, puis par heure
  const days = [...byKey.values()].sort((a, b) => a.date - b.date);
  for (const day of days) {
    day.items.sort((a, b) => {
      const ta = parseTime(a.begin), tb = parseTime(b.begin);
      if (!ta || !tb) return 0;
      return (ta.h * 60 + ta.m) - (tb.h * 60 + tb.m);
    });
  }
  return days;
}

const TYPE_META = {
  'interview': { label: 'Interview', cls: 'bg-brutes-red text-white' },
  'dj-set':    { label: 'DJ Set',    cls: 'bg-brutes-teal text-white' },
  'autre':     { label: 'Autre',     cls: 'bg-brutes-ink text-brutes-cream' },
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

function renderSchedule(days) {
  if (days.length === 0) {
    scheduleRoot.innerHTML = `
      <div class="rounded-xl border-2 border-dashed border-brutes-ink/30 p-8 text-center text-brutes-ink/75">
        La programmation sera bientôt annoncée.
      </div>`;
    return;
  }

  const html = days.map(day => {
    const sessions = day.items.map(s => {
      const meta  = TYPE_META[s.type] || { label: s.type || 'Session', cls: 'bg-brutes-ink text-brutes-cream' };
      const end   = s.end ? ` – ${escapeHtml(s.end)}` : '';
      const desc  = s.description
        ? `<p class="mt-1 text-sm text-brutes-ink/70 md:text-base">${escapeHtml(s.description)}</p>`
        : '';
      return `
        <li class="flex flex-col gap-2 border-b-2 border-brutes-ink/10 py-5 md:flex-row md:gap-6">
          <div class="flex shrink-0 items-start gap-3 md:w-60 md:flex-col md:items-start md:gap-2">
            <span class="font-display text-2xl font-extrabold tabular-nums md:whitespace-nowrap md:text-3xl">
              ${escapeHtml(s.begin)}${end}
            </span>
            <span class="inline-flex items-center rounded-full border-2 border-brutes-ink px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${meta.cls}">
              ${escapeHtml(meta.label)}
            </span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-display text-xl font-bold md:text-2xl">
              ${escapeHtml(s.guest || '—')}
            </p>
            ${desc}
          </div>
        </li>`;
    }).join('');

    return `
      <article class="mb-10 last:mb-0">
        <h3 class="font-display text-2xl font-extrabold uppercase tracking-tight text-brutes-teal md:text-3xl">
          ${escapeHtml(formatDateLong(day.date))}
        </h3>
        <ul class="mt-4 border-t-2 border-brutes-ink/10">
          ${sessions}
        </ul>
      </article>`;
  }).join('');

  scheduleRoot.innerHTML = html;
}

let scheduleRetryScheduled = false;

async function loadSchedule() {
  try {
    const res = await fetch(SCHEDULE_CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    const sessions = csvToSessions(rows);
    // Partage de la liste parsée avec le matching live (getCurrentProgram)
    currentSchedule = sessions;
    const days = groupByDay(sessions);
    renderSchedule(days);
    scheduleRetryScheduled = false;
  } catch {
    scheduleRoot.innerHTML = `
      <div class="rounded-xl border-2 border-dashed border-brutes-ink/30 p-8 text-center text-brutes-ink/75">
        La programmation sera bientôt annoncée.
      </div>`;
    // Retry unique 10 s après un échec (blip réseau au chargement).
    // Si le retry échoue aussi, on reste sur le fallback sans boucler.
    if (!scheduleRetryScheduled) {
      scheduleRetryScheduled = true;
      setTimeout(() => { loadSchedule(); }, 10_000);
    }
  } finally {
    // Une fois le rendu fait (succès ou fallback), on enlève l'aria-live :
    // la grille est statique et n'a plus à ré-annoncer son contenu aux
    // lecteurs d'écran.
    scheduleRoot.removeAttribute('aria-live');
  }
}
loadSchedule();

// =============================================================
// Partage + toast
// =============================================================
const toast      = document.getElementById('toast');
const toastInner = document.getElementById('toast-inner');
let toastTimer   = null;

function showToast(message) {
  toastInner.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2400);
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallback */ }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

document.querySelectorAll('.share-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const kind = btn.dataset.share;

    if (kind === 'facebook') {
      // Facebook lit les balises Open Graph de la page cible, le message
      // n'est pas transmis dans l'intent (il sera proposé à l'utilisateur
      // dans le dialogue FB).
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
        '_blank', 'noopener,noreferrer'
      );
    } else if (kind === 'whatsapp') {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(SHARE_MESSAGE)}`,
        '_blank', 'noopener,noreferrer'
      );
    } else if (kind === 'mail') {
      const subject = encodeURIComponent(SHARE_SUBJECT);
      const body    = encodeURIComponent(SHARE_MESSAGE);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    } else if (kind === 'instagram') {
      // Instagram n'a pas d'API de partage web : on copie l'URL pour que
      // l'utilisateur puisse la coller dans un sticker lien de story.
      const ok = await copyToClipboard(SHARE_URL);
      showToast(ok ? 'Lien copié — collez-le dans votre story' : 'Impossible de copier le lien');
    }
  });
});

// =============================================================
// Embed modal (player embed pour les partenaires)
// =============================================================
const embedModal   = document.getElementById('embed-modal');
const embedOpenBtn = document.getElementById('embed-open');
const embedCodeEl  = document.getElementById('embed-code');
const embedCopyBtn = document.getElementById('embed-copy');
const embedContact = document.getElementById('embed-contact');

if (embedModal && embedOpenBtn) {
  const openModal = () => {
    if (typeof embedModal.showModal === 'function') embedModal.showModal();
    else embedModal.setAttribute('open', '');
  };
  const closeModal = () => {
    if (typeof embedModal.close === 'function') embedModal.close();
    else embedModal.removeAttribute('open');
  };

  embedOpenBtn.addEventListener('click', openModal);

  // close on ✕ or on backdrop click (dialog gère déjà ESC)
  embedModal.addEventListener('click', (e) => {
    if (e.target.closest('[data-embed-close]')) { closeModal(); return; }
    // clic sur le backdrop : la cible est le <dialog> lui-même
    if (e.target === embedModal) closeModal();
  });
}

if (embedCopyBtn && embedCodeEl) {
  embedCopyBtn.addEventListener('click', async () => {
    const code = embedCodeEl.textContent;
    const ok = await copyToClipboard(code);
    showToast(ok ? 'Code copié dans le presse-papier' : 'Impossible de copier');
  });
}

if (embedContact) {
  // L'adresse est reconstruite au clic à partir de data-attributes séparés,
  // pour éviter qu'un crawler trouve une chaîne "user@domaine" dans le HTML.
  embedContact.addEventListener('click', () => {
    const { emL, emD, emS } = embedContact.dataset;
    if (!emL || !emD) return;
    const to      = emL + String.fromCharCode(64) + emD; // @ via charCode
    const subject = encodeURIComponent(emS || 'Radio Extra-BRUT(es)');
    window.location.href = `mailto:${to}?subject=${subject}`;
  });
}

// =============================================================
// Reveal on scroll
// =============================================================
function initReveal() {
  const targets = document.querySelectorAll('.reveal');
  if (!targets.length) return;

  const revealAll = () => targets.forEach(el => el.classList.add('is-revealed'));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    revealAll();
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -10% 0px' });

  targets.forEach(el => io.observe(el));

  // Filet de sécurité : si pour une raison quelconque un élément n'a pas
  // été révélé au bout de 2.5 s, on le révèle pour ne jamais laisser de
  // section invisible.
  setTimeout(() => {
    targets.forEach(el => {
      if (!el.classList.contains('is-revealed')) {
        el.classList.add('is-revealed');
      }
    });
  }, 2500);
}
initReveal();

// =============================================================
// Init
// =============================================================
// Par défaut Off Air jusqu'à la première réponse API. Le premier polling
// (lancé par startNowPlayingPolling plus haut) basculera en On Air dès
// succès — généralement < 1 s.
setOffAirState();
