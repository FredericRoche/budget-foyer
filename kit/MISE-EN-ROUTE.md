# Budget du foyer — votre propre copie : mise en route

Ce dossier est une **copie autonome** de l'application « Budget du foyer ». Elle ne contient aucune donnée de la personne qui vous l'a donnée et ne partage rien avec son application : vous aurez **votre** dépôt de code, **votre** adresse en ligne, **votre** inscription Microsoft et **votre** livre de comptes, chiffré par **votre** mot de passe.

Comptez une à deux heures la première fois. Les étapes 1 à 5 se font une seule fois.

**Ce qu'il faut :**

- un PC sous Windows, macOS ou Linux ;
- Git et Python 3 installés ;
- un compte GitHub (gratuit) ;
- un compte Microsoft personnel, celui de votre OneDrive.

Claude Code peut vous accompagner : ouvrez-le dans ce dossier, il y trouvera son guide (`CLAUDE.md`). Pour commencer, dites-lui simplement :

> Prends en main cette application en suivant la partie 0 de CLAUDE.md, puis accompagne-moi dans MISE-EN-ROUTE.md.

Il fera tourner l'application sur des données fictives, vous posera quelques questions sur votre banque et vos usages, puis vous guidera étape par étape. **Les identifiants, c'est toujours vous qui les saisissez**, jamais Claude : mot de passe GitHub, compte Microsoft, mot de passe du livre.

---

## 1. Votre liste de motifs personnels (garde-fou)

Le dépôt de code sera **public** : il ne doit jamais contenir vos numéros de comptes, votre nom ou votre adresse. Un contrôle automatique refuse tout enregistrement qui en contiendrait. Il lit vos motifs dans un fichier personnel, **hors du dépôt** :

- Windows : `C:\Users\<vous>\.budget-foyer-motifs.txt`
- macOS / Linux : `~/.budget-foyer-motifs.txt`

Créez ce fichier avec un motif par ligne : vos numéros de comptes et de cartes (au moins les 6 à 8 derniers chiffres), vos nom et prénom, votre adresse, votre employeur… Les lignes commençant par `#` sont des commentaires. Les IBAN français sont contrôlés d'office.

Ce fichier n'est jamais publié. Il vous est propre : ne réutilisez pas celui de quelqu'un d'autre.

## 2. Votre dépôt GitHub

1. Sur https://github.com, créez un compte si besoin, puis activez la double authentification (*Settings › Password and authentication*).
2. Bouton *New repository* : nom `budget-foyer`, visibilité *Public*, **sans** fichier initial, puis *Create repository*.
3. Placez ce dossier où vous voulez, par exemple dans `Documents`. Ouvrez un terminal dans le dossier (Git Bash sous Windows), puis tapez ces commandes une à une :
   ```bash
   git init -b main
   ```
   ```bash
   cp outils/crochet-pre-commit .git/hooks/pre-commit
   ```
   ```bash
   python outils/verifier_donnees.py --tout
   ```
   Le contrôle doit répondre « rien de personnel détecté ». Ensuite :
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Budget du foyer : ma copie"
   ```
   ```bash
   git remote add origin https://github.com/<votre-compte>/budget-foyer.git
   ```
   ```bash
   git push -u origin main
   ```
   À la première poussée, une fenêtre de connexion GitHub s'ouvre : identifiez-vous vous-même.

## 3. Votre publication (GitHub Pages)

Dans le dépôt, allez dans *Settings › Pages › Build and deployment* :

- choisissez *Deploy from a branch* ;
- branche `main`, dossier `/ (root)` ;
- cliquez sur *Save*.

Une à deux minutes plus tard, l'application est en ligne à :

`https://<votre-compte>.github.io/budget-foyer/`

Seul le code est publié : vos données n'iront jamais dans ce dépôt.

Pour l'essayer tout de suite sur des données fictives, ajoutez `?demo` à cette adresse. Pour lancer la suite de contrôle, ajoutez `?autotest`.

## 4. Votre inscription Microsoft (accès à OneDrive)

L'application range votre livre, toujours chiffré, dans un dossier réservé de **votre** OneDrive : « Applications › Budget foyer ». Le reste de votre OneDrive lui reste invisible. Il faut pour cela inscrire l'application chez Microsoft, à votre nom.

1. Connectez-vous à https://entra.microsoft.com avec votre compte Microsoft personnel. En haut à droite, sous votre nom :
   - **un nom d'annuaire** (par exemple « Default Directory ») : passez à l'étape 2 ;
   - **une suite de chiffres et de lettres** : vous n'avez pas encore d'annuaire. Ouvrez un compte Azure gratuit sur https://azure.microsoft.com/free. Microsoft demande un téléphone et une carte bancaire pour vérifier votre identité, sans débit tant qu'aucun service payant n'est créé. L'inscription d'une application n'est pas facturée.
2. Allez dans *Identité › Applications › Inscriptions d'applications › Nouvelle inscription* :
   - **Nom** : `Budget foyer` (ce sera le nom du dossier OneDrive) ;
   - **Types de comptes** : « Comptes Microsoft personnels uniquement » ;
   - **URI de redirection** : plateforme « Application monopage (SPA) », adresse `https://<votre-compte>.github.io/budget-foyer/`, exactement, **avec** la barre oblique finale ;
   - puis *Inscrire*.
