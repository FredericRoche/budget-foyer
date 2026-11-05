/* ================= Justificatifs et rapprochement =================
   Un justificatif (ticket de caisse, facture, facturette CB) est rapproché de
   l'opération bancaire de même montant, dans une fenêtre de dates qui dépend de
   son type. Un cas sans ambiguïté qui ne change ni le fournisseur ni la catégorie de l'opération est rapproché
   d'office (réversible) ; s'il les changerait, il est seulement proposé en tête, à confirmer d'un clic ; les autres
   attendent dans « À traiter ». Facture et facturette d'un même achat se
   rattachent à la même opération sans double compte. Plusieurs tickets réglés en
   un seul paiement forment un « achat groupé » et ventilent l'opération.
   Une note de frais est une créance : elle se rapproche du virement reçu (crédit de
   même montant), pas d'un débit, et n'entre ni dans les dépenses en attente ni dans
   les en-cours de cartes. */

const TYPES_JUSTIF = {ticket: "Ticket de caisse", facture: "Facture", devis: "Devis, acompte", facturette: "Facturette CB", notefrais: "Note de frais (à rembourser)", autre: "Autre"};
const estNoteFrais = j => j && j.type === "notefrais";
/* Note de frais : remboursement attendu de quelques jours avant (date de la dernière dépense) à 120 jours après. */
const FENETRE_NOTE_FRAIS = [7, 120];

