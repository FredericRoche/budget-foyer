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
    v("export carte reconnu", [luc.genre, luc.carte, luc.controle.ok], ["carte", "X333", true]);
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
    v("facturette rapprochée d'office (−1 jour, carte ****0333)", [obtenir("justificatifs", j1.id).statut, obtenir("justificatifs", j1.id).operations[0]], ["rapproche", opCafe.id]);
    const j2 = enregistrer("justificatifs", {type: "ticket", date: "2027-03-04", montant: 12.3, carte: "X333", statut: "a_rapprocher", operations: []});
    rapprocherTout();
    v("ticket du même achat : rattaché à la même opération", obtenir("justificatifs", j2.id).operations[0], opCafe.id);
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
      v("épargne : rendement d'un mois (120 000 € à 3 %, puis 50 000 € nouveaux à 2 % du 10 au 30)", [Math.round(avecR.jours[avecR.jours.length - 1].solde - sansR.jours[sansR.jours.length - 1].solde),
        Math.round(nouv.jours[nouv.jours.length - 1].solde - avecR.jours[avecR.jours.length - 1].solde)], [Math.round(120000 * 0.03 * 30 / 365), Math.round(50000 * 0.02 * 21 / 365)]);
      const tvj = simulerTresorerie({depart: "2027-12-20", jours: 40});
      v("trésorerie : intérêts des livrets virés le 15 janvier", tvj.evenements.filter(e => /des livrets/.test(e.libelle)).map(e => e.date + " " + Math.round(e.montant)).join(), "2028-01-15 3600");
      enregistrer("comptes", Object.assign(lv, {actif: false}));
    }
    v("jour habituel : groupé, à cheval sur le mois, dispersé", [jourDominant([5, 5, 6, 4, 20]), [30, 31, 1].includes(jourDominant([30, 1, 31, 2])), jourDominant([1, 10, 20])], [5, true, null]);
    for (const d of ["2027-01-05", "2027-02-05", "2027-03-05"]) enregistrer("operations", {compte: cj.id, date: d, montant: -1000, libelle: "VIR LOYER EXEMPLE", categorie: "Logement", sousCategorie: "Loyer", nature: "Courante"});
    const bj = budgetActif(2027); bj.lignes.push({id: "l2", nature: "Courante", categorie: "Logement", sousCategorie: "Loyer", annuel: 12000, paiement: {compte: 1}}); enregistrer("budgets", bj);
    const sj = simulerTresorerie({depart: "2027-03-31", jours: 60});
    const fluxJour = d => sj.jours.find(j => j.date === d).flux;
    v("trésorerie : loyer budgété à son jour habituel", [Math.round(fluxJour("2027-04-05") - fluxJour("2027-04-06")), sj.evenements.some(e => /Loyer \(budget, vers le 5\)/.test(e.libelle))], [-1000, true]);
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
