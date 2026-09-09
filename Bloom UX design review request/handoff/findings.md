# Les 14 constats

Classés P1 → P3. Preuves tirées du dépôt (`docs/`, `frontend/`, captures du README), de la
photo de séance en labo et du manuel de montage de la tablette.

## P1 — bloque l'usage sûr

**1. Le runtime porte les habits du builder.** Pendant qu'on pilote, l'écran affiche
HOME / BUILDER / RUNTIME / HELP plus *App library*, *Edit app*, *Edit screen*. Six façons de
sortir, aucune utile en séance, toutes à un tap de travers. `docs/design-system.md` l'interdit
déjà : « No builder chrome, inspector controls, or edit metadata should appear in runtime. »
→ Le runtime devient une surface kiosk ; nav et passerelles d'édition passent derrière un
appui long de 1,5 s, éventuellement protégé par un code par app.

**2. La chrome mange 37 % du panneau.** ~92 px de nav + ~130 px d'en-tête = 222 px sur 600,
avant le moindre joystick. « Trop de choses à l'écran » n'est pas un problème de nombre de
widgets : les widgets sont les seules choses qui devraient être là.
→ Un seul bandeau de 44 px. Récupère 178 px.

**3. Pas d'arrêt, aucun signe de vie.** La capture teleop n'a ni commande d'arrêt ni
indicateur d'état. Rien ne distingue « connecté et armé » de « websocket tombé, ta dernière
commande est la commande courante du robot ». Pour un bras fixé au corps de l'opérateur,
c'est le constat qui compte le plus.
→ Puce d'état + cible STOP de 176×132 px, en chrome runtime non déplaçable. Arrêt au tap,
reprise à l'appui d'une seconde.

**4. Les 48 px sont en espace d'auteur, pas en espace d'écran.**
`resolveScreenArtboardLayout` fixe l'artboard en pixels et le runtime l'adapte au viewport.
Un écran composé en 1440 de large tombe à 0,71 sur le panneau 1024 : le token 48 px atterrit
à 34 px de verre, le 64 px « haute visibilité » à 45 px. Les tokens sont honnêtes, le
pipeline les escompte en silence.
→ (a) Aucun widget interactif ne descend sous l'échelle 1.0 : on déplace la vue ou on change
de profil d'affichage, on ne rétrécit pas. (b) Le builder affiche la taille en espace écran à
la sélection et signale tout ce qui passe sous 44 px. C'est exactement ce que
`validation:sandbox-tablet` devrait vérifier.

**11. « Avant » doit vouloir dire l'avant de la personne.** Le bras est monté sur le côté du
châssis, à hauteur de hanche, et travaille en travers d'une table : ses axes de base ne
pointent nulle part près des axes du corps. Le README prévient déjà qu'une commande estampée
du mauvais `frame_id` est rejetée et que le robot s'arrête silencieusement. Le référentiel
cesse d'être un détail de config : c'est l'interface.
→ Mapping explicite au moment de l'installation, égocentré opérateur par défaut ; le
référentiel actif nommé dans le bandeau ; vérification builder que tous les widgets teleop
d'une app partagent le même mapping.

**12. Leurs yeux sont sur la pince, pas sur la tablette.** Sur la photo, l'opératrice regarde
le bras pendant que la tablette est à plat, sur le côté. C'est le cas normal, pas un cas
limite : on ne peut pas regarder ce que fait le robot et la commande qu'on presse. Tous les
constats ci-dessus supposaient une personne qui lit l'écran ; celui-ci dit qu'elle ne le lit
pas la plupart du temps.
→ Concevoir pour l'usage au toucher : positions de contrôles identiques sur tous les écrans
d'une app (le builder alerte quand un même type de widget se déplace d'un écran à l'autre),
ancrage aux bords et aux coins que la main retrouve sans les yeux, centre de la vitre réservé
à l'affichage, et un canal non visuel pour les changements d'état — un son bref à l'arrêt, à
la perte de lien, à l'engagement du latch.

## P2 — coûte de la compréhension et de la confiance

**5. Les widgets se chevauchent en silence.** Dans `runtime-live-teleop.png` la carte du
slider Z passe sous celle du joystick et son libellé est coupé en plein mot. Cette capture
est dans le README : elle a été livrée comme image de référence du produit.
→ Passe de collision : des bornes interactives qui se recouvrent alertent dans le builder et
font échouer `visual:smoke`. Le chevauchement décoratif reste légal.

**6. Les libellés d'axes sont la langue de l'adaptateur.** X−, X+, RY+ à environ 11 px, en
pastel, *hors* du pad où la carte les coupe. Quelqu'un qui pousse une pince vers une poignée
de porte ne pense pas dans le repère `base_link`.
→ Mots de direction à l'intérieur du bord du pad, 15 px minimum, encre pleine, flèche + mot.
La notation de repère reste en overlay de debug optionnel pour le labo.