3. Pour essayer l'application sur votre PC (facultatif) : *Authentification › Application monopage › Ajouter un URI* › `http://localhost:8000/` › *Enregistrer*.
4. Autorisation : *Autorisations d'API › Ajouter une autorisation › Microsoft Graph › Autorisations déléguées*. Cochez `Files.ReadWrite.AppFolder`, puis *Ajouter des autorisations*. Vous pouvez retirer `User.Read`.
5. Relevez l'**ID d'application (client)** dans *Vue d'ensemble* : 36 caractères. Ce n'est pas un secret. Aucun « secret client » n'est à créer.

## 5. Mettre votre identifiant dans le code

Ouvrez `src/js/05-stockage.js` et cherchez la ligne :

```
const CLIENT_GRAPH_DEFAUT = "";
```

Mettez votre identifiant entre les guillemets. Ensuite, reconstruisez la page, enregistrez et publiez :

```bash
python outils/construire.py
```
```bash
git commit -am "Mon identifiant Microsoft"
```
```bash
git push
```

Si vous laissez l'identifiant vide, l'application vous le demandera à la première connexion, sur chaque appareil.

## 6. Votre livre de comptes

1. Ouvrez `https://<votre-compte>.github.io/budget-foyer/` dans Chrome ou Edge.
2. Choisissez **« OneDrive en ligne »**, puis connectez-vous à votre compte Microsoft. Acceptez la demande d'accès au dossier de l'application.
3. Créez le livre : un nom et un **mot de passe** d'au moins 10 caractères (une phrase de quatre ou cinq mots est idéale). **Notez-le en lieu sûr : personne ne peut le retrouver à votre place**, pas même la personne qui vous a donné l'application.
4. Cochez « Se souvenir sur cet appareil » sur votre ordinateur personnel seulement.

L'application peut s'installer comme une application, avec le bouton « Installer » du navigateur.

## 7. Premiers pas

La liste **Réglages › Démarrage** vous guide. Dans l'ordre :

1. **Importer** : déposez le relevé du mois de votre banque.
   - **CSV**, à préférer s'il existe : la première fois, l'application vous demande à quoi sert chaque colonne (date, libellé, montant ou débit et crédit, solde) et à quel compte rattacher le fichier. Un aperçu montre le résultat : les dépenses doivent apparaître en négatif. Les fichiers suivants de même forme sont reconnus d'eux-mêmes.
   - **PDF** : l'application en fait une lecture générale et vous montre les lignes trouvées. Décochez ce qui n'est pas une opération et corrigez un signe si besoin (les lignes en rouge ont un sens incertain). Si le relevé porte un ancien et un nouveau solde, l'application vérifie que tout concorde.
   - Rien n'est importé deux fois, même si vous déposez le CSV puis le PDF du même mois.
2. **À traiter** : choisissez la catégorie de chaque opération. Chaque correction est retenue par la fiche du fournisseur et s'applique ensuite d'elle-même.
3. **Budget et réalisé** : « Créer le budget d'après les dépenses des 12 derniers mois », puis ajustez chaque ligne avec « Modifier ».
4. **Trésorerie** : ajoutez vos revenus réguliers (salaire…) avec « Nouvelle échéance », pour que la projection ait un sens.
5. Si votre relevé ne porte pas de solde : ouvrez **Bilan et résultat**, cliquez sur votre compte et saisissez le solde à une date.
6. **Réglages › Catégories et lieux** : les catégories proposées sont générales. Renommez, déplacez ou supprimez celles qui ne vous servent pas.

Certaines fonctions sont propres au foyer d'origine (exports LCL et Amex, facture des cartes à débit différé, classeur d'inventaire, coût par site). Elles restent en sommeil tant que vous ne vous en servez pas. L'écran « Coût par site » n'apparaît que si vous déclarez plusieurs lieux (par exemple deux logements).

## 8. Faire évoluer l'application

Demandez à Claude Code, ouvert dans ce dossier, par exemple : « ajoute la lecture des relevés CSV de ma banque ». Son guide (`CLAUDE.md`) lui explique :

- l'organisation du code ;
- la façon de travailler sur des données fictives ;
- le garde-fou des données personnelles.

**Ne lui donnez jamais un vrai relevé à mettre dans le dépôt.** Il fabrique un équivalent fictif. Après chaque modification, il reconstruit la page et vérifie ; c'est vous qui décidez de publier (`git push`).

## 9. Sécurité

- Le livre n'est lisible qu'avec votre mot de passe. Chaque jour d'écriture laisse une copie datée dans « sauvegardes/ », dans le dossier OneDrive de l'application.
- **Mot de passe oublié = livre illisible.** Gardez-le dans un gestionnaire de mots de passe.
- Le dépôt GitHub est public : n'y validez que du code. Le crochet installé à l'étape 2 et le fichier `.gitignore` refusent les relevés, classeurs et fichiers chiffrés.
- **Avant toute opération lourde** (supprimer un budget, reclasser beaucoup d'opérations, appliquer un lot de corrections, essayer une fonction nouvelle) : Réglages › Sauvegarde et export › **Télécharger une copie chiffrée**, puis rangez-la à part sous un nom daté. La copie automatique du jour ne contient pas ce que vous avez fait depuis le matin, et l'application n'a pas de bouton de restauration.
- Les photos des tickets sont gardées réduites (environ 0,1 Mo chacune) ; les dépôts du téléphone déjà intégrés sont retirés du OneDrive après 30 jours.
