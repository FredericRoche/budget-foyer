# Guide pour Claude — « Budget du foyer », copie autonome

Ce dépôt est la copie autonome d'une application de budget personnel, donnée à son propriétaire actuel par un membre de sa famille. La copie n'a **aucun lien** avec le dépôt d'origine :

- n'y ajoutez pas de remote vers le dépôt d'origine ;
- ne réutilisez pas l'identifiant Microsoft d'origine ;
- ne cherchez pas de données ailleurs que chez le propriétaire.

Le propriétaire n'est pas forcément développeur. Expliquez simplement, en français, et faites-lui valider toute publication (`git push`).

Si le propriétaire a déjà sa propre application et veut seulement y reprendre des fonctionnalités, lisez plutôt `FONCTIONNALITES.md`.

## 0. Prise en main : la première session

Vous découvrez ce code avec son nouveau propriétaire. Avant toute modification, faites dans l'ordre :

1. **Lisez ce guide en entier**, puis `MISE-EN-ROUTE.md` (ce que le propriétaire doit faire de son côté) et `FONCTIONNALITES.md` (ce que fait chaque partie du code, et où).
2. **Vérifiez l'outillage du poste** : `git --version`, `python --version` (Python 3.10 ou plus récent). S'il manque l'un ou l'autre, dites au propriétaire comment l'installer, sans le faire à sa place.
3. **Faites tourner le code tel qu'il est**, avant d'y toucher :
   - `python outils/construire.py` ;
   - `python -m http.server 8000` dans ce dossier ;
   - `http://localhost:8000/?autotest` : tous les contrôles doivent être verts. Notez le nombre : c'est la référence ;
   - `http://localhost:8000/?demo` : parcourez les écrans avec le propriétaire, sur données fictives.
4. **Faites le point avec le propriétaire** :
   - sa banque, ses cartes (débit immédiat ou différé), ses placements, ses appareils (PC, téléphone) ;
   - ce qu'il attend de l'application ;
   - ce qui, venant du foyer d'origine, ne le concerne pas (partie 6).

   Proposez ensuite un ordre de travail court. Commencez par ce qui sert tout de suite : lire les relevés de **sa** banque.
5. **Accompagnez la mise en route** (`MISE-EN-ROUTE.md`, parties 1 à 6) étape par étape. Le propriétaire saisit lui-même tous ses identifiants (GitHub, Microsoft, mot de passe du livre) ; vous ne les voyez ni ne les tapez jamais.
   - La liste de motifs (partie 1) vient avant le premier `git commit`.
   - Le crochet de contrôle est copié dans `.git/hooks/` juste après `git init`.
6. **Créez votre mémoire de travail.** Écrivez à la racine un `CLAUDE.md` propre au propriétaire, ou complétez celui-ci sous un titre « Notes du propriétaire ». Gardez-y ses choix, ses formats de relevés (décrits, jamais recopiés) et les règles qu'il vous donne. Ce fichier est publié : rien de personnel n'y entre.

Ensuite, à chaque session :

- `git pull` si le propriétaire travaille sur plusieurs postes ;
- lisez les derniers commits (`git log --since="3 weeks ago"`) : l'historique Git est le journal qui fait foi.

## 1. Règle absolue : aucune donnée réelle dans le dépôt

Le dépôt est public, car GitHub Pages le publie.

- **Ne mettez jamais dans le dépôt, les tests, les jeux d'essai ni les messages de validation** :
  - un relevé ;
  - un montant réel, un libellé réel, un nom de commerçant réel ;
  - un numéro de compte, un nom ou une adresse.
- Pour éprouver un lecteur de relevé, fabriquez un **équivalent fictif** :
  - dans `outils/donnees_fictives.py`, qui écrit dans `donnees-fictives/` ;
  - ou en ligne dans `src/js/29-autotest.js`.

  Inventez libellés, montants et numéros, avec le même format que l'original (colonnes, séparateurs, dates, signes).
- Un vrai relevé fourni pour comprendre un format se lit **hors du dépôt**, par exemple dans un dossier temporaire. Il ne se copie jamais dans le dépôt.
- Le garde-fou :
  - `outils/verifier_donnees.py` compare les fichiers aux motifs personnels du propriétaire. Ces motifs sont lus dans `~/.budget-foyer-motifs.txt`, **hors du dépôt**, et ne doivent jamais y entrer ; les IBAN français sont contrôlés d'office.
  - Le crochet `outils/crochet-pre-commit`, copié dans `.git/hooks/pre-commit`, lance ce contrôle à chaque validation.
  - Avant toute publication : `python outils/verifier_donnees.py --tout`.
