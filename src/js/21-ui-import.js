/* ================= Import des relevés et documents ================= */
let FICHIERS_EN_COURS = [];   // [{lu, compte, prep, statut, erreur}]

declarerEcran("import", {titre: "Importer les relevés", rendre(c, etat){
  c.appendChild(entete("Importer les relevés", "Les fichiers sont lus sur cet appareil ; rien n'est envoyé ailleurs.",
    [h("button", {onclick: async () => { const f = await choisirFichier(".csv,.xlsx,.pdf,.json,image/*", true); if (f && f.length) await deposerFichiers(f); }}, "Choisir des fichiers…"),
     FICHIERS_EN_COURS.length ? h("button", {class: "discret", onclick: () => { FICHIERS_EN_COURS = []; rafraichirEcran(); }}, "Vider la liste") : null]));
  const depot = h("div", {class: "depot"}, h("strong", null, "Déposez ici tous les fichiers du mois d'un coup"), " (CSV, Excel, PDF) : chacun est reconnu.",
    h("div", {class: "note"}, "Exports CSV du compte et des cartes LCL (encours), export Amex, facture des cartes LCL (PDF), relevés de livrets, PEA, assurance-vie et retraite (PDF), classeur d'inventaire, fichier de règles, photos ou PDF de justificatifs."));
  depot.addEventListener("click", async () => { const f = await choisirFichier(".csv,.xlsx,.pdf,.json,image/*", true); if (f && f.length) await deposerFichiers(f); });
  depot.addEventListener("dragover", e => { e.preventDefault(); depot.classList.add("survol"); });
  depot.addEventListener("dragleave", () => depot.classList.remove("survol"));
  depot.addEventListener("drop", e => { e.preventDefault(); depot.classList.remove("survol"); deposerFichiers([...e.dataTransfer.files]); });
  c.appendChild(depot);

  const grille = h("div", {class: "large-etroit"});
  const gauche = h("section");
  if (FICHIERS_EN_COURS.length){
    gauche.appendChild(h("h2", null, "Fichiers reconnus (" + FICHIERS_EN_COURS.length + ")"));
    gauche.appendChild(tableau([{titre: "Fichier"}, {titre: "Reconnu comme"}, {titre: "Période ou date"}, {titre: "Nouvelles", num: true}, {titre: "Contrôle"}, {titre: ""}], FICHIERS_EN_COURS, {classe: "serre", ligne: f => {
      const lu = f.lu; const p = f.prep;
      let genre = {compte: "Compte " + (lu.banque || ""), carte: lu.banque === "Amex" ? "Amex" : "Carte " + (lu.carte || ""), facture_cb: "Facture des cartes LCL", valorisation: "Valorisation · " + (lu.produit || ""),
        reprise_v7: "Classeur d'inventaire (reprise)", regles: "Règles de classement", plan: "Plan (budget et échéances)", justificatif_pdf: "Justificatif (PDF)", image: "Justificatif (photo)", document: "Avis d'opéré", inconnu: "Non reconnu"}[lu.genre] || lu.genre;
      const periode = lu.periode ? dateCourte(lu.periode.debut) + " – " + dateFr(lu.periode.fin) : lu.date ? dateFr(lu.date) : lu.arrete ? "arrêté " + dateFr(lu.arrete) : "";
      const nouvelles = p?.nouvelles ? p.nouvelles.length + (p.cartesSansTitulaire?.length || 0) : p?.operations ? p.operations.length : "";
      const controle = f.erreur ? h("span", {class: "neg"}, f.erreur) : lu.genre === "inconnu" ? h("span", {class: "neg"}, lu.raison)
        : p?.controles?.length ? p.controles.map(x => h("div", {class: x.ok ? "" : "neg"}, (x.ok ? "✓ " : "⚠ ") + x.texte))
        : lu.genre === "facture_cb" && p ? h("span", {class: Math.abs(p.ecart) < 0.01 ? "" : "neg"}, (Math.abs(p.ecart) < 0.01 ? "✓ " : "⚠ écart " + euros(p.ecart) + " · ") + euros(lu.montant) + " débité le " + dateFr(lu.dateDebit))
        : lu.genre === "valorisation" ? h("span", null, euros(lu.valeur) + (f.compte ? " → " + f.compte.nom : " → compte à créer"))
        : lu.genre === "reprise_v7" && p ? h("span", null, p.operations.length + " opérations, budget " + (p.budget ? euros(p.budget.total) : "—"), p.alertes.map(a => h("div", {class: "neg"}, a)))
        : "";
      return h("tr", {class: f.statut === "fait" ? "" : ""}, h("td", {class: "petit"}, lu.nom), h("td", null, genre, f.compte ? h("span", {class: "libbanque"}, f.compte.nom) : null),
        h("td", null, periode), h("td", {class: "num"}, String(nouvelles)), h("td", {class: "petit"}, controle),
        h("td", null, f.statut === "fait" ? h("span", {class: "pos"}, "✓ enregistré") : f.statut === "pret" ? h("button", {class: "mini", onclick: () => enregistrerFichier(f)}, "Enregistrer") :
          f.statut === "compte" ? h("button", {class: "mini primaire", onclick: () => creerCompteImport(f)}, "Créer le compte…") : ""));
    }}));
    const prets = FICHIERS_EN_COURS.filter(f => f.statut === "pret");
    if (prets.length) gauche.appendChild(h("div", {class: "outils", style: {marginTop: ".6rem"}}, h("button", {class: "primaire", onclick: async () => {
      for (const f of FICHIERS_EN_COURS.filter(x => x.statut === "pret")) await enregistrerFichier(f, true);
      rafraichirEcran();
    }}, "Tout enregistrer (" + prets.length + ")"), h("span", {class: "note", style: {margin: 0}}, "Les opérations douteuses iront dans « À traiter » ; les rapprochements sûrs s'appliqueront d'office.")));
    const detail = FICHIERS_EN_COURS.find(f => f.prep?.nouvelles?.length && f.statut === "pret");
    if (detail){
      gauche.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Aperçu : " + detail.lu.nom));
      gauche.appendChild(tableau([{titre: "Date"}, {titre: "Libellé"}, {titre: "Montant", num: true}, {titre: "Classement proposé"}, {titre: "Lieu"}, {titre: "Origine"}], detail.prep.nouvelles, {classe: "serre", limite: 60, ligne: l =>
        h("tr", null, h("td", null, dateCourte(l.date)), h("td", null, l.libelle), montantCellule(l.montant), h("td", {class: l.proposition.categorie === "À préciser" ? "neg" : ""}, l.proposition.categorie + (l.proposition.sousCategorie && l.proposition.sousCategorie !== l.proposition.categorie ? " › " + l.proposition.sousCategorie : "")),
          h("td", null, etiquetteLieu(l.proposition.lieu)), h("td", null, marqueOrigine(l.proposition)))}));
      if (detail.prep.deja.length || detail.prep.ecartees.length || detail.prep.doublonsLcl) gauche.appendChild(h("p", {class: "note"},
        (detail.prep.deja.length ? detail.prep.deja.length + " ligne(s) déjà présente(s), écartée(s). " : "") +
        (detail.prep.ecartees.length ? detail.prep.ecartees.length + " ligne(s) carte couverte(s) par les exports par carte, écartée(s). " : "") +
        (detail.prep.doublonsLcl ? detail.prep.doublonsLcl + " doublon(s) LCL écarté(s) (règle ⌈n/2⌉). " : "")));
    }
  } else gauche.appendChild(h("p", {class: "vide"}, "Aucun fichier en cours."));
  grille.appendChild(gauche);
  grille.appendChild(carteRoutine());
  c.appendChild(grille);

  const imports = vivants("imports").sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 15);
  if (imports.length){
    c.appendChild(h("h2", null, "Derniers imports"));
    c.appendChild(tableau([{titre: "Le"}, {titre: "Fichier"}, {titre: "Compte"}, {titre: "Période"}, {titre: "Nouvelles", num: true}, {titre: "Déjà là", num: true}], imports, {classe: "serre", ligne: i =>
      h("tr", null, h("td", null, dateFr(i.date.slice(0, 10))), h("td", {class: "petit"}, i.fichier), h("td", null, libelleCompte(i.compte)),
        h("td", null, i.periode ? dateCourte(i.periode.debut) + " – " + dateFr(i.periode.fin) : ""), h("td", {class: "num"}, String(i.nouvelles ?? "")), h("td", {class: "num"}, String(i.deja ?? "")))}));
  }
}});

