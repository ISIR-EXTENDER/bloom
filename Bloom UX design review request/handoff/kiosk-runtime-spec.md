# Spec — runtime kiosk (1024×600)

Cadre : 1024×600, pas de scroll, aucun overflow au niveau page.
Disposition : flex colonne. Bandeau `flex: 0 0 44px`. Corps `flex: 1`, flex ligne,
`gap: 12px`, `padding: 12px`, `min-height: 0`.

## Bandeau d'état (44 px)

Fond `surfaceSoft`, bordure basse 1 px `outline`, flex ligne, `gap: 14px`, `padding: 0 14px`.

- Nom d'app : 15 px / 700.
- **Puce d'état** : `padding: 5px 11px`, `radius: 8px`, fond `primaryContainer`
  (`errorContainer` si arrêté), pastille 10 px (rayon 50 % en marche, 3 px à l'arrêt),
  libellé 13 px / 700 / `letter-spacing: 0.04em`. Mot + couleur + forme — jamais la couleur
  seule.
- Latence : JetBrains Mono 13 px, `onSurfaceMuted`.
- Repère actif (constat 11) : un mot nommant le référentiel utilisé.
- Spacer, puis nom de profil (mono 13 px).
- **Bouton maintenance** : min 48×36 px, bordure 1 px `outline`, `radius: 9px`, glyphe 19 px,
  barre de progression 3 px en bas qui se remplit sur 1500 ms pendant l'appui.

Rien d'autre. Pas de nav produit, pas de passerelle d'édition, pas d'eyebrow `RUNTIME APP`,
pas de ligne de profil `Default`.

## Colonne gauche (`flex: 0 0 340px` ; `order: 2` si `motorMode === "edge"`)

- Ligne de titre : titre 15 px/700 + lecture live (mono 13 px, `onSurfaceMuted`,
  format `x.xx / y.yy`).
- **Pad de translation** : 340×340, `radius: 26px`, fond `cream`, bordure 2 px `outline`,
  `touch-action: none`. Mots de direction à 10 px de chaque bord, 15 px/700, encre pleine
  `onSurface`. Cercle guide pointillé Ø 216 px centré. Bouton 84 px, `radius: 50%`, fond
  `sage`, bordure 3 px `forest`, `box-shadow: 0 4px 12px rgba(37,61,53,0.25)`, positionné par
  `transform: translate(x * 108px, -y * 108px)` avec x,y ∈ [-1,1]. Le glissement est borné à
  un rayon de 108 px (`Math.hypot`, puis remise à l'échelle sur le cercle).
- **Segments de vitesse** : label + trois boutons, chacun `flex: 1`, `min-height: 56px`,
  `radius: 14px`, bordure 2 px `outline`, 16 px/700. Sélectionné : `primary` sur `onPrimary`.
  Non sélectionné : `surface` sur `onSurface`. Remplace le slider filaire actuel, dont le
  pouce faisait une cible d'environ 12 px.

## Colonne droite (`flex: 1`)

- **Pad de rotation** : 236×236, `radius: 22px`, même traitement, bouton 76 px, rayon de
  glissement 72 px, libellés 14 px/700, lecture en dessous.
- **Hauteur** : colonne de 92 px. Bouton haut 92×64, piste `flex: 1` avec remplissage depuis
  le bas à `height: <z>%` en `primaryContainer` et lecture mono 15 px/700 centrée, bouton bas
  92×64. Pas de 5 %. Les boutons font 64 px parce que le pas-à-pas est le chemin accessible.
- **Panneau d'aide + rangée STOP** : panneau `flex: 1`, `radius: 14px`, fond `surfaceSoft`,
  bordure 1 px, légende 13 px `onSurfaceMuted` + corps 15 px/700.
  **STOP** : 176×132, `radius: 18px`, sans bordure,
  `box-shadow: 0 6px 18px rgba(155,61,46,0.3)`, 20 px/700, `letter-spacing: 0.06em`.
  Au repos : `#9b3d2e` sur `#fffaf1`, libellé `STOP`. Arrêté : `#f5ddd8` sur `#9b3d2e`,
  libellé `MAINTENIR POUR REPRENDRE`, barre 6 px se remplissant sur 1000 ms pendant l'appui.

STOP et la puce d'état sont de la **chrome runtime**, pas des widgets : le builder ne peut ni
les déplacer, ni les supprimer, ni les recouvrir.

## Overlay de maintenance (après un appui de 1,5 s)

Voile plein cadre `rgba(37,61,53,0.55)`. Panneau 340 px ancré en haut à droite,
`padding: 56px 14px 0`, `radius: 18px`, fond `surface`,
`box-shadow: 0 18px 40px rgba(37,61,53,0.3)`, `gap: 10px`.

Titre 17 px/700 + légende « maintenu 1,5 s » ; une ligne d'explication ; une rangée
**Langue** de trois boutons de 52 px (English / Español / Français, chacun avec son attribut
`lang`, sélectionné = `primary`) ; puis Bibliothèque d'apps, Modifier cet écran dans le
builder, Profil d'affichage et moteur, à 52 px chacun ; puis un bouton primaire
« Retour à l'opération » à 52 px.

## Vocabulaire d'axes — un mot par axe, dans tous les modes

Non négociable : le même axe porte le même mot en mode pad, en mode balayage, dans les
messages d'aide et dans la voix de synthèse. Un axe qui s'appelle « Rouler » ici et
« Pivoter » là annule les constats 6 et 11.

| Axe | Mot | Cibles |
|---|---|---|
| tx | Gauche / Droite | pad translation, balayage |
| ty | Avant / Arrière | pad translation, balayage |
| rx | Rouler gauche / droite | pad rotation (horizontal), balayage |
| ry | Incliner haut / bas | pad rotation (vertical), balayage |
| rz | Pivoter gauche / droite | rangée RZ, balayage |
| z | Hauteur ▲ / ▼ | colonne hauteur, balayage |

## Balayage au contacteur

16 cibles, grille 4×4, dans cet ordre : Avant, Arrière, Gauche, Droite, Rouler g., Rouler d.,
Incliner haut, Incliner bas, Pivoter g., Pivoter d., Hauteur ▲, Hauteur ▼, Lente, Moyenne,
Rapide, ARRÊT.

Règle : **tout axe de tout widget de l'écran doit avoir une cible.** Un jeu de balayage qui
laisse tomber un axe est pire que pas de balayage — il a l'air utilisable et ne l'est pas.
Cette liste se dérive donc des widgets de l'écran, elle ne s'écrit pas à la main.

La surbrillance avance à `scan_period_ms` (défaut 1400). Un contacteur — bouton, sip-puff,
Espace, tap n'importe où sur la barre — déclenche la cible allumée. Changer la cadence prend
effet immédiatement, pas au prochain changement de mode.

## Interactions

- **Glissement des pads** : `pointerdown` capture le pointeur (`setPointerCapture`) et fixe
  le pad actif ; `pointermove` ne met à jour que tant que ce pad est actif ; `pointerup` et
  `pointercancel` relâchent. Vecteur borné au rayon. Au relâchement le pad revient à zéro —
  **sauf** en mode moteur `latch`, où il conserve sa dernière valeur.
- **État arrêté** : toute entrée pad et hauteur est refusée, les boutons passent en
  `#c9b7b2` avec bordure `#9b3d2e`, la puce lit `ARRÊTÉ`. L'arrêt au tap est immédiat ; la
  reprise demande un appui de 1000 ms, annulé par `pointerup` ou `pointerleave`, progression
  remise à zéro à l'annulation. L'asymétrie est volontaire.
- **Maintenance** : appui de 1500 ms, mêmes annulations. Les deux minuteurs tournent à 40 ms
  et doivent être nettoyés au démontage.
- **Langue** : le changement re-rend toute chaîne côté opérateur ; nombres, valeurs d'axes et
  noms de topics restent non traduits.
- **Mode moteur `edge`** : la colonne de translation passe de l'autre côté via `order`, pour
  que rien ne soit au centre de la vitre.
- Aucun état de survol ne porte de sens dans le runtime.

## État

```
tx, ty        -1..1   vecteur de translation
rx, ry        -1..1   vecteur de rotation
z             0..100  hauteur, pas de 5 %
speed         "slow" | "medium" | "fast"
stopped       boolean
activePad     "" | "tx" | "rx"    quel pad possède le pointeur
maintHold     0..1    progression, 1500 ms
resumeHold    0..1    progression, 1000 ms
maintOpen     boolean
lang          "en" | "es" | "fr"  surcharge locale de la valeur de profil
```

Props (config d'app / profil, pas état de composant) : `language`, `displayProfile`
(default | comfort | high-visibility), `motorMode` (default | latch | edge), `theme`
(bloom | clinical | extender-ui), `showTargets` (anneaux de cible de debug).

Dans l'app réelle tout cela vient de `resolveRuntimeProfile` et du thème d'app ; rien de
nouveau n'est nécessaire hormis le champ `language`.

## Tokens

Valeurs rendues par le prototype, tracées depuis `frontend/libs/ui/src/theme.ts`.
**Utiliser les variables CSS, pas ces littéraux.**

Bloom Garden : surface `#fffaf1`, surfaceSoft `#f8f4eb`, cream `#f2eadc`, ink `#253d35`,
inkSoft `#5c6b63` (assombri depuis `#74847b`, constat 8), outline `rgba(49,73,63,0.18)`,
primary `#31493f`, primaryContainer `#c8d5c4`, onPrimary `#fffaf1`, sage `#7e967e`,
error `#9b3d2e`, errorContainer `#f5ddd8`.

Type : Atkinson Hyperlegible pour tout le runtime ; JetBrains Mono pour lectures, latence et
valeurs d'axes ; Cormorant Garamond réservé aux titres de la revue, jamais au runtime.
Tailles runtime : plancher 13 px pour les micro-labels, 14–15 px labels, 16 px boutons,
20 px STOP.

Rayons : 8 px puce, 9 px bouton maintenance, 14 px segments et panneaux, 18 px STOP,
22 px pad de rotation, 26 px pad de translation.

## Budget vertical, panneau 1024×600

| | Chrome | Contrôles |
|---|---|---|
| Aujourd'hui | 222 px (nav 92 + en-tête 130) | 378 px |
| Proposé | 44 px | 556 px (+47 %) |

Les 178 px récupérés font passer le pad de translation de 250 à 340 px sans déplacer aucune
coordonnée de widget.
