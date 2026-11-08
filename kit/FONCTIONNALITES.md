# Catalogue des fonctionnalités — pour reprendre des idées dans une autre application

Cette page s'adresse à un Claude qui travaille sur **sa propre application** de budget et voudrait y reprendre une fonctionnalité de « Budget du foyer ». Le code fourni sert de **référence à lire**, pas d'application à installer.

## Méthode

- **Reprenez l'idée et l'algorithme, puis réécrivez-les dans le langage, les structures et les conventions de l'application d'accueil.** Ce code est en JavaScript sans bibliothèque, avec des noms français, et repose sur un livre JSON fusionné entre appareils (`03-modele.js`). Copier tel quel donne rarement du bon code ailleurs.
- **Le propriétaire choisit.** Présentez-lui ce que la fonctionnalité apporte et ce qu'elle exige (dépendances, changements de son modèle de données), puis attendez son accord avant de l'intégrer.
- **Jamais de donnée réelle** dans un dépôt, un test ou un exemple. Les jeux d'essai de ce code sont fictifs (`donnees-fictives/`, `29-autotest.js`) ; faites de même.
- La suite `?autotest` (`29-autotest.js`) contient des cas précis pour la plupart des fonctionnalités. Ce sont de bons cas à transposer dans les tests de l'application d'accueil.
- Les bibliothèques de `vendor/` (MSAL.js, pdf.js, Tesseract.js, qrcode-generator) ont leur propre licence : voir `vendor/LICENCES.md`.

Les chemins ci-dessous sont relatifs à `src/js/`. Les noms entre parenthèses sont ceux des fonctions principales.

---

## Saisie et lecture des pièces

### Lecture des tickets de caisse par photo (OCR sur l'appareil)
- **Ce que fait la fonctionnalité :**
  - prendre une photo de ticket, de facture ou de facturette CB ;
  - recadrer le papier ;
  - lire le texte sur l'appareil même (Tesseract.js, modèle français), sans aucun envoi vers un service ;
  - proposer le montant, la date, l'heure, le fournisseur, le SIRET, le numéro de facture et les 4 derniers chiffres de la carte.

  L'utilisateur valide ou corrige.
- **Où :** `12-ocr.js`.
  - Préparation de l'image : `cadrerPapier`, `preparerImage`. La copie gardée est réduite (1 200 px, niveaux de gris, JPEG 0,6 : environ 0,1 Mo par ticket).
  - Lecture : `lireTicket`. Quand le montant n'est pas sûr, deux passes de secours relisent l'image autrement préparée (niveaux de gris étirés, `etirerGris` ; seuil adaptatif lu en bloc, `seuilAdaptatif`).
  - Extraction des champs : `extraireTicket`, `montantsDe`, `numeroFacture`.
  - Reconnaissance du fournisseur dans le texte : `commercantDansTexte`, `commercantPourTicket`.
  - Règles du montant, mises au point sur des tickets réels :
    - le total vient d'une ligne « TOTAL » ou « MONTANT », jamais d'un sous-total, d'un rendu, d'une remise ou d'une ligne de TVA ;
    - les lettres lues pour des chiffres (O, S, I, B…) sont réparées dans les montants (`reparerMontantsOcr`) ;
    - faute de total lisible, le montant en euros le plus répété, sans les lignes de téléphone, de version de caisse ou de SIRET.
  - Règles du fournisseur :
    - nom reconnu à une ou deux lettres près ; un mot seul seulement s'il est distinctif ;
    - jamais une fiche de banque, de crédit, d'impôt ou de virement ;
    - un alias (souvent la raison sociale) imprimé sur n'importe quelle ligne suffit.
  - Mesure : Justificatifs › « Fiabilité de la lecture… » (`bilanLecture`, `22-ui-justificatifs.js`) rejoue la lecture sur les pièces déjà validées et exporte les écarts, avec ou sans les photos. C'est le banc d'essai de toute amélioration.
