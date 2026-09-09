# Accessibilité — jusqu'où aller

Référence de niveau : PlayAbility. Sa force n'est pas visuelle, donc copier son interface
raterait le sujet. Sa force est architecturale : **n'importe quelle entrée pilote n'importe
quelle sortie**, et la configuration appartient à la personne, pas au développeur.

Bloom aujourd'hui lie un geste tactile précis à une commande ROS précise. Un widget joystick
signifie *un doigt qui glisse sur du verre* — si la personne ne peut pas faire ça, l'app est
inutilisable et aucune configuration ne la sauve. C'est l'écart à combler.

## Le changement qui débloque tout le reste

```
source d'entrée   →   intention   →   binding
tactile / zone de tap / dwell        vecteur, scalaire     runtime_binding
balayage / joystick physique         ou commande           (existant, inchangé)
suivi de tête / voix                 normalisée, estampée
                                     d'un repère, limitée
                                     en débit
```

La colonne de droite existe déjà et marche. Tout ce qui suit consiste à donner plus d'une
entrée à la colonne de gauche. La frontière d'adaptateur n'apprend jamais que quelque chose a
changé — c'est exactement pourquoi ça ne viole pas la contrainte « ne pas toucher à
l'architecture ».

## Neuf capacités, dans l'ordre où elles paient

Chacune est une valeur de `motor_accessibility_preset` ou un champ de profil à côté. Aucune ne
demande de nouvel adaptateur.

1. **Step zones — taper au lieu de glisser.** Un widget joystick se rend en quatre cibles
   d'incrément. Pas de traction soutenue, pas de pression maintenue, pas de tremblement
   amplifié en diagonale. À elle seule, cette capacité rend toutes les apps teleop existantes
   utilisables par des gens qui ne peuvent pas glisser. *Gain le plus grand, coût le plus bas.*
2. **Latch — maintenir sans maintenir.** Le pad garde sa dernière valeur au relâchement ; un
   second tap remet à zéro. Ajouter un délai d'expiration automatique pour qu'une commande
   verrouillée ne survive jamais à l'attention. *Dans le prototype.*
3. **Balayage au contacteur.** Le runtime promène une surbrillance sur les contrôles à une
   cadence réglable ; un contacteur — bouton, sip-puff, touche Espace, tap n'importe où —
   déclenche ce qui est allumé. C'est ce qui fait passer Bloom de « il faut une main
   fonctionnelle » à « il faut un mouvement fiable ». *Dans le prototype : mode moteur `scan`.*
4. **Dwell — sélectionner sans cliquer.** Rester sur une cible un temps donné la déclenche,
   avec un anneau de décompte visible. Sert le pointage à la tête, l'oculométrie, et tous ceux
   pour qui l'appui lui-même est le point dur. Durée par profil, de 400 ms à plusieurs secondes.
5. **Conditionnement du signal — la partie que personne ne démontre.** Zone morte par profil
   (la fixture code 0,1 en dur pour tout le monde), courbe de réponse, lissage de tremblement,
   limite de débit, garde-fous anti-activation accidentelle : ignorer un second tap sous N ms,
   ignorer un contact de moins de N ms. C'est la différence entre « techniquement utilisable »
   et « pas épuisant ».
6. **Périphériques externes en entrée de plein droit.** L'API Gamepad du navigateur donne le
   joystick physique que le superviseur utilise déjà, plus toute manette adaptative et
   interface à contacteurs qui se présente comme telle — sans pilote, sans build natif. Mapper
   ses axes sur les mêmes intentions que les pads. Le joystick du fauteuil devient une entrée.
   *Valeur haute, coût bas.*
7. **Retour non visuel.** Tonalités distinctes pour l'arrêt, la perte de lien, le latch engagé,
   le rebouclage du balayage. Régions live pour lecteur d'écran sur la puce d'état. L'opérateur
   regarde la pince, pas la tablette : le son est le seul canal qui l'atteint là.
8. **Opérabilité clavier complète.** Toute action runtime atteignable et visible au clavier,
   avec un anneau de focus au même niveau de contraste que le texte. Un clavier est aussi une
   interface à contacteurs : bien fait, la moitié du balayage vient gratuitement.
9. **Le profil est le produit.** Langue, préréglage d'affichage, préréglage moteur, durée de
   dwell, cadence de balayage, zone morte, repère — un profil nommé, portable d'une séance et
   d'un montage à l'autre, exportable. Une personne arrive, son profil se charge, le robot se
   comporte comme elle le connaît déjà. C'est ça, et non une fonctionnalité isolée, que
   PlayAbility vend réellement.

## Champs de profil à ajouter

À côté de `display_preset` et `motor_accessibility_preset` sur `UserProfile` :

```
language                "en" | "es" | "fr"
motor_preset            "default" | "step" | "latch" | "edge" | "scan" | "dwell"
scan_period_ms          600..3000
dwell_ms                400..4000
deadzone                0..0.5        (aujourd'hui figé à 0.1 dans la config de widget)
response_curve          "linear" | "eased"
repeat_guard_ms         0..600        anti-double-activation
frame_of_reference      "operator" | "base_link"   (constat 11)
audio_cues              bool
```

Tous par profil, tous exportables avec lui. Aucun ne traverse la frontière d'adaptateur.

## Là où le travail de Bloom est plus dur que celui de PlayAbility

- Un jeu vous fait réapparaître. Un bras attaché à votre corps, non — la latence, l'arrêt et la
  certitude du mode portent un poids qu'un jeu n'a jamais.
- Leurs entrées se remappent une fois, tranquillement ; les vôtres doivent rester sûres pendant
  que le robot est vivant.
- Vous avez une seconde personne dans la boucle, pas eux.
- Vos utilisateurs n'installent ni ne configurent un logiciel : on leur tend une tablette.

## Le point qui décide si tout cela fonctionne

Chaque capacité ci-dessus est une hypothèse tant que quelqu'un qui en a besoin ne l'a pas
essayée. Les avis de PlayAbility ne parlent pas de fonctionnalités : ce sont des gens qui
décrivent ce qu'ils peuvent refaire. Ça vient d'une boucle constante avec des utilisateurs
handicapés, pas d'une checklist de conformité.

Concrètement : livrer step zones et balayage derrière le profil, puis les mettre devant deux ou
trois opérateurs aux profils moteurs différents avant de construire dwell ou l'entrée
périphérique. L'ordre de la liste doit survivre à ce contact, sinon c'était la mauvaise liste.
