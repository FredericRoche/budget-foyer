# Consignes pour Claude — Budget du foyer

Ce fichier est lu par toute session Claude ouverte dans ce dépôt. Il voyage
avec le code par GitHub : les deux postes ont donc les mêmes consignes dès
qu'ils ont tiré la dernière version. Le dépôt est public : n'écrire ici ni
donnée réelle, ni montant, ni nom de tiers.

## Deux postes, un seul dépôt

L'application est développée tantôt sur l'un, tantôt sur l'autre poste. Les deux
doivent rester opérationnels et savoir ce qui a été amélioré, changé ou
corrigé, et pourquoi. Le journal qui fait foi est l'historique Git.

**En ouvrant une session**

1. `git pull`, avant toute modification.
2. Lire les commits que ce poste n'a pas encore vus : `git log --since="3 weeks ago"`
   au minimum, en entier pour ceux qui touchent la demande.
3. Dire en deux ou trois lignes ce qui a changé depuis, et ce qui se rattache à
   la demande (commit, décision antérieure, fonction touchée). Chercher par
   `git log --grep=` et `git log -S` ; puis dans les conversations passées.

**En terminant**

1. Un commit par changement cohérent, avec un message qui dit quoi **et
   pourquoi** (la convention en place : constat, correction, effet mesuré).
2. `python outils/verifier_donnees.py --tout`, puis pousser sur `main`.
   Un correctif resté sur un poste n'existe ni pour l'autre poste ni pour
   l'application publiée, puisque la publication suit `main`.
3. Reconstruire `index.html` par `python outils/construire.py` après toute
   modification de `src/` : il pose aussi le numéro de version (page et
   `sw.js`), qui fait charger la nouvelle version sur chaque appareil.

## Règles apprises à l'usage, sur les vraies données

**Sauvegarde avant action radicale.** Avant de supprimer ou remplacer un
budget, reclasser en masse, ou lancer sur les vraies données une fonction
jamais essayée : faire d'abord télécharger une copie chiffrée (Réglages ›
Sauvegarde et export › Télécharger une copie chiffrée), renommée et rangée à
part. Cette étape vient en tête de la marche à suivre et n'est pas facultative.
Pourquoi : la copie automatique du jour est prise au premier enregistrement et
ne contient pas le travail fait ensuite ; l'application n'a pas de bouton de
restauration (constaté le 05/11/2026).

**Modifier les lignes, ne pas réécrire un budget.** Une nouvelle version part
du budget actif et ne change que les lignes concernées (« Modifier la ligne »,
ou un plan qui ne touche que ces lignes). Ne jamais reconstruire un budget
entier depuis un export Excel. Pourquoi : le 05/11/2026, une version réécrite
a perdu les répartitions par lieu, les types de site, les modes de paiement et
les jours de prélèvement, et rompu le lien d'une échéance (comptée deux fois en
trésorerie). L'export Excel ne contient pas ces réglages.

**Données réelles hors du dépôt.** Voir `.gitignore` et le crochet
`outils/crochet-pre-commit` : seuls le code et le jeu fictif sont publiés.
Les essais se font sur `?demo` ou sur les fichiers de `donnees-fictives/`.
