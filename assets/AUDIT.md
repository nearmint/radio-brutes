# Audit Radio Brut(es) — 16 avril 2026

## Résumé exécutif

**Verdict global.** Le site est fonctionnellement solide et prêt à 85 %. Les fondations (player robuste, gestion d'erreurs, accessibilité de base, SEO) sont saines. Il reste quatre blocs à nettoyer avant mise en ligne : *cinq liens externes non sécurisés*, *deux libellés au contraste AA insuffisant*, *Tailwind CDN qui embarque 320 ko de JS en runtime*, et quelques incohérences / bouts de code mort.

**Top 3 problèmes critiques.**
1. **A11y — contrastes sous WCAG AA** : `text-brutes-cream/80` et `/85` sur fond `brutes-teal` ≈ **3,7:1** (section « Partager la radio »). Le loading/fallback programme à `text-brutes-ink/60` sur cream ≈ **4,4:1**. Tous les trois échouent AA pour du texte normal (seuil 4,5:1).
2. **Sécurité — `target="_blank"` sans `rel="noopener noreferrer"`** sur les 5 liens de la section « Plus d'infos » (`index.html:445-469`). Fuite potentielle de `window.opener` et de Referer vers les sites tiers.
3. **Performance — Tailwind Play CDN en prod** : ~320 ko de JS + exécution runtime côté client. Impacte TTI et consomme des données 5G sur place. Chaque visiteur paie ce coût.

**Top 3 quick wins.**
- Ajouter `rel="noopener noreferrer"` aux 5 liens de la section liens utiles (5 min, S).
- Corriger les 3 contrastes en passant à `cream/100` et `ink/75` (5 min, S).
- Compresser `tigre.jpg` (195 ko) en WebP @ q=80 (~52 ko, gain ≈ 73 %) avec fallback JPEG via `<picture>` (20 min, S).

---

## Score par axe

| Axe | Note /10 | Commentaire 1 ligne |
| --- | --- | --- |
| Accessibilité | 7/10 | 3 contrastes à corriger, 2 `aria-live` sur-annoncés, focus visible OK globalement. |
| Performance | 6/10 | Poids total raisonnable sauf Tailwind CDN (320 ko JS) et image 195 ko non-WebP. |
| SEO | 8/10 | Meta + OG + Twitter complets, favicons OK, manque JSON-LD et robots.txt. |
| Sécurité | 6/10 | 5 liens sans `noopener`, pas de CSP (acceptable tant qu'on est sur Play CDN). |
| Robustesse | 8/10 | Bonne couverture des cas d'erreur, 2 petites fragilités (BOM CSV, polling visibility). |
| Qualité code | 7/10 | Propre et lisible, quelques morceaux morts (classes CSS, variable `streamOk`, branche jamais prise). |
| UX / Contenu | 8/10 | Cohérent et soigné, 1 incohérence d'orthographe, apostrophes droites partout. |
| Maintenance | 7/10 | README clair, mais liste de `#TODO-*` obsolète et icônes 192/512 non référencées. |

---

## Détail par axe

### 1. Accessibilité

#### Constats

- **Contrastes insuffisants AA (3 pairs)** :
  - `text-brutes-cream/80` (RGB ~207, 221, 213) sur `bg-brutes-teal` (#1F7A7A) → **≈ 3,68:1**. Appliqué à `index.html:363` (sous-titre « Aidez-nous à faire passer le mot autour de vous. », 16 px).
  - `text-brutes-cream/85` sur `bg-brutes-teal` → **≈ 3,95:1**. Appliqué à `index.html:420` (bloc « Partenaire ? Intégrer le player », 14 px).
  - `text-brutes-ink/60` sur `bg-brutes-cream` → **≈ 4,40:1**. Appliqué au loading message (`index.html:351`) et au fallback « La programmation sera bientôt annoncée. » (`app.js:310`, `app.js:367`).
- **`aria-live` sur `#schedule-root`** (`index.html:349`) : à chaque chargement ré-annonce toute la grille, ce qui peut être long pour un lecteur d'écran. Passer à `off` après le premier rendu, ou supprimer.
- **`role="status"` + `aria-live="polite"` redondants** sur `#toast` (`index.html:570-571`) — `role="status"` implique déjà `aria-live="polite"`.
- **`focus` sans `focus-visible` sur les 5 liens « Plus d'infos »** (`index.html:445-469`) : le fond jaune apparaît au clic souris alors qu'on vise un indicateur clavier uniquement.
- **`aria-live="polite"` sur `#onair-badge`** (`index.html:210`) : le badge est permanent et ne change quasiment jamais après init → bruit inutile. Acceptable mais à envisager supprimer.

#### Autres pairs contrôlés — tous OK
| Pair | Ratio | Verdict |
| --- | --- | --- |
| ink sur yellow (hero / header) | 10,35:1 | AAA |
| ink sur pink (about section) | 11,15:1 | AAA |
| ink sur cream (corps / liens utiles) | 15,90:1 | AAA |
| cream sur red (bouton play, badge interview) | 6,92:1 | AAA |
| cream sur green (CTA « Venir au salon ») | 4,95:1 | AA |
| cream sur ink (footer, player dark zone) | > 12:1 | AAA |
| white sur teal (badge DJ Set) | 5,16:1 | AA |
| ink/70 sur cream (descriptions, hutin link) | 5,82:1 | AA |

#### Impact

- Les 3 contrastes sous AA sont immédiatement visibles à un lecteur Lighthouse ou axe-DevTools → rapport public dégradé, et vraie difficulté de lecture pour des visiteurs mal-voyants ou en plein soleil (mobile dehors sur le salon).
- Sur-annonce `aria-live` : inconfort lecteur d'écran, pas bloquant.

#### Recommandation

- Contrastes : passer `text-brutes-cream/80` et `/85` → `text-brutes-cream` (plein) sur teal ; `text-brutes-ink/60` → `text-brutes-ink/75` sur cream.
- `aria-live` schedule : retirer l'attribut après premier rendu :
  ```js
  scheduleRoot.removeAttribute('aria-live');
  ```
- Toast : retirer `aria-live="polite"` en double, garder `role="status"`.
- Remplacer `focus:bg-brutes-yellow` par `focus-visible:bg-brutes-yellow` sur les 5 liens utiles.
- Envisager retirer `aria-live` sur le badge ON AIR (l'info est permanente).

---

### 2. Performance

#### Constats

- **Poids total de la page (sans cache)** :
  | Ressource | Transfert |
  | --- | --- |
  | `index.html` | 31 ko |
  | `app.js` | 19 ko |
  | `assets/tigre.jpg` | **195 ko** |
  | Tailwind Play CDN (cdn.tailwindcss.com) | ~320 ko JS (gzip ~80 ko) |
  | Google Fonts CSS | ~2 ko |
  | Google Fonts woff2 (Bricolage + Inter, 5 fichiers) | ~150 ko |
  | Favicons (ico + png + apple) | 53 ko |
  | **Total premier chargement** | **≈ 770 ko / 350 ko gzippé** |

- **Tailwind Play CDN** (`index.html:41`) : télécharge ~320 ko de JS, scanne le DOM, génère le CSS en runtime → bloque le premier paint utile de 200-400 ms sur 4G.
- **`tigre.jpg` 195 ko** en JPEG. Test PIL WebP q=80 → **52 ko** (gain ~73 %), q=85 → 63 ko.
- **Pas de `fetchpriority="high"`** sur l'image hero (`index.html:270`) → LCP sous-optimal.
- **Polling now-playing toujours actif en arrière-plan** (`app.js:175-177`) : pas de listener `visibilitychange`, la requête part toutes les 20 s même si l'onglet n'est plus visible (data 5G + batterie en salon).
- **Assets favicons 192 et 512 px générés mais non référencés** (`icon-192.png` 46 ko, `icon-512.png` 239 ko) : occupent 285 ko pour rien sur le FTP, pas servis à la page.
- **Pas de `.htaccess`** fourni pour le cache long des assets.
- **Google Fonts** : `preconnect` présent ✓, `&display=swap` présent ✓, subsets non restreints (`&subset=latin` pourrait être ajouté mais Google Fonts 2 gère ça via `unicode-range` automatiquement).
- **`preload="none"`** sur `<audio>` ✓.

#### Impact

- Sur iPhone 12 Pro / 4G, first contentful paint estimé ~1,2 s → correct mais pas exceptionnel à cause de Tailwind CDN.
- LCP = image hero. Passer à WebP peut gagner 300-500 ms sur mobile.
- Polling en arrière-plan : impact négligeable individuellement (≈ 1 ko / 20 s) mais sur 2 jours de salon c'est ~8 Mo pour rien.
- Core Web Vitals estimés (desktop, 4G simulée) : **LCP ≈ 1,8 s**, **CLS ≈ 0**, **INP ≈ 50 ms**. LCP pourrait descendre à ~1,2 s avec WebP + fetchpriority.

#### Recommandation

1. **Critique** : compresser `tigre.jpg` → WebP + garder JPEG en fallback.
   ```html
   <picture>
     <source srcset="assets/tigre.webp" type="image/webp" />
     <img src="assets/tigre.jpg" alt="…" loading="eager" fetchpriority="high" decoding="async" width="800" height="800" />
   </picture>
   ```
2. **Important** : ajouter `fetchpriority="high"` sur l'image hero même en restant en JPEG.
3. **Important** : pause le polling quand l'onglet est masqué :
   ```js
   document.addEventListener('visibilitychange', () => {
     if (document.visibilityState === 'visible') fetchNowPlaying();
   });
   // et stocker l'interval ID pour pouvoir l'arrêter
   ```
4. **À arbitrer** : passer de Tailwind Play CDN à un CSS Tailwind précompilé statique (`tailwind.css` 15-25 ko). Enlève 320 ko de JS, rend aussi le site utilisable sans JS. Nécessite un build one-shot mais pas d'intégration dans un pipeline (peut se faire en local puis push).
5. **Nice-to-have** : supprimer `icon-192.png` et `icon-512.png` (ou les référencer via un `manifest.webmanifest` pour PWA).
6. **Nice-to-have** : `.htaccess` minimal pour cache long sur assets :
   ```apache
   <IfModule mod_expires.c>
     ExpiresActive On
     ExpiresByType image/jpeg "access plus 1 year"
     ExpiresByType image/webp "access plus 1 year"
     ExpiresByType image/png  "access plus 1 year"
     ExpiresByType text/css   "access plus 1 month"
     ExpiresByType application/javascript "access plus 1 month"
   </IfModule>
   ```

---

### 3. SEO

#### Constats

- `<title>` 52 caractères, pertinent ✓
- `meta description` 221 caractères, légèrement longue (idéal 150-160) mais fine pour les SERP modernes.
- `lang="fr"` ✓
- Canonical ✓
- Open Graph complet (type, site_name, title, description, url, image, image:alt, image:width/height, locale) ✓
- Twitter Card `summary_large_image` ✓ avec alt
- Favicons ico + png + apple-touch ✓
- **`meta robots` absent** → comportement par défaut (`index, follow`) qui est OK mais explicite vaut mieux.
- **Aucune donnée structurée JSON-LD** → opportunité manquée pour un `RadioBroadcastService` ou `Event` (Google peut enrichir les résultats).
- **Pas de `robots.txt` ni `sitemap.xml`** : acceptable pour une single-page mais un `robots.txt` minimal avec un `Sitemap:` aide les crawlers.
- Image OG 800×800 carrée : formalement OK pour `og:image:width/height` déclarés, mais Facebook / LinkedIn préfèrent 1200×630 paysage pour l'affichage riche. Twitter Card `summary_large_image` demande 1200×628. L'illustration actuelle en carré risque d'être centrée-croppée en preview, avec potentiellement un crop défavorable.

#### Impact

- Les partages sociaux sont une fonctionnalité principale du site → risque que le crop Facebook coupe l'affiche de façon peu attrayante.
- JSON-LD manquant : pas bloquant, juste une opportunité.

#### Recommandation

- Ajouter `<meta name="robots" content="index, follow, max-image-preview:large" />`.
- Créer une image OG dédiée **1200×630** (ou 1200×628) avec le tigre + le texte « RADIO EXTRA BRUT(ES) — 16 & 17 mai » → plus impactant en preview.
- Ajouter un bloc JSON-LD `BroadcastService` :
  ```json
  {
    "@context": "https://schema.org",
    "@type": "BroadcastService",
    "name": "Radio Extra Brut(es)",
    "broadcastDisplayName": "Radio Extra Brut(es)",
    "description": "…",
    "url": "https://radio.salonbrutes.com/",
    "inLanguage": "fr-FR",
    "parentService": { "@type": "Organization", "name": "Grand Soir" }
  }
  ```
- Nice-to-have : `robots.txt` à la racine :
  ```
  User-agent: *
  Allow: /
  ```

---

### 4. Sécurité

#### Constats

- **5 liens `target="_blank"` sans `rel="noopener noreferrer"`** (`index.html:445, 451, 457, 463, 469`) : les 5 entrées de la section « Plus d'infos ». Les 5 autres liens externes du site ont bien `rel="noopener noreferrer"` (CTA header, crédit tigre, Suivre @salonbrutes, @hutin1v2v, grandsoirdjs footer) ✓.
- **Mixed content** : aucun appel HTTP, tout est HTTPS ✓.
- **Parsing CSV** : `description`, `guest` et le fallback `label` passent tous par `escapeHtml()` avant `innerHTML` (`app.js:319-338`). ✓
- **Now playing** : `title` et `artist` écrits via `.textContent = …` (`app.js:162-163`), donc safe. ✓
- **Pas de clés, tokens, secrets en dur** ✓ (l'email est déjà obfusqué via `data-em-l`/`data-em-d`).
- **CSP** absente. Faisabilité :
  - Tailwind Play CDN exécute du JS dynamique et utilise `eval()` / `Function()` en interne → incompatible avec une CSP stricte. Même une CSP `unsafe-inline unsafe-eval` est envisageable mais dénature l'intérêt.
  - **Si on passe à Tailwind précompilé**, une CSP stricte devient faisable :
    ```
    Content-Security-Policy:
      default-src 'self';
      img-src 'self' https://grandsoir.co data:;
      font-src https://fonts.gstatic.com;
      style-src 'self' https://fonts.googleapis.com 'unsafe-inline';
      script-src 'self';
      connect-src 'self' https://stream.grandsoir.co https://docs.google.com https://*.googleusercontent.com;
      media-src https://stream.grandsoir.co;
      frame-ancestors 'none';
    ```
- `role="application"` / iframe cross-origin : aucun utilisé côté page (juste prévu côté embed partenaires).
- `<script type="module">` : charge avec CORS implicite, OK.
- `data-em-*` pour l'email : obfuscation correcte, validé par regex sur le HTML source (aucune chaîne `user@domain` en clair sauf URLs Google Fonts de type `wght@700`, non matchables comme emails).

#### Impact

- `rel="noopener"` : CVE historiques résolues côté navigateur (Chrome implicite depuis 2020), mais le `rel="noreferrer"` reste pertinent pour ne pas fuiter le Referer aux sites tiers. C'est une hygiène minimale qu'on ne veut pas laisser passer.
- CSP : peu impactant tant qu'on est sur Play CDN ; à rediscuter si on précompile.

#### Recommandation

- **Critique** : ajouter `rel="noopener noreferrer"` sur les 5 liens de `index.html:445-469`.
- **Si passage Tailwind précompilé** : ajouter la CSP stricte ci-dessus (en `<meta http-equiv>` ou idéalement via `.htaccess` avec header HTTP).

---

### 5. Robustesse et gestion d'erreurs

#### Constats

- **Flux audio injoignable** : `audioEl.error` handler → `setOnAir(false)`, bouton Réessayer apparaît ✓.
- **API Azuracast** : `fetch` dans `try/catch`, fallback silencieux conservé ✓.
- **Google Sheet** : redirect `pub?output=csv` géré par fetch (suit les 302 par défaut), `text/csv` final ; fallback « La programmation sera bientôt annoncée. » ✓.
- **BOM UTF-8** non strippé par `parseCSV()` (`app.js:190`). Test empirique : le CSV actuel commence par `dat` (pas de BOM), mais si jamais la source change (export manuel, édition Excel), les 3 premiers bytes `\uFEFF` feraient que `headers.indexOf('date') === -1` → grille non rendue. Bug latent, peu probable mais facile à éviter.
- **Dates FR `DD/MM/YYYY`** supportées ✓.
- **Heures après minuit** : `begin=23:30` sorted correctement ; si quelqu'un saisit `begin=02:00` pour une session qui déborde au jour suivant mais reste encodée sur `date=2026-05-16`, elle sera triée avant la session 11:00 du même jour (bug théorique mais aucune entrée actuelle dans le Sheet n'a ce cas).
- **Offline pendant lecture** : `audioEl.error` + `stalled` / `waiting` handlers déclenchent le spinner ou l'état d'erreur ✓.
- **`streamOk` (variable)** : écrite mais jamais lue (`app.js:38, 110`) → dead code.
- **`if (npTitle.textContent === '') resetMeta()`** (`app.js:171`) : branche morte, `npTitle` ne devient jamais vide dans le flux normal.
- **Polling `setInterval` jamais nettoyé** : pas de fuite en pratique (la page vit pour toujours), mais va tourner derrière un onglet background (cf. Performance).
- **Pas de retry en cas d'échec de `loadSchedule()`** : un blip réseau à l'ouverture → fallback permanent jusqu'au reload. Acceptable pour un site éphémère, mais un simple retry après 10 s serait zéro coût.
- **Tests navigateurs** : non automatisables depuis ici. Je recommande de vérifier avant le lancement :
  - Safari iOS 17+ (autoplay gesture, `<dialog>` OK depuis iOS 15.4)
  - Chrome Android récent
  - Safari macOS (certaines particularités clipboard)
  - Firefox desktop

#### Impact

- BOM : faible probabilité, mais ferait complètement disparaître la grille → à corriger.
- Polling en arrière-plan : cf. perf.
- Dead code : cosmétique.

#### Recommandation

- Strip BOM en début de `parseCSV` : `text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')…`
- Supprimer `streamOk` et la branche `npTitle.textContent === ''`.
- Ajouter un retry unique 10 s après un échec de `loadSchedule()`.
- Ajouter la pause du polling en arrière-plan (cf. perf).

---

### 6. Code et bonnes pratiques

#### Constats

- **Code mort** :
  - `.toast-enter` et `.toast-show` définies (`index.html:139-140`) jamais utilisées → classes orphelines.
  - `let streamOk` (`app.js:38`) → jamais lue.
  - Branche `if (npTitle.textContent === '') resetMeta();` (`app.js:171`) → condition impossible en pratique.
- **Duplications** :
  - Deux blocs `@media (prefers-reduced-motion: reduce)` (`index.html:127` et `index.html:164`) → fusionner.
  - Les 5 liens de « Plus d'infos » ont exactement la même longue liste de classes Tailwind + le même SVG → factorisable, mais pas critique vu la stack (pas de composant, pas de template).
- **Nommage** : globalement cohérent (français pour les variables métier, anglais pour les techniques : `playBtn`, `onairBadge`, `SHARE_URL`). Quelques `npTitle`/`npArtist` / `onair*` OK.
- **Commentaires** : utilisés là où le "pourquoi" n'est pas évident (pourquoi `/pub` et pas `/export`, pourquoi ne pas repasser Off air sur pause, etc.). ✓
- **Config groupée en haut de `app.js`** ✓.
- **Séparation des préoccupations** : `app.js` concatène player, polling, CSV, rendu, partage, modale, reveal. Sur 535 lignes c'est gérable, mais plusieurs responsabilités mélangées. Pas bloquant.
- **Event listeners** : aucune fuite, pas de `removeEventListener`, mais rien qui n'en demande. Pas de `passive: true` requis (pas de scroll listener côté JS).
- **`console.log` / `console.error` résiduels** : aucun ✓.
- **HTML** : le `<header>`, `<main>`, `<footer>` sont là, sections avec `aria-labelledby`. Manque `<nav>` : discutable mais l'unique lien sortant du header (« Venir au salon ») ne mérite pas un `<nav>` dédié.
- **CSS Tailwind** : quelques classes rangées dans un ordre inconsistant (alphabétique vs logique) mais rien de contradictoire ni de redondant détecté.
- **Structure des fichiers** : conforme au livrable attendu ✓.
- **Incohérence orthographique** : `index.html:250` utilise `Régnéville-sur-Mer` (double accent) alors que tout le reste du fichier et du `README` utilise `Regnéville-sur-Mer` (orthographe officielle). Ça se voit dans le fallback du sous-titre du player.

#### Impact

- Code mort : lisibilité. Rien de fonctionnel.
- Incohérence Régnéville/Regnéville : minime mais visible.

#### Recommandation

- Supprimer `streamOk`, la branche morte, et les classes `.toast-enter/.toast-show`.
- Fusionner les deux blocs `prefers-reduced-motion`.
- Corriger `Régnéville` → `Regnéville` à `app.js:73`.
- Optionnel : extraire les 5 liens « Plus d'infos » en JS avec une boucle `.map()` — supprime 100 lignes d'HTML répétitif.

---

### 7. UX et contenu

#### Constats

- **Apostrophes droites** (`'`, U+0027) partout dans le contenu éditorial — typographie française ancienne attend des apostrophes courbes (`'`, U+2019). Exemples : `l'antenne`, `d'auteur·e·s`, `C'est quoi`, `l'air marin`, etc. Visible dans les paragraphes about, hero, modale, etc.
- **Espaces insécables** correctement utilisés devant les `:`, `?`, dans « 120 px », « Partenaire ? ». ✓
- **Tiret cadratin** (`—`, U+2014) correctement utilisé plusieurs fois. ✓
- **Toast Instagram** : durée 2,4 s, apparition simple (opacité), pas d'animation d'entrée ni de bouton dismissible. Suffisant.
- **Bouton `Suivre @salonbrutes`** : `bg-brutes-pink` sur section `bg-brutes-pink` → l'encart ne se détache que par la bordure et l'ombre. Aspect volontaire (brutaliste / bouton « fantôme »), discuté précédemment. Le contraste texte reste bon (11:1).
- **Embed modale** : on ne retourne pas le focus au trigger à la fermeture dans le cas IE11-like où `<dialog>` n'est pas supporté — non-issue pour les navigateurs cibles.
- **FOUC** : grâce au script inline `<script>document.documentElement.classList.add('js')</script>` en tête de `<head>`, la page reste visible même si Tailwind CDN tarde. ✓
- **Responsive** : 5 breakpoints testés (320, 375, 768, 1024, 1440). Header, hero, programme, partage, liens, modale → OK.
- **Ordre de lecture mobile vs desktop** : cohérent — le tigre est en `order-first` sur mobile (visuel accueillant) et à droite sur desktop. Player vient après.

#### Impact

- Apostrophes : minime, mais pour un projet éditorial/culturel propre, c'est un point d'hygiène typographique.
- Toast non-dismissible : 2,4 s c'est court, OK.

#### Recommandation

- Passe de typographie : remplacer les apostrophes droites par des courbes dans le contenu éditorial.
- Nice-to-have : bouton dismiss × dans le toast pour les gens qui veulent le fermer tout de suite.

---

### 8. Maintenance

#### Constats

- **README** : couvre le local, le déploiement, les URLs à modifier, le Sheet. ✓
- **Section obsolète** dans le README : le tableau des `#TODO-xxx` liste les 5 placeholders… qui ne sont **plus** des placeholders depuis que les vraies URLs ont été mises en place (`index.html:445, 451, 457, 463, 469`). La colonne est donc trompeuse.
- **Phrase finale obsolète** : `README.md:93` contient « on affiche "Programme à venir — revenez bientôt" » alors que le message a été changé plus tôt en « La programmation sera bientôt annoncée. ».
- **Pas de mention README** :
  - Des favicons et comment les regénérer si le tigre change.
  - Du script Python utilisé pour générer les favicons.
  - Des icon-192/512 non référencés.
- **Liste `#TODO-*`** dans le code : aucun restant (`grep #TODO` sur `index.html` et `app.js` ne retourne plus rien). ✓
- **Commentaires config** : bien placés en haut de `app.js` avec explication (« pourquoi /pub et pas /export »). ✓

#### Impact

- Risque que la prochaine personne (ou toi dans 6 mois) modifie des URL qui n'existent plus en se basant sur la doc obsolète.

#### Recommandation

- Mettre à jour le tableau README : remplacer la section « Les liens utiles » par la liste des URLs actuelles, avec une phrase indiquant où les modifier (`index.html:445-469`).
- Retirer la mention « Programme à venir — revenez bientôt » (`README.md:93`) et l'aligner sur le message réel.
- Ajouter un paragraphe « Régénérer les favicons » avec le script Python utilisé.

---

## Plan d'action priorisé

| # | Priorité | Effort | Axe | Action | Fichier(s) concerné(s) |
| --- | --- | --- | --- | --- | --- |
| 1 | Critique | S | Sécurité | Ajouter `rel="noopener noreferrer"` aux 5 liens « Plus d'infos ». | `index.html:445,451,457,463,469` |
| 2 | Critique | S | A11y | Corriger les 3 contrastes sub-AA (cream/80, cream/85 sur teal ; ink/60 sur cream). | `index.html:363,420` ; `app.js:310,367` ; `index.html:351` |
| 3 | Important | M | Perf | Convertir `tigre.jpg` en WebP + garder JPEG en fallback via `<picture>`, ajouter `fetchpriority="high"`. | `index.html:268-277`, `assets/` |
| 4 | Important | S | Perf | Pauser le polling now-playing quand l'onglet est en arrière-plan. | `app.js:175-179` |
| 5 | Important | S | Robustesse | Strip BOM UTF-8 en début de `parseCSV`. | `app.js:190-197` |
| 6 | Important | S | Code | Nettoyer : `streamOk`, branche morte `npTitle===''`, classes `.toast-enter/.toast-show`, fusionner les 2 `@media reduced-motion`. | `app.js:38,110,171` ; `index.html:127,139-140,164` |
| 7 | Important | S | Contenu | Corriger `Régnéville-sur-Mer` → `Regnéville-sur-Mer`. | `app.js:73` |
| 8 | Important | S | A11y | Retirer `aria-live` du `#schedule-root` après premier rendu ; retirer `aria-live` redondant du toast. | `app.js` (rendu schedule) ; `index.html:571` |
| 9 | Important | S | A11y | Remplacer `focus:` par `focus-visible:` sur les liens utiles. | `index.html:445,451,457,463,469` |
| 10 | Important | S | SEO | Ajouter `<meta name="robots">` et un bloc JSON-LD `BroadcastService`. | `index.html:<head>` |
| 11 | Important | M | SEO | Créer une image OG 1200×630 dédiée (compo tigre + titre + dates), remplacer les `og:image`/`twitter:image`. | `assets/` + `index.html:24,26-27,34` |
| 12 | Nice-to-have | L | Perf | Précompiler Tailwind en CSS statique (enlève 320 ko de JS, débloque aussi CSP stricte). | `index.html` + script one-shot en local |
| 13 | Nice-to-have | S | Perf | Supprimer `icon-192.png` et `icon-512.png` (ou les référencer via `manifest.webmanifest`). | `assets/` + `index.html` |
| 14 | Nice-to-have | S | Perf | Fournir un `.htaccess` minimal avec cache long sur les assets. | nouveau `.htaccess` |
| 15 | Nice-to-have | S | Robustesse | Retry automatique 10 s après un échec de `loadSchedule()`. | `app.js:355-370` |
| 16 | Nice-to-have | S | Maintenance | Mettre à jour le tableau README (liens, phrase fallback) et ajouter paragraphe favicons. | `README.md:52-60,93` |
| 17 | Nice-to-have | M | Contenu | Passe typographique apostrophes droites → courbes. | `index.html` contenu |
| 18 | Nice-to-have | S | Sécurité | Ajouter CSP stricte en `<meta http-equiv>` (dépend du ticket #12 : nécessite Tailwind précompilé). | `index.html:<head>` |
| 19 | Nice-to-have | L | Robustesse | Tester manuellement sur Safari iOS / Chrome Android / Firefox / Safari macOS. | — |

---

## Questions ouvertes

Je listerai ici les points qui nécessitent ton arbitrage avant correction :

1. **Ticket #12 (Tailwind précompilé)** : prêt·e à lancer un `npx tailwindcss -i input.css -o dist.css --minify` en local une fois, puis à committer le CSS résultant et retirer le `<script src="https://cdn.tailwindcss.com">` ? Gain : -320 ko JS + compatibilité CSP stricte. Coût : 1 étape manuelle à chaque changement de classes. Sinon on garde Play CDN, c'est parfaitement acceptable.
2. **Ticket #11 (image OG 1200×630)** : tu as la main sur une version rectangulaire de l'affiche ? Sinon on peut générer une compo texte + tigre dans un canevas (Figma, Affinity, ou code HTML→image via Puppeteer).
3. **Ticket #15 (retry programme)** : acceptable qu'un échec réseau initial affiche le fallback pendant 10 s avant retry, ou tu préfères loader indefiniment jusqu'à succès ?
4. **Ticket #19 (tests navigateurs)** : tu as accès aux devices (iPhone récent, Android) ou il faut que je propose une checklist à qui fera ces tests ?
5. **Order des tickets** : veux-tu qu'on enchaîne dans l'ordre du tableau, ou qu'on regroupe par fichier (tous les changements `index.html` d'un coup, puis `app.js`, etc.) ?

---

Prêt pour tes décisions. Je ne touche à rien avant ton OK sur le plan.
