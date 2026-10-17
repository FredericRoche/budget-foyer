# Budget du foyer — mode d'emploi

Application de budget, de comptes et de trésorerie, en une seule page web. Elle s'installe comme une application (bouton « Installer » du navigateur, ou « Ajouter à l'écran d'accueil » sur téléphone) et fonctionne hors ligne.

Vos données ne quittent l'appareil que **chiffrées par votre mot de passe** (AES-256), vers le dossier OneDrive choisi. Le code publié ne contient aucune donnée.

Pour découvrir l'application sans rien installer ni importer, ouvrez l'adresse suivie de `?demo` : foyer, comptes et montants y sont fictifs, et rien n'est enregistré.

## 1. Première ouverture (premier PC)

1. Choisissez le stockage :
   - **OneDrive en ligne**, si l'inscription Azure est faite (voir la procédure) : ouvrez avec ce choix sur le premier PC ;
   - **dossier OneDrive de ce PC** ensuite, ou si l'inscription Azure n'est pas faite.
2. Créez le livre : nom du foyer et mot de passe d'au moins 10 caractères (une phrase de quatre ou cinq mots est idéale). **Notez-le en lieu sûr : personne ne peut le retrouver à votre place.**
3. Cochez « Se souvenir sur cet appareil » sur vos ordinateurs personnels seulement.

Sur le second PC : même adresse, même stockage, puis le mot de passe. Les deux PC partagent le même livre ; les modifications faites en parallèle sont fusionnées, enregistrement par enregistrement.

## 2. Mise en route (Réglages › Démarrage)

1. **Importer** : déposez votre fichier de règles initiales (JSON, conservé hors du dépôt), puis le classeur d'inventaire v7. L'application reprend l'historique classé, le budget 2027 et les hypothèses, ces dernières comme échéances à confirmer. Le classeur n'est pas modifié.
2. Déposez les relevés du mois (voir la routine ci-dessous).
3. **Réglages › Comptes** : vérifiez les titulaires des cartes et le compte de trésorerie.
4. **Trésorerie** : confirmez ou corrigez les échéances proposées (pensions, loyer, travaux, voiture), et ajoutez les cessions de titres quand les quantités seront arrêtées.
5. **Réglages › Téléphones** : appairez le téléphone en saisie seule.

Un **plan** (fichier JSON au format « budget-foyer-plan ») peut aussi être déposé : il ajoute d'un coup un budget, des échéances et des règles. Il sert par exemple à un budget provisoire de quelques mois. Un budget de même nom est remplacé ; ses notes s'affichent au survol des lignes et sous les échéances.

## 3. Routine du mois (écran « Importer »)

Déposez tous les fichiers d'un coup ; chacun est reconnu.

| Fichier | Où le trouver |
|---|---|
| Export CSV du compte joint | LCL, compte › Télécharger les opérations (CSV) |
| Export « encours » de chaque carte, **après l'arrêté** | LCL, compte › Encours carte › Exporter (CSV), une carte à la fois |
| Facture des cartes (PDF « CB_FACTURE_RETRAIT_DT_DIFFERE… ») | LCL, relevés et documents |
| Export Amex (CSV ou Excel) | Amex, relevés › Télécharger |
| Autre compte courant (CSV) | LCL, comme le compte joint |
| Relevés PDF (livrets, PEA, assurances-vie, retraite) | À leur arrivée ; un PDF protégé demande son mot de passe, jamais conservé |

L'application dédoublonne (rien n'est importé deux fois), classe, rapproche les justificatifs et contrôle le solde du compte joint, factures de cartes comprises.

**Débit différé** : un achat par carte compte au budget à sa **date d'achat**, et dans la trésorerie à la **date du débit**. La colonne « Débité le » et le filtre « Non encore débitées » le montrent.

## 4. Chaque semaine : « À traiter »

- **Opérations à classer** : validez les propositions cochées, ou corrigez la catégorie et le lieu. Une correction est retenue par la fiche du fournisseur et s'applique ensuite d'elle-même.
- **Justificatifs à rapprocher** : choisissez l'opération candidate, ou « paiement en espèces ».
- **Rapprochés automatiquement** : relisez-les ; « Défaire » annule.
- **Écarts de facture de cartes** : le plus souvent, un achat de fin de période à retrouver au prochain export.
- **Échéances à confirmer** : hypothèses reprises du classeur ou d'un plan ; « Confirmer » une fois montant et date vérifiés, « Modifier » sinon. Elles comptent déjà dans les projections.

