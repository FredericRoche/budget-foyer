/* ================= Justificatifs et rapprochement =================
   Un justificatif (ticket de caisse, facture, facturette CB) est rapproché de
   l'opération bancaire de même montant, dans une fenêtre de dates qui dépend de
   son type. Un cas sans ambiguïté est appliqué d'office, réversible ; les autres
   attendent dans « À traiter ». Facture et facturette d'un même achat se
   rattachent à la même opération sans double compte. Plusieurs tickets réglés en
   un seul paiement forment un « achat groupé » et ventilent l'opération. */

const TYPES_JUSTIF = {ticket: "Ticket de caisse", facture: "Facture", facturette: "Facturette CB", autre: "Autre"};

function fenetre(j){
  const p = LIVRE.parametres;
  return j.type === "facture" ? [p.tolFactureAvant, p.tolFactureApres] : [p.tolTicketAvant, p.tolTicketApres];
}
function compteCompatible(j, compte){
  if (!j.carte) return true;
  if (j.carte === "ESPECES") return compte.type === "especes";
  if (j.carte.startsWith("CPT:") || j.carte.startsWith("CHQ:")) return compte.id === j.carte.slice(4);
  if (j.carte === "AMEX") return compte.carte === "AMEX";
  if (/^X\d+/.test(j.carte)) return compte.carte === j.carte || compte.carte === "LCL-NV";
  return true;
}
function correspondCarte4(j, compte){
  return j.carte4 && compte.carte && /^X\d+/.test(compte.carte) && j.carte4.endsWith(compte.carte.slice(1));
}
function montantJustif(js){ return somme(js, j => versCentimes(j.montant)); }

/* Candidats pour un justificatif ou un groupe de justificatifs (même paiement). */
/* Les 4 derniers chiffres lus sur une facturette désignent la carte, s'ils correspondent à une carte connue. */
function carteDesChiffres(carte4){
  if (!carte4) return "";
  const c = vivants("comptes").find(x => x.type === "carte" && /^X\d+/.test(x.carte || "") && carte4.endsWith(x.carte.slice(1)));
  return c ? c.carte : "";
}
function candidats(js){
  const j = Object.assign({}, js[0]); const cents = montantJustif(js);
  if (!j.carte && j.carte4) j.carte = carteDesChiffres(j.carte4);
  const [avant, apres] = fenetre(j);
  const nomJ = js.map(x => [x.commercantNom, x.raisonSociale].filter(Boolean).join(" ")).join(" ");
  const r = [];
  for (const op of vivants("operations")){
    if (op.montant >= 0 || -versCentimes(op.montant) !== cents) continue;
    const dj = ecartJours(j.date, op.date);
    if (dj < -avant || dj > apres) continue;
    const compte = obtenir("comptes", op.compte); if (!compte || !compteCompatible(j, compte)) continue;
    if (j.cheque && !String(op.libelle + " " + (op.detail || "")).replace(/\D/g, " ").split(" ").some(n => n && (n === j.cheque || n.endsWith(j.cheque)))) continue;
    const dejaTypes = (op.justificatifs || []).map(id => obtenir("justificatifs", id)).filter(x => x && !js.includes(x)).map(x => x.type);
    if (js.some(x => dejaTypes.includes(x.type))) continue;
    const cOp = op.commercant ? obtenir("commercants", op.commercant) : null;
    const sim = Math.max(similarite(nomJ, op.libelle), cOp ? similarite(nomJ, cOp.nom + " " + (cOp.alias || []).join(" ")) : 0,
      js.some(x => x.commercant && x.commercant === op.commercant) ? 1 : 0);
    let score = 100 - 6 * Math.abs(dj) - (dj < 0 ? 4 : 0) + Math.round(25 * sim) - 15;
    if (correspondCarte4(j, compte)) score += 15;
    if (dejaTypes.length) score += 5;     // l'autre pièce du même achat est déjà là
    r.push({op, score: Math.max(0, Math.min(100, score)), ecart: dj, sim});
  }
  return r.sort((a, b) => b.score - a.score);
}
/* Combinaisons de 2 ou 3 justificatifs du même jour et de la même carte dont la somme égale une opération. */
function achatsGroupes(libres){
  const r = [];
  const parJour = regrouper(libres.filter(j => j.type !== "facture"), j => j.date + "|" + (j.carte || ""));
  for (const liste of parJour.values()){
    if (liste.length < 2) continue;
    const combos = [];
    for (let a = 0; a < liste.length; a++) for (let b = a + 1; b < liste.length; b++){
      combos.push([liste[a], liste[b]]);
      for (let c = b + 1; c < liste.length; c++) combos.push([liste[a], liste[b], liste[c]]);
    }
    for (const js of combos){ const c = candidats(js); if (c.length) r.push({justifs: js, candidats: c}); }
  }
  return r;
}