function carteRoutine(){
  const ul = h("ul", {class: "liste-traiter"});
  const dernier = compteId => vivants("imports").filter(i => i.compte === compteId).sort((a, b) => a.date < b.date ? 1 : -1)[0];
  for (const c of vivants("comptes").filter(c => c.actif !== false && c.carte !== "LCL-NV")){
    let quoi, date;
    if (["courant", "carte"].includes(c.type)){ const d = dernier(c.id); quoi = c.type === "carte" && c.banque === "LCL" ? "encours CSV (après l'arrêté)" : "CSV"; date = d ? d.periode?.fin || d.date.slice(0, 10) : null; }
    else if (c.type === "especes") continue;
    else { const v = derniereValorisation(c.id, "9999-12-31"); quoi = "relevé PDF"; date = v?.date; }
    const vieux = !date || ecartJours(date, aujourdhui()) > (["courant", "carte"].includes(c.type) ? 35 : 400);
    ul.appendChild(h("li", null, h("span", null, c.nom + ", " + quoi), h("span", {class: vieux ? "discret" : "pos"}, date ? (vieux ? "" : "✓ ") + dateFr(date) : "jamais")));
  }
  const factures = vivants("factures").sort((a, b) => a.arrete < b.arrete ? 1 : -1)[0];
  if (comptesDeType("carte").some(c => c.banque === "LCL")) ul.appendChild(h("li", null, h("span", null, "Facture des cartes LCL, PDF"), h("span", {class: factures && ecartJours(factures.dateDebit, aujourdhui()) < 35 ? "pos" : "discret"}, factures ? "arrêté " + dateFr(factures.arrete) : "jamais")));
  if (!ul.children.length) ul.appendChild(h("li", null, h("span", {class: "discret"}, "Aucun compte encore : déposez un premier relevé.")));
  return h("section", {class: "carte"}, h("h2", null, "Routine du mois"), ul);
}

