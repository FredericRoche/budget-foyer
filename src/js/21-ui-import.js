/* ================= Import des relevés et documents ================= */
let FICHIERS_EN_COURS = [];   // [{lu, compte, prep, statut, erreur}]

declarerEcran("import", {titre: "Importer", rendre(c, etat){
  c.appendChild(entete("Importer", "Relevés, factures, plans, classeur, règles et justificatifs · les fichiers sont lus sur cet appareil ; rien n'est envoyé ailleurs.",
    ["showDirectoryPicker" in window ? h("button", {class: "primaire", onclick: () => importerDossierDepot().catch(e => message(e.message, true))}, "Importer le dossier de dépôt") : null,
     h("button", {onclick: async () => { const f = await choisirFichier(".csv,.xlsx,.pdf,.json,image/*", true); if (f && f.length) await deposerFichiers(f); }}, "Choisir des fichiers…"),
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
    const avecDepot = FICHIERS_EN_COURS.some(f => f.source);
    gauche.appendChild(tableau([{titre: "Fichier"}, {titre: "Reconnu comme"}, {titre: "Période ou date"}, {titre: "Nouvelles", num: true}, {titre: "Contrôle"}, {titre: ""}, avecDepot ? {titre: "Rangement"} : null].filter(Boolean), FICHIERS_EN_COURS, {classe: "serre", ligne: f => {
      const lu = f.lu; const p = f.prep;
      let genre = {compte: "Compte " + (lu.banque || ""), carte: lu.banque === "Amex" ? "Amex" : "Carte " + (lu.carte || ""), facture_cb: "Facture des cartes LCL", valorisation: "Valorisation · " + (lu.produit || ""),
        corrections: "Lot de corrections · " + (lu.actions || []).length + " action(s)" + (lu.titre ? " · " + lu.titre : ""), releve_lcl: "Relevé LCL (PDF, fait foi)", releve_amex: "Relevé Amex (PDF, fait foi)", cartes_lcl: "Cartes LCL (relevé PDF) · " + (lu.titre || "").replace(/^Détail des cartes /, ""), reprise_v7: "Classeur d'inventaire (reprise)", regles: "Règles de classement", plan: "Plan (budget et échéances)", justificatif_pdf: "Justificatif (PDF)", image: "Justificatif (photo)",
        document: lu.sousGenre === "avis_impot" ? "Avis d'impôt" + (lu.titre ? " · " + lu.titre : "") : lu.sousGenre === "achat_sncf" ? "Justificatif SNCF Connect · " + lu.titre : "Avis d'opéré", inconnu: "Non reconnu"}[lu.genre] || lu.genre;
      const periode = lu.periode ? dateCourte(lu.periode.debut) + " – " + dateFr(lu.periode.fin) : lu.date ? dateFr(lu.date) : lu.arrete ? "arrêté " + dateFr(lu.arrete) : "";
      const nouvelles = p?.nb != null ? p.nb : p?.nouvelles ? p.nouvelles.length + (p.cartesSansTitulaire?.length || 0) : p?.operations ? p.operations.length : "";
      const controle = f.erreur ? h("span", {class: "neg"}, f.erreur) : lu.genre === "inconnu" ? h("span", {class: "neg"}, lu.raison)
        : p?.controles?.length ? p.controles.map(x => h("div", {class: x.ok ? "" : "neg"}, (x.ok ? "✓ " : "⚠ ") + x.texte))
        : lu.genre === "facture_cb" && p ? h("span", {class: Math.abs(p.ecart) < 0.01 ? "" : "neg"}, (Math.abs(p.ecart) < 0.01 ? "✓ " : "⚠ écart " + euros(p.ecart) + " · ") + euros(lu.montant) + " débité le " + dateFr(lu.dateDebit))
        : lu.genre === "valorisation" ? h("span", null, euros(lu.valeur) + (f.compte ? " → " + f.compte.nom : " → compte à créer"))
        : lu.genre === "reprise_v7" && p ? h("span", null, p.operations.length + " opérations, budget " + (p.budget ? euros(p.budget.total) : "—"), p.alertes.map(a => h("div", {class: "neg"}, a)))
        : "";
      return h("tr", {class: f.statut === "fait" ? "" : ""}, h("td", {class: "petit"}, lu.nom), h("td", null, genre, f.compte ? h("span", {class: "libbanque"}, f.compte.nom) : null),
        h("td", null, periode), h("td", {class: "num"}, String(nouvelles)), h("td", {class: "petit"}, controle),
        h("td", null, f.statut === "fait" ? h("span", {class: "pos"}, "✓ enregistré") : f.statut === "pret" ? h("button", {class: "mini", onclick: () => enregistrerFichier(f)}, "Enregistrer") :
          f.statut === "compte" ? h("button", {class: "mini primaire", onclick: () => creerCompteImport(f)}, "Créer le compte…") : ""),
        avecDepot ? h("td", {class: "petit"}, celluleRangement(f)) : null);
    }}));
    const prets = FICHIERS_EN_COURS.filter(f => f.statut === "pret");
    if (prets.length) gauche.appendChild(h("div", {class: "outils", style: {marginTop: ".6rem"}}, h("button", {class: "primaire", onclick: async () => {
      for (const f of FICHIERS_EN_COURS.filter(x => x.statut === "pret")) await enregistrerFichier(f, true);
      if (FICHIERS_EN_COURS.some(f => f.source)) await nettoyerDepot();
      rafraichirEcran();
    }}, "Tout enregistrer (" + prets.length + ")"), h("span", {class: "note", style: {margin: 0}}, "Les opérations douteuses iront dans « À traiter » ; les rapprochements sûrs sans changement de fournisseur ni de catégorie s'appliqueront d'office, les autres seront proposés.")));
    // Aperçu des opérations nouvelles : seulement pour les fichiers qui en proposent un classement (relevés)
    try {
    const detail = FICHIERS_EN_COURS.find(f => f.statut === "pret" && !["releve_lcl", "releve_amex"].includes(f.lu.genre) && ((f.prep?.nouvelles?.length && f.prep.nouvelles[0]?.proposition) || f.prep?.cartesSansTitulaire?.length));
    if (detail){
      gauche.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Aperçu : " + detail.lu.nom));
      gauche.appendChild(tableau([{titre: "Date"}, {titre: "Libellé"}, {titre: "Montant", num: true}, {titre: "Classement proposé"}, {titre: "Lieu"}, {titre: "Origine"}], detail.prep.nouvelles, {classe: "serre", limite: 60, ligne: l =>
        h("tr", null, h("td", null, dateCourte(l.date)), h("td", null, l.libelle), montantCellule(l.montant), h("td", {class: l.proposition.categorie === "À préciser" ? "neg" : ""}, l.proposition.categorie + (l.proposition.sousCategorie && l.proposition.sousCategorie !== l.proposition.categorie ? " › " + l.proposition.sousCategorie : "")),
          h("td", null, etiquetteLieu(l.proposition.lieu)), h("td", null, marqueOrigine(l.proposition)))}));
      if (detail.prep.deja.length || detail.prep.ecartees.length || detail.prep.doublonsLcl || detail.prep.cartesSansTitulaire?.length) gauche.appendChild(h("p", {class: "note"},
        (detail.prep.deja.length ? detail.prep.deja.length + " ligne(s) déjà présente(s), écartée(s). " : "") +
        (detail.prep.ecartees.length ? detail.prep.ecartees.length + " ligne(s) carte déjà présente(s) sur une carte, écartée(s). " : "") +
        (detail.prep.cartesSansTitulaire?.length ? detail.prep.cartesSansTitulaire.length + " achat(s) carte absent(s) des cartes, ajouté(s) sur « Cartes LCL (sans titulaire) » : " + detail.prep.cartesSansTitulaire.slice(0, 12).map(l => dateCourte(l.date) + " " + l.libelle + " " + euros(l.montant)).join(" · ") + (detail.prep.cartesSansTitulaire.length > 12 ? " …" : "") + ". " : "") +
        (detail.prep.doublonsLcl ? detail.prep.doublonsLcl + " doublon(s) LCL écarté(s) (règle ⌈n/2⌉). " : "")));
    }
    // Clôture sur le relevé PDF : écarts à trancher avant d'enregistrer
    for (const f of FICHIERS_EN_COURS.filter(x => ["releve_lcl", "releve_amex"].includes(x.lu.genre) && x.statut === "pret" && x.prep)){
      const p = f.prep, enTrop = [...p.enTrop, ...p.enTropCartes];
      // Ligne en trop expliquée : présente sur un autre relevé déposé (achat de fin de période), ou même montant qu'une
      // ligne appariée du relevé à 3 jours près (doublon probable, libellé différent : CSV et reprise)
      const autresReleves = FICHIERS_EN_COURS.filter(x => x !== f && x.lu.genre === f.lu.genre && (x.lu.releveAmex || x.lu.releveCompte));
      const surAutre = o => autresReleves.find(x => (x.lu.releveAmex || x.lu.releveCompte).operations.some(l => versCentimes(l.montant) === versCentimes(o.montant) && Math.abs(ecartJours(l.date, o.date)) <= 3));
      const jumeau = o => (p.apparies || []).find(a => a.id !== o.id && a.compte === o.compte && versCentimes(a.montant) === versCentimes(o.montant) && Math.abs(ecartJours(a.date, o.date)) <= 3);
      const explication = o => { const x = surAutre(o); if (x) return "sur le relevé suivant (" + x.lu.nom + ") : à garder";
        const j = !p.doublonsExacts?.has(o.id) && jumeau(o); return j ? "doublon probable de « " + (j.libelle || "") + " » du " + dateFr(j.date) : null; };
      gauche.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Clôture sur le relevé : " + f.lu.titre));
      if (p.anciens?.length) gauche.append(h("p", null, h("label", null, h("input", {type: "checkbox", checked: p.choixAnciens, onchange: e => { p.choixAnciens = e.target.checked; }}),
        " Marquer comme réglés les " + p.anciens.length + " achat(s) Amex antérieurs au " + dateFr(p.lu.periode.debut) + " restés sans date de débit (" + euros(-somme(p.anciens, o => o.montant)) + ")"),
        h("div", {class: "note"}, "Le relevé constate le paiement du solde précédent le " + dateFr(p.paiementPrecedent) + " : ces achats ont été réglés par les relevés précédents. Ils reçoivent la date du prélèvement Amex qui les suit (date estimée) et sortent de l'encours. "
          + "Pour les dater exactement et repérer d'éventuels doublons, importez d'abord les relevés PDF Amex précédents, du plus ancien au plus récent.")));
      if (!p.manquants.length && !enTrop.length && !p.cartes?.nouvelles?.length){ gauche.appendChild(h("p", {class: "note"}, "Tout est conforme au relevé : « Enregistrer » marque le mois comme clôturé.")); continue; }
      if (p.manquants.length) gauche.append(h("h3", null, "Écritures du relevé absentes de l'application (" + p.manquants.length + ") : à ajouter"),
        tableau([{titre: ""}, {titre: "Date"}, {titre: "Libellé"}, {titre: "Montant", num: true}], p.manquants.map((l, i) => ({l, i})), {classe: "serre", ligne: ({l, i}) => h("tr", null,
          h("td", null, h("input", {type: "checkbox", checked: p.choixManquants.has(i), onchange: e => { e.target.checked ? p.choixManquants.add(i) : p.choixManquants.delete(i); }})),
          h("td", null, dateFr(l.date)), h("td", null, l.libelle, l.detail ? h("div", {class: "libbanque"}, l.detail) : null), montantCellule(l.montant))}));
      if (p.cartes?.nouvelles?.length) gauche.appendChild(h("p", {class: "note"}, p.cartes.nouvelles.length + " achat(s) carte du relevé absent(s) de l'application, ajouté(s) à l'enregistrement : "
        + p.cartes.nouvelles.slice(0, 15).map(l => dateCourte(l.date) + " " + l.libelle + " " + euros(l.montant)).join(" · ") + (p.cartes.nouvelles.length > 15 ? " …" : "")));
      if (enTrop.length) gauche.append(h("h3", null, "Dans l'application mais pas sur le relevé (" + enTrop.length + ") : doublons ou lignes en trop ?"),
        h("p", {class: "note"}, "Rien n'est supprimé sans votre coche. Un achat du dernier jour peut appartenir au relevé suivant.",
          p.doublonsExacts?.size ? [" ", h("button", {class: "mini", onclick: () => { for (const id of p.doublonsExacts) p.choixEnTrop.add(id); rafraichirEcran(); }}, "Cocher les " + p.doublonsExacts.size + " doublon(s) exact(s)"),
            " ", h("span", {class: "discret"}, "(même compte, jour, montant et libellé qu'une ligne conservée ; l'original reste)")] : null),
        tableau([{titre: "Supprimer"}, {titre: "Date"}, {titre: "Compte"}, {titre: "Libellé"}, {titre: "Montant", num: true}], enTrop, {classe: "serre", ligne: o => h("tr", null,
          h("td", null, h("input", {type: "checkbox", checked: p.choixEnTrop.has(o.id), onchange: e => { e.target.checked ? p.choixEnTrop.add(o.id) : p.choixEnTrop.delete(o.id); }})),
          h("td", null, dateFr(o.date)), h("td", null, libelleCompte(o.compte)), h("td", null, o.libelle, p.doublonsExacts?.has(o.id) ? h("span", {class: "libbanque"}, "doublon exact") : null, explication(o) ? h("span", {class: "libbanque"}, explication(o)) : null, (o.justificatifs || []).length ? h("span", {class: "libbanque"}, "pièce jointe") : null), montantCellule(o.montant))}));
    }
    } catch (e){ console.error(e); gauche.appendChild(h("p", {class: "neg"}, "Aperçu impossible à afficher : " + e.message + " (le fichier peut quand même être enregistré ; signalez ce message).")); }
  } else gauche.appendChild(h("p", {class: "vide"}, "Aucun fichier en cours."));
  // Pleine largeur : la routine du mois se replie sous la liste au lieu d'occuper une colonne en permanence
  grille.className = "";
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
  const d = h("details", {class: "carte", style: {marginTop: "1rem"}}, h("summary", {style: {cursor: "pointer"}}, h("strong", null, "Routine du mois"), h("span", {class: "petit discret"}, " — date du dernier relevé de chaque compte (cliquer pour déplier)")), ul);
  try { d.open = localStorage.getItem("routineOuverte") === "1"; } catch (e) {}
  d.addEventListener("toggle", () => { try { localStorage.setItem("routineOuverte", d.open ? "1" : "0"); } catch (e) {} });
  return d;
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
    else if (lu.genre === "cartes_lcl"){ f.prep = preparerCartesPdf(lu); f.statut = "pret"; }
    else if (lu.genre === "releve_lcl" || lu.genre === "releve_amex"){
      // Recalcul (après l'enregistrement d'un autre fichier) : les choix de l'utilisateur sont gardés
      const avant = f.prep;
      const amex = lu.genre === "releve_amex";
      f.prep = amex ? preparerClotureAmex(lu) : preparerClotureLcl(lu); if (f.prep) f.compte = f.prep.compte; f.statut = f.prep ? "pret" : "erreur"; if (!f.prep) f.erreur = amex ? "compte Amex introuvable : créez d'abord la carte Amex (import d'un CSV Amex)" : "compte LCL introuvable";
      if (avant && f.prep){
        const cle = l => l.date + "|" + versCentimes(l.montant) + "|" + l.libelle;
        const refuses = new Set(avant.manquants.filter((l, i) => !avant.choixManquants.has(i)).map(cle));
        f.prep.choixManquants = new Set(f.prep.manquants.map((l, i) => i).filter(i => !refuses.has(cle(f.prep.manquants[i]))));
        const presents = new Set([...f.prep.enTrop, ...f.prep.enTropCartes].map(o => o.id));
        f.prep.choixEnTrop = new Set([...avant.choixEnTrop].filter(id => presents.has(id)));
        if (avant.choixAnciens === false) f.prep.choixAnciens = false;
      }
    }
    else if (lu.genre === "corrections"){ f.prep = preparerCorrections(lu); f.statut = "pret"; }
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
    else if (lu.genre === "cartes_lcl"){ const n = appliquerCartesPdf(f.prep); f.resultat = n + " opération(s)"; }
    else if (lu.genre === "releve_amex"){ const r = appliquerClotureAmex(f.prep); f.resultat = r.ajoutees + " ajoutée(s), " + r.supprimees + " supprimée(s)";
      message("Mois de la carte Amex clôturé sur le relevé : " + r.ajoutees + " écriture(s) ajoutée(s), " + r.supprimees + " ligne(s) en trop supprimée(s)" + (r.anciens ? ", " + r.anciens + " achat(s) antérieur(s) marqués réglés" : "") + "."); }
    else if (lu.genre === "releve_lcl"){ const r = appliquerClotureLcl(f.prep); f.resultat = r.ajoutees + r.cartes + " ajoutée(s), " + r.supprimees + " supprimée(s)";
      message("Mois clôturé sur le relevé : " + r.ajoutees + " écriture(s) et " + r.cartes + " achat(s) carte ajoutés, " + r.supprimees + " ligne(s) en trop supprimée(s)."); }
    else if (lu.genre === "corrections"){
      if (!enLot && !(await confirmer("Appliquer les " + lu.actions.length + " correction(s) du lot « " + lu.nom + " » ?", "Appliquer"))) return;
      const n = appliquerCorrections(lu); f.resultat = n + " correction(s)"; message(n + " correction(s) appliquée(s).");
    }
    else if (lu.genre === "valorisation") appliquerValorisation(lu, f.compte);
    else if (lu.genre === "reprise_v7"){
      const ok = enLot ? true : await confirmer("Reprendre " + f.prep.operations.length + " opérations, le budget " + (f.prep.budget?.annee || "") + " (" + euros(f.prep.budget?.total || 0) + ") et " + f.prep.echeances.length + " échéances à confirmer ? Le classeur n'est pas modifié.", "Reprendre");
      if (!ok) return;
      const r = appliquerReprise(f.prep); message(r.operations + " opérations reprises.");
    }
    else if (lu.genre === "plan"){ const r = appliquerPlan(lu.contenu); message(r.budgets + " budget(s), " + r.echeances + " échéance(s), " + r.regles + " règle(s)" + (r.comptes ? ", " + r.comptes + " compte(s)" : "") + " importés" + (r.reclassees != null ? " ; " + r.reclassees + " opération(s) reclassée(s)" : "") + (r.budgetsSupprimes ? " ; " + r.budgetsSupprimes + " budget(s) supprimé(s)" : "") + (r.budgetsNonSupprimes ? " ; non supprimé : " + r.budgetsNonSupprimes.join(", ") : "") + (r.budgetsIntrouvables ? " ; budget à supprimer introuvable : " + r.budgetsIntrouvables.join(", ") : "") + (r.liensReportes ? " ; " + r.liensReportes + " échéance(s) rattachée(s) à la ligne équivalente du nouveau budget" : "") + (r.liensNonReportes ? " ; lien de budget à revoir (Trésorerie, échéances) : " + r.liensNonReportes.join(", ") : "") + ".", !!(r.liensNonReportes || r.budgetsNonSupprimes || r.budgetsIntrouvables));
      for (const op of vivants("operations").filter(o => o.statut !== "classe")) enregistrer("operations", classerAutomatiquement(op)); }
    else if (lu.genre === "regles"){ const n = appliquerRegles(lu.contenu); message(n + " règle(s) importée(s).");
      for (const op of vivants("operations").filter(o => o.statut !== "classe")) enregistrer("operations", classerAutomatiquement(op)); }
    else if (lu.genre === "justificatif_pdf" || lu.genre === "image") await importerJustificatifPc(lu, !!f.source);
    else if (lu.genre === "document" && lu.sousGenre === "achat_sncf"){ const n = enregistrerAchatsSncf(lu); f.resultat = n + " paiement(s) nouveau(x)"; message(n + " justificatif(s) SNCF Connect enregistré(s) : ils serviront au rapprochement des notes de frais."); }
    else if (lu.genre === "document" && lu.sousGenre === "avis_impot"){
      // Un avis réimporté remplace le précédent (même nature, même année, même montant) au lieu de s'ajouter
      const deja = vivants("documents").find(d => d.genre === "avis_impot" && d.titre === lu.titre && (d.montant || null) === (lu.montant || null))
        || vivants("documents").find(d => d.genre === "avis_impot" && !d.echeances && d.titre && lu.titre.startsWith(d.titre));
      enregistrer("documents", Object.assign(deja || {}, {genre: "avis_impot", fichier: lu.nom, date: lu.date, titre: lu.titre, montant: lu.montant, quoi: lu.quoi, echeances: lu.echeances || []}));
      const n = classerParAvisImpot(); f.resultat = (lu.echeances || []).length + " échéance(s)" + (n ? ", " + n + " prélèvement(s) classé(s)" : "");
      if (n) message(n + " prélèvement(s) d'impôt classé(s) d'après l'avis.");
    }
    else if (lu.genre === "document") enregistrer("documents", {genre: lu.sousGenre, fichier: lu.nom, date: lu.date, titre: lu.titre, quantite: lu.quantite, montant: lu.montant, sens: lu.sens, isin: lu.isin});
    f.statut = "fait";
    if (f.source) await rangerFichier(f);
    for (const autre of FICHIERS_EN_COURS.filter(x => x.statut === "pret" && x !== f)) preparerFichier(autre);
    if (!enLot) rafraichirEcran();
  } catch (e){ f.erreur = e.message; f.statut = "erreur"; console.error(e); message(e.message, true); if (!enLot) rafraichirEcran(); }
}
/* Justificatif déposé sur le PC : lecture, puis écran de rapprochement. Venu du dossier de dépôt, il n'a
   été vu par personne : il attend une validation (moyen de paiement, doublon possible), comme une saisie du téléphone. */
async function importerJustificatifPc(lu, depuisDepot){
  let t;
  if (lu.genre === "image"){ message("Lecture du ticket « " + lu.nom + " »…"); t = await lireTicket(new Blob([lu.octets], {type: lu.mime})); }
  else { t = Object.assign(extraireTicket(lu.texte), {photo: {mime: "application/pdf", octets: lu.octets}}); if (!/facturette|notefrais/.test(t.type)) t.type = "facture"; }
  // Note de frais détaillée : montant, date de déclaration, numéro et créancier lus sur la note ; classement repris de la note précédente
  const ndf = lu.noteFrais;
  if (ndf) Object.assign(t, {type: "notefrais", montant: ndf.total, date: ndf.declaree, numero: "NDF " + ndf.numero, raisonSociale: ndf.entite || t.raisonSociale, enseigne: ndf.entite || t.enseigne});
  const precedente = ndf ? vivants("justificatifs").filter(x => estNoteFrais(x) && !x.aValider && x.id).sort((a, b) => a.date < b.date ? 1 : -1)[0] || null : null;
  const c = commercantPourTicket(t) || (precedente?.commercant ? obtenir("commercants", precedente.commercant) : null);
  // Fournisseur trouvé autrement que par un alias ou un SIRET : simple supposition, affichée comme telle
  const devine = !!c && !commercantSur(t) && !(ndf && precedente && c.id === precedente.commercant);
  // Même pièce déjà enregistrée (même montant, même date, même fournisseur) : on demande avant de l'ajouter
  const double = justificatifDejaLa({montant: t.montant, date: t.date, commercant: c?.id, raisonSociale: t.raisonSociale, numero: t.numero});
  if (double && !(await confirmer("Une pièce identique est déjà enregistrée : " + (double.commercantNom || double.raisonSociale || "fournisseur ?") + (double.numero ? ", facture n° " + double.numero : "") + ", " + euros(double.montant) + " du " + dateFr(double.date)
    + ". L'ajouter quand même ?", "Ajouter quand même"))) return;
  const j = await creerJustificatif({type: t.type, date: t.date || aujourdhui(), heure: t.heure, montant: t.montant || 0, raisonSociale: t.raisonSociale, commercantNom: c ? c.nom : nomDepuisCle(cleLibelle(t.enseigne || t.raisonSociale || "")),
    commercant: c ? c.id : null, carte4: t.carte4, carte: ndf ? (precedente?.carte || "") : carteDesChiffres(t.carte4), siret: t.siret, numero: t.numero || "", texteOCR: t.texte, origine: depuisDepot ? "depot" : "pc",
    categorie: precedente?.categorie || c?.categorie || "", sousCategorie: precedente ? precedente.sousCategorie || "" : c?.sousCategorie || "", lieu: precedente?.lieu || c?.lieu || "", aVerifier: true,
    fournisseurDevine: devine, natureExacte: ndf ? "Note de frais n° " + ndf.numero + " (" + ndf.periode.toLowerCase() + ")" : "", lignesNdf: ndf ? ndf.lignes : undefined,
    aValider: !!depuisDepot}, t.photo);
  rapprocherTout();
  ETAT_ECRAN.justificatifs = Object.assign(ETAT_ECRAN.justificatifs || {}, {choisi: j.id});
}