function lier(js, op, auto){
  op.justificatifs = [...new Set([...(op.justificatifs || []), ...js.map(j => j.id)])];
  const j0 = js[0];
  if (js.length > 1){
    op.ventilation = js.map(j => ({montant: -Math.abs(j.montant), natureExacte: j.natureExacte || "", categorie: j.categorie || op.categorie,
      sousCategorie: j.sousCategorie || op.sousCategorie, lieu: j.lieu || op.lieu, justificatif: j.id, commercantNom: j.commercantNom || ""}));
    op.natureExacte = js.map(j => j.natureExacte).filter(Boolean).join(" ; ");
  } else if (j0.natureExacte && !op.natureExacte) op.natureExacte = j0.natureExacte;
  if (js.length === 1 && j0.commercant && op.commercant !== j0.commercant){
    // Le libellé bancaire devient un alias du commerçant du ticket, si sa fiche n'avait encore rien appris.
    const d = op.commercant ? obtenir("commercants", op.commercant) : null;
    const c = obtenir("commercants", j0.commercant);
    if (c && d && !d.fixe && !Object.keys(d.stats || {}).length) fusionnerCommercants(c, d);
    if (c) op.commercant = c.id;
  }
  if (j0.categorie && js.every(j => j.categorie === j0.categorie) && j0.categorie !== "À préciser"){
    const corrige = op.categorie !== j0.categorie || (j0.sousCategorie && op.sousCategorie !== j0.sousCategorie);
    Object.assign(op, {categorie: j0.categorie, sousCategorie: j0.sousCategorie || op.sousCategorie, nature: j0.nature || op.nature || natureParDefaut(j0.categorie)});
    if (j0.lieu) op.lieu = j0.lieu;
    validerClassement(op, corrige && !auto);
  } else enregistrer("operations", op);
  for (const j of js) enregistrer("justificatifs", Object.assign(j, {operations: [op.id], statut: "rapproche", auto: !!auto, rapprocheLe: new Date().toISOString(), propositions: null}));
}
function delier(j){
  for (const id of j.operations || []){
    const op = obtenir("operations", id); if (!op) continue;
    op.justificatifs = (op.justificatifs || []).filter(x => x !== j.id);
    if (op.ventilation) op.ventilation = op.ventilation.filter(v => v.justificatif !== j.id);
    if (op.ventilation && op.ventilation.length < 2) delete op.ventilation;
    enregistrer("operations", op);
  }
  enregistrer("justificatifs", Object.assign(j, {operations: [], statut: "a_rapprocher", auto: false, rapprocheLe: null, refuse: true}));
}