**7. `motor_accessibility_preset` ne change rien de visible.** Le champ existe et
`runtimeProfile.ts` le résout, mais le runtime rend à l'identique. Pour la population réelle
du produit c'est le levier le plus fort, et c'est un no-op.
→ Quatre comportements concrets : **edge** (tout ancré au bord atteignable, rien au centre),
**step zones** (zones de tap-à-incrément en alternative au glissement, pour ne pas exiger de
traction soutenue), **latch** (le pad garde sa valeur au lieu de revenir à zéro), **dwell
confirm** (maintien plutôt que tap précis). En livrer un, valider sur matériel, puis le
suivant.

**8. Le texte `muted` échoue au contraste que vos tests prétendent tenir.**
`muted #74847b` sur `paper #fffaf1` mesure ≈3,8:1. Utilisé pour les eyebrows, la ligne
`Default`, « WEBCAM LIVE » et l'URI webcam — à 11 px, en capitales, sur un panneau de 10,1
pouces, dans une salle avec des fenêtres. La suite de contraste teste des paires sémantiques ;
muted-sur-surface n'en fait pas partie.
→ Assombrir vers ≈4,6:1 (autour de `#5c6b63`), ajouter muted-sur-chaque-surface à la matrice
de test, plancher de 13 px pour les micro-labels en capitales. Le correctif le moins cher de
la liste.

**13. Deux surfaces, une séance — et une seule existe.** La photo montre l'opératrice dans le
fauteuil *et* une seconde personne qui pilote le même bras depuis un joystick physique, un
portable à côté. Le modèle runtime de Bloom est mono-surface : rien, sur aucun des deux
écrans, ne dit qui a la main ni ce que voit l'autre.
→ La supervision devient un rôle runtime de plein droit : vue miroir sur le portable, même
puce, mêmes valeurs, lecture seule par défaut, arrêt propre qui marche toujours. La
possession du contrôle est affichée des deux côtés et le passage de main est explicite, jamais
déduit de qui a bougé en dernier. C'est une vue sur la couche session existante.

**14. La langue appartient à la personne, pas au build.** Toutes les chaînes du dashboard sont
des littéraux anglais en TSX. Une séance à l'ISIR peut réunir une opératrice française, un
participant hispanophone et un développeur anglophone autour du même montage en une heure.
→ Voir `i18n.md`.

## P3 — avant que quiconque hors du labo ne le voie

**9. L'onboarding parle aux contributeurs.** Le premier écran propose « Architecture
promises », « Generic web logic stays independent from ROS », « Open builder preview ». Bon
hero de README, mauvaise porte d'entrée pour quelqu'un à qui on vient de tendre une tablette.
→ Fourcher par rôle une fois, et s'en souvenir : *Opérer* mène à la bibliothèque runtime (ou
directement à la dernière app), *Construire* mène à la page actuelle. Puis un overlay de
premier lancement par app : trois phrases simples générées depuis les libellés de widgets déjà
écrits dans le builder, écartable, atteignable au clavier, montré une seule fois.

**10. Vous éditez sur le PC et le PC ne voit pas la tablette.** Le canvas builder est de
taille bureau et sans cadre : les problèmes tablette apparaissent en fin de boucle, sur
matériel, au labo, avec le robot. `docs/extender-tablet-hardware.md` liste trois géométries
qui comptent ; le canvas n'en connaît aucune.
→ Sélecteur de cadre d'appareil avec ces trois préréglages, plus un bascule *touch check* qui
dessine les anneaux de cible en espace écran réel et rougit tout ce qui passe sous 44 px. Les
mêmes nombres que le script de validation, visibles pendant qu'on compose au lieu d'après le
commit.

---

## Échelle physique — mesurée depuis le manuel de montage

Écran HMTECH 10,1", 1024×600, multitouch, HDMI + micro-USB. Diagonale 10,1" en 16:9 →
largeur ≈ 8,8", soit **≈116 ppp** : 1 px CSS ≈ 0,22 mm. Le rendu est à peu près 1:1, donc les
tailles de la spec se traduisent directement en millimètres de verre :

| Élément | px | mm |
|---|---|---|
| Plancher de cible | 44 | 9,6 |
| Token 48 px | 48 | 10,5 |
| Segment de vitesse | 56 | 12,2 |
| Bouton de hauteur | 64 | 14,0 |
| Bouton de pad | 84 | 18,4 |
| STOP | 176 × 132 | 38 × 29 |
| Pad de translation | 340 | 74 |

ISO 9241-411 place le plancher tactile autour de 9,6 mm pour une motricité ordinaire : 44 px
est donc un minimum strict, pas une marge. C'est ce qui rend le constat 4 sérieux — à
l'échelle 0,71, ce même token tombe à 7,4 mm, sous le plancher, pour des utilisateurs dont la
précision est justement réduite. Et cela confirme le dimensionnement du STOP : à 38 × 29 mm,
il se trouve à la main sans le chercher des yeux (constat 12).

Le panneau est un écran externe HDMI sans batterie ni capteur : pas de rotation, pas de
luminosité automatique, pas de veille gérée par l'app. La géométrie est fixe — composer pour
1024×600 exactement, sans breakpoint.
