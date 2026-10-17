# Publication et inscription Microsoft — procédure pas à pas

Deux opérations, à faire **par vous seul**, car elles demandent vos identifiants :

- **A. Publication** : mettre l'application en ligne sur GitHub Pages. C'est gratuit, et seul le code est publié.
- **B. Inscription Microsoft** : déclarer l'application auprès de Microsoft pour qu'elle accède à OneDrive en ligne. C'est indispensable au téléphone ; pour les PC, c'est facultatif.

Ordre conseillé : A, puis B, puis la création du livre (section C).

---

## A. Publication sur GitHub Pages

Pour une solution européenne, Codeberg Pages (association allemande, codeberg.org) fonctionne de la même façon. Il faudra alors adapter l'adresse de redirection de la partie B.

1. **Créer le compte** sur https://github.com/signup avec votre adresse e-mail, puis activer la double authentification : *Settings › Password and authentication*.
2. **Créer le dépôt** : bouton *New repository*, nom `budget-foyer`, visibilité *Public*, sans fichier initial, puis *Create repository*.
3. **Installer le contrôle des données personnelles**, une fois. Le fichier `%USERPROFILE%\.budget-foyer-motifs.txt` (numéros de comptes, noms, adresses) est déjà en place sur ce PC et n'est jamais publié. Ouvrez Git Bash dans le dossier de l'application :
   ```bash
   cd "/c/Users/<vous>/Documents/Claude/budget-foyer"
   ```
   ```bash
   git init -b main
   ```
   ```bash
   cp outils/crochet-pre-commit .git/hooks/pre-commit
   ```
   ```bash
   python outils/verifier_donnees.py --tout
   ```
   Le dernier contrôle doit afficher « rien de personnel détecté ». Ensuite, toute validation qui contiendrait un motif interdit sera refusée.
4. **Première publication** (remplacez `<compte>` par votre nom de compte GitHub) :
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Budget du foyer : première version"
   ```
   ```bash
   git remote add origin https://github.com/<compte>/budget-foyer.git
   ```
   ```bash
   git push -u origin main
   ```
   À la première poussée, une fenêtre de connexion GitHub s'ouvre : c'est vous qui vous y identifiez.
5. **Activer Pages** : dépôt › *Settings › Pages* › *Build and deployment* › *Deploy from a branch* › branche `main`, dossier `/ (root)` › *Save*. Après une à deux minutes, l'application est en ligne à `https://<compte>.github.io/budget-foyer/`.
6. **Mises à jour** : après une modification du code, reconstruire, valider et pousser.
   ```bash
   python outils/construire.py
   ```
   ```bash
   git commit -am "Mise à jour"
   ```
   ```bash
   git push
   ```

Le fichier `.gitignore` écarte aussi de la publication tout CSV, Excel, PDF, JSON, image ou fichier chiffré, hors du jeu fictif `donnees-fictives/`, ainsi que les maquettes.

---

## B. Inscription de l'application chez Microsoft (Entra)

But : obtenir un **identifiant d'application (client)**. Ce n'est pas un secret, mais il permet à l'application de demander l'accès à **son seul dossier** OneDrive (« Applications › Budget foyer »). Tout le reste du OneDrive lui reste invisible.

1. **Disposer d'un annuaire (tenant).** Connectez-vous à https://entra.microsoft.com avec le compte Microsoft qui porte votre OneDrive. En haut à droite, sous votre nom :
   - **un nom d'annuaire** (par exemple « Default Directory ») : passez à l'étape 2 ;
   - **une suite de chiffres et de lettres** (GUID) : vous n'avez pas encore d'annuaire, et Microsoft n'autorise alors aucune inscription d'application. Ouvrez un compte Azure gratuit sur https://azure.microsoft.com/free : Microsoft demande un téléphone et une carte bancaire pour vérifier l'identité, sans débit tant qu'aucun service payant n'est créé. L'annuaire « Default Directory » est créé au passage.
   - Point non tranché par la documentation : ce que devient l'annuaire si l'essai Azure expire sans être converti. L'inscription d'une application n'est pas facturée. Si l'annuaire devenait inaccessible, convertir l'abonnement en « paiement à l'utilisation » le garde actif, sans frais tant que rien de payant n'est créé.