- N'affaiblissez jamais ce garde-fou :
  - pas de `--no-verify` ;
  - pas de retrait de motifs ;
  - pas de relâchement de `.gitignore`, qui écarte CSV, Excel, PDF, JSON, images et `*.chiffre`, sauf `donnees-fictives/`.
- Le contenu de la liste de motifs ne se recopie pas dans une réponse.

## 2. Architecture

L'application tient en **une page web unique (PWA), sans serveur** :

- les données sont chiffrées sur l'appareil, en AES-256-GCM ;
- la clé est enveloppée par PBKDF2-SHA-256, à 600 000 itérations ;
- le livre est stocké dans le dossier d'application OneDrive du propriétaire, via Microsoft Graph :
  - autorisation `Files.ReadWrite.AppFolder` ;
  - autorité MSAL `consumers` ;
  - ou bien un dossier OneDrive local (File System Access) ;
- aucune bibliothèque n'est chargée d'un CDN : MSAL, pdf.js, Tesseract.js et qrcode-generator sont dans `vendor/` ;
- une politique de sécurité (CSP) n'autorise que le script en ligne identifié par son empreinte, et des connexions vers Microsoft seulement.

**Construction :**

- sources : `src/page.html`, `src/style.css`, `src/js/*.js` ;
- `python outils/construire.py` les concatène **par ordre alphabétique** dans `index.html`, calcule l'empreinte CSP et met à jour la version de `sw.js` ;
- **ne modifiez jamais `index.html` à la main** : reconstruisez après chaque changement ;
- pas de npm, pas de framework, pas d'étape de compilation.

