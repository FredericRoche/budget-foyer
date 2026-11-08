# Kit de transmission

Pour donner à un proche **sa propre copie autonome** de l'application : son dépôt, sa publication, son inscription Microsoft, son livre. La copie ne contient aucune de vos données, aucun historique, ni votre identifiant Microsoft. Elle ne partage rien avec votre application.

## Produire la copie

Depuis le dossier de l'application, avec un dossier de sortie neuf, **hors du dépôt** :

```bash
python outils/preparer_copie.py "C:/Users/<vous>/Documents/budget-foyer-copie"
```

Le script :

1. part du dernier état **validé** du dépôt (`git archive`), donc sans fichier ignoré ni historique ;
2. vide l'identifiant de votre application Microsoft ;
3. ajoute `MISE-EN-ROUTE.md` (pour le destinataire) et `CLAUDE.md` (pour son Claude), tirés de ce dossier `kit/` ;
4. reconstruit `index.html` et passe le contrôle des données personnelles sur la copie.

Ensuite, compressez le dossier produit et transmettez-le : clé USB, courriel, ou dossier partagé de votre choix.

## Contenu du kit

- [MISE-EN-ROUTE.md](MISE-EN-ROUTE.md) : dépôt GitHub, publication, inscription Microsoft, premier livre, premiers imports.
- [GUIDE-POUR-CLAUDE.md](GUIDE-POUR-CLAUDE.md) : prise en main par le Claude du destinataire (première session), architecture, conventions, garde-fou des données, ajout du lecteur d'une banque, publication, méthode de travail apprise à l'usage.
- [FONCTIONNALITES.md](FONCTIONNALITES.md) : catalogue des fonctionnalités, pour un proche qui a déjà sa propre application et veut y reprendre des idées (son Claude lit la copie comme une référence, sans l'installer).

Le dossier `kit/` lui-même n'est pas copié.