2. **Nouvelle inscription** : *Identité › Applications › Inscriptions d'applications › Nouvelle inscription*.
   - **Nom** : `Budget foyer`. Ce nom devient celui du dossier OneDrive « Applications › Budget foyer ».
   - **Types de comptes pris en charge** : « Comptes Microsoft personnels uniquement ».
   - **URI de redirection** : plateforme « Application monopage (SPA) », adresse `https://<compte>.github.io/budget-foyer/`, exactement, avec la barre oblique finale.
   - Puis *Inscrire*.
3. **Adresse de test** (facultatif) : *Authentification › Application monopage › Ajouter un URI* › `http://localhost:8000/` › *Enregistrer*.
4. **Autorisation** : *Autorisations d'API › Ajouter une autorisation › Microsoft Graph › Autorisations déléguées*. Cochez `Files.ReadWrite.AppFolder`, puis *Ajouter des autorisations*. Vous pouvez retirer `User.Read`, inutile ici, pour réduire les droits au strict nécessaire.
5. **Relever l'identifiant** : *Vue d'ensemble › ID d'application (client)*, 36 caractères. Aucun « secret client » n'est à créer.

Références : [inscription d'une application (Microsoft Graph)](https://learn.microsoft.com/en-us/graph/auth-register-app-v2) ; [création d'un annuaire Entra](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-create-new-tenant) ; [dossier d'application OneDrive](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder) ; [autorisation Files.ReadWrite.AppFolder](https://learn.microsoft.com/en-us/graph/permissions-reference).

---

## C. Création du livre et appareils

1. **Premier PC** : ouvrez `https://<compte>.github.io/budget-foyer/`, choisissez « OneDrive en ligne », collez l'identifiant, puis « Se connecter ». Microsoft affiche une demande d'accès au dossier de l'application, que vous acceptez vous-même. Créez ensuite le livre (mot de passe).
   - Créez le livre par cette voie en ligne : le dossier « Applications › Budget foyer » est alors celui que Microsoft rattache à l'application. Ne le créez pas à la main.
2. **Réglages › Téléphones** : collez le même identifiant (« Identifiant de l'application Microsoft »), puis enregistrez.
3. **Second PC** : soit « OneDrive en ligne » avec le même identifiant, soit « Dossier OneDrive de ce PC ». Dans le second cas, choisissez `OneDrive › Applications › Budget foyer`, synchronisé par le client OneDrive (Chrome ou Edge requis).
4. **Téléphone en saisie seule** :
   - lisez le QR code affiché par le PC (Réglages › Téléphones) ;
   - connectez-vous au compte Microsoft du foyer ;
   - ajoutez l'application à l'écran d'accueil (menu du navigateur).

   Le navigateur du téléphone restera connecté à ce compte Microsoft : un navigateur ou un profil réservé à l'application est préférable. Les applications monopages doivent renouveler leur connexion environ une fois par jour s'il n'y a pas eu d'usage : un clic suffit.

**Sans inscription Microsoft**, les PC fonctionnent par la voie « Dossier OneDrive de ce PC » : choisissez par exemple `OneDrive › Budget foyer`. Seule la saisie au téléphone manque alors. Si la voie en ligne est activée plus tard, déplacez le contenu de ce dossier (`budget.chiffre`, `justificatifs`, `sauvegardes`) dans `OneDrive › Applications › Budget foyer` après la première connexion, puis choisissez ce nouveau dossier sur chaque PC.

---

## D. Contrôles de sécurité intégrés

- **Politique de sécurité (CSP)** : la page n'exécute que son propre script, identifié par son empreinte. Elle ne communique qu'avec Microsoft (connexion et OneDrive).
- **Bibliothèques** : MSAL.js, pdf.js, Tesseract.js et qrcode-generator sont hébergées avec l'application, sans appel à un CDN. L'OCR et la lecture des PDF se font sur l'appareil.
- **Jetons de connexion** : conservés par la bibliothèque Microsoft dans le stockage du navigateur. Ils ne donnent accès qu'au dossier de l'application, et le livre y reste chiffré.
- **Suite de contrôle** : `…/budget-foyer/?autotest`, sur des données fictives uniquement.