| Fichier | Rôle |
|---|---|
| `01-utilitaires.js` | `h()` (construction du DOM, jamais d'`innerHTML`), montants (`lireMontant`, `versCentimes`, `euros`), dates ISO (`lireDate`, `dateFr`), CSV |
| `02-xlsx.js` | lecture des classeurs Excel, sans bibliothèque |
| `03-modele.js` | le livre : collections, `livreVide()`, catégories par défaut, `enregistrer` / `supprimer` / `vivants` / `obtenir`, fusion entre appareils |
| `04-crypto.js`, `05-stockage.js`, `06-session.js` | chiffrement, stockage (cache local, dossier, Graph), ouverture, enregistrement, synchronisation |
| `07-classement.js` | classement automatique : règles, puis fiches fournisseurs apprises, puis codes MCC |
| `08-lecture-fichiers.js` | reconnaissance des fichiers déposés : lecteurs dédiés (LCL, Amex, PDF de placements…) |
| `08b-lecture-libre.js` | **banque sans lecteur dédié** : CSV décrit une fois (modèle retenu), PDF en lecture générale vérifiée par l'utilisateur |
| `09-import.js` | intégration : `preparerReleve` (aperçu, dédoublonnage par empreinte), `appliquerReleve` |
| `10-reprise.js` | reprise d'un classeur d'inventaire propre au foyer d'origine (en sommeil) |
| `11`, `12`, `22` | justificatifs, OCR local des tickets, rapprochement |
| `13-calculs.js`, `14-tresorerie.js` | budget et réalisé, bilan, résultat, trésorerie à 12 mois |
| `15`–`27b` | écrans (`declarerEcran`), un fichier par écran |
| `28-mobile.js` | téléphone en saisie seule : dépôts chiffrés à clé publique |
| `29-autotest.js` | suite de contrôle (`?autotest`) sur livres fictifs en mémoire |
| `30-demonstration.js` | démonstration (`?demo`) sur données fictives |

**Modèle de données :**

- le livre est un objet JSON unique (`format: "budget-foyer"`) ;
- il porte des collections d'enregistrements (`comptes`, `operations`, `commercants`, `regles`, `budgets`, `echeances`…) et des `parametres` ;
- chaque enregistrement est daté (`maj`) et marqué par son appareil (`app`) ; la fusion garde le plus récent ;
- une suppression laisse une pierre tombale ;
- passez toujours par `enregistrer()` / `supprimer()` / `modifierParametres()` ;
- toute évolution doit **relire les livres existants** : ajouter des champs, n'en retirer ni n'en renommer aucun sans réparation à l'ouverture.

## 3. Conventions

- **Principe du foyer d'origine, à garder : pas de déduction appliquée sans accord.** L'application ne change d'elle-même ni un fournisseur, ni une catégorie, ni une fiche sur une supposition. Elle propose, l'utilisateur confirme. Seul ce qui ne change rien peut être automatique (par exemple un rapprochement sûr qui garde fournisseur et catégorie). Toute nouvelle automatisation passe ce test.

- **Tout en français** : identifiants, commentaires, textes affichés. Typographie française : guillemets « », espace avant `:` `;` `?` `!`.
- Imitez le code voisin : même densité de commentaires (courts, en tête de fonction, sur le *pourquoi*), mêmes aides (`h`, `champ`, `selection`, `dialogue`, `tableau`, `message`, `confirmer`).
- Montants en euros dans les objets ; les comparaisons et les sommes exactes se font en centimes (`versCentimes`). Dépense négative, recette positive.
- Dates : chaînes ISO `aaaa-mm-jj`.
- **Fins de ligne** : `.gitattributes` désactive toute conversion. Certains fichiers sont en LF, d'autres en CRLF : conservez celles du fichier modifié, sinon tout le fichier apparaît modifié.
- Pas de dépendance nouvelle. Si une bibliothèque est indispensable, elle va dans `vendor/` avec sa licence (`vendor/LICENCES.md`), jamais d'un CDN.

## 4. Ajouter le lecteur d'une banque

D'abord, vérifiez si la lecture générale suffit (`08b-lecture-libre.js`) :

- **CSV** : l'utilisateur décrit une fois les colonnes ; le modèle est retenu dans `parametres.modelesCsv` et reconnu par la ligne d'en-tête. C'est souvent suffisant.
- **PDF** : la lecture générale repère les lignes « date … montant ». Elle distingue débit et crédit par la position des colonnes « Débit » et « Crédit », puis l'utilisateur vérifie.

Un **lecteur dédié** se justifie quand la lecture générale ne suffit pas : numéro de compte à reconnaître, soldes, cartes à débit différé, relevés mal mis en page. Démarche :

1. Comprendre le format sur un vrai fichier fourni par le propriétaire, **lu hors du dépôt**. N'en recopiez aucune donnée.
2. Fabriquer un équivalent fictif, même structure et données inventées :
   - dans `outils/donnees_fictives.py`, puis `python outils/donnees_fictives.py` ;
   - les autres fichiers fictifs ne changent que par leur date de création : restaurez-les (`git checkout -- donnees-fictives/`) et ne gardez que le nouveau.
3. Écrire la reconnaissance **avant** la lecture générale, dans `08-lecture-fichiers.js` :
   - CSV : dans `lireCsv`, avant l'appel à `lireCsvLibre` ;
   - PDF : dans `reconnaitrePdf`.

   Elle rend un objet neutre :
   ```js
   {genre: "compte", banque: "Nom", nom, numero, periode: {debut, fin}, soldeDebut, soldeFin,
    lignes: [{date, montant, libelle, detail?, mcc?, categorieBanque?}]}
   ```
   (`genre: "carte"` avec `carte` pour une carte à débit différé.)
4. Rattacher le fichier à son compte dans `09-import.js` :
   - `compteAProposer` : compte à créer ;
   - `compteDuFichier` : compte existant, reconnu par son numéro.
5. Ajouter des cas dans `29-autotest.js`, avec des données inventées.
6. Lancer les contrôles et vérifier dans le navigateur :
   - `python outils/construire.py` ;
   - `python -m http.server 8000` ;
   - ouvrir `http://localhost:8000/?autotest` : tout doit être vert ;
   - essayer l'import du fichier fictif dans un livre « Ce navigateur seulement ».

## 5. Vérifier et publier

1. `python outils/construire.py`.
2. `http://localhost:8000/?autotest` : tous les contrôles au vert.
3. `python outils/verifier_donnees.py --tout` : « rien de personnel détecté ».
4. Valider (`git commit`), avec des messages qui ne décrivent jamais la vie ou les comptes du propriétaire.
5. **Publier seulement avec l'accord du propriétaire** : `git push`. GitHub Pages met l'application à jour en une à deux minutes ; le service worker propose la nouvelle version.

L'identifiant de l'application Microsoft du propriétaire se trouve dans `CLIENT_GRAPH_DEFAUT` (`src/js/05-stockage.js`). L'adresse de redirection inscrite chez Microsoft doit être **exactement** l'adresse publiée, barre oblique finale comprise, plus `http://localhost:8000/` pour les essais. La marche à suivre complète est dans `MISE-EN-ROUTE.md`, partie 4.

## 6. Ce qui vient du foyer d'origine

Ces éléments restent en sommeil tant qu'ils ne servent pas. Ne les retirez que si le propriétaire le demande.

- **Lecteurs LCL** (compte, encours des cartes, facture des cartes à débit différé, livrets, PEA, détail des cartes dans le relevé de compte PDF) et **Amex** (CSV, Excel, CSV enregistré dans Excel).
- **Notes de frais d'un employeur** et **justificatifs SNCF Connect** (`11b-notes-frais.js`) : formats propres au foyer d'origine.
- **Règle ⌈n/2⌉** pour les lignes carte que LCL double dans l'export du compte.
- **Reprise du classeur d'inventaire v7.**
- **« Coût par site »** : visible seulement avec plusieurs lieux.
- **Répartition du paiement d'une ligne de budget** entre « compte », « cartes LCL » et « Amex », qui sert à la trésorerie.
- **Clôture du mois sur le relevé PDF** de LCL et d'Amex (`preparerClotureLcl`, `preparerClotureAmex`, `09-import.js`). L'idée vaut pour toute banque : le relevé PDF fait foi, ses écritures sont comparées au livre, les écarts sont tranchés à la main.
- **Avis d'impôt, assurance-vie, livrets** : lecteurs propres aux documents de ce foyer.
- **Date de début du contrôle des anomalies** (`anomaliesDepuis`, par défaut le 1er octobre 2026, dans `11-rapprochement.js`) : pour un nouveau propriétaire, proposez de la régler sur le début de **son** suivi des pièces.
- **Catégories par défaut** (`CATEGORIES_DEFAUT`), modifiables dans Réglages ; « Créer une catégorie… » y ajoute une catégorie de premier niveau.

## 7. Méthode de travail apprise à l'usage

Ces règles viennent de l'usage réel de l'application d'origine. Chacune répond à un incident constaté.

**Avec les données du propriétaire :**

- **Une copie chiffrée avant toute action radicale.** Avant de supprimer ou remplacer un budget, de reclasser en masse, d'appliquer un lot de corrections ou d'essayer une fonction nouvelle sur le vrai livre, faites d'abord télécharger une copie chiffrée (Réglages › Sauvegarde et export › Télécharger une copie chiffrée), renommée et rangée à part. Cette étape vient en tête de la marche à suivre. Pourquoi : la copie automatique du jour est prise au premier enregistrement et ne contient pas le travail fait ensuite ; il n'y a pas de bouton de restauration.
- **Modifier les lignes, ne pas réécrire un budget.** Une nouvelle version part du budget actif et ne change que les lignes concernées. Ne reconstruisez jamais un budget entier depuis un export Excel. Pourquoi : l'export ne contient ni les répartitions par lieu, ni les modes de paiement, ni les jours de prélèvement, ni le lien des échéances ; une version réécrite les a perdus.
- **Corriger en masse par un lot.** Les corrections nombreuses (fusion de fiches, renommages, reclassements) se préparent dans un fichier « lot de corrections » (`09b-corrections.js`). Le propriétaire le relit, l'aperçu chiffré le confirme, puis il l'applique. Pas de manipulation directe du livre.
- **Mesurer sur les vraies pièces, hors du dépôt.** Pour améliorer une lecture (tickets, relevés), faites exporter les cas réels par le propriétaire (Justificatifs › « Fiabilité de la lecture… »). Rejouez-les dans un dossier temporaire, hors du dépôt, avant et après la modification : un progrès sur un cas ne doit rien casser ailleurs. Supprimez ensuite ces fichiers et ne gardez dans le dépôt que des cas fictifs équivalents.
- **Pas de déduction sans accord** (partie 3) : un réglage commode qui fausse un résultat se voit tôt ou tard. En cas de doute, l'application demande.

**Avec le code :**

- **Un commit par changement cohérent**, dont le message dit quoi **et pourquoi** : constat, correction, effet mesuré.
- **Reconstruire après toute modification de `src/`** (`python outils/construire.py`) : le numéro de version change, et chaque appareil charge alors la nouvelle version.
- Après une publication, vérifiez qu'elle est en ligne : la version de `https://<compte>.github.io/budget-foyer/sw.js` doit être la nouvelle.
- **Fins de ligne** : un script Python qui lit un fichier en CRLF doit couper sur `"\r\n"`, et l'écrire avec `newline=""`.
- **Un correctif resté sur un poste n'existe pas** : ni pour l'autre poste, ni pour l'application publiée.
