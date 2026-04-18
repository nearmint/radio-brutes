// Radio Extra-BRUT(es) — plan de tag Umami.
//
// Script classic (pas de module), à charger en `defer` APRÈS le snippet Umami.
// Fail-safe : si `umami` est absent (bloqueur de pub, offline, domaine non
// autorisé), aucune erreur ne remonte et la page continue de fonctionner.
//
// Événements émis :
//   - player_play          (1× par session, propriétés : source)
//   - player_listen_30s    (à 30 s d'écoute effective cumulée, source)
//   - player_listen_5min   (à 300 s d'écoute effective cumulée, source)
//   - stream_url_copy      (clic copie URL MP3, source + context)
//   - embed_code_copy      (clic copie code iframe, source)
//   - schedule_view        (section programme visible à 50 %, source + day)
//   - share_click          (clic bouton partage social, source + channel)

(function () {
  'use strict';

  // ---- Source : site (page principale) ou embed (iframe) ----
  // Calculé une fois au chargement. `window.self !== window.top` → iframe.
  // try/catch pour couvrir le cas où l'accès à window.top lève SecurityError
  // dans un contexte cross-origin verrouillé ; fallback sur 'embed'.
  var SOURCE;
  try {
    SOURCE = (window.self !== window.top) ? 'embed' : 'site';
  } catch (e) {
    SOURCE = 'embed';
  }

  // ---- Wrapper umami.track : injecte `source`, avale les erreurs ----
  function track(name, props) {
    try {
      if (typeof umami === 'undefined' || !umami || typeof umami.track !== 'function') return;
      var data = { source: SOURCE };
      if (props) {
        for (var k in props) {
          if (Object.prototype.hasOwnProperty.call(props, k)) data[k] = props[k];
        }
      }
      umami.track(name, data);
    } catch (e) {
      // silencieux : le tracking ne doit jamais casser la page
    }
  }

  // ============================================================
  // Player : player_play (1×) + paliers 30 s / 5 min
  // ============================================================
  // "Écoute effective" : on incrémente uniquement pendant la lecture, via un
  // setInterval actif entre `play` et `pause`/`ended`. Ne compte pas le temps
  // absolu passé sur la page ; buffering compris dans la lecture (spec).
  function initPlayerTracking(audioEl) {
    if (!audioEl) return;

    var played   = false;  // player_play déjà émis ?
    var hit30    = false;  // palier 30 s atteint ?
    var hit5min  = false;  // palier 5 min atteint ?
    var elapsed  = 0;      // secondes d'écoute effective cumulées
    var tickId   = null;   // id du setInterval (null quand arrêté)

    function startTick() {
      if (tickId !== null) return;
      tickId = setInterval(function () {
        elapsed += 1;
        if (!hit30 && elapsed >= 30) {
          hit30 = true;
          track('player_listen_30s');
        }
        if (!hit5min && elapsed >= 300) {
          hit5min = true;
          track('player_listen_5min');
          // Tous les paliers atteints : on coupe le timer pour économiser.
          stopTick();
        }
      }, 1000);
    }
    function stopTick() {
      if (tickId === null) return;
      clearInterval(tickId);
      tickId = null;
    }

    audioEl.addEventListener('play', function () {
      if (!played) {
        played = true;
        track('player_play');
      }
      startTick();
    });
    audioEl.addEventListener('pause', stopTick);
    audioEl.addEventListener('ended', stopTick);
  }

  // ============================================================
  // Copy buttons : stream_url_copy / embed_code_copy
  // ============================================================
  // Délégation sur document : robuste aux boutons ajoutés/remplacés après
  // coup (ex. modal lazy-rendered). Le tracking se déclenche au clic, sans
  // attendre le résultat réel de la copie (l'utilisateur a exprimé l'intent).
  function initCopyTracking() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest(
        '[data-track="stream_url_copy"], [data-track="embed_code_copy"]'
      );
      if (!t) return;
      var name = t.getAttribute('data-track');
      if (name === 'stream_url_copy') {
        track('stream_url_copy', { context: t.getAttribute('data-context') || '' });
      } else {
        track('embed_code_copy');
      }
    });
  }

  // ============================================================
  // Schedule : schedule_view par jour (samedi / dimanche)
  // ============================================================
  // Le programme est rendu dynamiquement par app.js / waiting.js après un
  // fetch CSV : les <article data-day="..."> n'existent pas à DOMContentLoaded.
  // On expose window.__trackingRefreshSchedule() que les modules de rendu
  // appellent à la fin de renderSchedule(). Plus simple et déterministe qu'un
  // MutationObserver permanent.
  //
  // Dédup : une seule émission par valeur de `day` sur la session.
  var scheduleIO   = null;
  var seenDays     = Object.create(null);
  var observedEls  = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  function ensureScheduleObserver() {
    if (scheduleIO !== null) return scheduleIO;
    if (typeof IntersectionObserver === 'undefined') return null;
    scheduleIO = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.isIntersecting) continue;
        var day = entry.target.getAttribute('data-day') || '';
        if (!day || seenDays[day]) {
          scheduleIO.unobserve(entry.target);
          continue;
        }
        seenDays[day] = true;
        track('schedule_view', { day: day });
        scheduleIO.unobserve(entry.target);
      }
    }, { threshold: 0.5 });
    return scheduleIO;
  }

  function refreshScheduleObserver() {
    var io = ensureScheduleObserver();
    if (!io) return;
    var els = document.querySelectorAll('[data-track="schedule"][data-day]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (observedEls && observedEls.has(el)) continue;
      if (observedEls) observedEls.add(el);
      io.observe(el);
    }
  }

  // API globale exposée aux modules de rendu dynamique (app.js, waiting.js).
  window.__trackingRefreshSchedule = refreshScheduleObserver;

  // ============================================================
  // Share : clic sur bouton de partage social
  // ============================================================
  function initShareTracking() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-track="share"]');
      if (!t) return;
      track('share_click', { channel: t.getAttribute('data-channel') || '' });
    });
  }

  // ============================================================
  // Init global
  // ============================================================
  function init() {
    initPlayerTracking(document.querySelector('[data-track="player"]'));
    initCopyTracking();
    initShareTracking();
    // Premier passage : utile si du contenu schedule est déjà dans le DOM
    // (pas le cas ici mais sans coût) ; les rendus dynamiques rappelleront
    // window.__trackingRefreshSchedule() après leur propre renderSchedule().
    refreshScheduleObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