### Revue des fournisseurs

Une classification exacte conditionne toutes les analyses. Pour passer le fichier en revue :

1. Écran **Fournisseurs**, case **« à vérifier seulement »** ; la liste est triée par nombre d'achats décroissant. L'en-tête indique l'avancement (« dont N vérifiés »).
2. Cliquer sur une ligne ouvre la fiche à droite.
3. **Fournisseur d'un seul type** (restaurant, boucher, pharmacie…) :
   - corriger au besoin le **nom d'usage** (« SARL LUXEMBOURG » devient « Artaban ») : les anciens libellés restent en alias ;
   - choisir la **catégorie**, la **nature** et le **lieu** ;
   - **« Enregistrer (vérifié) »**, puis **« Reclasser »** si l'application propose de corriger les opérations déjà validées : le passé est corrigé et les achats futurs seront classés d'office.
4. **Fournisseur aux achats variés** (Amazon, grande surface, Apple…) :
   - laisser la catégorie sur « À préciser » ;
   - **« Historique des achats »**, puis, pour chaque opération, saisir dans le détail la **nature exacte** (« cadeau d'anniversaire »), la **catégorie** et le **lieu**, puis **Enregistrer** ;
   - revenir à la fiche et **« Enregistrer (vérifié) »**.
5. **Doublons** : « Fusionner deux fiches… » en haut de l'écran.

Ordre conseillé : restaurants, courses, Amazon, parfumerie et beauté, vins et spiritueux, abonnements : ce sont les postes discrétionnaires les plus lourds, et ceux où se cachent les cadeaux.

## 5. Le téléphone en saisie seule

Appairage depuis le PC : Réglages › Téléphones, puis lecture du QR code par le téléphone. Il se connecte une fois au OneDrive du foyer.

Ensuite, pour chaque achat :
1. « Photographier un ticket » ;
2. vérifier le montant, la date et le fournisseur proposés (la lecture se fait sur le téléphone) ;
3. ajouter la nature exacte, toucher la catégorie et le lieu ;
4. « Envoyer ».

Plusieurs tickets réglés en un seul paiement : « Ajouter un second ticket au même paiement ».

Le téléphone ne peut ni lire les comptes ni relire ses dépôts. Sur le PC, l'écran **Boîte de saisies › Fusionner** intègre les dépôts et les rapproche des relevés.

## 6. Restitution

- **Tableau de bord** : dépensé et reste à dépenser du mois, trésorerie au plus bas, patrimoine net, écarts, répartition par lieu.
- **Budget et réalisé** : par mois, cumul ou année, filtre par lieu. Un clic sur une ligne ouvre ses opérations. Le bouton « Copier pour 2028 » prépare l'année suivante.
- **Bilan et résultat** : patrimoine à une date (soldes relevés, valorisations lues dans les PDF), compte de résultat par nature, avec un contrôle qui rapproche les deux.
- **Trésorerie** : la marche courante seule (revenus, budget, impôts), projetée jour par jour sur 12 mois, avec seuils bas et haut, virement conseillé avant un découvert, échéances.
- **Épargne** : livrets, assurances-vie et PER, en valeur brute sans fiscalité latente (leurs revenus y restent), plus les cessions de titres, moins le financement des projets et les approvisionnements du compte courant ; courbe sur 12 mois et alerte si elle passe sous zéro.
- **Projets** : travaux, voiture… hors marche courante ; coût, payé, reste, échéancier en appels de fonds et paiements rattachés (champ « Projet » d'une opération). Une échéance devient un projet dès qu'elle porte un nom de projet.

## 7. Sécurité et sauvegardes

- Chaque jour d'écriture laisse une copie datée dans `sauvegardes/` du dossier OneDrive.
- Verrouillage automatique après 15 minutes d'inactivité, sauf sur un appareil qui « se souvient ».
- Changer le mot de passe : Réglages › Sécurité. Seule l'enveloppe de la clé change.
- Téléphone perdu : Réglages › Téléphones › « Changer la clé de l'extrait », puis réappairer.
- Contrôle technique : ajoutez `?autotest` à l'adresse. Une suite de contrôles tourne sur des données fictives.
