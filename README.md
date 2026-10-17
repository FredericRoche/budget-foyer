# Budget du foyer

Budget, comptes et trésorerie d'un foyer, en une seule page web (PWA), sans serveur.

- **Données chiffrées** sur l'appareil (AES-256-GCM, clé enveloppée par PBKDF2-SHA-256, 600 000 itérations), partagées entre appareils par un dossier OneDrive : dossier synchronisé du PC, ou Microsoft Graph avec la seule autorisation `Files.ReadWrite.AppFolder`.
- **Imports** : exports CSV LCL (compte et « encours » par carte, avec la règle ⌈n/2⌉ pour les lignes carte doublées de l'export du compte), exports Amex (CSV ou Excel, dates mm/jj/aaaa), factures des cartes et relevés de placements en PDF (lus par pdf.js), classeur de reprise. Dédoublonnage et classement automatique (règles, puis fiches commerçants apprises des corrections).
- **Justificatifs** : photo, lecture locale par Tesseract.js, rapprochement avec tolérance de date, gestion des achats groupés et des facturettes CB.
- **Téléphone en saisie seule** : dépôts chiffrés à clé publique (ECDH P-256) dans une boîte que le PC fusionne.
- **Restitution** : budget et réalisé (débit différé compté à la date d'achat), bilan, compte de résultat par nature, trésorerie à 12 mois au jour le jour avec seuils.

Démonstration sur données fictives : ajouter `?demo` à l'adresse. Suite de contrôle : `?autotest`.

Documentation : [MODE-EMPLOI.md](MODE-EMPLOI.md) · [PROCEDURE-AZURE-ET-PUBLICATION.md](PROCEDURE-AZURE-ET-PUBLICATION.md).

## Développement

- Sources : `src/page.html`, `src/style.css`, `src/js/*.js`.
- Assemblage de `index.html` : `python outils/construire.py`.
- Jeu fictif : `python outils/donnees_fictives.py`.
- Captures : `python outils/captures.py URL dossier [largeur]`.
- Contrôle avant publication : `python outils/verifier_donnees.py --tout`.

Bibliothèques embarquées dans `vendor/` : voir [vendor/LICENCES.md](vendor/LICENCES.md).
