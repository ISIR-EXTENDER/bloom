# Handoff — Bloom kiosk runtime

Pour Claude Code, dans le dépôt `ISIR-EXTENDER/bloom` (branche `main`).

## Contexte

Bloom est l'interface qu'une personne en fauteuil utilise pour piloter un bras robotisé
monté sur son fauteuil. Aujourd'hui le runtime s'affiche dans la même coque que le builder :
navigation produit, en-tête d'app et trois passerelles d'édition sont à l'écran pendant que
le bras bouge.

Ce dossier contient une revue UX classée (14 constats, P1→P3) et la spec du **runtime kiosk**
proposé, prototypé à la géométrie réelle du panneau (1024×600).

**Contrainte du propriétaire produit : ne pas toucher au backend ni à l'architecture
front/back.** Tout ce qui suit atterrit dans (a) la coque runtime — ce que l'app rend pour
la route runtime, (b) la configuration d'app / le seed JSON, ou (c) les affordances du
builder. Le modèle de config, la frontière d'adaptateur et la couche session ne changent pas.
Le seul champ nouveau est `language` sur `UserProfile` (constat 14), signalé comme tel.

## Fichiers

- `kiosk-runtime-spec.md` — la spec écran par écran, à implémenter.
- `findings.md` — les 14 constats avec preuves, pour arbitrer et prioriser.
- `accessibility.md` — le modèle d'entrée et les neuf capacités, niveau de référence PlayAbility.
- `settings-and-onboarding.md` — l'écran de réglages accessible et les deux parcours guidés.
- `i18n.md` — le plan EN/ES/FR et les chaînes déjà traduites.
- `Bloom UX Review.dc.html` (à la racine du projet) — **référence de design en HTML**,
  pas du code de production. Ne pas copier dans le dépôt. Elle sert à voir le comportement :
  les pads, le stop, le geste de maintenance, le changement de langue.

## Environnement cible

React 19 + TypeScript, primitives `@bloom/ui` (`BloomButton`, `BloomCard`, `BloomPanel`,
`BloomThemeProvider`), tokens CSS de `frontend/libs/ui/src/theme.ts`, feuilles existantes
`runtime-app.css`, `runtime-widgets.css`, `responsive.css`.

Utiliser les **variables sémantiques** (`--bloom-primary`, `--bloom-surface`,
`--bloom-on-surface`), jamais les hex listés dans la spec — ils ne sont là que pour vérifier
ce que le prototype a rendu. Là où le prototype et `@bloom/ui` divergent, garder la
primitive `@bloom/ui` et conserver la taille.

## Fidélité

**Haute.** Couleurs, tailles de texte, tailles de cible et géométrie sont arrêtées : elles
ont été choisies contre le budget vertical du panneau 1024×600. Les reproduire fidèlement.

## Décisions actées

- **Préréglage `native-1280x720`** à ajouter à `CanvasPresetId`, utilisé par toutes les apps
  opérateur. Supprime le facteur 0,703 et les 214 px de letterbox d'un coup. Les apps existantes
  se recomposent à cette géométrie ; l'artboard `wide-tablet` reste pour les écrans de labo.
- **`language` sur `UserProfile`**, à côté de `display_preset` et
  `motor_accessibility_preset`. Le sélecteur vit dans l'overlay de maintenance.

## Ordre de travail suggéré

1. Coque kiosk + bandeau d'état 56 px (constats 1, 2) + préréglage `native-1280x720`
2. Puce d'état + cible STOP (constat 3)
3. Contraste `muted` + plancher 13 px, correction du chevauchement Z dans le seed (8, 5)
4. Règle « jamais en dessous de l'échelle 1.0 » + vérif device-space dans le builder (4, 10)
5. Mots de direction sur les pads, repère opérateur explicite (6, 11)
6. `language` sur `UserProfile` + extraction des chaînes (14)
7. `motor_accessibility_preset` : step zones d'abord, puis latch, puis balayage —
   une passe matériel avec de vrais opérateurs entre chaque (7, 12, `accessibility.md`)
8. Entrée Gamepad API, conditionnement du signal, dwell (`accessibility.md`)
9. Vue superviseur miroir (13), fork de rôle et overlay premier lancement (9)