function fenetre(j){
  const p = LIVRE.parametres;
  if (estNoteFrais(j)) return FENETRE_NOTE_FRAIS;
  return j.type === "facture" || j.type === "devis" ? [p.tolFactureAvant, p.tolFactureApres] : [p.tolTicketAvant, p.tolTicketApres];
}
function compteCompatible(j, compte){
  if (!j.carte) return true;
  // Note de frais : seul un compte de réception désigné (« Virement · compte ») restreint la recherche
  if (estNoteFrais(j)) return !j.carte.startsWith("CPT:") || compte.id === j.carte.slice(4);
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
  const d = String(carte4 || "").replace(/\D/g, "").slice(-4);
  if (!d) return "";
  const c = vivants("comptes").find(x => x.type === "carte" && (x.chiffres || []).includes(d))
    || vivants("comptes").find(x => x.type === "carte" && /^X\d+/.test(x.carte || "") && d.endsWith(x.carte.slice(1)));
  return c ? c.carte : "";
}
/* Les 4 derniers chiffres d'une facturette validée avec une carte sont retenus pour cette carte. */
function apprendreChiffresCarte(carte4, carte){
  const d = String(carte4 || "").replace(/\D/g, "").slice(-4);
  const c = d.length === 4 && carte ? vivants("comptes").find(x => x.type === "carte" && x.carte === carte) : null;
  if (!c || (c.chiffres || []).includes(d)) return false;
  c.chiffres = [...(c.chiffres || []), d]; enregistrer("comptes", c); return true;
}
function candidats(js){
  const j = Object.assign({}, js[0]); const cents = montantJustif(js);
  if (!j.carte && j.carte4) j.carte = carteDesChiffres(j.carte4);
  const [avant, apres] = fenetre(j);
  const nomJ = js.map(x => [x.commercantNom, x.raisonSociale].filter(Boolean).join(" ")).join(" ");
  const credit = estNoteFrais(j);   // remboursement attendu : on cherche un crédit
  const r = [];
  for (const op of vivants("operations")){
    if ((credit ? op.montant <= 0 : op.montant >= 0) || Math.abs(versCentimes(op.montant)) !== cents) continue;
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
  const parJour = regrouper(libres.filter(j => j.type !== "facture" && !estNoteFrais(j)), j => j.date + "|" + (j.carte || ""));
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

/* Le rapprochement modifierait-il l'opération ? Ventilation (plusieurs pièces), fournisseur établi différent,
   catégorie établie différente : oui. Compléter n'est pas modifier (précision de Frédéric, 05/11/2026) :
   - une opération pas encore classée (« À préciser ») ou seulement devinée (« proposé ») prend la catégorie
     saisie sur la pièce ;
   - une fiche née de l'import du libellé bancaire, qui n'a encore rien appris (ni classement validé, ni
     verrou), cède la place au fournisseur de la pièce (le libellé devient son alias, comme sur confirmation). */
const ficheProvisoire = id => { const d = id ? obtenir("commercants", id) : null; return !!d && !d.fixe && !Object.keys(d.stats || {}).length; };
function rapprochementModifie(js, op){
  if (js.length > 1) return true;
  const j = js[0];
  if (j.commercant && op.commercant && j.commercant !== op.commercant && !ficheProvisoire(op.commercant)) return true;
  const classeeOp = op.verrou || (op.categorie && op.categorie !== "À préciser" && !["propose", "a_preciser"].includes(op.statut));
  if (classeeOp && j.categorie && j.categorie !== "À préciser" && (j.categorie !== op.categorie || (j.sousCategorie && j.sousCategorie !== op.sousCategorie))) return true;
  return false;
}
/* Propositions sûres (montant exact, candidat unique ou nettement en tête) qui attendent une confirmation
   parce qu'elles changeraient fournisseur ou catégorie, ou ventileraient : à valider en lot, après relecture. */
function propositionsSures(){
  const vus = new Set(), r = [];
  for (const j of vivants("justificatifs").filter(x => x.statut === "a_rapprocher" && !x.aValider && !x.refuse)){
    const p = (j.propositions || [])[0];
    if (!p || !p.sur) continue;
    const ids = p.groupe || [j.id], cle = ids.slice().sort().join("|");
    if (vus.has(cle)) continue; vus.add(cle);
    const op = obtenir("operations", p.op);
    const js = ids.map(id => obtenir("justificatifs", id)).filter(x => x && x.statut === "a_rapprocher");
    if (!op || js.length !== ids.length) continue;
    r.push({js, op, changements: changementsRapprochement(js, op)});
  }
  return r;
}
function changementsRapprochement(js, op){
  const r = [], nomC = id => obtenir("commercants", id)?.nom || "—";
  if (js.length > 1) r.push("ventilée sur " + js.length + " pièces");
  const j = js[0];
  if (js.length === 1 && j.commercant && op.commercant && j.commercant !== op.commercant) r.push("fournisseur : " + nomC(op.commercant) + " → " + nomC(j.commercant));
  if (js.length === 1 && j.categorie && j.categorie !== "À préciser" && (j.categorie !== op.categorie || (j.sousCategorie && j.sousCategorie !== op.sousCategorie)))
    r.push("catégorie : " + [op.categorie, op.sousCategorie].filter(Boolean).join(" › ") + " → " + [j.categorie, j.sousCategorie].filter(Boolean).join(" › "));
  return r;
}
/* Passe automatique, après chaque import ou fusion de la boîte. Décision de Frédéric (04/11/2026) : l'application
   ne change rien d'elle-même sur une déduction. Un cas sûr qui ne modifie pas l'opération est rapproché d'office ;
   sinon il est proposé en tête (« sur »), à confirmer. Renvoie le nombre de rapprochements faits d'office. */
function rapprocherTout(){
  // Une saisie du téléphone n'est rapprochée qu'une fois validée sur le PC
  const libres = vivants("justificatifs").filter(j => (j.statut === "a_rapprocher" || !j.statut) && !j.aValider);
  let auto = 0;
  // 1. Groupes déclarés au téléphone (« second ticket au même paiement »)
  const groupes = regrouper(libres.filter(j => j.groupe), j => j.groupe);
  for (const js of groupes.values()){
    if (js.length < 2) continue;
    const c = candidats(js);
    const sur = c.length === 1 && c[0].score >= 60 && !js.some(j => j.refuse);
    if (sur && !rapprochementModifie(js, c[0].op)){ lier(js, c[0].op, true); auto++; continue; }
    for (const j of js) enregistrer("justificatifs", Object.assign(j, {propositions: c.slice(0, 4).map((x, i) => ({op: x.op.id, score: x.score, groupe: js.map(y => y.id), sur: sur && i === 0}))}));
  }
  // 2. Justificatifs seuls
  for (const j of libres.filter(j => !j.groupe || (groupes.get(j.groupe) || []).length < 2)){
    if (j.statut === "rapproche") continue;
    const c = candidats([j]);
    const sur = (c.length === 1 && c[0].score >= 60) || (c.length > 1 && c[0].score >= 85 && c[1].score < c[0].score - 25);
    if (sur && !j.refuse && !rapprochementModifie([j], c[0].op)){ lier([j], c[0].op, true); auto++; continue; }
    enregistrer("justificatifs", Object.assign(j, {propositions: c.slice(0, 4).map((x, i) => ({op: x.op.id, score: x.score, sur: sur && !j.refuse && i === 0}))}));
  }
  // 3. Achats groupés devinés (jamais appliqués d'office)
  const restants = vivants("justificatifs").filter(j => j.statut === "a_rapprocher" && !(j.propositions || []).length);
  for (const g of achatsGroupes(restants)){
    for (const j of g.justifs) enregistrer("justificatifs", Object.assign(j, {propositions: g.candidats.slice(0, 2).map(x => ({op: x.op.id, score: Math.max(0, x.score - 5), groupe: g.justifs.map(y => y.id)}))}));
  }
  return auto;
}

/* Anomalies de rapprochement : ce qui est à traiter à la main (définition de Frédéric, 05/11/2026).
   - « pièce sans débit » : pièce à rapprocher dont la période est déjà couverte par le relevé de son moyen
     de paiement (le dernier relevé va au-delà de la fenêtre de la pièce) ;
   - « montant différent » : même cas, mais un débit voisin existe (devise, pourboire, saisie) ;
   - « débit sans pièce » : achat carte des 90 derniers jours, postérieur à la première pièce saisie, sans
     pièce et non écarté (« pas de pièce pour celui-ci ») ;
   - « fournisseur non reconnu » : pièce sans fiche, ou fiche seulement devinée dans le texte.
   Chaque anomalie porte une piste. Les pièces dont le relevé n'est pas encore arrivé n'en sont pas. */
function anomaliesRapprochement(){
  const comptes = vivants("comptes");
  const derniere = new Map();
  for (const o of vivants("operations")) if (o.date > (derniere.get(o.compte) || "")) derniere.set(o.compte, o.date);
  const r = [], nomJ = j => (j.commercant && obtenir("commercants", j.commercant)?.nom) || j.commercantNom || j.raisonSociale || "—";
  const pieces = vivants("justificatifs").filter(x => !x.aValider && !estNoteFrais(x));
  for (const j of pieces.filter(x => x.statut === "a_rapprocher" && x.carte !== "ESPECES")){
    const jj = Object.assign({}, j); if (!jj.carte && jj.carte4) jj.carte = carteDesChiffres(jj.carte4);
    const [avant, apres] = fenetre(jj);
    const compat = comptes.filter(c => c.type !== "especes" && compteCompatible(jj, c) && derniere.has(c.id));
    const couvert = compat.reduce((m, c) => derniere.get(c.id) > m ? derniere.get(c.id) : m, "");
    if (compat.length && couvert < ajouterJours(j.date, apres)) continue;   // relevé pas encore arrivé
    const cents = versCentimes(j.montant);
    const dansFenetre = o => { const d = ecartJours(j.date, o.date); return d >= -avant && d <= apres; };
    const libre = o => !(o.justificatifs || []).some(id => obtenir("justificatifs", id)?.type === j.type);
    let genre = "pièce sans débit", raison;
    if ((j.propositions || []).length) raison = "rapprochement proposé, à confirmer";
    else if (!compat.length) raison = "moyen de paiement inconnu ou sans relevé importé : préciser la carte";
    else {
      const ailleurs = vivants("operations").find(o => o.montant < 0 && -versCentimes(o.montant) === cents && dansFenetre(o) && libre(o) && !compat.some(c => c.id === o.compte));
      const voisin = !ailleurs && vivants("operations").find(o => o.montant < 0 && compat.some(c => c.id === o.compte) && dansFenetre(o) && libre(o)
        && Math.abs(-versCentimes(o.montant) - cents) <= Math.max(10, cents * 0.03) && -versCentimes(o.montant) !== cents);
      if (voisin) genre = "montant différent";
      raison = ailleurs ? "même montant le " + dateCourte(ailleurs.date) + " sur " + libelleCompte(ailleurs.compte) + " : la carte de la pièce est-elle la bonne ?"
        : voisin ? "au relevé : " + euros(voisin.montant) + " le " + dateCourte(voisin.date) + " (devise, pourboire, erreur de saisie ?)"
        : "aucun débit de ce montant au relevé (" + libelleMoyen(jj.carte) + ") : espèces, autre moyen, date ou montant mal lus ?";
    }
    r.push({genre, j, date: j.date, nom: nomJ(j), montant: -Math.abs(j.montant), raison});
  }
  // Fournisseur non reconnu (pièces rapprochées ou non)
  const recent = ajouterJours(aujourdhui(), -90);
  for (const j of pieces.filter(x => (!x.commercant || x.fournisseurDevine) && (x.statut === "a_rapprocher" || x.date >= recent))){
    if (r.some(a => a.j === j)) { r.find(a => a.j === j).raison += " ; fournisseur non reconnu"; continue; }
    r.push({genre: "fournisseur non reconnu", j, date: j.date, nom: nomJ(j), montant: -Math.abs(j.montant),
      raison: j.fournisseurDevine ? "fournisseur deviné dans le texte : à confirmer" : "aucune fiche fournisseur : choisir ou créer la fiche"});
  }
  // Débits carte sans pièce, depuis que des pièces sont saisies
  const premiere = pieces.filter(x => x.type !== "facture" && x.type !== "devis").reduce((m, x) => !m || x.date < m ? x.date : m, "");
  if (premiere){
    const depuis = [premiere, ajouterJours(aujourdhui(), -90)].sort()[1];
    const cartes = new Set(comptes.filter(c => c.type === "carte").map(c => c.id));
    for (const o of vivants("operations").filter(o => cartes.has(o.compte) && o.montant < 0 && o.date >= depuis && !(o.justificatifs || []).length && !o.sansPiece && !o.ndf && !(o.commercant && obtenir("commercants", o.commercant)?.sansPiece))){
      if (pieces.some(j => j.statut === "a_rapprocher" && (j.propositions || []).some(p => p.op === o.id))) continue;
      r.push({genre: "débit sans pièce", op: o, date: o.date, nom: (o.commercant && obtenir("commercants", o.commercant)?.nom) || o.libelle, montant: o.montant,
        raison: "au relevé de " + libelleCompte(o.compte) + ", aucune pièce : ticket à saisir, ou rien à joindre"});
    }
  }
  return r.sort((a, b) => a.date < b.date ? 1 : -1);
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
  for (const j of vivants("justificatifs").filter(x => x.statut === "a_rapprocher" && x.carte !== "ESPECES" && !estNoteFrais(x))){
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
    const sur = (j.raisonSociale && trouverCommercant(j.raisonSociale)) || (j.commercantNom && vivants("commercants").find(x => norm(x.nom) === norm(j.commercantNom)));
    const c = sur || commercantPourTicket({raisonSociale: j.raisonSociale, enseigne: j.commercantNom, texte: j.texteOCR});
    if (c && !sur && !commercantSur({raisonSociale: j.raisonSociale, enseigne: j.commercantNom})) j.fournisseurDevine = true;
    if (c){
      // Aucune fiche n'est modifiée d'office (ni alias ni nature) : cela se fait à la validation, avec votre accord
      if (!mobile && !j.fournisseurDevine && j.natureExacte){ c.natures = c.natures || {}; c.natures[j.natureExacte] = (c.natures[j.natureExacte] || 0) + 1; enregistrer("commercants", c); invaliderIndex(); }
      Object.assign(j, {commercant: c.id, commercantNom: c.nom, fournisseurProvisoire: false});
      if (!j.categorie && c.categorie) Object.assign(j, {categorie: c.categorie, sousCategorie: c.sousCategorie || "", lieu: j.lieu || c.lieu || ""});
    } else j.fournisseurProvisoire = true;
    enregistrer("justificatifs", j);
  }
  if (j.carte === "ESPECES" && !j.aValider && !estNoteFrais(j)) creerOperationEspeces(j);
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
    // Déjà reprise (essai précédent interrompu) : on ne fait que ranger le dépôt
    if (vivants("justificatifs").some(j => j.saisie === e.nom)){ await SESSION.adaptateur.deplacer(e.chemin, "boite/traitees"); continue; }
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