- **Dépend de :**
  - `vendor/tesseract/`, chargé à la demande et autorisé par la CSP (`wasm-unsafe-eval`, `worker-src blob:`) ;
  - pour reconnaître le fournisseur, la liste des fournisseurs (voir « Fournisseurs qui apprennent »).
- **Se reprend :** seule, et c'est la plus facile. `extraireTicket` est une fonction pure (texte → champs) : elle se transpose et se teste à part.

### Téléphone en « saisie seule » (envois chiffrés que le téléphone ne peut pas relire)
- **Ce que fait la fonctionnalité :**
  - le téléphone est appairé par un QR code affiché par le PC ;
  - il photographie et lit le ticket, fait choisir la catégorie, puis dépose la saisie **chiffrée** dans un dossier OneDrive ;
  - il ne détient que la **clé publique** du foyer : il peut déposer, jamais relire, et ne voit aucun compte ;
  - hors réseau, la saisie attend et part seule ;
  - le PC fusionne ensuite ces dépôts dans le livre.
- **Où :**
  - téléphone : `28-mobile.js` (`traiterAppairage`, `photographier`, `formulaireMobile`, `deposerSaisie`, `envoyerFile`) ;
  - chiffrement hybride : `04-crypto.js` (`nouvellePaireBoite`, `chiffrerPourBoite`, `dechiffrerBoite`), avec ECDH P-256 sur une clé éphémère, puis HKDF-SHA-256, puis AES-GCM ;
  - lien d'appairage : `27-ui-reglages.js` (`lienAppairage`) ;
  - fusion côté PC : `11-rapprochement.js` (`fusionnerBoite`) et `22-ui-justificatifs.js` ;
  - extrait des fournisseurs pour le téléphone, chiffré, sans aucun montant : `06-session.js` (`construireExtrait`, `publierExtraitCommercants`).
- **Dépend de :**
  - un stockage partagé accessible au téléphone : ici OneDrive en ligne via Microsoft Graph, donc une inscription d'application Microsoft ;
  - la lecture des tickets (ci-dessus).
- **Se reprend :** le principe s'adapte à tout stockage partagé, y compris un autre service que OneDrive. C'est une fonctionnalité exigeante : clés, appairage, file d'attente hors ligne.

### Rapprochement des tickets avec les opérations du relevé
- **Ce que fait la fonctionnalité :**
  - associer chaque justificatif à l'opération bancaire de même montant, dans une fenêtre de dates propre à son type (ticket, facture, facturette) ;
  - appliquer d'office un cas sans ambiguïté **seulement s'il ne change ni le fournisseur ni la catégorie de l'opération** (ni ne la ventile), de façon réversible ; sinon le proposer en tête, à confirmer d'un clic ; les autres attendent dans « À traiter » ;
  - gérer plusieurs tickets payés en une fois, la facture et la facturette d'un même achat (sans double compte), et les paiements en espèces.
- **Où :** `11-rapprochement.js` (`candidats`, `fenetre`, `achatsGroupes`, `lier`, `delier`, `rapprocherTout`, `justificatifDejaLa`, `creerOperationEspeces`), écran `22-ui-justificatifs.js`.
- **Dépend de :** opérations bancaires importées et justificatifs saisis. La carte (4 derniers chiffres) et son titulaire affinent les candidats.
- **Se reprend :** facilement, si l'application d'accueil a déjà des opérations et des pièces jointes. Le test `rapprochementModifie` (même fichier) est la garde à reprendre avec.