async function deposerFichiers(fichiers){
  aller("import");
  for (const fichier of fichiers){
    const f = {fichier, lu: {nom: fichier.name, genre: "en cours"}, statut: "lecture"};
    FICHIERS_EN_COURS.push(f); rafraichirEcran();
    await lireEtPreparer(f);
  }
  rafraichirEcran();
}
async function lireEtPreparer(f, motDePasse){
  try { f.lu = await lireFichier(f.fichier, motDePasse); }
  catch (e){
    if (e.protege){
      const mdp = await demander("PDF protégé", "Mot de passe du PDF « " + f.fichier.name + " » (utilisé ici, jamais conservé)", "", "password");
      if (mdp) return lireEtPreparer(f, mdp);
      f.lu = {nom: f.fichier.name, genre: "inconnu", raison: "PDF protégé, mot de passe non fourni"}; f.statut = "erreur"; return;
    }
    f.lu = {nom: f.fichier.name, genre: "inconnu", raison: e.message}; f.statut = "erreur"; return;
  }
  preparerFichier(f);
}
function preparerFichier(f){
  const lu = f.lu;
  try {
    if (["compte", "carte", "valorisation", "facture_cb"].includes(lu.genre)){
      f.compte = compteDuFichier(lu);
      if (!f.compte){ f.statut = "compte"; return; }
      if (lu.genre === "facture_cb") f.prep = preparerFacture(lu, f.compte);
      else if (lu.genre !== "valorisation") f.prep = preparerReleve(lu, f.compte);
      f.statut = "pret";
    } else if (lu.genre === "reprise_v7"){ f.prep = preparerReprise(lu); f.statut = "pret"; }
    else if (["regles", "plan", "justificatif_pdf", "image", "document"].includes(lu.genre)) f.statut = "pret";
    else f.statut = "erreur";
  } catch (e){ f.erreur = e.message; f.statut = "erreur"; console.error(e); }
}
async function creerCompteImport(f){
  const p = compteAProposer(f.lu); if (!p) return;
  const nom = h("input", {type: "text", value: p.nom});
  const type = selection(Object.entries(TYPES_COMPTE), p.type);
  const titulaire = h("input", {type: "text", value: p.titulaire || "", placeholder: "ex. Titulaire A, Joint"});
  const debit = selection([["", "—"], ...comptesDeType("courant").map(c => [c.id, c.nom])], p.compteDebit || "");
  const ok = await dialogue({titre: "Nouveau compte", corps: h("div", null, h("p", null, "Le fichier « " + f.lu.nom + " » porte sur un compte inconnu de ce livre."),
    h("div", {class: "grille-champs"}, champ("Nom", nom), champ("Type", type), champ("Titulaire", titulaire), p.type === "carte" ? champ("Débitée sur", debit) : null),
    p.numero ? h("p", {class: "note"}, "Numéro reconnu : …" + String(p.numero).slice(-6)) : null),
    actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Créer", classe: "primaire", valeur: true}]});
  if (!ok) return;
  enregistrer("comptes", Object.assign(p, {nom: nom.value.trim() || p.nom, type: type.value, titulaire: titulaire.value.trim(), compteDebit: p.type === "carte" ? debit.value : undefined, actif: true,
    produit: f.lu.produit || undefined}));
  if (p.type === "courant" && !LIVRE.parametres.compteTresorerie) modifierParametres({compteTresorerie: vivants("comptes").find(c => c.type === "courant").id});
  for (const autre of FICHIERS_EN_COURS.filter(x => x.statut === "compte" || x.statut === "pret")) preparerFichier(autre);
  rafraichirEcran();
}
async function enregistrerFichier(f, enLot){
  try {
    const lu = f.lu;
    if (lu.genre === "compte" || lu.genre === "carte"){ const imp = appliquerReleve(f.prep); f.resultat = imp.nouvelles + " opération(s)"; }
    else if (lu.genre === "facture_cb") appliquerFacture(f.prep);
    else if (lu.genre === "valorisation") appliquerValorisation(lu, f.compte);
    else if (lu.genre === "reprise_v7"){
      const ok = enLot ? true : await confirmer("Reprendre " + f.prep.operations.length + " opérations, le budget " + (f.prep.budget?.annee || "") + " (" + euros(f.prep.budget?.total || 0) + ") et " + f.prep.echeances.length + " échéances à confirmer ? Le classeur n'est pas modifié.", "Reprendre");
      if (!ok) return;
      const r = appliquerReprise(f.prep); message(r.operations + " opérations reprises.");
    }
    else if (lu.genre === "plan"){ const r = appliquerPlan(lu.contenu); message(r.budgets + " budget(s), " + r.echeances + " échéance(s), " + r.regles + " règle(s) importés.");
      for (const op of vivants("operations").filter(o => o.statut !== "classe")) enregistrer("operations", classerAutomatiquement(op)); }
    else if (lu.genre === "regles"){ const n = appliquerRegles(lu.contenu); message(n + " règle(s) importée(s).");
      for (const op of vivants("operations").filter(o => o.statut !== "classe")) enregistrer("operations", classerAutomatiquement(op)); }
    else if (lu.genre === "justificatif_pdf" || lu.genre === "image") await importerJustificatifPc(lu);
    else if (lu.genre === "document") enregistrer("documents", {genre: lu.sousGenre, fichier: lu.nom, date: lu.date, titre: lu.titre, quantite: lu.quantite, montant: lu.montant, sens: lu.sens, isin: lu.isin});
    f.statut = "fait";
    for (const autre of FICHIERS_EN_COURS.filter(x => x.statut === "pret" && x !== f)) preparerFichier(autre);
    if (!enLot) rafraichirEcran();
  } catch (e){ f.erreur = e.message; f.statut = "erreur"; console.error(e); message(e.message, true); if (!enLot) rafraichirEcran(); }
}
/* Justificatif déposé sur le PC : lecture, puis écran de rapprochement. */
async function importerJustificatifPc(lu){
  let t;
  if (lu.genre === "image"){ message("Lecture du ticket « " + lu.nom + " »…"); t = await lireTicket(new Blob([lu.octets], {type: lu.mime})); }
  else { t = Object.assign(extraireTicket(lu.texte), {photo: {mime: "application/pdf", octets: lu.octets}}); if (!/facturette/.test(t.type)) t.type = "facture"; }
  const c = commercantPourTicket(t);
  const j = await creerJustificatif({type: t.type, date: t.date || aujourdhui(), heure: t.heure, montant: t.montant || 0, raisonSociale: t.raisonSociale, commercantNom: c ? c.nom : nomDepuisCle(cleLibelle(t.enseigne || t.raisonSociale || "")),
    commercant: c ? c.id : null, carte4: t.carte4, carte: carteDesChiffres(t.carte4), siret: t.siret, texteOCR: t.texte, origine: "pc", categorie: c?.categorie || "", sousCategorie: c?.sousCategorie || "", lieu: c?.lieu || "", aVerifier: true}, t.photo);
  rapprocherTout();
  ETAT_ECRAN.justificatifs = Object.assign(ETAT_ECRAN.justificatifs || {}, {choisi: j.id});
}
