// Radio Brut(es) — page d'attente (waiting.html)
// Version allégée d'app.js : pas de player, pas d'API Azuracast.
// Logique incluse : compte à rebours vers l'ouverture du salon,
// chargement du programme depuis le Google Sheet, partage social, reveal on scroll.

// =============================================================
// Constantes
// =============================================================
const SCHEDULE_CSV_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQA3QZiRSPpUib3F9v00-pItiXuT6yNuV4KaM-S2EPHpIFVZ4ICq2gAKfmYlEVn4SHhu8WzEPXlEiy/pub?output=csv';
const SHARE_URL          = 'https://salonbrutes.com/radio';
const SHARE_MESSAGE      = `Radio Extra-BRUT(es), en direct les 16 et 17 mai depuis Regnéville-sur-Mer : ${SHARE_URL}`;
const SHARE_SUBJECT      = 'Radio Extra-BRUT(es) — en direct les 16 et 17 mai';
// Ouverture du salon le samedi 16 mai 2026 à 11h00, heure de Paris.
const COUNTDOWN_TARGET   = new Date('2026-05-16T11:00:00+02:00');

// =============================================================
// Compte à rebours
// =============================================================
const cdDays    = document.querySelector('[data-countdown="days"]');
const cdHours   = document.querySelector('[data-countdown="hours"]');
const cdMinutes = document.querySelector('[data-countdown="minutes"]');
const cdPassed  = document.querySelector('[data-countdown-passed]');
const cdBlocks  = document.querySelectorAll('[data-countdown-block]');

function updateCountdown() {
  const diff = COUNTDOWN_TARGET - new Date();

  if (diff <= 0) {
    if (cdPassed) cdPassed.hidden = false;
    cdBlocks.forEach(el => { el.hidden = true; });
    return;
  }

  const days    = Math.floor(diff / 86_400_000);
  const hours   = Math.floor((diff / 3_600_000) % 24);
  const minutes = Math.floor((diff / 60_000) % 60);

  if (cdDays)    cdDays.textContent    = String(days);
  if (cdHours)   cdHours.textContent   = String(hours).padStart(2, '0');
  if (cdMinutes) cdMinutes.textContent = String(minutes).padStart(2, '0');
}
updateCountdown();
setInterval(updateCountdown, 60 * 1000);

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

    // data-day est utilisé par tracking.js (schedule_view). On ne le pose
    // que pour samedi (6) et dimanche (0), les seuls jours taggués selon
    // la taxonomie ; les autres jours sont ignorés par l'observer.
    const dow = day.date.getDay();
    const dayAttr = dow === 6 ? ' data-day="samedi"' : dow === 0 ? ' data-day="dimanche"' : '';

    return `
      <article class="mb-10 last:mb-0" data-track="schedule"${dayAttr}>
        <h3 class="font-display text-2xl font-extrabold uppercase tracking-tight text-brutes-teal md:text-3xl">
          ${escapeHtml(formatDateLong(day.date))}
        </h3>
        <ul class="mt-4 border-t-2 border-brutes-ink/10">
          ${sessions}
        </ul>
      </article>`;
  }).join('');

  scheduleRoot.innerHTML = html;

  // Notifie tracking.js (s'il est chargé) pour observer les nouveaux
  // articles via IntersectionObserver. Noop si tracking.js est bloqué.
  if (typeof window.__trackingRefreshSchedule === 'function') {
    window.__trackingRefreshSchedule();
  }
}

let scheduleRetryScheduled = false;

async function loadSchedule() {
  try {
    const res = await fetch(SCHEDULE_CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    const sessions = csvToSessions(rows);
    const days = groupByDay(sessions);
    renderSchedule(days);
    scheduleRetryScheduled = false;
  } catch {
    scheduleRoot.innerHTML = `
      <div class="rounded-xl border-2 border-dashed border-brutes-ink/30 p-8 text-center text-brutes-ink/75">
        La programmation sera bientôt annoncée.
      </div>`;
    if (!scheduleRetryScheduled) {
      scheduleRetryScheduled = true;
      setTimeout(() => { loadSchedule(); }, 10_000);
    }
  } finally {
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
      const ok = await copyToClipboard(SHARE_URL);
      showToast(ok ? 'Lien copié — collez-le dans votre story' : 'Impossible de copier le lien');
    }
  });
});

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