/* Passe automatique, après chaque import ou fusion de la boîte. */
function rapprocherTout(){
  // Une saisie du téléphone n'est rapprochée qu'une fois validée sur le PC
  const libres = vivants("justificatifs").filter(j => (j.statut === "a_rapprocher" || !j.statut) && !j.aValider);
  let auto = 0;
  // 1. Groupes déclarés au téléphone (« second ticket au même paiement »)
  const groupes = regrouper(libres.filter(j => j.groupe), j => j.groupe);
  for (const js of groupes.values()){
    if (js.length < 2) continue;
    const c = candidats(js);
    if (c.length === 1 && c[0].score >= 60 && !js.some(j => j.refuse)){ lier(js, c[0].op, true); auto++; }
    else for (const j of js) enregistrer("justificatifs", Object.assign(j, {propositions: c.slice(0, 4).map(x => ({op: x.op.id, score: x.score, groupe: js.map(y => y.id)}))}));
  }
  // 2. Justificatifs seuls
  for (const j of libres.filter(j => !j.groupe || (groupes.get(j.groupe) || []).length < 2)){
    if (j.statut === "rapproche") continue;
    const c = candidats([j]);
    const sur = (c.length === 1 && c[0].score >= 60) || (c.length > 1 && c[0].score >= 85 && c[1].score < c[0].score - 25);
    if (sur && !j.refuse){ lier([j], c[0].op, true); auto++; }
    else enregistrer("justificatifs", Object.assign(j, {propositions: c.slice(0, 4).map(x => ({op: x.op.id, score: x.score}))}));
  }
  // 3. Achats groupés devinés (jamais appliqués d'office)
  const restants = vivants("justificatifs").filter(j => j.statut === "a_rapprocher" && !(j.propositions || []).length);
  for (const g of achatsGroupes(restants)){
    for (const j of g.justifs) enregistrer("justificatifs", Object.assign(j, {propositions: g.candidats.slice(0, 2).map(x => ({op: x.op.id, score: Math.max(0, x.score - 5), groupe: g.justifs.map(y => y.id)}))}));
  }
  return auto;
}

