# Le raisonnement — langage, choix, théorie

Ce document explique *pourquoi* la spec dit ce qu'elle dit. Il sert à deux moments : quand
vous implémentez et qu'un détail semble arbitraire, et quand vous concevez un écran que je
n'ai pas dessiné et qu'il faut décider seul.

---

## 1. Le langage

### Le mot ressenti, jamais le mot d'implémentation

`motor_accessibility_preset: latch` s'affiche « Continue seul », et sa ligne d'aide dit
« Le bras continue après le relâchement ». Personne n'apprend le mot *latch*. La règle :
**décrire ce que la personne va sentir, pas ce que le code va faire.**

Corollaire dur : `X+`, `RY−`, `rad/s`, `frame_id`, `base_link`, `topic` n'apparaissent jamais
sur un écran opérateur. Ce ne sont pas des libellés difficiles, ce sont des libellés adressés
à quelqu'un d'autre. Ils restent — utiles, précis — dans la vue superviseur et l'overlay de
debug.

### Un mot par axe, pour toujours

Rouler / Incliner / Pivoter / Avant-Arrière / Gauche-Droite. Le même axe porte le même mot en
mode pad, en mode balayage, dans l'aide, dans les sons, dans la documentation. Un axe qui
s'appelle « Rouler » ici et « Pivoter » là coûte plus cher que n'importe quelle maladresse de
formulation : il oblige à retraduire à chaque écran.

### Adresser la personne, pas le système

« Le bras ne répond pas. Rien de ce que vous appuyez ne le fera bouger. » plutôt que
« /joystick_cartesian_command MISSING ». La première phrase dit ce qui est vrai *pour la
personne* et ce qu'elle doit en conclure. La seconde dit ce qui est vrai pour le nœud ROS et
laisse le travail de traduction à celui qui a le moins de contexte.

### Dire ce que le bouton va faire, pas où il en est

`Gripper — CLOSED` est un état déguisé en bouton : appuyer va-t-il ouvrir, ou fermer ? Un
bouton porte un verbe (« Ouvrir la pince »), l'état vit à côté. Sur la seule commande où une
erreur casse quelque chose, l'ambiguïté n'est pas acceptable.

### Longueur des chaînes

ES et FR font 15 à 30 % de plus que EN. Chaque libellé runtime a un budget et un test de
retour à la ligne à 1280×720. Cas déjà tendus : `HOLD TO RESUME` →
`MANTENER PARA REANUDAR` → `MAINTENIR POUR REPRENDRE` sur un bouton de 220 px.

---

## 2. Les choix d'interaction

### L'effort est asymétrique quand les conséquences le sont

Arrêter : un tap, immédiat. Reprendre : un maintien d'une seconde avec barre de progression.
Ouvrir la maintenance : un maintien d'une seconde et demie. Ce n'est pas de la friction
gratuite — c'est une **fonction de forçage** (Norman) : rendre l'action dangereuse
physiquement plus coûteuse que l'action sûre, plutôt que poser une question à laquelle tout
le monde répond « oui » sans lire.

C'est aussi pourquoi il n'y a aucune boîte de dialogue de confirmation dans le runtime. Une
confirmation interrompt sans protéger. Un geste maintenu protège sans interrompre.

### Reconnaître plutôt que se rappeler

Les positions des contrôles sont identiques sur tous les écrans d'une app, et le builder
alerte quand un même type de widget se déplace. La personne regarde la pince, pas la
tablette : sa main retrouve un bouton par mémoire motrice, pas en le lisant. Un contrôle qui
change de place entre deux écrans annule cette mémoire.

D'où aussi : ancrer aux bords et aux coins, laisser le centre de la vitre à l'affichage. Un
bord se trouve sans les yeux, un centre non.

### Un pas visible entre l'intention et l'effet

Chaque commande produit une réponse visible immédiate — le bouton s'enfonce, la valeur
change, la pastille bouge. Le tactile n'a pas de curseur : sans retour, on ne sait pas si le
tap a été pris, alors on retape. Sur un bras robotisé, retaper est une commande de plus.

### Le balayage doit couvrir tous les axes, sinon il ment

