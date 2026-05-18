// Radio Extra-BRUT(es) — plan de tag Umami pour la page post-festival.
//
// Script classic (pas de module), à charger en `defer` APRÈS le snippet Umami.
// Fail-safe : si `umami` est absent (bloqueur de pub, offline, domaine non
// autorisé), aucune erreur ne remonte et la page continue de fonctionner.
//
// Événements émis (uniquement) :
//   - share_click     (clic sur un bouton de partage, propriétés : source + channel)
//   - schedule_view   (section programme visible à 50 %, propriétés : source + day)
//
// La page post-festival n'a plus de player ni d'embed : aucun event
// lié à la lecture audio ou à l'intégration partenaire n'est émis.

(function () {
  'use strict';

  // La page after est servie comme home, jamais embeddée : source figée.
  var SOURCE = 'site';

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
  // share_click — clic sur un bouton de partage social
  // ============================================================
  // Délégation sur document : robuste à toute reconfiguration des boutons.
  function initShareTracking() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-track="share"]');
      if (!t) return;
      track('share_click', { channel: t.getAttribute('data-channel') || '' });
    });
  }

  // ============================================================
  // schedule_view — section programme visible à 50 %, par jour
  // ============================================================
  // La grille est statique côté page after (pas de rendu dynamique) : les
  // <article data-track="schedule" data-day="..."> sont présents dès le
  // chargement, on observe directement sans MutationObserver.
  //
  // Dédup : une seule émission par valeur de `day` sur la session.
  var seenDays = Object.create(null);

  function initScheduleTracking() {
    if (typeof IntersectionObserver === 'undefined') return;
    var els = document.querySelectorAll('[data-track="schedule"][data-day]');
    if (!els.length) return;

    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.isIntersecting) continue;
        var day = entry.target.getAttribute('data-day') || '';
        if (!day || seenDays[day]) {
          io.unobserve(entry.target);
          continue;
        }
        seenDays[day] = true;
        track('schedule_view', { day: day });
        io.unobserve(entry.target);
      }
    }, { threshold: 0.5 });

    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  }

  // ============================================================
  // Init
  // ============================================================
  function init() {
    initShareTracking();
    initScheduleTracking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