/* En-cours : justificatifs à rapprocher (hors espèces), regroupés par moyen de paiement. */
function libelleMoyen(carte){
  if (!carte) return "Non précisé";
  if (carte === "AMEX") return "Amex";
  if (carte.startsWith("CPT:")) return "Virements · " + libelleCompte(carte.slice(4));
  if (carte.startsWith("CHQ:")) return "Chèques · " + libelleCompte(carte.slice(4));
  const c = vivants("comptes").find(x => x.carte === carte);
  return c ? c.nom : "Carte " + carte;
}
function encoursSaisis(){
  const m = new Map();
  for (const j of vivants("justificatifs").filter(x => x.statut === "a_rapprocher" && x.carte !== "ESPECES")){
    const k = libelleMoyen(j.carte); const g = m.get(k) || m.set(k, {moyen: k, n: 0, montant: 0, depuis: j.date}).get(k);
    g.n++; g.montant += j.montant || 0; if (j.date && j.date < g.depuis) g.depuis = j.date;
  }
  const lignes = [...m.values()].sort((a, b) => b.montant - a.montant);
  return {lignes, n: somme(lignes, x => x.n), montant: somme(lignes, x => x.montant)};
}
/* Justificatif déjà enregistré pour le même achat : même montant, même date, même fournisseur (ou même raison sociale lue). */
function justificatifDejaLa(x){
  const memeFournisseur = j => (x.commercant && j.commercant === x.commercant) || (x.raisonSociale && norm(j.raisonSociale || "") === norm(x.raisonSociale));
  // Le numéro de facture fait foi : même numéro et même fournisseur = même pièce ; numéros différents = pièces distinctes
  if (x.numero) return vivants("justificatifs").find(j => j.numero && j.numero === x.numero && memeFournisseur(j)) || null;
  if (!x.montant || !x.date) return null;
  return vivants("justificatifs").find(j => !j.numero && Math.abs((j.montant || 0) - x.montant) < 0.005 && j.date === x.date && memeFournisseur(j)) || null;
}
/* ---------- Création d'un justificatif (PC ou boîte) ---------- */
async function creerJustificatif(donnees, piece){
  const j = enregistrer("justificatifs", Object.assign({statut: "a_rapprocher", operations: [], cree: new Date().toISOString()}, donnees));
  if (piece) await enregistrerPiece(j.id, piece.octets, piece.mime);
  // Fournisseur : rattaché s'il est déjà enregistré ; sinon le nom reste provisoire, et la fiche n'est créée
  // qu'à la validation sur le PC (« Enregistrer la saisie »). Une saisie du téléphone ne modifie aucune fiche.
  if (j.commercantNom || j.raisonSociale){
    const mobile = j.origine === "mobile";
    const c = (j.raisonSociale && trouverCommercant(j.raisonSociale)) || (j.commercantNom && vivants("commercants").find(x => norm(x.nom) === norm(j.commercantNom)))
      || commercantPourTicket({raisonSociale: j.raisonSociale, enseigne: j.commercantNom, texte: j.texteOCR});
    if (c){
      if (!mobile){
        if (j.raisonSociale) ajouterAlias(c, j.raisonSociale);
        if (j.natureExacte){ c.natures = c.natures || {}; c.natures[j.natureExacte] = (c.natures[j.natureExacte] || 0) + 1; }
        enregistrer("commercants", c); invaliderIndex();
      }
      Object.assign(j, {commercant: c.id, commercantNom: c.nom, fournisseurProvisoire: false});
      if (!j.categorie && c.categorie) Object.assign(j, {categorie: c.categorie, sousCategorie: c.sousCategorie || "", lieu: j.lieu || c.lieu || ""});
    } else j.fournisseurProvisoire = true;
    enregistrer("justificatifs", j);
  }
  if (j.carte === "ESPECES" && !j.aValider) creerOperationEspeces(j);
  return j;
}
function compteEspeces(){
  let c = vivants("comptes").find(x => x.type === "especes");
  if (!c) c = enregistrer("comptes", {nom: "Espèces", type: "especes", banque: "", actif: true});
  return c;
}
function creerOperationEspeces(j){
  const compte = compteEspeces();
  const op = {compte: compte.id, date: j.date, dateDebit: j.date, montant: -Math.abs(j.montant), libelle: j.commercantNom || j.raisonSociale || "Espèces",
    natureExacte: j.natureExacte || "", commercant: j.commercant || null, categorie: j.categorie || "À préciser", sousCategorie: j.sousCategorie || "",
    nature: j.nature || natureParDefaut(j.categorie), lieu: j.lieu || "", origine: "especes", statut: j.categorie ? "classe" : "a_preciser",
    justificatifs: [j.id], empreinte: "especes|" + j.id};
  const o = enregistrer("operations", op);
  enregistrer("justificatifs", Object.assign(j, {operations: [o.id], statut: "rapproche", auto: true, rapprocheLe: new Date().toISOString()}));
  if (op.categorie !== "À préciser") apprendre(o);
}

/* ---------- Fusion de la boîte de saisies du téléphone ---------- */
async function fusionnerBoite(elements){
  let n = 0;
  for (const e of elements){
    if (!e.saisie) continue;
    const s = e.saisie;
    const groupe = (s.tickets || []).length > 1 ? "g-" + idAleatoire(6) : null;
    for (const t of s.tickets || []){
      const piece = t.photo ? {octets: depuisB64(t.photo.b64), mime: t.photo.mime} : null;
      await creerJustificatif({type: t.type || "ticket", date: t.date || s.date, heure: t.heure || "", montant: Math.abs(lireMontant(t.montant)),
        raisonSociale: t.raisonSociale || "", commercantNom: t.commercant || "", commercantCorrige: !!t.commercantCorrige, natureExacte: t.natureExacte || "",
        categorie: s.categorie || "", sousCategorie: s.sousCategorie || "", lieu: s.lieu || "", carte: s.carte || "", carte4: t.carte4 || "", siret: t.siret || "",
        texteOCR: t.texte || "", origine: "mobile", auteur: s.auteur || "", saisie: e.nom, groupe, aValider: true}, piece);
      n++;
    }
    await SESSION.adaptateur.deplacer(e.chemin, "boite/traitees");
  }
  const auto = rapprocherTout();
  return {justificatifs: n, auto};
}