### Notes de frais : avance, remboursement et détail ligne par ligne
- **Ce que fait la fonctionnalité :**
  - un justificatif de type « Note de frais (à rembourser) » est une **créance** : il se rapproche du **virement reçu** (crédit) de même montant, jamais d'un débit, et sort des dépenses en attente ;
  - la note détaillée exportée par l'outil de l'employeur (« NDF #… », déclarant, lignes date / nature / montant) est lue, rangée sous un nom normalisé, et chaque ligne est rapprochée du **débit qui l'a payée** : montant exact, plusieurs lignes sur un paiement, billets pour deux personnes, ou choix à la main ;
  - le débit est **ventilé** : la part de la note va dans une catégorie hors budget (Transfert), le reste (autres voyageurs, trajets personnels) garde son classement ; tout se défait ;
  - les **justificatifs d'achat SNCF Connect** (PDF, ZIP, ou commandes relevées dans les e-mails en JSON) donnent pour chaque paiement ses trajets et ses voyageurs : la ligne du déclarant est rattachée au bon paiement sans calcul de montants.
- **Où :** `11b-notes-frais.js` (`extraireNoteFrais`, `rapprochementLignesNdf`, `classerDepensesNdf`, `declasserDepensesNdf`, `debitsDesAchats`, `rangerNoteFrais`), `08-lecture-fichiers.js` (`extraireAchatSncf`, `lireZipJustificatifs`), `02-xlsx.js` (`octetsDuZip`).
- **Dépend de :** rapprochement des justificatifs, relevés importés. Les formats (outil de notes de frais, SNCF Connect) sont ceux d'un foyer : à adapter.
- **Se reprend :** l'idée (créance rapprochée d'un crédit, ventilation d'un débit partagé) se transpose partout ; les lecteurs de documents sont à refaire pour d'autres formats.

---

## Classement

### Fournisseurs qui apprennent des corrections
- **Ce que fait la fonctionnalité :**
  - chaque libellé bancaire est ramené à une **clé** stable : `cleLibelle` retire dates, références, préfixes « CB », « PRLV SEPA » et numéros ;
  - la clé est rattachée à une **fiche fournisseur** (nom d'usage, alias) ;
  - chaque validation ou correction nourrit la fiche (catégorie, nature et lieu habituels) ; deux achats concordants suffisent à fixer un défaut ;
  - une fiche peut rester « à préciser » pour les fournisseurs aux achats variés ;
  - les doublons probables sont détectés et peuvent être fusionnés ;
  - **rien n'est déduit en silence** : un fournisseur seulement deviné dans le texte d'une pièce est affiché « à confirmer » ; un nom lu sur une pièce ne devient alias qu'après une question ; les mots de lieu ou d'adresse (souvent l'adresse du client imprimée sur la facture) ne suffisent jamais à reconnaître un fournisseur ; « Nouveau fournisseur… » crée une fiche, ne renomme jamais celle qui était attachée.
- **Ordre de décision du classement :** règle explicite, puis fiche du fournisseur, puis code MCC de la carte ou catégorie proposée par la banque, sinon « À préciser ».
- **Où :**
  - `07-classement.js` (`cleLibelle`, `trouverCommercant`, `assurerCommercant`, `apprendre`, `apprendreCorrection`, `proposerClassement`, `classerAutomatiquement`, `validerClassement`, tables `MCC`) ;
  - écran `23-ui-commercants.js` (`doublonsProbables`, `fusionnerGroupe`) ;
  - export Excel des fiches (`exporterFournisseurs`) : alias, libellés bancaires les plus fréquents, raisons sociales lues sur les pièces, volume. Il sert à rapprocher sur papier nom commercial, enseigne et dénomination sociale, puis à préparer un lot de corrections.
- **Se reprend :** seule, et c'est sans doute **la plus rentable**. `cleLibelle` et la table MCC se transposent telles quelles ; la logique d'apprentissage tient en quelques fonctions.

### Règles explicites et « plans »
- **Règles** : le libellé contient un mot (plusieurs possibles, séparés par `|`), avec des conditions facultatives (sens, montant, jour du mois, compte) et une priorité. Voir `07-classement.js` (`regleConvient`, `reglesTriees`).
- **Plan** : un fichier JSON (`budget-foyer-plan`) qui apporte d'un coup un budget, des échéances et des règles. Voir `09-import.js` (`appliquerPlan`).

---

## Import des relevés

- **Dédoublonnage :** chaque opération reçoit une empreinte faite du compte, de la date, du montant en centimes, du libellé normalisé et du rang d'occurrence dans le fichier. Un fichier réimporté n'ajoute rien. Voir `09-import.js` (`empreintes`, `preparerReleve`, `appliquerReleve`). Cette fonctionnalité **est à reprendre en premier** si l'application d'accueil importe des relevés.
- **Relevés de toute banque :** `08b-lecture-libre.js`.
  - CSV : l'utilisateur désigne une fois les colonnes, avec un aperçu ; le modèle est reconnu ensuite par la ligne d'en-tête.
  - PDF : lecture générale des lignes « date … montant ». Débit et crédit se distinguent par la position des colonnes, le contrôle se fait par l'ancien et le nouveau solde, puis l'utilisateur vérifie.
  - `analyserReleveLibre` est une fonction pure, testée dans `29-autotest.js`.
- **Lecteurs dédiés** (LCL, Amex, relevés PDF de placements, avis d'impôt) : `08-lecture-fichiers.js`. Ils servent d'exemples de reconnaissance par motifs.
- **Détail des cartes dans un relevé de compte PDF** (quand la banque ne donne plus de CSV pour les mois anciens) : `extraireCartesReleveLcl` lit la section « paiements par carte » carte par carte, contrôle chaque carte contre le **sous-total imprimé** (un écart égal au double d'une ligne la désigne comme remboursement) ; `preparerCartesPdf` (`09-import.js`) ne recrée pas un achat déjà connu sur la même carte, à la même date et pour le même montant, quel que soit son libellé.
- **Clôture du mois sur le relevé PDF** (`preparerClotureLcl`, `preparerClotureAmex`, `09-import.js`) : le relevé PDF de la banque fait foi.
  - Ses écritures sont appariées à celles du livre, à quelques jours près.
  - Les écritures manquantes sont proposées à l'ajout ; celles en trop sont expliquées (doublon exact, achat qui figure sur le relevé suivant), puis tranchées à la main.
  - Pour une carte à débit différé, l'encours est comparé au solde du relevé et chaque achat reçoit sa date de débit.
  - Les coches survivent au recalcul ; la clôture est mémorisée par compte et par période.
- **Lot de corrections** (`09b-corrections.js`) : un fichier JSON préparé à part (renommer, fusionner, recréer une fiche, déplacer une sous-catégorie, reclasser, fixer un classement par défaut) s'importe avec un aperçu chiffré, puis s'applique sur un clic. Utile après un contrôle de cohérence fait hors de l'application.
- **Dossier de dépôt :** importer tout un dossier d'un coup, puis ranger chaque fichier traité dans un dossier d'archives. Voir `21b-dossier-import.js` (API File System Access, Chrome et Edge).
- **Excel sans bibliothèque :** `02-xlsx.js` lit et écrit des `.xlsx` (zip et XML) avec les seules API du navigateur.

---

## Restitution

### Budget et réalisé
- **Ce que fait la fonctionnalité :**
  - un budget annuel par catégorie, réparti selon un profil mensuel (1/12 par défaut, ou 12 poids, pour une taxe d'octobre par exemple) ;
  - le réalisé du mois, le cumul et l'année, avec les écarts et les postes en dépassement ;
  - la répartition par lieu ;
  - une version imprimable ;
  - la création d'un budget d'après les dépenses des 12 derniers mois.
- **Où :** `13-calculs.js` (`poidsMois`, `tableauBudget`, `realiseParLigne`, `partsPeriode`), écran `24-ui-budget.js` (`lignesDepuisRealise`).
- **Règle utile :** un achat par carte à débit différé compte au budget **à sa date d'achat**, et à la trésorerie **à sa date de débit**.

### Trésorerie à 12 mois, au jour le jour
- **Ce que fait la fonctionnalité :**
  - projeter le solde du compte courant jour par jour à partir des échéances datées (salaire, loyer, impôts…) et du budget restant ;
  - placer chaque dépense au bon jour : jour habituel déduit des opérations passées, débit différé des cartes ;
  - signaler les seuils bas et haut, le premier découvert prévu et le virement conseillé.
- **Où :** `14-tresorerie.js` (`simulerTresorerie`, `joursHabituels`, `jourDominant`, `analyseTresorerie`), écran `26-ui-tresorerie.js`.
- **Dépend de :** budget, échéances, solde de départ.

### Bilan, résultat, épargne, projets
- **Bilan :** patrimoine à une date, à partir des soldes relevés et des valorisations lues dans les PDF de placements.
- **Compte de résultat :** par nature, avec un contrôle qui rapproche les deux.
- **Épargne :** courbe sur 12 mois.
- **Projets :** travaux, voiture… hors de la marche courante, avec leur échéancier.
- **Où :** `13-calculs.js`, `25-ui-patrimoine.js`, `27b-ui-projets.js`.
- **Graphiques :** SVG, sans bibliothèque (`17-graphiques.js`).

---

## Socle technique

### Chiffrement du livre
- **Ce que fait la fonctionnalité :**
  - une clé de données AES-256-GCM aléatoire chiffre tout le livre ;
  - cette clé est **enveloppée** par une clé dérivée du mot de passe (PBKDF2-SHA-256, 600 000 itérations) ;
  - changer de mot de passe ne rechiffre donc pas le livre ;
  - « Se souvenir sur cet appareil » garde la clé, non extractible, dans IndexedDB.
- **Où :** `04-crypto.js` (`creerEnveloppe`, `ouvrirEnveloppe`, `chiffrerLivre`, `dechiffrerLivre`), `06-session.js` (`memoriserCle`, `changerMotDePasse`).
- **Se reprend :** seule. L'API Web Crypto suffit, sans aucune dépendance.

### Synchronisation entre appareils, sans serveur
- **Ce que fait la fonctionnalité :**
  - chaque enregistrement porte `maj` (horodatage) et `app` (appareil) ;
  - avant d'écrire, l'appareil relit le livre partagé et **fusionne enregistrement par enregistrement**, en gardant le plus récent ; une suppression laisse une pierre tombale ;
  - les copies de conflit créées par OneDrive sont fusionnées puis rangées ;
  - une copie datée est gardée par jour ;
  - les dépôts du téléphone déjà fusionnés sont retirés après 30 jours si la pièce est bien enregistrée (`purgerBoiteTraitees`), pour ne pas remplir le OneDrive.
- **Stockage interchangeable :** trois « adaptateurs » de même interface :
  - dossier OneDrive synchronisé du PC ;
  - OneDrive en ligne via Graph, avec la seule autorisation `Files.ReadWrite.AppFolder` ;
  - navigateur seul.
- **Où :** `03-modele.js` (`fusionnerLivres`, `plusRecent`), `05-stockage.js`, `06-session.js` (`synchroniser`, `fusionnerCopiesDeConflit`, `sauvegardeDuJour`).

### Application installable, hors ligne, sûre
- **Page unique assemblée :** `outils/construire.py` assemble une page unique, dont le script en ligne est autorisé par son **empreinte** dans la CSP.
- **Service worker :** `sw.js` assure le fonctionnement hors ligne et la mise à jour de version.
- **Manifeste :** `manifest.webmanifest` rend l'application installable.
- **Garde-fou des données personnelles :** `outils/verifier_donnees.py` et `outils/crochet-pre-commit`, avec une liste de motifs propre au propriétaire, hors du dépôt. Utile à toute application publiée depuis un dépôt public.
- **Démonstration et suite de contrôle :** `?demo` et `?autotest`, sur données fictives en mémoire.

---

## Dépendances entre fonctionnalités

```
Chiffrement ── Synchronisation ── Téléphone en saisie seule ── Lecture des tickets (OCR)
                                                   └────────── Rapprochement ── Import des relevés (dédoublonnage)
Fournisseurs qui apprennent ── Classement ── Budget et réalisé ── Trésorerie à 12 mois
```

Fonctionnalités indépendantes, à reprendre seules :

- lecture des tickets (OCR) ;
- dédoublonnage des relevés ;
- clé de libellé et table MCC ;
- relevés de toute banque ;
- chiffrement du livre ;
- Excel sans bibliothèque ;
- garde-fou des données personnelles.
