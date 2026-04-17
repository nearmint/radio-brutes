# Radio Extra-BRUT(es)

Page web de la radio éphémère du **Salon Extra-BRUT(es) #5** (16–17 mai 2026, Regnéville-sur-Mer).

Site statique : HTML + Tailwind (CDN) + JS vanilla. Aucune dépendance à installer.

## Structure

```
radio-brutes/
├── index.html                Page unique
├── app.js                    Player, polling now playing, chargement programme, partage, modale embed
├── .htaccess                 Cache long assets + compression gzip + redirect HTTPS (mutualisé Apache)
├── assets/
│   ├── tigre.jpg             Illustration hero, fallback JPEG
│   ├── tigre.webp            Illustration hero, version WebP (-74 % vs JPEG)
│   ├── favicon.ico           16/32/48, tête de tigre recadrée
│   ├── favicon-32.png        Favicon 32 px pour navigateurs modernes
│   └── apple-touch-icon.png  Icône iOS 180×180
└── README.md
```

## Tester en local

```bash
cd radio-brutes
python3 -m http.server 8000
# ouvrir http://localhost:8000
```

Un serveur HTTP est nécessaire (les ES modules et le `fetch()` CSV ne fonctionnent pas avec `file://`).

## Publier

Envoyer le dossier tel quel sur `radio.salonbrutes.com`. Tous les chemins sont relatifs, rien à ajuster côté hébergement. Aucun build, aucune étape de compilation.

## Où modifier quoi

### Les URLs du flux et de l'API

En haut de [`app.js`](app.js) :

```js
const STREAM_URL         = 'https://stream.grandsoir.co/listen/radio-brutes/radio.mp3';
const NOWPLAYING_API_URL = 'https://stream.grandsoir.co/api/nowplaying/radio-brutes';
const SCHEDULE_CSV_URL   = 'https://docs.google.com/spreadsheets/d/e/<PUB_ID>/pub?output=csv';
const NOWPLAYING_POLL_MS = 20_000;
```

- `STREAM_URL` : le flux MP3 Azuracast.
- `NOWPLAYING_API_URL` : l'API JSON Azuracast. Si elle renvoie une erreur, la zone « now playing » retombe silencieusement sur le texte par défaut.
- `SCHEDULE_CSV_URL` : le Google Sheet publié en CSV (voir plus bas).
- `NOWPLAYING_POLL_MS` : intervalle de polling (20 s par défaut).

### Les liens « Plus d’infos »

Les 5 liens de la section **Plus d’infos** sont définis dans [`index.html`](index.html) aux lignes 445-469. Ils pointent actuellement vers :

| Libellé                    | URL actuelle                                                          |
|----------------------------|------------------------------------------------------------------------|
| Infos pratiques du salon   | `https://www.salonbrutes.com/infos-pratiques-1`                        |
| Exposants                  | `https://www.salonbrutes.com/exposants-extra-brutes-2026`              |
| À propos de Brut(es)       | `https://www.salonbrutes.com/copie-de-c-est-quoi-c-est-qui`            |
| Contact                    | `https://www.salonbrutes.com/contact`                                  |
| Instagram @salonbrutes     | `https://www.instagram.com/salonbrutes/`                               |

Éditer directement les `href` dans `index.html` pour les ajuster.

## Publier le Google Sheet

1. Créer un Google Sheet avec ces colonnes en première ligne :

   | date       | begin | end   | type      | guest         | description                    |
   |------------|-------|-------|-----------|---------------|--------------------------------|
   | 2026-05-16 | 14:30 | 15:15 | interview | Domaine X     | Vigneron·ne en Loire           |
   | 2026-05-16 | 18:00 | 20:00 | dj-set    | DJ Trempette  | Set d'apéro                    |

2. Ouvrir `Fichier` → `Partager` → **Publier sur le Web**, choisir la feuille concernée, format **Valeurs séparées par des virgules (.csv)**, et cliquer sur **Publier**. C'est ce qui rend le Sheet lisible par la page sans authentification.

3. L'URL renvoyée est de la forme&nbsp;:

   ```
   https://docs.google.com/spreadsheets/d/e/<PUB_ID>/pub?output=csv
   ```

   où `<PUB_ID>` est un long identifiant qui commence par `2PACX-`. Copier cette URL dans `SCHEDULE_CSV_URL` en haut de `app.js`. **⚠️ Ne pas confondre** avec l'URL `…/export?format=csv&gid=0` (export direct, qui exige un partage « tous les utilisateurs disposant du lien » et renvoie sinon une page de login).

4. Les modifications du Sheet sont reflétées sur le site après quelques minutes (Google re-publie). La page elle-même utilise `cache: 'no-store'` donc pas de cache côté client.

5. Si le Sheet est vide (hors en-têtes) ou inaccessible, la section affiche automatiquement «&nbsp;La programmation sera bientôt annoncée.&nbsp;»

### Colonnes — notes

- `date` : `YYYY-MM-DD` ou `DD/MM/YYYY`.
- `begin` / `end` : `HH:MM` (24 h). `end` est optionnel.
- `type` : `interview`, `dj-set` ou `autre` (contrôle la couleur du badge).
- `guest` : libellé affiché en gros.
- `description` : texte libre, peut rester vide.

Les lignes vides sont ignorées. Si le Sheet est vide ou le fetch échoue, on affiche «&nbsp;La programmation sera bientôt annoncée.&nbsp;» Un retry unique est planifié 10 s après un échec pour absorber un blip réseau au chargement.

## Régénérer les favicons

Les favicons sont dérivés d’un recadrage serré sur le tigre (et `apple-touch-icon.png` d’un recadrage plus large). Pour les régénérer après une mise à jour de `tigre.jpg` :

```python
from PIL import Image
src = Image.open('assets/tigre.jpg').convert('RGB')
w, h = src.size

# apple-touch-icon (180×180) : recadrage carré centré large
side = min(w, h)
sq = src.crop(((w - side) // 2, (h - side) // 2,
               (w - side) // 2 + side, (h - side) // 2 + side))
sq.resize((180, 180), Image.LANCZOS).save('assets/apple-touch-icon.png', optimize=True)

# favicon.ico + favicon-32.png : recadrage serré sur la tête
cx, cy = w * 0.50, h * 0.42
side = int(min(w, h) * 0.62)
tight = src.crop((int(cx - side / 2), int(cy - side / 2),
                  int(cx - side / 2) + side, int(cy - side / 2) + side))
tight.save('assets/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
tight.resize((32, 32), Image.LANCZOS).save('assets/favicon-32.png', optimize=True)
```

Nécessite `pip install Pillow`.

## Régénérer `tigre.webp`

Si `tigre.jpg` est mis à jour, regénérer la version WebP servie en priorité au hero :

```python
from PIL import Image
Image.open('assets/tigre.jpg').save('assets/tigre.webp', 'WEBP', quality=80, method=6)
```

## `.htaccess`

Le fichier [`.htaccess`](.htaccess) à la racine configure l’hébergement mutualisé Apache :

- Cache long (1 an) pour les images, favicons et polices (`ExpiresByType`).
- Cache moyen (1 mois) pour CSS / JS.
- Cache court (1 h) pour le HTML — les mises à jour de contenu sont vues rapidement.
- Compression gzip (`mod_deflate`) pour HTML / CSS / JS / JSON / SVG.
- Redirection HTTPS (filet de sécurité si le mutualisé ne force pas déjà).

## Hors-scope

Pas d’analytics, pas de cookies, pas de newsletter, pas de replay, pas de backend. Tout est statique.
