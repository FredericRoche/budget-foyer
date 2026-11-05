/* ================= Suite de contrôle (adresse ?autotest) =================
   Porte sur la logique pure et sur des livres fictifs créés en mémoire :
   aucune donnée réelle n'est lue ni modifiée. */

async function autotest(){
  const cas = [];
  const v = (nom, obtenu, attendu) => cas.push({nom, ok: JSON.stringify(obtenu) === JSON.stringify(attendu), obtenu, attendu});
  const vrai = (nom, cond, detail) => cas.push({nom, ok: !!cond, obtenu: detail ?? cond, attendu: true});
  const memoire = {LIVRE, session: Object.assign({}, SESSION), modifie: LIVRE_MODIFIE};
  const sauvegardePlanifiee = planifierSauvegarde;
  try {
    planifierSauvegarde = () => {};   // aucun enregistrement réel pendant les essais
    LIVRE = livreVide("Essai");

    /* --- Lectures de base --- */
    v("montant français", lireMontant("1 234,56"), 1234.56);
    v("montant point de milliers", lireMontant("356.973,29"), 356973.29);
    v("montant négatif", lireMontant("-206,38"), -206.38);
    v("date française", lireDate("31/03/2027"), "2027-03-31");
    v("date Amex mm/jj", lireDate("10/12/2026", "mj"), "2026-10-12");
    v("dernier jour ouvré (samedi 31/07/2027 → vendredi 30)", dernierJourOuvre("2027-07-10"), "2027-07-30");
    v("clé de libellé", cleLibelle("PRLV SEPA BOUCHERIE DU PONT 12/03 CAMPAGNE 123456"), "BOUCHERIE DU PONT CAMPAGNE");

    /* --- Export LCL du compte : soldes, lignes carte doublées --- */
    const csv = ["01/03/2027;10000,00;;09999 000099Z", "02/03/2027;-50,00;Virement;;PRLV SEPA EAU EXEMPLE;;;", "05/03/2027;-12,30;Carte;;CAFE TEST PARIS;;5812;Alimentation:Restaurant",
      "05/03/2027;-12,30;Carte;;CAFE TEST PARIS;;5812;Alimentation:Restaurant",
      "09/03/2027;2000,00;Virement;;;VIR CAISSE RETRAITE TEST;;", "30/03/2027;11950,00;;09999 000099Z"].join("\r\n");
    const lu = lireCsv("T_cpte_09999_000099Z_du_01-03-2027_au_30-03-2027.csv", csv);
    v("CSV LCL reconnu", lu.genre, "compte");
    v("CSV LCL : lignes", lu.lignes.length, 4);
    v("ceil(n/2) : 2 lignes identiques → 1", dedoublonnerCartesLcl(lu.lignes.filter(l => l.type === "Carte")).gardees.length, 1);
    v("ceil(n/2) : 3 lignes identiques → 2", dedoublonnerCartesLcl([1, 2, 3].map(() => ({date: "2027-03-05", montant: -1, libelle: "X"}))).gardees.length, 2);
    const cj = enregistrer("comptes", {nom: "Joint essai", type: "courant", banque: "LCL", numero: "000099Z"});
    modifierParametres({compteTresorerie: cj.id});
    const prep = preparerReleve(lu, cj);
    v("contrôle du solde hors cartes", prep.controles[0].ok, true);
    appliquerReleve(prep);
    v("réimport : zéro nouvelle ligne", preparerReleve(lireCsv("x_du_01-03-2027_au_30-03-2027.csv", csv), cj).nouvelles.length, 0);

    /* --- Export « encours » d'une carte, puis facture --- */
    const csvCarte = ["28/02/2027;45,40;;09999 000099Z", "03/03/2027;-33,10;Carte;;LIBRAIRIE TEST PARIS;;5942;Loisirs/culture", "05/03/2027;-12,30;Carte;;CAFE TEST PARIS;;5812;Alimentation:Restaurant", "27/03/2027;0;;09999 000099Z"].join("\n");
    const luc = lireCsv("T_cpte_09999_000099Z_carte_Carte_Premier_X333_du_28-02-2027_au_27-03-2027.csv", csvCarte);
    {
      // Export CSV Amex enregistré dans Excel : une seule colonne contenant les lignes CSV
      const ux = amexCsvDansFeuille("amex.xlsx", [["Date,Description,Montant"], ["10/31/2026,RELAIS ESSAI,\"87,00\""], ["10/19/2026,AVOIR ESSAI,\"-6,99\""], [null]]);
      v("export Amex CSV enregistré en Excel reconnu", [ux?.genre, ux?.carte, ux?.lignes.length, ux?.lignes[0].date, ux?.lignes[0].montant, ux?.lignes[1].montant], ["carte", "AMEX", 2, "2026-10-31", -87, 6.99]);
    }
    v("export carte reconnu",[luc.genre, luc.carte, luc.controle.ok], ["carte", "X333", true]);
    const carte = enregistrer("comptes", {nom: "Carte X333", type: "carte", banque: "LCL", carte: "X333", compteDebit: cj.id});
    const pc = preparerReleve(luc, carte);
    v("ligne déjà venue du compte : réattribuée", pc.reattribuees.length, 1);
    appliquerReleve(pc);
    const facture = reconnaitrePdf("CB_FACTURE_RETRAIT_DT_DIFFERE_31-03-2027.pdf", "Détails de l'opération\nMontant -45,40 €\nDétails RELEVE CB AU 27/03/27\nDate de l'opération 31/03/2027\nDate de valeur 31/03/2027\nNature de l'opération CB FACTURE/RETRAIT DT DIFFERE", null);
    v("facture PDF lue", [facture.genre, facture.montant, facture.arrete, facture.dateDebit], ["facture_cb", 45.4, "2027-03-27", "2027-03-31"]);
    const pf = preparerFacture(facture, cj);
    v("facture = somme des achats de la période (aucun écart)", pf.ecart, 0);
    appliquerFacture(pf);
    vrai("achats marqués débités le 31/03", vivants("operations").filter(o => o.compte !== cj.id && o.date <= "2027-03-27").every(o => o.dateDebit === "2027-03-31"));

    /* --- Amex CSV --- */
    const amex = lireCsv("activity.csv", 'Date,Description,Montant\n03/14/2027,RESTAURANT TEST PARIS,"84,50"\n03/20/2027,PRELEVEMENT AUTOMATIQUE,"-84,50"\n');
    v("Amex : date mm/jj et signe", [amex.lignes[0].date, amex.lignes[0].montant, amex.lignes[1].montant], ["2027-03-14", -84.5, 84.5]);

    /* --- Fenêtre de dialogue : « Annuler » ferme et rend false --- */
    {
      const pr = dialogue({titre: "essai", corps: h("p", null, "x"), actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "OK", classe: "primaire", valeur: true}]});
      document.querySelector("#dialogue .actions button").click();
      v("dialogue : Annuler ferme et rend false", [await pr, $("voile").hidden], [false, true]);
      // demander() : « Annuler » (valeur null) ne doit pas devenir true, qui créait une sous-catégorie « true ».
      const pa = demander("essai", "x", "texte");
      document.querySelector("#dialogue .actions button").click();
      const pv = demander("essai", "x", "texte");
      document.querySelector("#dialogue .actions button.primaire").click();
      v("demander : Annuler rend null, Valider le texte", [await pa, await pv, $("voile").hidden], [null, "texte", true]);
    }
    /* --- Reprise d'historique : date de débit estimée des achats carte, encours à venir --- */
    {
      const avant = LIVRE; LIVRE = livreVide("Essai reprise");
      const cc = enregistrer("comptes", {nom: "Joint", type: "courant", banque: "LCL"});
      const kl = enregistrer("comptes", {nom: "Cartes", type: "carte", banque: "LCL", carte: "LCL-NV", compteDebit: cc.id});
      const ka = enregistrer("comptes", {nom: "Amex", type: "carte", banque: "Amex", carte: "AMEX", compteDebit: cc.id});
      const op = (compte, date, montant, libelle) => enregistrer("operations", {compte, date, dateDebit: date, montant, libelle, origine: "reprise"});
      const l1 = op(kl.id, "2027-02-10", -20, "A"), l2 = op(kl.id, "2027-02-25", -5, "B"), l3 = op(kl.id, "2027-03-10", -7, "C");
      const a0 = op(ka.id, "2027-01-02", -99, "relevé antérieur incomplet");
      const a1 = op(ka.id, "2027-01-20", -30, "D"), a2 = op(ka.id, "2027-02-02", -10, "E"), a3 = op(ka.id, "2027-02-09", -15, "F");
      op(cc.id, "2027-01-12", -250, "PRLV SEPA AMERICAN EXPRESS"); op(cc.id, "2027-02-12", -40, "PRLV SEPA AMERICAN EXPRESS"); op(cc.id, "2027-03-15", 0, "fin des données");
      estimerDebitsCartes();
      v("reprise LCL : débit au dernier jour ouvré, puis à venir", [l1.dateDebit, l2.dateDebit, l3.dateDebit], ["2027-02-26", null, null]);
      v("reprise Amex : achats soldés par le prélèvement, suivant à venir", [a0.dateDebit, a1.dateDebit, a2.dateDebit, a3.dateDebit], ["2027-01-12", "2027-02-12", "2027-02-12", null]);
      v("facture LCL : achats arrêtés deux jours ouvrés avant", finPeriodeCarte("2026-09-30"), "2026-09-28");
      v("Amex : arrêté en cours de journée (dernier jour pris en partie)", (suiteSoldee([{date: "2027-01-05", montant: -5}, {date: "2027-01-05", montant: -7}, {date: "2027-01-06", montant: -4}, {date: "2027-01-06", montant: -3}], 1500) || []).map(o => o.montant), [-5, -7, -3]);
      v("reprise : correction idempotente", estimerDebitsCartes(), 0);
      LIVRE = avant;
    }

    /* --- Classement : règle, puis apprentissage --- */
    enregistrer("regles", {nom: "eau", contient: "EAU EXEMPLE", categorie: "Logement", sousCategorie: "Eau", lieu: "Autres", priorite: 10, active: true});
    v("règle appliquée", proposerClassement({libelle: "PRLV SEPA EAU EXEMPLE", montant: -50, date: "2027-04-02"}).categorie, "Logement");
    const opL = vivants("operations").find(o => /LIBRAIRIE/.test(o.libelle));
    Object.assign(opL, {categorie: "Culture et loisirs", sousCategorie: "Livres, presse, sorties, jeux", lieu: "Autres"}); validerClassement(opL, true);
    const p2 = proposerClassement({libelle: "LIBRAIRIE TEST PARIS", montant: -9, date: "2027-04-03"});
    v("correction mémorisée par le commerçant", [p2.categorie, p2.origine, p2.sur], ["Culture et loisirs", "commercant", true]);

    /* --- Chiffrement --- */
    const cle = await nouvelleCleDonnees();
    const env = await creerEnveloppe("phrase de passe d'essai", cle);
    const octets = await chiffrerLivre({format: "budget-foyer", essai: 42}, cle, env);
    const cle2 = await ouvrirEnveloppe("phrase de passe d'essai", env, false);
    v("chiffrement aller-retour", (await dechiffrerLivre(octets, cle2)).essai, 42);
    let refuse = false; try { await ouvrirEnveloppe("mauvais mot de passe", env); } catch (e){ refuse = true; }
    vrai("mauvais mot de passe refusé", refuse);
    vrai("le fichier ne contient pas le texte en clair", !dec.decode(octets).includes("essai"));
    {
      // Changement de mot de passe : seule l'enveloppe change, la clé de données (gardée par les appareils « se souvenir ») reste valable
      const env2 = await creerEnveloppe("nouvelle phrase de passe d'essai", cle);
      const oct2 = await chiffrerLivre({format: "budget-foyer", essai: 43}, cle, env2);
      v("mot de passe changé : nouvelle enveloppe lue dans l'en-tête, même clé de données", [JSON.stringify(lireEnTete(oct2).enveloppe) === JSON.stringify(env2), (await dechiffrerLivre(oct2, cle2)).essai], [true, 43]);
    }
    const paire = await nouvellePaireBoite(), autre = await nouvellePaireBoite();
    const depot = await chiffrerPourBoite({montant: "12,30"}, paire.publique);
    v("boîte : le PC lit la saisie", (await dechiffrerBoite(depot, paire.privee)).montant, "12,30");
    let illisible = false; try { await dechiffrerBoite(depot, autre.privee); } catch (e){ illisible = true; }
    vrai("boîte : illisible sans la clé privée du foyer (le téléphone ne peut pas relire)", illisible);

    /* --- Fusion de deux appareils --- */
    const base = livreVide("F"); base.operations = {a: {id: "a", libelle: "A", maj: 1, app: "x"}, b: {id: "b", libelle: "B", maj: 1, app: "x"}};
    const pc1 = JSON.parse(JSON.stringify(base)), pc2 = JSON.parse(JSON.stringify(base));
    pc1.operations.a = {id: "a", libelle: "A modifiée à Paris", maj: 5, app: "paris"};
    pc2.operations.b = {id: "b", libelle: "B modifiée à Campagne", maj: 6, app: "campagne"};
    pc2.operations.a = {id: "a", libelle: "A modifiée à Campagne, plus tard", maj: 7, app: "campagne"};
    const f = fusionnerLivres(pc1, pc2).livre;
    v("fusion : modifications différentes conservées", f.operations.b.libelle, "B modifiée à Campagne");
    v("fusion : même enregistrement, le plus récent l'emporte", f.operations.a.libelle, "A modifiée à Campagne, plus tard");

    /* --- Synchronisation avec conflit (adaptateur simulé) --- */
    const sim = adaptateurSimule();
    const e0 = await sim.ecrire("budget.chiffre", new Uint8Array([1]));
    await sim.ecrire("budget.chiffre", new Uint8Array([2]), e0);
    let conflit = false; try { await sim.ecrire("budget.chiffre", new Uint8Array([3]), e0); } catch (e){ conflit = !!e.conflit; }
    vrai("écriture refusée si le fichier a changé (étiquette)", conflit);

    /* --- Lecture de tickets --- */
    {
      const f1 = extraireTicket("FACTURE\nN°D99-001\nDate de création : 13/10/2026\nDESIGNATION Quantité Total HT\nTOTAL NET 1070 € .\nTVA non applicable");
      const f2 = extraireTicket("Facture\nn°\nDate\n12/10/2026\nMontant à régler HT\n3 560 €\nTVA 20%\n712 €\nMontant à régler TTC\n4 272 €\nIBAN\nFR76 0000 0000 0000 0000 0000 000");
      const fp = enregistrer("commercants", {nom: "Dupont Architecte Essai", alias: [], stats: {}, natures: {}, categorie: "Travaux essai", sousCategorie: "Études"});
      const tk = extraireTicket("Jean Dupont, architecte essai\nFacture\nn° Date\n2 6 – 0 7 – 10 2 12 / 10 /202 6\nMontant à régler TTC\n980 €");
      v("facture : date fragmentée et fournisseur nommé dans le texte", [tk.date, commercantPourTicket(tk)?.id === fp.id], ["2026-10-12", true]);
      {
        // L'adresse du client (« avenue de Valence, Paris ») ne doit pas faire reconnaître une boutique dont l'alias n'est fait que de lieux
        const fc = enregistrer("commercants", {nom: "Traiteur essai (place essai)", alias: ["RPG ST VALENCE PARIS"], stats: {}, natures: {}, categorie: "Alimentation"});
        const fh = extraireTicket("Hebergeur Essai Network SA\nFacture N° 12345\nClient : Jean Dupont\n10 avenue de Valence\n75005 Paris\nTotal TTC 13,68 €");
        const fh2 = Object.assign({}, fh, {raisonSociale: "Hebergeur Essai Network SA", enseigne: "Hebergeur Essai Network SA"});
        v("fournisseur : reconnaissance sûre (alias) distinguée de la supposition (texte)", [commercantSur({raisonSociale: "RPG ST VALENCE PARIS"}, [fc])?.id === fc.id, commercantSur({raisonSociale: "Autre nom"}, [fc])], [true, null]);
        v("facture : l'adresse du client ne désigne pas un commerçant", [commercantDansTexte(fh.texte, [fc]), commercantPourTicket(fh2, [fc])], [null, null]);
        supprimer("commercants", fc.id);
      }
      {
        const nb0 = vivants("commercants").length;
        const jm = await creerJustificatif({type: "ticket", date: "2027-03-10", montant: 12, commercantNom: "Boulangrie Nouvele", origine: "mobile"});
        v("téléphone : fournisseur inconnu laissé provisoire, aucune fiche créée", [vivants("commercants").length - nb0, jm.fournisseurProvisoire], [0, true]);
        const jv = await creerJustificatif({type: "ticket", date: "2027-03-10", montant: 4.5, commercantNom: "Essai espèces", carte: "ESPECES", origine: "mobile", aValider: true});
        rapprocherTout();
        {
          const ck = enregistrer("comptes", {nom: "Carte essai", type: "carte", carte: "X111", actif: true});
          apprendreChiffresCarte("7998", "X111");
          v("carte : 4 chiffres de la facturette appris puis reconnus", carteDesChiffres("############7998"), "X111");
          supprimer("comptes", ck.id);
        }
        {
          // Note de frais : rapprochée du virement de remboursement (crédit), jamais d'un débit de même montant
          const cc = enregistrer("comptes", {nom: "Courant essai NF", type: "courant", banque: "Essai", actif: true});
          const deb = enregistrer("operations", {compte: cc.id, date: "2027-04-02", montant: -1735.61, libelle: "CB ESSAI DEBIT"});
          const cre = enregistrer("operations", {compte: cc.id, date: "2027-05-20", montant: 1735.61, libelle: "VIR EMPLOYEUR ESSAI REMB NDF"});
          const nf = await creerJustificatif({type: "notefrais", date: "2027-04-01", montant: 1735.61, commercantNom: "Employeur essai", origine: "pc"});
          const c = candidats([nf]).map(x => x.op.id);
          v("note de frais : candidat = le crédit, pas le débit", [c.includes(cre.id), c.includes(deb.id)], [true, false]);
          v("note de frais : lue sur la pièce, hors en-cours", [extraireTicket("EMPLOYEUR ESSAI" + String.fromCharCode(10) + "NOTE DE FRAIS" + String.fromCharCode(10) + "Collaborateur" + String.fromCharCode(10) + "Total 1 735,61").type, encoursSaisis().lignes.some(l => l.montant === 1735.61)], ["notefrais", false]);
          delier(nf); supprimer("justificatifs", nf.id); supprimer("operations", deb.id); supprimer("operations", cre.id); supprimer("comptes", cc.id);
        }
        {
          // Note de frais détaillée : lecture des lignes, nom de rangement, débits retrouvés (un débit par ligne), classement réversible
          const L = String.fromCharCode(10);
          const texte = ["NDF #2681 : Novembre 2026, déclarée le 02/11/2026 Imprimé le 02/11/2026 à 16:44", " Entité légale : EMPLOYEUR ESSAI Contrôlé : Oui", "N° Date Nature TVA Montant TTC",
            "1 28/05/2026 Train 0,00 € 99,00 €", "2 01/06/2026 Train 0,00 € 99,00 €", "3 17/06/2026 Hôtel 0,00 € 25,01 €", "4 08/09/2026 Péages 0,00 € 6,20 €", "Total 229,21 €"].join(L);
          const x = extraireNoteFrais(texte);
          v("note de frais détaillée : numéro, date, lignes, total", [x.numero, x.declaree, x.lignes.length, x.lignes[2].nature, x.total, x.entite], ["2681", "2026-11-02", 4, "Hôtel", 229.21, "EMPLOYEUR ESSAI"]);
          v("note de frais : nom de rangement des notes déjà classées", nomNoteFrais(x), "2026 Note de frais 2681 novembre 2026 - 02-11.pdf");
          const cc = enregistrer("comptes", {nom: "Carte essai NDF", type: "carte", carte: "X919", actif: true});
          const o1 = enregistrer("operations", {compte: cc.id, date: "2026-05-27", montant: -99, libelle: "SNCF CONNECT ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
          const o2 = enregistrer("operations", {compte: cc.id, date: "2026-05-30", montant: -99, libelle: "SNCF CONNECT ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
          const o3 = enregistrer("operations", {compte: cc.id, date: "2026-06-17", montant: -25.01, libelle: "HOTEL ESSAI", categorie: "Voyages", sousCategorie: "Hôtels", statut: "classe"});
          const jn = enregistrer("justificatifs", {type: "notefrais", date: "2026-11-02", montant: 229.21, texteOCR: texte, categorie: "Transfert", sousCategorie: "Notes de frais essai", statut: "a_rapprocher", operations: []});
          const rap = rapprochementLignesNdf(jn);
          v("note de frais : chaque ligne trouve son débit, sans doublon", rap.map(r => r.op ? r.op.id : null), [o1.id, o2.id, o3.id, null]);
          const n = classerDepensesNdf(jn, rap);
          v("note de frais : débits classés avec la note", [n, obtenir("operations", o3.id).categorie, (obtenir("operations", o1.id).justificatifs || []).includes(jn.id)], [3, "Transfert", true]);
          declasserDepensesNdf(jn);
          v("note de frais : classement d'avant rétabli", [obtenir("operations", o3.id).categorie, obtenir("operations", o3.id).sousCategorie, !!obtenir("operations", o1.id).ndf], ["Voyages", "Hôtels", false]);
          // Deux billets payés ensemble, un seul sur la note : débit ventilé, l'autre moitié garde son classement
          {
            // Deux commandes de 198 € le même jour : chacune est un aller-retour seul (99 + 99), pas un billet « à deux »
            const t3 = ["NDF #2701 : Septembre 2026, déclarée le 30/09/2026", "1 07/09/2026 Train 0,00 € 99,00 €", "2 09/09/2026 Train 0,00 € 99,00 €", "3 14/09/2026 Train 0,00 € 99,00 €", "4 19/09/2026 Train 0,00 € 99,00 €", "Total 396,00 €"].join(L);
            const a1 = enregistrer("operations", {compte: cc.id, date: "2026-08-27", montant: -198, libelle: "SNCF-VOYAGEURS ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
            const a2 = enregistrer("operations", {compte: cc.id, date: "2026-08-27", montant: -198, libelle: "SNCF-VOYAGEURS ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
            const j4 = enregistrer("justificatifs", {type: "notefrais", date: "2026-09-30", montant: 396, texteOCR: t3, categorie: "Transfert", sousCategorie: "Notes de frais essai", statut: "a_rapprocher", operations: []});
            const rr = rapprochementLignesNdf(j4);
            v("note de frais : allers-retours payés en une fois préférés au billet « à deux »", [rr.every(r => r.op && r.facteur === 1 && r.groupe && r.groupe.length === 2), rr[0].op === rr[1].op, rr[2].op === rr[3].op, rr[0].op !== rr[2].op], [true, true, true, true]);
            supprimer("operations", a1.id); supprimer("operations", a2.id); supprimer("justificatifs", j4.id);
          }
          {
            // Justificatif d'achat SNCF Connect : un paiement, plusieurs trajets et voyageurs ; la ligne du déclarant s'y rattache
            const pdf = ["Justificatif d'achat", "Résumé de la commande", "Montant total (TTC) : 396,00 €", "Société SNCF Connect", "Détail des transactions", "Date de transaction : 10/05/2026 à 11:01:27",
              "Aller 01/06/2026 à 10:05:00", "Voyageur 1 : JEAN ESSAI - Carte Liberté", "Voyageur 2 : MARIE ESSAI - Carte Liberté", "198,00 €", "Réf: AAA111",
              "Aller 15/06/2026 à 10:05:00", "Voyageur 1 : JEAN ESSAI - Carte Liberté", "Retour 18/06/2026 à 16:56:00", "Voyageur 1 : JEAN ESSAI - Carte Liberté", "198,00 €", "Réf: BBB222",
              "Montant de la transaction (TTC) : 396,00 €", "Transaction n° 0099", "Référence commande AAA111, BBB222", "Numéro de carte : #######1234"].join(L);
            const ach = extraireAchatSncf(pdf);
            v("justificatif SNCF Connect lu (paiement, trajets, voyageurs)", [ach.date, ach.montant, ach.trajets.length, ach.trajets[0].voyageurs.join("/"), ach.trajets[2].sens, ach.carte4], ["2026-05-10", 396, 3, "JEAN ESSAI/MARIE ESSAI", "Retour", "1234"]);
            v("justificatif SNCF Connect reconnu à l'import", reconnaitrePdf("x.pdf", pdf, null).sousGenre, "achat_sncf");
            // Texte tel que le lecteur PDF du navigateur le rend : ligature coupée, prix avant les voyageurs
            const brut = extraireAchatSncf(["Justi fi catif d'achat", "Montant total (TTC) : 114,20 €", "Aller 09/07/2026 à 19:00:00", "88,00 €", "Voyageur 1 : JEAN ESSAI - Carte Liberté", "176,00 €", "Voyageur 2 : MARIE ESSAI - Carte Liberté", "Réf: AAA",
              "Aller 09/07/2026 à 21:12:00", "26,20 €", "Voyageur 1 : JEAN ESSAI - Carte Liberté", "Date de transaction : 01/07/2026 à 11:44:31", "Montant de la transaction (TTC) : 114,20 €", "Société SNCF Connect - 1-3 Rue"].join(L));
            v("justificatif SNCF Connect lu dans le texte du navigateur", [brut?.date, brut?.montant, brut?.trajets.map(t => t.heure + " " + t.voyageurs.join("/")).join(" | ")], ["2026-07-01", 114.2, "19:00 JEAN ESSAI/MARIE ESSAI | 21:12 JEAN ESSAI"]);
            const deb = enregistrer("operations", {compte: cc.id, date: "2026-05-11", montant: -396, libelle: "SNCF-VOYAGEURS ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
            const nAch = enregistrerAchatsSncf({nom: "x.pdf", achats: [ach]}), nAch2 = enregistrerAchatsSncf({nom: "x.pdf", achats: [ach]});
            const t5 = ["NDF #2702 : Juin 2026, déclarée le 30/06/2026", " Déclarant : ESSAI Jean", "1 01/06/2026 Train 0,00 € 99,00 €", "2 15/06/2026 Train 0,00 € 99,00 €", "3 18/06/2026 Train 0,00 € 99,00 €", "4 20/12/2026 Train 0,00 € 99,00 €", "Total 396,00 €"].join(L);
            const j5 = enregistrer("justificatifs", {type: "notefrais", date: "2026-06-30", montant: 396, texteOCR: t5, categorie: "Transfert", sousCategorie: "Notes de frais essai", statut: "a_rapprocher", operations: []});
            const r5 = rapprochementLignesNdf(j5);
            v("note de frais : lignes rattachées par le justificatif d'achat (doublon ignoré)", [nAch, nAch2, r5.map(r => r.op ? (r.op.id === deb.id ? "J" : "autre") : "-").join("")], [1, 0, "JJJ-"]);
            classerDepensesNdf(j5, r5);
            v("note de frais : paiement du justificatif ventilé (3 trajets avec la note, le reste au foyer)", (obtenir("operations", deb.id).ventilation || []).map(x => x.montant + " " + x.categorie), ["-99 Transfert", "-99 Transfert", "-99 Transfert", "-99 Transports"]);
            declasserDepensesNdf(j5);
            supprimer("operations", deb.id); supprimer("justificatifs", j5.id); for (const d of vivants("documents").filter(d => d.genre === "achat_sncf" && d.transaction === "0099")) supprimer("documents", d.id);
            // Achats relevés dans les e-mails (JSON) : reconnus, dédoublonnés par référence ; deux commandes du jour payées ensemble
            const js = JSON.stringify({format: "budget-foyer-achats-sncf", source: "e-mails", achats: [
              {date: "2025-05-12", montant: 128, references: ["RRR001"], trajets: [{sens: "Aller", date: "2025-05-15", voyageurs: ["Jean Essai", "Marie Essai"]}]},
              {date: "2025-05-12", montant: 95, references: ["RRR002"], trajets: [{sens: "Aller", date: "2025-05-29", voyageurs: ["Jean Essai"]}]},
              {date: "2025-05-12", montant: 95, references: ["RRR002"], trajets: [{sens: "Aller", date: "2025-05-29", voyageurs: ["Jean Essai"]}]}]});
            const lj = lireJson("achats.json", js);
            const nj = enregistrerAchatsSncf(lj);
            const dj = enregistrer("operations", {compte: cc.id, date: "2025-05-13", montant: -223, libelle: "SNCF-VOYAGEURS ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
            const t7 = ["NDF #1700 : Mai 2025, déclarée le 31/05/2025", " Déclarant : ESSAI Jean", "1 15/05/2025 Train 0,00 € 64,00 €", "2 29/05/2025 Train 0,00 € 95,00 €", "Total 159,00 €"].join(L);
            const j7 = enregistrer("justificatifs", {type: "notefrais", date: "2025-05-31", montant: 159, texteOCR: t7, categorie: "Transfert", sousCategorie: "Notes de frais essai", statut: "a_rapprocher", operations: []});
            v("achats des e-mails : reconnus, doublon écarté, deux commandes du jour sur un seul débit", [lj.sousGenre, nj, rapprochementLignesNdf(j7).map(r => r.op === dj ? "J" : "-").join("")], ["achat_sncf", 2, "JJ"]);
            supprimer("operations", dj.id); supprimer("justificatifs", j7.id);
            for (const d of vivants("documents").filter(d => d.genre === "achat_sncf" && (d.references || []).some(r => /^RRR/.test(r)))) supprimer("documents", d.id);
            // Deux paiements avec un trajet le même jour (97 € seul ; 88 € + 26,20 €) : chaque ligne va au bon paiement
            const achat = (tx, mt, heures) => ["Justificatif d'achat", "SNCF Connect", "Date de transaction : 01/07/2026 à 11:00:00"].concat(heures.flatMap(hh => ["Aller 09/07/2026 à " + hh + ":00", "Voyageur 1 : JEAN ESSAI - Carte Liberté"]),
              ["Montant de la transaction (TTC) : " + mt + " €", "Transaction n° " + tx]).join(L);
            enregistrerAchatsSncf({nom: "a.pdf", achats: [extraireAchatSncf(achat("0201", "97,00", ["07:08"])), extraireAchatSncf(achat("0202", "114,20", ["19:00", "21:12"]))]});
            const d97 = enregistrer("operations", {compte: cc.id, date: "2026-07-01", montant: -97, libelle: "SNCF-VOYAGEURS ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
            const d114 = enregistrer("operations", {compte: cc.id, date: "2026-07-01", montant: -114.2, libelle: "SNCF-VOYAGEURS ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
            const t6 = ["NDF #2703 : Juillet 2026, déclarée le 31/07/2026", " Déclarant : ESSAI Jean", "1 09/07/2026 Train 0,00 € 88,00 €", "2 09/07/2026 Train 0,00 € 97,00 €", "3 09/07/2026 Train 0,00 € 26,20 €", "Total 211,20 €"].join(L);
            const j6 = enregistrer("justificatifs", {type: "notefrais", date: "2026-07-31", montant: 211.2, texteOCR: t6, categorie: "Transfert", sousCategorie: "Notes de frais essai", statut: "a_rapprocher", operations: []});
            v("note de frais : même jour, deux paiements : chaque ligne au bon justificatif", rapprochementLignesNdf(j6).map(r => r.op === d97 ? "97" : r.op === d114 ? "114" : "-"), ["114", "97", "114"]);
            supprimer("operations", d97.id); supprimer("operations", d114.id); supprimer("justificatifs", j6.id);
            for (const d of vivants("documents").filter(d => d.genre === "achat_sncf" && ["0201", "0202"].includes(d.transaction))) supprimer("documents", d.id);
          }
          {
            // Nature sans mot connu : le choix à la main propose les débits proches en montant, quel que soit le libellé
            const pe = enregistrer("operations", {compte: cc.id, date: "2025-10-20", montant: -1599, libelle: "BOUTIQUE ESSAI", categorie: "Maison", sousCategorie: "Équipement, électroménager", statut: "classe"});
            const t8 = ["NDF #1800 : Octobre 2025, déclarée le 24/11/2025", "1 22/10/2025 Petit équipement 0,00 € 1 581,00 €", "Total 1 581,00 €"].join(L);
            const j8 = enregistrer("justificatifs", {type: "notefrais", date: "2025-11-24", montant: 1581, texteOCR: t8, statut: "a_rapprocher", operations: []});
            v("note de frais : nature sans mot connu, débit proposé au choix à la main", debitsPossiblesNdf(j8, lignesNoteFrais(j8)[0]).some(o => o.id === pe.id), true);
            supprimer("operations", pe.id); supprimer("justificatifs", j8.id);
          }
          {
            // Relevé PDF LCL : détail des cartes, carte reconnue, devise ignorée, année de janvier, remboursement, doublons
            const ck = enregistrer("comptes", {nom: "Carte essai PDF", type: "carte", banque: "LCL", carte: "X456", actif: true});
            const rel = ["RELEVE DE COMPTE", "Indicatif : 8208 Compte : 99 Z", "PAIEMENTS PAR CARTE DE JANVIER 2027", "LIBELLE VALEUR DEBIT CREDIT",
              "CARTE N° 12 3456 M JEAN ESSAI", "SOUS TOTAL : 1 608,50", "BOUTIQUE ESSAI LE 30/12 1 581,00", "Rotterdam 1581,00 EUR", "CAFE ESSAI LE 03/01 20,00", "CAFE ESSAI LE 03/01 20,00", "AVOIR ESSAI LE 05/01 12,50",
              "CARTE N° 34 5678 MME MARIE ESSAI", "SOUS TOTAL : 8,00", "PAIN ESSAI LE 04/01 8,00", "TOTAUX 1 616,50", "MONTANT COMPTABILISE LE 31/01/2027"].join(L);
            const lc = extraireCartesReleveLcl(rel);
            v("relevé PDF LCL : cartes, dates, devise ignorée, remboursement reconnu", [lc.cartes.length, lc.cartes[0].carte, lc.cartes[0].lignes.map(l => l.date + " " + l.montant).join(" | "), lc.cartes[0].controle.ok, lc.cartes[1].carte],
              [2, "X456", "2026-12-30 -1581 | 2027-01-03 -20 | 2027-01-03 -20 | 2027-01-05 12.5", true, "X678"]);
            const p1 = preparerCartesPdf(lc); appliquerCartesPdf(p1);
            v("relevé PDF LCL : achats déjà débités (fin du mois de la section), pas d'encours", vivants("operations").filter(o => o.compte === ck.id).map(o => o.dateDebit), ["2027-01-29", "2027-01-29", "2027-01-29", "2027-01-29"]);
            const p2 = preparerCartesPdf(extraireCartesReleveLcl(rel));
            v("relevé PDF LCL : deux achats identiques gardés, réimport sans doublon, carte inconnue sans titulaire", [p1.nouvelles.length, p2.nouvelles.length, vivants("operations").filter(o => o.compte === ck.id && o.date === "2027-01-03").length, p1.cartes[1].sansTitulaire], [5, 0, 2, true]);
            for (const o of vivants("operations").filter(o => /ESSAI/.test(o.libelle) && o.date >= "2026-12-30" && o.date <= "2027-01-05")) supprimer("operations", o.id);
            for (const i of vivants("imports").filter(i => /2027-01|2026-12-30/.test(JSON.stringify(i.periode || {})))) supprimer("imports", i.id);
            supprimer("comptes", ck.id);
          }
          {
            // Lot de corrections : aperçu sans effet, puis application sur clic
            const fa = enregistrer("commercants", {nom: "Etude Essai", alias: [], stats: {}, natures: {}});
            const fb = enregistrer("commercants", {nom: "Doublon Essai A", alias: ["DOUBLON A"], stats: {}, natures: {}});
            const fc2 = enregistrer("commercants", {nom: "Doublon Essai B", alias: ["DOUBLON B"], stats: {}, natures: {}});
            const o1 = enregistrer("operations", {compte: cc.id, date: "2027-02-01", montant: -500, libelle: "VIR DEMENAGEUR ESSAI", commercant: fa.id, categorie: "Logement", sousCategorie: "Entretien"});
            const o2 = enregistrer("operations", {compte: cc.id, date: "2027-02-02", montant: -5, libelle: "DOUBLON B", commercant: fc2.id, categorie: "Culture et loisirs", sousCategorie: "Livres, presse, sorties, jeux"});
            const jd = enregistrer("justificatifs", {type: "devis", date: "2027-02-01", montant: 99, commercant: fa.id, commercantNom: fa.nom, natureExacte: "Étude de sol essai", statut: "a_rapprocher", operations: []});
            const lot = lireJson("c.json", JSON.stringify({format: "budget-foyer-corrections", actions: [
              {type: "renommerFiche", de: "Etude Essai", vers: "Demenageur Essai"}, {type: "creerFiche", nom: "Etude Essai", depuis: "Demenageur Essai", natureJustificatifs: "sol"},
              {type: "fusionnerFiches", garder: "Doublon Essai A", absorber: ["Doublon Essai B", "Inconnue Essai"]},
              {type: "reclasser", fournisseur: "Doublon Essai A", de: ["Culture et loisirs", "Livres, presse, sorties, jeux"], vers: ["Abonnements", "Abonnements numériques"], ficheParDefaut: true}]}));
            const ap = preparerCorrections(lot);
            // Aperçu enchaîné : une fusion avec nouveau nom, puis un reclassement sous ce nom, compte les opérations absorbées
            const ap2 = preparerCorrections({actions: [{type: "fusionnerFiches", garder: "Doublon Essai A", absorber: ["Doublon Essai B"], nom: "Doublon Essai"},
              {type: "reclasser", fournisseur: "Doublon Essai", de: ["Culture et loisirs", "Livres, presse, sorties, jeux"], vers: ["Abonnements", "Abonnements numériques"]},
              {type: "categorieFiche", fiche: "Doublon Essai", categorie: "Abonnements", sousCategorie: "Abonnements numériques"}]});
            v("lot de corrections : fiche retrouvée malgré espaces et ponctuation", ficheNommee("Doublon  essai A.")?.id, fb.id);
            v("lot de corrections : aperçu d'une fusion renommée puis reclassée", ap2.lignes.map(l => l.ok + ":" + (l.n || 0)), ["true:1", "true:1", "true:0"]);
            v("lot de corrections : aperçu sans effet, actions enchaînées (renommage puis recréation)", [lot.genre, ap.lignes.length, obtenir("commercants", fa.id).nom, !!obtenir("commercants", fc2.id), ap.lignes[1].ok, ap.lignes[1].n], ["corrections", 4, "Etude Essai", true, true, 1]);
            appliquerCorrections(lot);
            const etude = ficheNommee("Etude Essai");
            v("lot de corrections : renommage, fiche recréée avec son devis, fusion, reclassement", [obtenir("commercants", fa.id).nom, obtenir("justificatifs", jd.id).commercant === etude?.id, obtenir("operations", o1.id).commercant === fa.id,
              obtenir("operations", o2.id).commercant === fb.id, !obtenir("commercants", fc2.id), obtenir("operations", o2.id).categorie, obtenir("commercants", fb.id).categorie],
              ["Demenageur Essai", true, true, true, true, "Abonnements", "Abonnements"]);
            for (const x of [o1, o2]) supprimer("operations", x.id); supprimer("justificatifs", jd.id);
            for (const f of [fa, fb, etude].filter(Boolean)) supprimer("commercants", f.id);
          }
          v("note de frais : un parking de gare n'est pas un billet de train", [libelleColleNature("Train", {libelle: "EFFIA VALENCE TGV"}), libelleColleNature("Train", {libelle: "SNCF-VOYAGEURS PARIS"})], [false, true]);
          const o4 = enregistrer("operations", {compte: cc.id, date: "2026-09-01", montant: -12.4, libelle: "TUNNEL ESSAI", categorie: "Voyages", sousCategorie: "Hôtels", statut: "classe"});
          const r4 = rapprochementLignesNdf(jn).find(r => r.ligne.n === 4);
          classerDepensesNdf(jn, [r4]);
          const v4 = obtenir("operations", o4.id).ventilation || [];
          v("note de frais : débit du double ventilé (part remboursée / part du foyer)", [r4.facteur === 2, v4.map(x => x.montant + " " + x.categorie)], [true, ["-6.2 Transfert", "-6.2 Voyages"]]);
          declasserDepensesNdf(jn);
          v("note de frais : ventilation retirée au rétablissement", !!obtenir("operations", o4.id).ventilation, false);
          // Un paiement pour plusieurs trajets à deux : 4 billets (2 lignes × 2 personnes) = 396 €
          const texte2 = ["NDF #2700 : Décembre 2026, déclarée le 05/12/2026", "1 03/12/2026 Train 0,00 € 99,00 €", "2 05/12/2026 Train 0,00 € 99,00 €", "3 05/12/2026 Taxi 0,00 € 30,00 €", "Total 228,00 €"].join(L);
          const o5 = enregistrer("operations", {compte: cc.id, date: "2026-11-20", montant: -396, libelle: "SNCF CONNECT ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
          const o6 = enregistrer("operations", {compte: cc.id, date: "2026-12-05", montant: -60, libelle: "BOULANGERIE ESSAI", categorie: "Alimentation", sousCategorie: "Courses", statut: "classe"});
          const j2 = enregistrer("justificatifs", {type: "notefrais", date: "2026-12-05", montant: 228, texteOCR: texte2, categorie: "Transfert", sousCategorie: "Notes de frais essai", statut: "a_rapprocher", operations: []});
          const rap2 = rapprochementLignesNdf(j2);
          v("note de frais : un paiement pour plusieurs trajets à deux, sans coïncidence de montant", rap2.map(r => r.op ? r.op.id + "×" + r.facteur : null), [o5.id + "×2", o5.id + "×2", null]);
          classerDepensesNdf(j2, rap2);
          v("note de frais : paiement groupé ventilé (deux parts avec la note, le reste au foyer)", (obtenir("operations", o5.id).ventilation || []).map(x => x.montant + " " + x.categorie), ["-99 Transfert", "-99 Transfert", "-198 Transports"]);
          v("note de frais : groupe repris tel quel une fois classé", rapprochementLignesNdf(j2).map(r => r.op ? r.op.id : null), [o5.id, o5.id, null]);
          declasserDepensesNdf(j2);
          // Choix à la main : paiement mêlant d'autres billets (247 €), puis ligne ajoutée au même débit
          const o7 = enregistrer("operations", {compte: cc.id, date: "2026-11-25", montant: -247, libelle: "SNCF CONNECT ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
          choisirDebitNdf(j2, 1, null); choisirDebitNdf(j2, 2, null);
          v("note de frais : débit d'un autre prix proposé au choix à la main", debitsPossiblesNdf(j2, lignesNoteFrais(j2)[0]).map(o => o.id).includes(o7.id), true);
          choisirDebitNdf(j2, 1, o7.id);
          classerDepensesNdf(j2, rapprochementLignesNdf(j2));
          v("note de frais : choix à la main ventilé (part de la note, reste au foyer)", (obtenir("operations", o7.id).ventilation || []).map(x => x.montant + " " + x.categorie), ["-99 Transfert", "-148 Transports"]);
          choisirDebitNdf(j2, 2, o7.id);
          v("note de frais : autre ligne ajoutée au même débit, reventilé", [classerDepensesNdf(j2, rapprochementLignesNdf(j2)), (obtenir("operations", o7.id).ventilation || []).map(x => x.montant + " " + x.categorie)], [1, ["-99 Transfert", "-99 Transfert", "-49 Transports"]]);
          declasserDepensesNdf(j2);
          const j3 = enregistrer("justificatifs", {type: "notefrais", date: "2026-12-05", montant: 228, texteOCR: texte2, categorie: "Transfert", sousCategorie: "Notes de frais essai", statut: "a_rapprocher", operations: [], ndfManuel: {1: o7.id, 2: o7.id}});
          const o8 = enregistrer("operations", {compte: cc.id, date: "2026-11-26", montant: -100, libelle: "SNCF CONNECT ESSAI", categorie: "Transports", sousCategorie: "Train et transports en commun", statut: "classe"});
          choisirDebitNdf(j3, 1, o8.id); choisirDebitNdf(j3, 2, o8.id);
          v("note de frais : lignes au-delà du débit refusées", [classerDepensesNdf(j3, rapprochementLignesNdf(j3)), !!obtenir("operations", o8.id).ventilation, debitsPossiblesNdf(j3, lignesNoteFrais(j3)[1]).some(o => o.id === o8.id)], [0, false, false]);
          supprimer("operations", o8.id); supprimer("justificatifs", j3.id);
          v("note de frais : rétabli après reventilation", [obtenir("operations", o7.id).categorie, !!obtenir("operations", o7.id).ventilation], ["Transports", false]);
          for (const o of [o5, o6, o7]) supprimer("operations", o.id); supprimer("justificatifs", j2.id);
          for (const o of [o1, o2, o3, o4]) supprimer("operations", o.id); supprimer("justificatifs", jn.id); supprimer("comptes", cc.id);
        }
        v("facturette : la banque du terminal n'est pas le commerçant", [extraireTicket("BANQUE POPULAIRE\nFOURNIL ESSAI\n12/03/27 10:02\nMONTANT 3,20 EUR").enseigne, ajouterAlias({nom: "x", alias: []}, "Banque Populaire")], ["FOURNIL ESSAI", false]);
        v("téléphone : fournisseur retrouvé par un morceau du nom ou de l'alias", rechercherFournisseurs(["savour"], [{nom: "La Savoureine Eurre", alias: []}, {nom: "Autre", alias: ["SAVOUREINE SARL"]}, {nom: "Sans rapport", alias: []}]).map(f => f.nom), ["La Savoureine Eurre", "Autre"]);
        v("pièce : lecture illisible ni proposée ni apprise comme nom", [nomPlausible("‘ au qi Tee ce L j"), nomPlausible("La Savoureine")], [false, true]);
        v("projet : dépense rattachée par catégorie et nature, pièce par catégorie seule", [estDepenseProjet({categorie: "Travaux", sousCategorie: "Archi", nature: "Exceptionnelle"}, [{categorie: "Travaux"}]), estDepenseProjet({categorie: "Travaux", nature: "Courante"}, [{categorie: "Travaux"}]), estDepenseProjet({categorie: "Travaux"}, [{categorie: "Travaux"}], true), estDepenseProjet({categorie: "Courses", projet: "Maison"}, [])], [true, false, true, true]);
        {
          const ee = enregistrer("echeances", {libelle: "Enveloppe essai", montant: -1000, recurrence: "unique", debut: ajouterJours(aujourdhui(), 200), projet: "Essai env", categorie: "Essai env cat", nature: "Exceptionnelle", capital: true, enveloppe: true});
          const oe = enregistrer("operations", {compte: "x", date: aujourdhui(), montant: -200, libelle: "acompte", categorie: "Essai env cat", nature: "Exceptionnelle", projet: "Essai env"});
          v("projet : l'enveloppe est consommée par les paiements", [montantEcheance(ee), etatProjet("Essai env").total], [-800, 1000]);
          supprimer("operations", oe.id); supprimer("echeances", ee.id);
        }
        {
          const d3 = ajouterJours(aujourdhui(), -3);
          v("facturette : date sans année lisible (année du jour)", extraireTicket("CB CREDIT\nj " + d3.slice(8, 10) + "/" + d3.slice(5, 7) + ",\nOA 15:20:17\nMONTANT 49,00 EUR").date, d3);
        }
        v("libellé : « VIREMENT » retiré en entier", [cleLibelle("VIREMENT HENNER GMC"), cleLibelle("VIR SEPA M HUMBERT ARMAND"), cleLibelle("PRELEVEMENT EUROPEEN ORANGE SA"), cleLibelle("CB BOUCHERIE D'ICI VILLE 16/10")], ["HENNER GMC", "M HUMBERT ARMAND", "ORANGE SA", "BOUCHERIE D'ICI VILLE"]);
        {
          ajouterCategorie("Abonnements essai", "Domaines (Ancien prestataire)");
          const or = enregistrer("operations", {compte: "x", date: "2027-01-05", montant: -13.68, libelle: "ESSAI DOMAINE", categorie: "Abonnements essai", sousCategorie: "Domaines (Ancien prestataire)", nature: "Courante"});
          const fr = enregistrer("commercants", {nom: "Essai domaine", alias: [], categorie: "Abonnements essai", sousCategorie: "Domaines (Ancien prestataire)", stats: {"Abonnements essai|Domaines (Ancien prestataire)|Courante|": 3}, natures: {}});
          const nr = renommerSousCategorie("Abonnements essai", "Domaines (Ancien prestataire)", "Domaines");
          v("catégories : sous-catégorie renommée partout", [obtenir("operations", or.id).sousCategorie, obtenir("commercants", fr.id).sousCategorie, Object.keys(obtenir("commercants", fr.id).stats)[0], LIVRE.parametres.categories["Abonnements essai"].join(","), nr >= 2], ["Domaines", "Domaines", "Abonnements essai|Domaines|Courante|", "Domaines", true]);
          supprimer("operations", or.id); supprimer("commercants", fr.id); delete LIVRE.parametres.categories["Abonnements essai"];
        }
        {
          // Sous-catégorie enregistrée comme le booléen true (Annuler avant le correctif du 24/10/2026) : réparée puis renommable.
          LIVRE.parametres.categories["Licence essai"] = ["Logiciels", true, null, false];
          const ob = enregistrer("operations", {compte: "x", date: "2027-01-06", montant: -9, libelle: "ESSAI LICENCE", categorie: "Licence essai", sousCategorie: true, nature: "Courante"});
          const jb = enregistrer("justificatifs", {type: "facture", date: "2027-01-06", montant: 9, categorie: "Licence essai", sousCategorie: true});
          const nb = reparerCategories();
          const avant = [LIVRE.parametres.categories["Licence essai"].join(","), obtenir("operations", ob.id).sousCategorie, obtenir("justificatifs", jb.id).sousCategorie, nb >= 3];
          const nr = renommerSousCategorie("Licence essai", "true", "Licence");
          v("sous-catégorie « true » booléenne : réparée en texte puis renommée", [avant, nr, obtenir("operations", ob.id).sousCategorie, LIVRE.parametres.categories["Licence essai"].join(","), reparerCategories()],
            [["Logiciels,true", "true", "true", true], 2, "Licence", "Logiciels,Licence", 0]);
          supprimer("operations", ob.id); supprimer("justificatifs", jb.id); delete LIVRE.parametres.categories["Licence essai"];
        }
        {
          // Catégorie nommée « true » : ses enregistrements passent en « À préciser », elle disparaît de la liste.
          LIVRE.parametres.categories["true"] = ["true"];
          const jt = enregistrer("justificatifs", {type: "facture", date: "2027-01-07", montant: 5, categorie: "true", sousCategorie: true});
          reparerCategories();
          v("catégorie « true » : retirée, enregistrement en « À préciser »", ["true" in LIVRE.parametres.categories, categorieComplete(obtenir("justificatifs", jt.id))], [false, "À préciser › À préciser"]);
          supprimer("justificatifs", jt.id);
        }
        {
          // Déplacement d'une sous-catégorie vers une autre catégorie, puis suppression de la catégorie vidée.
          ajouterCategorie("Départ essai", "Licence"); ajouterCategorie("Arrivée essai", "Courant");
          const jd = enregistrer("justificatifs", {type: "facture", date: "2027-01-08", montant: 145, categorie: "Départ essai", sousCategorie: "Licence"});
          const od = enregistrer("operations", {compte: "x", date: "2027-01-08", montant: -150, libelle: "ESSAI VENTILÉ", categorie: "Arrivée essai", sousCategorie: "Courant", nature: "Courante",
            ventilation: [{montant: -145, categorie: "Départ essai", sousCategorie: "Licence"}, {montant: -5}]});
          const refus = supprimerCategorieVide("Départ essai");
          const nd = deplacerSousCategorie("Départ essai", "Licence", "Arrivée essai", "Logiciels");
          const ok = supprimerCategorieVide("Départ essai");
          v("sous-catégorie déplacée vers une autre catégorie, catégorie vide supprimée",
            [refus.usages, nd, categorieComplete(obtenir("justificatifs", jd.id)), categorieComplete(obtenir("operations", od.id).ventilation[0]), LIVRE.parametres.categories["Arrivée essai"].join(","), ok.supprimee, "Départ essai" in LIVRE.parametres.categories, supprimerCategorieVide("À préciser").protegee],
            [2, 2, "Arrivée essai › Logiciels", "Arrivée essai › Logiciels", "Courant,Logiciels", true, false, true]);
          supprimer("justificatifs", jd.id); supprimer("operations", od.id); delete LIVRE.parametres.categories["Arrivée essai"];
        }
        {
          const bl = {lignes: [{categorie: "Assurances essai", sousCategorie: "Habitation", nature: "Courante", annuel: 1200, repartition: {Ville: 0.5, Campagne: 0.5}, logement: true}]};
          const o1 = enregistrer("operations", {compte: "x", date: "2027-03-05", montant: -100, libelle: "ESSAI ASSURANCE", categorie: "Assurances essai", sousCategorie: "Habitation", nature: "Courante", lieu: ""});
          const o2 = enregistrer("operations", {compte: "x", date: "2027-03-06", montant: -30, libelle: "ESSAI ASSURANCE 2", categorie: "Assurances essai", sousCategorie: "Habitation", nature: "Courante", lieu: "Ville"});
          const rp = l => somme(tableauBudget(bl, 2027, 3, 3, l).filter(x => x.categorie === "Assurances essai"), x => x.realise);
          v("lieu : dépense sans lieu répartie comme son budget, dépense localisée gardée", [rp("Ville"), rp("Campagne"), rp("Autres"), estLogement(tableauBudget(bl, 2027, 3, 3, "Ville")[0])], [80, 50, 0, true]);
          supprimer("operations", o1.id); supprimer("operations", o2.id);
        }
        {
          const bd = {lignes: [{categorie: "Énergie essai", sousCategorie: "Élec et gaz", nature: "Courante", annuel: 1200}, {categorie: "Énergie essai", sousCategorie: "Élec et gaz", nature: "Courante", annuel: 2400}]};
          const od = enregistrer("operations", {compte: "x", date: "2027-04-05", montant: -100, libelle: "ESSAI ENERGIE", categorie: "Énergie essai", sousCategorie: "Élec et gaz", nature: "Courante"});
          const td = tableauBudget(bd, 2027, 4, 4, "").filter(x => x.categorie === "Énergie essai");
          v("budget : deux lignes de même nom réunies, réalisé compté une fois", [td.length, td[0].budget, td[0].realise], [1, 300, 100]);
          supprimer("operations", od.id);
        }
        {
          const be = enregistrer("budgets", {annee: 2031, nom: "Essai emplois", lignes: [{id: "lb-essai-e", categorie: "Énergie essai 2", sousCategorie: "Électricité – Ville", nature: "Courante", annuel: 100}]});
          const absente = !(LIVRE.parametres.categories["Énergie essai 2"] || []).includes("Électricité – Ville");
          const vue = sousCategoriesEmployees().has("Énergie essai 2|Électricité – Ville");
          renommerSousCategorie("Énergie essai 2", "Électricité – Ville", "Électricité et gaz – Ville");
          v("catégories : sous-catégorie employée mais absente des réglages, proposée et renommée", [absente, vue, obtenir("budgets", be.id).lignes[0].sousCategorie], [true, true, "Électricité et gaz – Ville"]);
          supprimer("budgets", be.id); delete LIVRE.parametres.categories["Énergie essai 2"];
        }
        v("synthèse par site : type de la ligne (choix, ancienne case, catégorie)", [typeSiteLigne({site: "site"}, "Voiture"), typeSiteLigne({logement: true}, "Assurances"), typeSiteLigne(null, "Logement"), typeSiteLigne({}, "Alimentation")], ["site", "logement", "logement", "foyer"]);
        {
          const avant = ETAT_ECRAN.budget; ETAT_ECRAN.budget = {mois: "2031-03", budget: "bx-essai-inexistant"};
          const memeObjet = selectionBudget() === ETAT_ECRAN.budget;
          v("coût par site : même mois et même budget que Budget et réalisé", [memeObjet, moisCourant(selectionBudget()), budgetChoisi(selectionBudget(), 2031)?.id || null], [true, "2031-03", budgetActif(2031)?.id || null]);
          if (avant) ETAT_ECRAN.budget = avant; else delete ETAT_ECRAN.budget;
        }
        v("facturette : le commerçant suit la ligne « LE jj/mm », pas une lecture parasite en tête", [
          extraireTicket("prete\nCARTE BANCAIRE\nCREDIT MUTUEL\nA0000000421010\nCB\nLE 17/10/26 A 15:20:37\nBIJOUTERIE ESSAI\nVille\n26400\n############7998\nMONTANT= 49,00 EUR\nDEBIT\nTICKET CLIENT\nA CONSERVER").enseigne,
          extraireTicket("prete\nCARTE BANCAIRE\nFOURNIL ESSAI\nMONTANT 3,20 EUR\nTICKET CLIENT").enseigne], ["BIJOUTERIE ESSAI", "FOURNIL ESSAI"]);
        {
          const poignee = (name, chemin) => ({name, chemin, isSameEntry: async o => o.chemin === chemin, resolve: async o => o.chemin.startsWith(chemin + "/") ? o.chemin.slice(chemin.length + 1).split("/") : null});
          const archivesT = poignee("02 Finances", "C/FROCHE/02 Finances"), depotT = poignee("À importer", "E/Budget/À importer");
          const r = [await conflitDossiers("depot", poignee("02 Finances", "C/FROCHE/02 Finances"), archivesT), await conflitDossiers("depot", poignee("Banque", "C/FROCHE/02 Finances/Banque"), archivesT),
            await conflitDossiers("archives", poignee("FROCHE", "C/FROCHE"), poignee("02 Finances", "C/FROCHE/02 Finances")), await conflitDossiers("depot", depotT, archivesT)];
          v("dossiers d'import : dépôt et archives jamais confondus ni imbriqués", r.map(x => x ? x.split(" : ")[0].replace(/«[^»]*»/g, "«»") : ""),
            ["«» est déjà le dossier des archives", "«» est à l'intérieur du dossier des archives («»)", "«» contient le dossier de dépôt («»)", ""]);
        }
        v("ticket : la mention du vendeur n'est pas le magasin", extraireTicket("VENDEUR 01 VOUS A SERVI\nEPICERIE ESSAI\n20/10/26 11:02\nTOTAL 42,94").enseigne, "EPICERIE ESSAI");
        v("téléphone : saisie à valider ni rapprochée ni passée en espèces avant validation", [jv.statut, (jv.operations || []).length], ["a_rapprocher", 0]);
      }
      {
        const jd = await creerJustificatif({type: "facture", date: "2027-03-11", montant: 980, raisonSociale: "Jean Dupont, architecte essai", origine: "pc"});
        v("justificatif : la même pièce est repérée", [!!justificatifDejaLa({montant: 980, date: "2027-03-11", raisonSociale: "Jean Dupont, architecte essai"}), !!justificatifDejaLa({montant: 981, date: "2027-03-11", raisonSociale: "Jean Dupont, architecte essai"})], [true, false]);
      }
      v("factures : numéro lu", [numeroFacture(["FACTURE", "N°D26-011", "Date de création : 13/10/2026"]), numeroFacture(["Facture", "n° Date", "2 6 – 0 7 – 10 2 12 / 10 /202 6"]), numeroFacture(["Facture n° F-2027-0042 du 03/02/2027"])],
        ["D26011", "2607102", "F20270042"]);
      {
        await creerJustificatif({type: "facture", date: "2027-03-12", montant: 500, raisonSociale: "Entreprise essai", numero: "F100", origine: "pc"});
        v("doublon : le numéro de facture fait foi", [!!justificatifDejaLa({raisonSociale: "Entreprise essai", numero: "F100", montant: 1, date: "2027-01-01"}), !!justificatifDejaLa({raisonSociale: "Entreprise essai", numero: "F101", montant: 500, date: "2027-03-12"})], [true, false]);
      }
      {
        await creerJustificatif({type: "facture", date: "2027-03-14", montant: 200, raisonSociale: "Encours essai", carte: "CPT:" + cj.id, origine: "pc"});
        const en = encoursSaisis();
        vrai("en-cours : virements saisis regroupés par compte", en.lignes.some(l => l.moyen === "Virements · " + cj.nom && l.montant >= 200));
      }
      v("factures : montants entiers en euros", [f1.montant, f1.type, f2.montant, f2.type], [1070, "facture", 4272, "facture"]);
    }
    const t1 = extraireTicket("BOUCHERIE ST-VICTOR\nSARL VIANDES ST VICTOR\n12 rue Exemple\nGigot 1,2 kg 38,40\nSaucisses x6 10,20\nTOTAL TTC 48,60\nCB 48,60\n12/03/2027 10:48\nSIRET 123 456 789 00012");
    v("ticket : montant, date, heure", [t1.montant, t1.heure], [48.6, "10:48"]);
    v("ticket : raison sociale", t1.raisonSociale, "SARL VIANDES ST VICTOR");
    v("ticket : SIRET", t1.siret, "12345678900012");
    const t2 = extraireTicket("TICKET CLIENT\nA CONSERVER\nSALON LUCIE\nCAMPAGNE\nCARTE BANCAIRE\nXXXXXXXXXXXX0333\nSANS CONTACT\nMONTANT 86,00 EUR\nDEBIT\nLE 20/03/27 A 09:12");
    v("facturette : type et 4 chiffres", [t2.type, t2.carte4, t2.montant], ["facturette", "0333", 86]);

    /* --- Rapprochement : tolérance, facturette, achat groupé --- */
    const opCafe = vivants("operations").find(o => /CAFE/.test(o.libelle) && o.compte === carte.id);
    const j1 = enregistrer("justificatifs", {type: "facturette", date: "2027-03-04", montant: 12.3, carte: "X333", carte4: "0333", statut: "a_rapprocher", operations: []});
    rapprocherTout();
    // Pièce sans fournisseur ni catégorie à imposer : rapprochée d'office
    v("facturette rapprochée d'office (−1 jour, carte ****0333, rien ne change)", [obtenir("justificatifs", j1.id).statut, obtenir("justificatifs", j1.id).operations[0]], ["rapproche", opCafe.id]);
    const j2 = enregistrer("justificatifs", {type: "ticket", date: "2027-03-04", montant: 12.3, carte: "X333", statut: "a_rapprocher", operations: []});
    rapprocherTout();
    v("ticket du même achat : rattaché à la même opération", obtenir("justificatifs", j2.id).operations[0], opCafe.id);
    {
      // Pièce qui changerait la catégorie de l'opération : seulement proposée
      const opX = enregistrer("operations", {compte: carte.id, date: "2027-03-20", montant: -44.4, libelle: "LIBRAIRIE CHANGE", categorie: "Culture et loisirs", sousCategorie: "Livres, presse, sorties, jeux", statut: "classe"});
      const jx = enregistrer("justificatifs", {type: "ticket", date: "2027-03-20", montant: 44.4, carte: "X333", categorie: "Maison", sousCategorie: "Bricolage et jardin", statut: "a_rapprocher", operations: []});
      rapprocherTout();
      const px = obtenir("justificatifs", jx.id);
      v("rapprochement qui changerait la catégorie : proposé, pas appliqué", [px.statut, (px.propositions || [])[0]?.op, obtenir("operations", opX.id).categorie], ["a_rapprocher", opX.id, "Culture et loisirs"]);
      const sx = propositionsSures().find(s => s.op.id === opX.id);
      vrai("proposition sûre listée pour validation en lot, avec ce qui change", !!sx && /catégorie : Culture/.test(sx.changements.join(" ")));
      supprimer("justificatifs", jx.id); supprimer("operations", opX.id);
      // Compléter n'est pas modifier : catégorie seulement devinée, fiche née de l'import sans rien appris
      const fProv = enregistrer("commercants", {nom: "Libelle Brut Essai", alias: ["LIBELLE BRUT ESSAI"], stats: {}, natures: {}});
      const fVrai = enregistrer("commercants", {nom: "Quincaillerie Essai", alias: [], stats: {"Maison|Bricolage et jardin": 3}, natures: {}});
      const opY = enregistrer("operations", {compte: carte.id, date: "2027-03-22", montant: -31.7, libelle: "LIBELLE BRUT ESSAI", commercant: fProv.id, categorie: "Culture et loisirs", sousCategorie: "Livres, presse, sorties, jeux", statut: "propose"});
      const jy = enregistrer("justificatifs", {type: "ticket", date: "2027-03-22", montant: 31.7, carte: "X333", commercant: fVrai.id, commercantNom: fVrai.nom, categorie: "Maison", sousCategorie: "Bricolage et jardin", statut: "a_rapprocher", operations: []});
      rapprocherTout();
      const oy = obtenir("operations", opY.id);
      v("catégorie devinée et fiche provisoire : rapproché d'office, complété par la pièce", [obtenir("justificatifs", jy.id).statut, oy.categorie, oy.commercant], ["rapproche", "Maison", fVrai.id]);
      supprimer("justificatifs", jy.id); supprimer("operations", opY.id); supprimer("commercants", fVrai.id); if (obtenir("commercants", fProv.id)) supprimer("commercants", fProv.id);
    }
    {
      // Anomalies : période couverte par le relevé de la carte, pas de rapprochement ; piste donnée
      const oc = enregistrer("operations", {compte: carte.id, date: "2027-03-28", montant: -1, libelle: "COUVERTURE ESSAI"});
      const oa = enregistrer("operations", {compte: cj.id, date: "2027-03-08", montant: -45.5, libelle: "AUTRE COMPTE ESSAI", dateDebit: "2027-03-08"});
      const ja = enregistrer("justificatifs", {type: "ticket", date: "2027-03-08", montant: 45.5, carte: "X333", statut: "a_rapprocher", operations: []});
      const jb = enregistrer("justificatifs", {type: "ticket", date: "2027-03-08", montant: 77.7, carte: "X333", statut: "a_rapprocher", operations: []});
      const jc = enregistrer("justificatifs", {type: "ticket", date: "2027-03-27", montant: 66.6, carte: "X333", statut: "a_rapprocher", operations: []});
      const an = anomaliesRapprochement(), rs = id => an.find(a => a.j && a.j.id === id && a.genre !== "fournisseur non reconnu")?.raison || "";
      v("anomalies : autre compte signalé, aucun débit signalé, relevé pas encore arrivé exclu", [/même montant/.test(rs(ja.id)), /aucun débit/.test(rs(jb.id)), rs(jc.id)], [true, true, ""]);
      v("anomalies : fournisseur non reconnu, débit carte sans pièce (puis écarté)", [an.some(a => a.j === jc || a.j?.id === jc.id && a.genre === "fournisseur non reconnu"), an.some(a => a.op?.id === oc.id)], [true, true]);
      enregistrer("operations", Object.assign(oc, {sansPiece: true}));
      vrai("anomalies : débit marqué « pas de pièce » retiré", !anomaliesRapprochement().some(a => a.op?.id === oc.id));
      const jv = enregistrer("justificatifs", {type: "ticket", date: "2026-09-15", montant: 12, carte: "X333", statut: "a_rapprocher", operations: []});
      const jn = enregistrer("justificatifs", {type: "notefrais", date: "2026-09-15", montant: 12, statut: "a_rapprocher", operations: []});
      v("pièce antérieure au contrôle : close, hors en-cours ; note de frais et saisie à valider restent ouvertes",
        [pieceClose(jv), encoursSaisis().lignes.some(l => (l.justificatifs || []).includes?.(jv.id)) || JSON.stringify(encoursSaisis()).includes(jv.id), pieceOuverte(jn), pieceClose(Object.assign({}, jv, {aValider: true}))], [true, false, true, false]);
      supprimer("justificatifs", jv.id); supprimer("justificatifs", jn.id);
      {
        // Export du compte : une ligne carte n'est écartée que si l'achat est déjà sur une carte LCL (à un jour près)
        const ox = enregistrer("operations", {compte: carte.id, date: "2027-02-05", montant: -10, libelle: "DEJA SUR CARTE"});
        const lu = {genre: "compte", banque: "LCL", numero: "000099Z", periode: {debut: "2027-02-01", fin: "2027-02-28"}, soldeDebut: 0, soldeFin: 0,
          lignes: [{date: "2027-02-06", montant: -10, libelle: "DEJA SUR CARTE", type: "Carte"}, {date: "2027-02-06", montant: -42.94, libelle: "MANQUANT CARTE", type: "Carte"}]};
        const pr = preparerReleve(lu, cj);
        v("export du compte : achat déjà sur une carte écarté, achat absent gardé (sans titulaire)", [pr.ecartees.length, (pr.cartesSansTitulaire || []).map(l => l.libelle)], [1, ["MANQUANT CARTE"]]);
        supprimer("operations", ox.id);
      }
      {
        // Relevé PDF LCL du compte (sens par la colonne, marque [C]) : lecture, contrôle des soldes, clôture
        const rel = ["RELEVE DE COMPTE", " du 08.04.2027 au 07.05.2027 - N° 12", "Indicatif : 8208 Compte : 99 Z", "ECRITURES DE LA PERIODE", "DATE LIBELLE VALEUR DEBIT CREDIT",
          "07.04 ANCIEN SOLDE 1 000,00 [C]", "10.04 PRLV SEPA ESSAI EAU 10.04.27 68,00", "REF.CLIENT:X", "12.04 VIREMENT ESSAI PENSION 12.04.27 1 454,82 [C]",
          "30.04 RELEVE CB AU 30/04/27 30.04.27 120,00", "07.05 SOLDE EN EUROS 2 266,82 [C]"].join(String.fromCharCode(10));
        const rc = extraireReleveCompteLcl(rel);
        v("relevé PDF du compte : écritures, sens, années, soldes cohérents", [rc.operations.map(o => o.date + " " + o.montant).join(" | "), rc.soldeDebut, rc.soldeFin, rc.controle.ok, rc.numero],
          ["2027-04-10 -68 | 2027-04-12 1454.82 | 2027-04-30 -120", 1000, 2266.82, true, "99Z"]);
        const oDeja = enregistrer("operations", {compte: cj.id, date: "2027-04-11", montant: -68, libelle: "PRLV EAU", dateDebit: "2027-04-11"});
        const oTrop = enregistrer("operations", {compte: cj.id, date: "2027-04-20", montant: -15, libelle: "DOUBLON ESSAI", dateDebit: "2027-04-20"});
        const lu = Object.assign({nom: "essai.pdf", cartes: []}, {genre: "releve_lcl", releveCompte: rc, numero: rc.numero, periode: rc.periode});
        const pc = preparerClotureLcl(lu);
        const oDup = enregistrer("operations", {compte: cj.id, date: "2027-04-11", montant: -68, libelle: "PRLV EAU", dateDebit: "2027-04-11"});
        const pcd = preparerClotureLcl(lu);
        v("clôture : doublon exact repéré (l'original apparié reste)", [(pcd.doublonsExacts.has(oDup.id) ? 1 : 0) + (pcd.doublonsExacts.has(oDeja.id) ? 1 : 0), pcd.doublonsExacts.has(oTrop.id)], [1, false]);
        supprimer("operations", oDup.id);
        v("clôture : conforme à 4 jours près, manquants proposés, ligne en trop signalée (non cochée)", [pc.conformes, pc.manquants.map(l => l.montant), pc.enTrop.map(o => o.id), pc.choixEnTrop.size], [1, [1454.82, -120], [oTrop.id], 0]);
        const rr = appliquerClotureLcl(pc);
        const cb = vivants("operations").find(o => o.compte === cj.id && /^RELEVE CB AU/.test(o.libelle) && o.date === "2027-04-30");
        v("clôture appliquée : ajouts, rien supprimé sans coche, débit des cartes en Transfert, clôture notée", [rr.ajoutees, rr.supprimees, !!obtenir("operations", oTrop.id), cb?.sousCategorie, !!(LIVRE.parametres.clotures || {})[cj.id + "|2027-05-07"]], [2, 0, true, "Facture cartes", true]);
        for (const o of vivants("operations").filter(o => o.compte === cj.id && o.date >= "2027-04-08" && o.date <= "2027-05-07")) supprimer("operations", o.id);
        for (const s of vivants("soldes").filter(s => s.source === "essai.pdf")) supprimer("soldes", s.id);
        for (const i of vivants("imports").filter(i => i.fichier === "essai.pdf")) supprimer("imports", i.id);
        const cl = Object.assign({}, LIVRE.parametres.clotures); delete cl[cj.id + "|2027-05-07"]; modifierParametres({clotures: cl});
      }
      {
        // Chèque importé sans son numéro (colonne à part de l'export LCL) : rapproché au montant ; avec numéro, il doit correspondre
        const oc1 = enregistrer("operations", {compte: cj.id, date: "2027-03-20", montant: -524.03, libelle: "", type: "Chèque", dateDebit: "2027-03-20"});
        const jc1 = enregistrer("justificatifs", {type: "facture", date: "2027-03-13", montant: 524.03, carte: "CPT:" + cj.id, cheque: "5367918", statut: "a_rapprocher", operations: []});
        const avant = candidats([jc1]).some(x => x.op.id === oc1.id);
        enregistrer("operations", Object.assign(oc1, {cheque: "5367000", libelle: "CHQ. 5367000"}));
        v("chèque : sans numéro connu, rapproché au montant ; numéro différent, écarté", [avant, candidats([jc1]).some(x => x.op.id === oc1.id)], [true, false]);
        supprimer("operations", oc1.id); supprimer("justificatifs", jc1.id);
        const lc = creerOperation(cj, {date: "2027-03-21", montant: -10, libelle: "", type: "Chèque", cheque: "1234567", empreinte: "essai-chq"}, null);
        v("import : le numéro du chèque est gardé (libellé « CHQ. n° »)", [lc.cheque, lc.libelle], ["1234567", "CHQ. 1234567"]);
        supprimer("operations", lc.id);
      }
      const je = enregistrer("justificatifs", {type: "ticket", date: "2027-03-14", montant: 9.5, carte: "ESPECES", statut: "a_rapprocher", operations: []});
      creerOperationEspeces(je); const oe = obtenir("justificatifs", je.id).operations[0];
      delier(obtenir("justificatifs", je.id));
      v("espèces défait : l'opération en espèces disparaît avec le rapprochement", [!!obtenir("operations", oe), obtenir("justificatifs", je.id).statut], [false, "a_rapprocher"]);
      supprimer("justificatifs", je.id);
      {
        // Relevé annuel de livret : solde au 31/12 tiré des écritures
        const NL2 = String.fromCharCode(10);
        const tl = ["RELEVE DE COMPTE", " du 01.02.2026 au 31.01.2027 - N° 3", "ECRITURES DE LA PERIODE", "DATE LIBELLE VALEUR DEBIT CREDIT", "31.01 ANCIEN SOLDE 12 119,39 [C]",
          "31.12 INTERETS AU : 31 12 26 31.12.26 . 363,57 [C]", "15.01 VIREMENT ESSAI 15.01.27 100,00", "31.01 SOLDE EN EUROS 12 382,96 [C]"].join(NL2);
        v("livret : solde au 31/12 lu dans le relevé annuel", soldesFinAnnee(tl), [{date: "2026-12-31", valeur: 12482.96}]);
      }
      {
        // Lot : nature d'une catégorie (projet) sur les opérations et les parts ventilées
        const on1 = enregistrer("operations", {compte: cj.id, date: "2027-02-10", montant: -100, libelle: "ESSAI NAT 1", categorie: "Catégorie essai", sousCategorie: "Études", nature: "Courante"});
        const on2 = enregistrer("operations", {compte: cj.id, date: "2027-02-11", montant: -50, libelle: "ESSAI NAT 2", categorie: "Catégorie essai", sousCategorie: "Honoraires", nature: "Hors budget"});
        const lotN = {actions: [{type: "natureCategorie", categorie: "Catégorie essai", nature: "Exceptionnelle"}]};
        const apN = preparerCorrections(lotN); appliquerCorrections(lotN);
        v("lot : nature d'une catégorie (aperçu, puis appliquée)", [apN.nb, obtenir("operations", on1.id).nature, obtenir("operations", on2.id).nature], [2, "Exceptionnelle", "Exceptionnelle"]);
        supprimer("operations", on1.id); supprimer("operations", on2.id);
      }
      {
        // Avis d'impôt : échéances lues, prélèvements DGFiP classés (une échéance par prélèvement)
        const NL = String.fromCharCode(10);
        const ir = echeancesAvisImpot(["Somme qu'il vous reste à payer", "6 623,00 €", "25 septembre 2026 : 1 655,00 €", "26 octobre 2026 : 1 655,00 €", "28 décembre 2026 : 1 658,00 €"].join(NL), "Impôt sur le revenu");
        const tf = echeancesAvisImpot(["Somme à payer", " 1 412,00 €", "Date limite de paiement : 15/10/2026"].join(NL), "Taxe foncière");
        const th = echeancesAvisImpot(["Montant de votre taxe d'habitation 1 787,00 €", "la somme à payer sera prélevée automatiquement le 28/12/2026."].join(NL), "Taxe d'habitation");
        v("avis d'impôt : échéancier, date limite + 10 jours, prélèvement daté", [ir.map(e => e.date + " " + e.montant).join(" | "), tf, th],
          ["2026-09-25 1655 | 2026-10-26 1655 | 2026-12-28 1658", [{date: "2026-10-25", montant: 1412}], [{date: "2026-12-28", montant: 1787}]]);
        const dA = enregistrer("documents", {genre: "avis_impot", titre: "Taxe foncière 2027", quoi: "Taxe foncière", echeances: [{date: "2027-10-25", montant: 1412}]});
        const oT = enregistrer("operations", {compte: cj.id, date: "2027-10-26", montant: -1412, libelle: "PRLV SEPA DIRECTION GENERALE DE", categorie: "À préciser", statut: "a_preciser", dateDebit: "2027-10-26"});
        const oT2 = enregistrer("operations", {compte: cj.id, date: "2027-10-27", montant: -1412, libelle: "PRLV SEPA DIRECTION GENERALE DE", categorie: "À préciser", statut: "a_preciser", dateDebit: "2027-10-27"});
        const nA = classerParAvisImpot();
        v("avis d'impôt : prélèvement classé Impôts › Taxe foncière, une seule fois", [nA, obtenir("operations", oT.id).sousCategorie, obtenir("operations", oT2.id).categorie], [1, "Taxe foncière", "À préciser"]);
        supprimer("operations", oT.id); supprimer("operations", oT2.id); supprimer("documents", dA.id);
      }
      v("banque du terminal : caisse régionale lue seule, jamais un fournisseur ; vrai commerçant accepté",
        [estBanqueTerminal("SUD RHONE ALPES"), estBanqueTerminal("Crédit Agricole Sud Rhône Alpes"), estBanqueTerminal("Pharmacie Sud Rhône Alpes"), estBanqueTerminal("La Savoureine")], [true, true, false, false]);
      // Débit sans pièce et pièce du même fournisseur à un écart près : appariés, rapprochés seulement sur décision
      const fq = enregistrer("commercants", {nom: "Hebergeur Essai", alias: [], stats: {}, natures: {}});
      const oq = enregistrer("operations", {compte: carte.id, date: "2027-03-12", montant: -15.74, libelle: "HEBERGEUR ESSAI COM", commercant: fq.id});
      const jq = enregistrer("justificatifs", {type: "facture", date: "2027-03-12", montant: 13.68, carte: "X333", commercant: fq.id, commercantNom: fq.nom, statut: "a_rapprocher", operations: []});
      const oq2 = enregistrer("operations", {compte: carte.id, date: "2027-03-13", montant: -16.5, libelle: "HEBERGEUR ESSAI COM", commercant: fq.id});
      const anq = anomaliesRapprochement(), aq = anq.find(a => a.op?.id === oq.id);
      v("écart de montant : pièce voisine proposée à un seul débit (le plus proche), pas rapprochée d'office", [aq?.genre, aq?.piece?.id, anq.find(a => a.op?.id === oq2.id)?.piece || null, obtenir("justificatifs", jq.id).statut], ["montant différent", jq.id, null, "a_rapprocher"]);
      supprimer("operations", oq2.id);
      rapprocherAvecEcart(obtenir("justificatifs", jq.id), obtenir("operations", oq.id));
      v("rapprocher quand même : lié, écart noté, plus d'anomalie", [obtenir("justificatifs", jq.id).statut, obtenir("justificatifs", jq.id).ecartMontant, anomaliesRapprochement().some(a => a.op?.id === oq.id)], ["rapproche", 2.06, false]);
      supprimer("justificatifs", jq.id); supprimer("operations", oq.id); supprimer("commercants", fq.id);
      for (const x of [ja, jb, jc]) supprimer("justificatifs", x.id); supprimer("operations", oc.id); supprimer("operations", oa.id);
    }
    const j3 = enregistrer("justificatifs", {type: "ticket", date: "2027-03-10", montant: 12.3, carte: "X333", statut: "a_rapprocher", operations: []});
    rapprocherTout();
    v("hors tolérance (opération 5 jours avant le ticket) : pas de rapprochement d'office", obtenir("justificatifs", j3.id).statut, "a_rapprocher");
    const opG = enregistrer("operations", {compte: carte.id, date: "2027-03-12", montant: -72, libelle: "SUMUP *MARCHE TEST", justificatifs: [], categorie: "Alimentation", sousCategorie: "Courses", nature: "Courante"});
    const ga = enregistrer("justificatifs", {type: "ticket", date: "2027-03-12", montant: 48.6, carte: "X333", statut: "a_rapprocher", operations: [], natureExacte: "gigot"});
    const gb = enregistrer("justificatifs", {type: "ticket", date: "2027-03-12", montant: 23.4, carte: "X333", statut: "a_rapprocher", operations: [], natureExacte: "fromages"});
    rapprocherTout();
    vrai("achat groupé proposé (48,60 + 23,40 = 72,00)", (obtenir("justificatifs", ga.id).propositions || []).some(p => p.op === opG.id && (p.groupe || []).length === 2));
    lier([ga, gb], opG, false);
    v("achat groupé : opération ventilée en deux", obtenir("operations", opG.id).ventilation.length, 2);

    /* --- Valorisations lues dans des PDF (textes types) --- */
    const av = reconnaitrePdf("RELEVE.pdf", "Votre relevé trimestriel au 30 juin 2027\nLa valeur de votre adhésion s'élève à 612 400,00 euros.\nN° Adhésion : 123 456789012C", null);
    v("assurance-vie : valeur et date", [av.genre, av.valeur, av.date], ["valorisation", 612400, "2027-06-30"]);
    const pea = reconnaitrePdf("PLANDEPARGNEENACTIONS_08208012345_20270331.pdf", "Précisions sur votre PEA au 31/03/2027:\nEvaluation globale de votre PEA : 356.973,29 euros", null);
    v("PEA : évaluation globale", [pea.valeur, pea.date], [356973.29, "2027-03-31"]);

    /* --- Classeur : écriture puis relecture --- */
    const blob = ecrireClasseur([{nom: "Essai", colonnes: [{titre: "Date", type: "date"}, {titre: "Libellé"}, {titre: "Montant", type: "euros"}], lignes: [["2027-03-31", "Été à Campagne", -12.5]]}]);
    const relu = await lireClasseur(await blob.arrayBuffer());
    v("xlsx aller-retour", [relu.feuilles.Essai[1][1], relu.feuilles.Essai[1][2], dateExcel(relu.feuilles.Essai[1][0])], ["Été à Campagne", -12.5, "2027-03-31"]);

    /* --- Trésorerie : découvert provoqué --- */
    enregistrer("budgets", {annee: 2027, nom: "B", fige: false, actif: true, lignes: [{id: "l1", nature: "Courante", categorie: "Alimentation", sousCategorie: "Courses", annuel: 12000, paiement: {compte: 1}}]});
    enregistrer("echeances", {libelle: "Grosse dépense", montant: -30000, recurrence: "unique", debut: "2027-05-15", compte: cj.id});
    {
      // Achat carte ancien sans date de débit : pas un débit à venir ; flux passés cohérents
      const cv = enregistrer("comptes", {nom: "Carte ancienne essai", type: "carte", banque: "LCL", carte: "X909", compteDebit: cj.id, actif: true});
      const ov = enregistrer("operations", {compte: cv.id, date: "2027-01-05", montant: -5000, libelle: "ACHAT ANCIEN ESSAI", dateDebit: null});
      const sv = simulerTresorerie({depart: "2027-03-31", jours: 60});
      v("encours : achat de plus de 62 jours sans débit ignoré et signalé", [sv.evenements.some(e => /Carte ancienne/.test(e.libelle)), encoursCarte(cv, "2027-03-31").anciens.length], [false, 1]);
      supprimer("operations", ov.id); supprimer("comptes", cv.id);
      const fp = fluxPasses(cj, 3, "2027-03-31");
      v("flux passés : mois sans relevé ni opération omis ; fin = début + entrées − sorties + virements", [fp.length > 0, fp.every(m => m.debut === null || Math.abs(m.debut + m.entrees - m.sorties + m.transferts - m.fin) < 0.01)], [true, true]);
    }
    const s1 = simulerTresorerie({depart: "2027-03-31", jours: 120});
    const a1 = analyseTresorerie(s1);
    v("trésorerie : solde de départ (relevé + facture)", Math.round(s1.soldeDepart * 100) / 100, Math.round((11950 - 45.4) * 100) / 100);
    v("trésorerie : premier jour sous zéro", a1.premierBas?.date, "2027-05-15");
    vrai("trésorerie : virement proposé suffisant", analyseTresorerie(simulerTresorerie({depart: "2027-03-31", jours: 120, supplements: [{date: a1.avant, montant: a1.virement, libelle: "v"}]})).premierBas === undefined);
    const grosse = vivants("echeances").find(e => e.libelle === "Grosse dépense");
    enregistrer("echeances", Object.assign(grosse, {projet: "Travaux"}));
    enregistrer("echeances", {libelle: "Cession de titres", montant: 50000, recurrence: "unique", debut: "2027-04-10", compte: cj.id, categorie: "Patrimoine", sousCategorie: "Cession"});
    const s2 = simulerTresorerie({depart: "2027-03-31", jours: 120});
    vrai("projet et cession : hors de la marche courante", analyseTresorerie(s2).premierBas === undefined && !s2.evenements.some(e => /Grosse|Cession/.test(e.libelle)));
    const k2 = simulerEpargne({depart: "2027-03-31", jours: 120, rendement: false});
    v("épargne : cession puis paiement du projet", [k2.jours.find(j => j.date === "2027-04-10").solde, k2.jours[k2.jours.length - 1].solde], [50000, 20000]);
    enregistrer("operations", {compte: cj.id, date: "2027-03-02", montant: -950, libelle: "VIR ARCHITECTE EXEMPLE", categorie: "Travaux maison", sousCategorie: "Honoraires", nature: "Exceptionnelle"});
    enregistrer("echeances", Object.assign(grosse, {rattache: [{categorie: "Travaux maison"}]}));
    v("projet : dépenses déjà faites rattachées par catégorie", etatProjet("Travaux").paye, 950);
    const rp = appliquerPlan({comptes: [{nom: "Titres essai", type: "titres", banque: "Essai", valorisations: [{date: "2027-03-01", valeur: 1000}, {date: "2027-05-01", valeur: 0}]}]});
    const ct = vivants("comptes").find(x => x.nom === "Titres essai");
    v("plan : compte-titres et valorisations, hors épargne", [rp.comptes, soldeCompte(ct, "2027-04-01"), soldeCompte(ct, "2027-06-01"), estMobilisable(ct)], [1, 1000, 0, false]);
    v("projet : prochain paiement net de la reprise du même jour", prochainPaiement([{date: "2027-06-15", montant: -61092}, {date: "2027-06-15", montant: 20000}, {date: "2027-07-01", montant: -5}]), {date: "2027-06-15", montant: -41092});
    enregistrer("operations", {compte: cj.id, date: "2027-03-05", montant: 1234.56, libelle: "VIREMENT EMPLOYEUR EXEMPLE", categorie: "Revenus", sousCategorie: "Salaire", nature: "Revenu", verrou: true});
    const rr = appliquerPlan({reclasser: [{date: "2027-03-05", montant: 1234.56, contient: "EMPLOYEUR", categorie: "Professionnel", sousCategorie: "Remboursements de frais", nature: "Hors budget"}]});
    v("plan : reclassement ciblé d'une opération validée", [rr.reclassees, vivants("operations").find(o => o.date === "2027-03-05" && o.montant === 1234.56).nature], [1, "Hors budget"]);
    appliquerPlan({commercants: [{nom: "Pisciniste essai", alias: ["PISCINE ESSAI VILLE"], categorie: "Extérieurs", sousCategorie: "Piscine (entretien)", lieu: "Campagne", verifie: true}]});
    const fp = trouverCommercant(cleLibelle("PISCINE ESSAI VILLE"), true);
    v("plan : fiche fournisseur fixée et vérifiée", [fp?.nom, fp?.sousCategorie, fp?.verifie], ["Pisciniste essai", "Piscine (entretien)", true]);
    {
      const epx = {depart: "2027-01-10", soldeDepart: 300, comptes: [], jours: [{date: "2027-01-11", flux: 50, solde: 350}], evenements: [
        {date: "2027-01-11", montant: 100, genre: "capital"}, {date: "2027-02-01", montant: -80, genre: "projet", echeance: {projet: "Toit"}},
        {date: "2027-02-01", montant: 30, genre: "projet", echeance: {projet: "Toit"}}, {date: "2027-03-01", montant: -20, genre: "courant"}]};
      const dx = decompositionEpargne(epx), fx = financementsParDestination(epx);
      v("épargne : décomposition et financements par destination", [dx.cessions, dx.projets, dx.courant, fx.map(g => g.destination + " " + g.sorties + "/" + g.entrees).join(", ")],
        [100, -50, -20, "Projet Toit 80/30, Compte courant 20/0"]);
    }
    v("budget : une ligne de crédit sans réalisé n'est pas en dépassement", postesEnDepassement([{budget: -138, realise: 0}, {budget: -3073, realise: 0}, {budget: 100, realise: 200}, {budget: 1000, realise: 1040}]).length, 1);
    const tj = simulerTresorerie({depart: "2027-03-31", jours: 120, perimetre: "tout"});
    v("compte joint réel : marche courante + capital", Math.round(tj.jours[tj.jours.length - 1].solde - s2.jours[s2.jours.length - 1].solde), 20000);
    {
      enregistrer("echeances", {libelle: "Pension essai", montant: 1000, recurrence: "mensuelle", debut: "2027-01-10", compte: cj.id, categorie: "Revenus", sousCategorie: "Pensions"});
      const di = donneesImpressionBudget(budgetActif(2027), 2027, 1, 12, "");
      v("impression du budget : revenus prévus d'une échéance mensuelle, non ponctuels", [Math.round(di.revenus.find(r => r.poste === "Pensions")?.prevu || 0), Math.round(di.revenus.find(r => r.poste === "Pensions")?.ponctuel || 0)], [12000, 0]);
      v("impression du budget : totaux cohérents et échéances lisibles", [Math.round(di.budget), Math.round(somme(di.parMois, x => x.total)), echeanceLigne({annuel: 1, profil: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]}), echeanceLigne({annuel: 1, profil: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], jour: 25}), echeanceLigne({annuel: 1})],
        [Math.round(somme(budgetActif(2027).lignes, l => l.annuel)), Math.round(somme(budgetActif(2027).lignes, l => l.annuel)), "juil.–déc.", "oct. · le 25", ""]);
    }
    {
      const cd = champDate({value: "2027-03-05"}); const lu0 = cd.value; cd.value = ""; const vide = cd.value;
      v("dates : saisie jj/mm/aaaa, lecture ISO", [lu0, vide, lireDateFr("05/03/2027"), lireDateFr("5.3.27"), lireDateFr("05032027"), lireDateFr("31/02/2027"), lireDateFr("03/13/2027"), lireDateFr("")],
        ["2027-03-05", "", "2027-03-05", "2027-03-05", "2027-03-05", null, null, ""]);
    }
    {
      const lv = enregistrer("comptes", {nom: "Livret essai rendement", type: "livret", actif: true, rendement: 3});
      enregistrer("valorisations", {compte: lv.id, date: "2027-03-31", valeur: 120000, source: ""});
      const tn0 = LIVRE.parametres.tauxNouveauxPlacements; LIVRE.parametres.tauxNouveauxPlacements = 0;
      const sansR = simulerEpargne({depart: "2027-03-31", jours: 30, rendement: false}), avecR = simulerEpargne({depart: "2027-03-31", jours: 30});
      LIVRE.parametres.tauxNouveauxPlacements = 2;
      const nouv = simulerEpargne({depart: "2027-03-31", jours: 30}); LIVRE.parametres.tauxNouveauxPlacements = tn0;
      v("épargne : part du rendement venant des sommes nouvelles", Math.round(somme(nouv.evenements.filter(e => e.genre === "rendement"), e => e.nouveau)), Math.round(50000 * 0.02 * 21 / 365));
      v("épargne : rendement d'un mois (120 000 € à 3 %, puis 50 000 € nouveaux à 2 % du 10 au 30)", [Math.round(avecR.jours[avecR.jours.length - 1].solde - sansR.jours[sansR.jours.length - 1].solde),
        Math.round(nouv.jours[nouv.jours.length - 1].solde - avecR.jours[avecR.jours.length - 1].solde)], [Math.round(120000 * 0.03 * 30 / 365), Math.round(50000 * 0.02 * 21 / 365)]);
      const tvj = simulerTresorerie({depart: "2027-12-20", jours: 40});
      v("trésorerie : intérêts des livrets virés le 15 janvier", tvj.evenements.filter(e => /des livrets/.test(e.libelle)).map(e => e.date + " " + Math.round(e.montant)).join(), "2028-01-15 3600");
      enregistrer("comptes", Object.assign(lv, {actif: false}));
    }
    {
      const p0 = window.print; window.print = () => {};
      try { imprimerSynthese(budgetActif(2027), 2027); const zs = document.getElementById("impression"); v("synthèse annuelle : construite, sans sous-catégorie", [!!zs.querySelector("h1"), /Courses/.test(zs.innerText)], [true, false]); vider(zs); }
      finally { window.print = p0; }
    }
    {
      const rc = appliquerPlan({categories: {"Travaux essai": ["Études", "Gros œuvre"]}});
      v("plan : sous-catégories créées", [rc.categories, (LIVRE.parametres.categories["Travaux essai"] || []).join("|")], [2, "Études|Gros œuvre"]);
      enregistrer("operations", {compte: cj.id, date: "2027-03-20", montant: -555, libelle: "Chèque n° 1234567", categorie: "", nature: "Courante"});
      enregistrer("operations", {compte: cj.id, date: "2027-03-21", montant: -555, libelle: "Chèque n° 7654321", categorie: "", nature: "Courante"});
      const jc = {type: "facture", montant: 555, date: "2027-03-15", carte: "CHQ:" + cj.id, cheque: "7654321"};
      v("chèque : le numéro désigne l'opération", candidats([jc]).map(x => x.op.libelle), ["Chèque n° 7654321"]);
      v("justificatif payé par virement : compte compatible", [compteCompatible({carte: "CPT:" + cj.id}, cj), compteCompatible({carte: "CPT:autre"}, cj)], [true, false]);
    }
    v("jour habituel : groupé, à cheval sur le mois, dispersé", [jourDominant([5, 5, 6, 4, 20]), [30, 31, 1].includes(jourDominant([30, 1, 31, 2])), jourDominant([1, 10, 20])], [5, true, null]);
    for (const d of ["2027-01-05", "2027-02-05", "2027-03-05"]) enregistrer("operations", {compte: cj.id, date: d, montant: -1000, libelle: "VIR LOYER EXEMPLE", categorie: "Logement", sousCategorie: "Loyer", nature: "Courante"});
    const bj = budgetActif(2027); bj.lignes.push({id: "l2", nature: "Courante", categorie: "Logement", sousCategorie: "Loyer", annuel: 12000, paiement: {compte: 1}}); enregistrer("budgets", bj);
    const sj = simulerTresorerie({depart: "2027-03-31", jours: 60});
    const fluxJour = d => sj.jours.find(j => j.date === d).flux;
    v("trésorerie : loyer budgété à son jour habituel", [Math.round(fluxJour("2027-04-05") - fluxJour("2027-04-06")), sj.evenements.some(e => /Loyer \(budget, vers le 5\)/.test(e.libelle))], [-1000, true]);
    {
      /* --- Dossier de dépôt : rangement par compte --- */
      const ix = ["Banque X 000099Z Compte essai", "Banque X 000099Z Compte essai/Avis débit différé cartes", "Épargne essai", "Épargne essai/Livret A 09999123456",
        "Placements essai 012345B", "Placements essai 012345B/Relevés et évaluations", "Amex", "Assureur essai/Contrat 00777777K (retraite)", "Budget/Copie essai/justificatifs"];
      v("rangement proposé : justificatifs au premier niveau seulement", proposerRangement({genre: "justificatif_pdf"}, null, ix), "Justificatifs");
      const lv = enregistrer("comptes", {nom: "Livret essai", type: "livret", numero: "123456"});
      const ps = enregistrer("comptes", {nom: "PEA essai", type: "pea", numero: "012345"});
      const rt = enregistrer("comptes", {nom: "Retraite essai", type: "retraite", numero: "0777777K"});
      const cx = enregistrer("comptes", {nom: "Carte essai X1", type: "carte", banque: "LCL", carte: "X1", numero: "000099Z", compteDebit: cj.id});
      v("rangement proposé : compte, carte, facture CB", [proposerRangement({genre: "compte"}, cj, ix), proposerRangement({genre: "carte", banque: "LCL"}, cx, ix), proposerRangement({genre: "facture_cb"}, null, ix)],
        ["Banque X 000099Z Compte essai/Historiques CSV", "Banque X 000099Z Compte essai/Encours cartes", "Banque X 000099Z Compte essai/Avis débit différé cartes"]);
      v("rangement proposé : livret, PEA, retraite (zéros de tête), Amex", [proposerRangement({genre: "valorisation"}, lv, ix), proposerRangement({genre: "valorisation"}, ps, ix),
        proposerRangement({genre: "valorisation"}, rt, ix), proposerRangement({genre: "carte", banque: "Amex"}, null, ix)],
        ["Épargne essai/Livret A 09999123456", "Placements essai 012345B/Relevés et évaluations", "Assureur essai/Contrat 00777777K (retraite)", "Amex/Relevés"]);
      const sansDossier = enregistrer("comptes", {nom: "Compte sans dossier", type: "courant", numero: "000011A"});
      v("rangement proposé : compte sans dossier → son nom ; avis d'impôt → Impôts", [proposerRangement({genre: "compte"}, sansDossier, ix), proposerRangement({genre: "document", sousGenre: "avis_impot"}, null, ix)], ["Compte sans dossier", "Impôts"]);
      modifierParametres({rangement: {["compte:" + lv.id]: "Ailleurs/Livret"}});
      v("rangement : la règle du livre l'emporte", dossierRangement({lu: {genre: "valorisation"}, compte: lv}), {cle: "compte:" + lv.id, dossier: "Ailleurs/Livret", propose: false});
      modifierParametres({rangement: {}});
      v("rangement : année du fichier", [anneeFichier({periode: {fin: "2026-10-19"}}), anneeFichier({date: "2025-06-30"}), anneeFichier({arrete: "2027-01-28"})], ["2026", "2025", "2027"]);
      v("rangement : nom libre sans écraser", [nomLibre("a.csv", new Set()), nomLibre("a.csv", new Set(["a.csv", "a (2).csv"]))], ["a.csv", "a (3).csv"]);
      v("avis d'impôt reconnu", [reconnaitrePdf("x.pdf", "AVIS_TF_RG\nCENTRE DES FINANCES PUBLIQUES\nAVIS DE TAXES FONCIERES 2026", null).titre,
        reconnaitrePdf("y.pdf", "AVIS_IR_RG\nAvis d'impôt 2026 sur les revenus de 2025", null).sousGenre], ["Taxe foncière 2026", "avis_impot"]);
      for (const x of [lv, ps, rt, cx, sansDossier]) enregistrer("comptes", Object.assign(x, {actif: false}));
    }
    {
      /* --- Fournisseurs : doublons probables --- */
      const fs = [{id: "a", nom: "Enseigne Essai"}, {id: "b", nom: "Enseigne Essai rue Longue"}, {id: "c", nom: "Jean Martin"}, {id: "d", nom: "M Martin Jean"},
        {id: "e", nom: "Boulangerie du Coin"}, {id: "f", nom: "Boulangerie Durand"}, {id: "g", nom: "Primeur Essai", lieu: "Lieu A"}, {id: "h", nom: "Primeur Essai", lieu: "Lieu B"},
        {id: "i", nom: "Superette Alpha", alias: ["ALPHA SAS 12"]}, {id: "j", nom: "Alpha Distribution", alias: ["ALPHA SAS 12"]}];
      v("doublons probables : inclusion, ordre des mots, alias ; ni générique ni deux lieux", doublonsProbables(fs).map(g => g.map(x => x.id).sort().join("")).sort(), ["ab", "cd", "ij"]);
      v("doublons probables : groupe écarté", doublonsProbables(fs, ["a|b"]).length, 2);
      const fv = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"].map((n, i) => ({id: "v" + i, nom: n + " Villeessai"})).concat([{id: "w", nom: "Villeessai"}, {id: "x1", nom: "Hotel Kilo Villeessai"}, {id: "x2", nom: "Kilo"}]);
      v("doublons probables : un mot répandu (ville) ne relie rien ; paires seulement", doublonsProbables(fv).map(g => g.map(x => x.id).sort().join("")), ["x1x2"]);
      v("devis : fenêtre de date d'une facture", fenetre({type: "devis"}), fenetre({type: "facture"}));
      const jOk = enregistrer("justificatifs", {type: "autre", date: "2027-05-20", montant: 1318.8, commercantNom: "Bureau d'études essai", statut: "a_rapprocher", operations: []});
      const jDep = enregistrer("justificatifs", {type: "facturette", date: "2027-05-20", montant: 1318.8, commercantNom: "Lu de travers", origine: "depot", aValider: true, statut: "a_rapprocher", operations: []});
      const jLoin = enregistrer("justificatifs", {type: "facture", date: "2027-09-01", montant: 1318.8, statut: "a_rapprocher", operations: []});
      v("pièce du dépôt : saisie voisine signalée (même montant, 45 jours)", piecesVoisines(jDep).map(x => x.id), [jOk.id]);
      vrai("pièce du dépôt à valider : jamais rapprochée d'office", (rapprocherTout(), obtenir("justificatifs", jDep.id).statut === "a_rapprocher"));
      for (const x of [jOk, jDep, jLoin]) supprimer("justificatifs", x.id);
    }
  } catch (e){ cas.push({nom: "exception", ok: false, obtenu: e.stack || String(e), attendu: "aucune"}); }
  finally {
    LIVRE = memoire.LIVRE; Object.assign(SESSION, memoire.session); LIVRE_MODIFIE = memoire.modifie; planifierSauvegarde = sauvegardePlanifiee; invaliderIndex();
  }
  const echecs = cas.filter(c => !c.ok);
  console.log("AUTOTEST " + (cas.length - echecs.length) + "/" + cas.length, echecs);
  return {cas, echecs};
}
async function afficherAutotest(){
  $("verrou").hidden = true; $("appli").hidden = true;
  const z = vider($("saisie")); z.hidden = false; z.style.maxWidth = "60rem";
  z.appendChild(h("div", {class: "barre-tel"}, h("span", null, "Suite de contrôle"), h("span", null, VERSION_APP)));
  const corps = h("div", {class: "corps-tel"}, h("p", null, "Exécution sur des données fictives en mémoire…")); z.appendChild(corps);
  const r = await autotest();
  vider(corps);
  corps.appendChild(h("div", {class: "bandeau " + (r.echecs.length ? "alerte" : "calme"), id: "resultat-autotest"}, (r.cas.length - r.echecs.length) + " / " + r.cas.length + " contrôles réussis" + (r.echecs.length ? " — échecs : " + r.echecs.map(e => e.nom).join(", ") : " (tout est vert).")));
  corps.appendChild(tableau([{titre: "Contrôle"}, {titre: "Résultat"}, {titre: "Obtenu"}], r.cas, {limite: 500, ligne: c => h("tr", null, h("td", null, c.nom), h("td", {class: c.ok ? "pos" : "neg"}, c.ok ? "✓" : "✗"), h("td", {class: "petit"}, c.ok ? "" : JSON.stringify(c.obtenu) + " (attendu " + JSON.stringify(c.attendu) + ")"))}));
  corps.appendChild(h("p", {class: "note"}, h("a", {href: location.pathname}, "Revenir à l'application")));
}
