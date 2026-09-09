# Bloom — orientation

Un cadre pour trancher les décisions que ni la spec ni la revue ne couvrent.
Court exprès : s'il faut le relire pour s'en servir, il a raté.

---

## Ce que Bloom est

**Bloom est l'endroit où quelqu'un reprend un geste.**

Pas un tableau de bord robotique. Pas un éditeur d'interfaces. Ce sont des moyens. La fin est
une personne qui attrape une poignée de porte, un verre, la main de quelqu'un — avec un bras
qu'elle pilote elle-même.

Tout le reste du produit se juge à cette aune, y compris ce qui est loin de l'écran :
l'architecture, les tests, le format des bundles. Un choix qui rend le geste plus sûr ou plus
simple est bon. Un choix qui rend le code plus élégant sans toucher au geste est neutre au
mieux.

---

## Six orientations

### 1. Ne jamais affirmer plus qu'on ne sait

C'est déjà la meilleure idée du dépôt — ADR 0124 : *unknown n'est pas unavailable*. Elle vaut
partout. Une pastille qui dit « Actif » quand cinq topics sont muets est un mensonge, et un
mensonge sur un bras attaché à un corps n'est pas une imprécision d'affichage.

Quand on ne sait pas, on le dit. Quand on sait mal, on ne présente pas comme un fait.

### 2. Le runtime n'est pas l'éditeur

Une personne qui opère est dans un mode, pas sur une page. Rien de ce qui sert à construire
n'a le droit d'être à portée de doigt pendant qu'un bras bouge. Ce n'est pas une préférence
de mise en page : c'est une frontière, et elle se défend écran par écran.

### 3. Concevoir pour la personne qui ne regarde pas l'écran

Elle regarde la pince. C'est le cas normal, pas le cas limite. Donc : les contrôles ne
bougent pas d'un écran à l'autre, ils s'ancrent aux bords, et tout changement d'état a un
canal qui n'est pas visuel.

Un design qui n'est beau que quand on le fixe est un design qu'on n'a pas testé en situation.

### 4. L'accessibilité est une entrée, pas une conformité

La question n'est pas « est-ce conforme ». Elle est : **quel est le plus petit mouvement
fiable que cette personne peut faire, et est-ce que Bloom sait l'écouter ?**

Un contacteur. Un souffle. Un regard. Une main qui tremble. La réponse doit être oui de plus
en plus souvent, et chaque fois qu'elle devient oui, une personne de plus peut opérer. C'est
la seule métrique de progrès qui compte vraiment.

### 5. Le profil est le produit

Une personne arrive, son profil se charge, le robot se comporte comme elle le connaît déjà.
Langue, mode moteur, cadence, zone morte, repère : tout suit la personne, pas la machine, pas
l'app, pas la séance.

Un réglage qui n'est pas dans le profil est un réglage qu'il faudra refaire devant elle, à
chaque fois, en la faisant attendre.

### 6. Mesurer en millimètres

Le pixel a caché le problème pendant tout ce temps. La bonne unité pour une cible tactile est
celle du doigt. Ça vaut au-delà de la taille : la bonne unité est toujours celle de la
personne — millimètres, secondes d'attente, nombre de gestes pour arriver au but. Jamais
celle du système.

---

## Trois tests à passer

À dégainer quand une décision hésite.

**Le test de l'arrêt.** Si le lien tombe maintenant, est-ce que la personne le sait, et
est-ce qu'elle peut arrêter le bras ? Si l'un des deux est non, plus rien d'autre ne compte
sur cet écran.

**Le test du contacteur.** Est-ce que cet écran est utilisable par quelqu'un qui n'a qu'un
seul mouvement fiable ? Si non, ce n'est pas un écran fini — c'est un écran fini *pour
certains*.

**Le test du regard ailleurs.** Est-ce que ça se pilote en regardant le robot ? Si ça
demande de lire, ça demande de détourner les yeux du bras qu'on est en train de bouger.

---

## Ce qu'on refuse

- Cacher un widget qui ne marche pas — le marquer et dire pourquoi. (Vous avez déjà tranché ça.)
- Une boîte de confirmation à la place d'un geste maintenu ou d'une annulation.
- Un réglage à deux endroits.
- Un tutoriel qu'on clique sans agir.
- Un libellé écrit pour la personne qui a câblé l'adaptateur.
- Une fonctionnalité d'accessibilité livrée sans avoir été mise devant quelqu'un qui en a besoin.

---

## Comment on sait qu'on avance

Pas au nombre de fonctionnalités. À ceci :

- Combien de profils moteurs différents peuvent opérer une app Bloom, aujourd'hui ?
- Combien de temps entre « on tend la tablette à quelqu'un » et « il déplace le bras » ?
- Combien de fois faut-il un développeur pendant une séance ?
- Est-ce que quelqu'un est reparti en ayant fait quelque chose qu'il ne pouvait plus faire ?

La dernière est la seule qui compte. Les trois autres disent si on est sur le chemin.