Un jeu de balayage qui laisse tomber un axe est pire que pas de balayage : il a l'air
utilisable et ne l'est pas. La liste des cibles se **dérive des widgets de l'écran**, elle ne
s'écrit pas à la main — sinon elle diverge au premier widget ajouté.

### L'écran de réglages doit se piloter au niveau qu'il configure

Le piège est circulaire : configurer le mode qui supprime le besoin de motricité fine demande
de la motricité fine. D'où : aucun slider, tout en paires −/+ de 88×72 px, et l'écran de
réglages se balaie lui-même en mode contacteur. C'est le test le plus dur de tout le produit
et le seul qui prouve quelque chose.

### Apprendre en faisant, une fois, sans risque

Chaque étape du parcours guidé se termine par une action réelle, jamais par « Suivant ». Le
parcours tablette tourne robot débranché, et c'est écrit à chaque étape. Un tutoriel qu'on
clique sans agir n'est pas retenu ; un premier essai qui peut mal tourner n'est pas retenté.

---

## 3. La théorie appliquée, et ce qu'elle donne ici

**Fitts.** Le temps d'atteinte dépend de la taille de la cible et de la distance. Pour une
motricité réduite, la taille domine. D'où : rien de petit, et les cibles critiques ancrées à
un bord — un bord a une profondeur infinie, on ne peut pas le dépasser.

**ISO 9241-411.** Plancher tactile autour de 9,6 mm pour une motricité *ordinaire*. C'est le
chiffre qui rend le constat 4 grave : à l'échelle 0,703 votre token de 48 px tombe à 5,9 mm,
sous le plancher, pour les personnes les moins en mesure de l'absorber. La leçon plus large :
**mesurer en millimètres, pas en pixels.** Le pixel est ce qui a caché le problème.

**Les deux golfes de Norman.** Le golfe d'exécution (« comment je fais faire ça ? ») se
franchit avec des mots de direction dans le pad plutôt que des noms d'axes. Le golfe
d'évaluation (« qu'est-ce qui s'est passé ? ») se franchit avec la pastille d'état, les
lectures live et les sons. Vos drapeaux MISSING sont du très bon travail sur le second golfe.

**Hick-Hyman.** Le temps de décision croît avec le nombre d'options. Six onglets d'écran
au-dessus d'un bras vivant, c'est six décisions à chaque coup d'œil, dont cinq mauvaises.
D'où la coque kiosk : un écran, et tout le reste derrière un geste délibéré.

**Visibilité de l'état (Nielsen).** Ne jamais laisser deviner. Mais avec le corollaire que
votre ADR 0124 formule mieux que moi : **« unknown » n'est pas « unavailable »**. Une
interface qui affirme plus qu'elle ne sait est pire qu'une interface qui se tait.

**Prévention plutôt que message d'erreur.** Le contrôle de collision et la vérification
tactile dans le builder existent pour que l'erreur ne soit jamais construite. C'est moins
cher qu'un message d'erreur, et infiniment moins cher qu'une découverte au labo avec le robot
allumé.

**Charge cognitive.** L'opérateur pilote un bras attaché à son corps pendant qu'il regarde
autre chose que l'écran. Tout pixel qui n'aide pas ce geste précis prend de la place dans une
attention déjà saturée. C'est le vrai argument derrière « la chrome mange le panneau » —
pas l'esthétique, le budget d'attention.

**Accessibilité comme entrée, pas comme conformité.** Une checklist WCAG vous donne le
contraste et le clavier, et ne vous donnera jamais le balayage au contacteur. La bonne
question n'est pas « est-ce conforme » mais **« quel est le plus petit mouvement fiable que
cette personne peut faire, et est-ce que ça suffit »**.

---

## 4. Ce que je n'ai pas décidé, et pourquoi

- **Le vocabulaire exact en FR/ES** doit passer par un locuteur natif, en particulier les
  formulations d'arrêt et de reprise : elles portent une charge de sécurité.
- **L'ordre des neuf capacités d'accessibilité** est un pari argumenté, pas un résultat. Il
  doit survivre au contact de deux ou trois opérateurs aux profils moteurs différents, sinon
  c'était la mauvaise liste.
- **La cadence de balayage par défaut** (1,4 s) est une valeur de départ raisonnable, pas une
  valeur mesurée. Elle se règle par profil précisément parce que personne ne peut la deviner.
