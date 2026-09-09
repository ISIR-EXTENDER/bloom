# Réglages et parcours guidé

Deux écrans qui manquaient entièrement. Voir les onglets **Settings** et **Tour** du
prototype pour la version vivante.

## 1. Écran de réglages — 1280×720, opérable par la personne qu'il configure

Le piège est circulaire : configurer le mode qui supprime le besoin de motricité fine
demande de la motricité fine. Trois règles en découlent.

**Aucun slider.** Toute valeur numérique est une paire −/+ de 88×72 px avec la valeur écrite
entre les deux. Le pouce d'un slider est une cible de 12 px, la première à lâcher en cas de
tremblement.

**Essai sur place.** Une bande en bas de l'écran obéit aux réglages du dessus. On choisit
*Un contacteur*, elle se met à balayer immédiatement. Pas de sauvegarde, pas de sortie
d'écran, pas de supposition. Rien de cette bande ne part vers le robot.

**Mots ressentis, pas mots d'implémentation.** « Le bras continue après le relâchement »
plutôt que « mode latch ». La ligne d'aide sous chaque choix décrit le comportement vécu.

### Structure

Bandeau 56 px : titre, nom du profil concerné, *Annuler les changements* (n'apparaît que si
quelque chose a changé), *Terminé*.

Colonne de gauche, cinq catégories en cibles de 84 px :

| Catégorie | Contenu |
|---|---|
| Comment je le bouge | `motor_preset` : Glisser, Coup par coup, Continue seul, Sur le bord, Un contacteur |
| Réglage fin | `scan_period_ms`, `deadzone`, `dwell_ms`, `audio_cues` |
| Où est l'avant | `frame_of_reference` : là où je regarde / les axes du robot |
| Langue | `language` : EN / ES / FR |
| Lire l'écran | lecture seule — vient de `display_preset`, réglé à l'installation |

« Lire l'écran » est volontairement en lecture seule : deux endroits pour changer la même
chose, c'est un endroit de trop, et le profil d'affichage se règle avec la personne qui
installe la tablette.

### Points d'implémentation

- Ces réglages écrivent dans `UserProfile`, pas dans la config d'app. Un profil suit la
  personne d'un montage à l'autre.
- L'écran doit être opérable **au niveau d'accessibilité courant** : en mode balayage, il se
  balaie lui aussi. C'est le test le plus dur et le seul qui compte.
- *Annuler les changements* est toujours disponible tant qu'on n'a pas quitté. Pas de
  dialogue de confirmation : un retour arrière vaut mieux qu'une question.
- Aucun réglage ne s'applique au robot depuis cet écran.

## 2. Parcours guidé — deux publics, une règle

**Chaque étape se termine par une action réelle, jamais par « Suivant ».**

### Sur la tablette — utiliser une app (5 étapes)

Robot débranché pendant tout le parcours, et c'est écrit à chaque étape.

1. **Voici votre écran** — ce que dit le bandeau, ce qu'est le carré rouge. *J'ai vu.*
2. **Déplacer le bras** — le faire avancer deux fois. *Je l'ai déplacé.*
3. **Arrêter, et repartir** — arrêt, puis maintien pour reprendre. *J'ai arrêté et repris.*
4. **L'adapter à votre main** — trouver le geste de maintenance. *J'ai trouvé les réglages.*
5. **Vous êtes prêt** — le robot se connecte en sortant. *Commencer pour de vrai.*

Contraintes : une idée par étape, dans la langue de l'opérateur, aux tailles de texte du
runtime ; réatteignable depuis les réglages, jamais un one-shot qu'on perd ; **généré depuis
les libellés de widgets de l'app** pour rester vrai quand l'app change.

### Sur le PC — construire une app (6 étapes)

Chaque étape est un contrôle qui aujourd'hui n'arrive que trop tard, au labo, avec le robot.

1. **Partir du panneau** — géométrie `native-1280x720`.
2. **Poser les contrôles, regarder les anneaux** — vérification tactile, rien sous 9,6 mm.
3. **Dire où est l'avant** — repère de l'app.
4. **Lier aux topics** — dans la liste autorisée par `runtime_policy`.
5. **Tester comme la personne** — charger son profil, son préréglage moteur.
6. **Envoyer sur la tablette** — export du bundle, seed dans SQLite.

L'étape est validée quand le canvas le dit, pas quand on clique. Même ordre que le script de
validation, pour que le parcours et la CI ne se contredisent jamais.

## Ce qui reste à trancher

- Le profil affiché s'appelle « Camille » dans le prototype : à remplacer par le vrai modèle
  de profil, et à décider si un opérateur peut avoir plusieurs profils nommés (séance de labo
  vs usage quotidien).
- Le parcours tablette suppose un mode « robot débranché » côté runtime. À confirmer que la
  couche session sait le faire proprement, sinon c'est un faux-semblant dangereux.
