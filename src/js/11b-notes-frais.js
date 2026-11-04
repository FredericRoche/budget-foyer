/* ================= Notes de frais : détail, rangement, dépenses avancées =================
   Une note de frais exportée par l'outil de l'employeur (« NDF #2681 : Novembre 2026,
   déclarée le 02/11/2026 ») porte la liste des dépenses avancées : date, nature, montant.
   - Lecture : numéro, période, date de déclaration, entité, lignes, total.
   - Rangement : dans le dossier des notes de frais de l'appareil, sans sous-dossier
     d'année, sous le nom « 2026 Note de frais 2681 novembre 2026 - 02-11.pdf ».
   - Dépenses avancées : chaque ligne est rapprochée du débit de même montant (achat
     jusqu'à 60 jours avant la date de la ligne, ou 5 jours après), un débit ne sert
     qu'une fois ; le libellé (SNCF, hôtel, autoroute…) départage. Les débits trouvés
     prennent la catégorie de la note (par exemple « Transfert », hors budget), sans
     rien apprendre au fournisseur : un billet de train personnel reste classé à part.
     Le classement d'avant est gardé, pour pouvoir le rétablir. */

const FENETRE_LIGNE_NDF = [60, 5];
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function extraireNoteFrais(texte){
  const T = String(texte || "").replace(/[   ]/g, " ");
  const tete = T.match(/NDF\s*#\s*(\d+)\s*:\s*([^,\n]+?)\s*,\s*d[ée]clar[ée]e le (\d{2}\/\d{2}\/\d{4})/i);
  if (!tete) return null;
  const lignes = [];
  const re = /(?:^|\n)\s*(\d{1,3})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\d[\d .]*,\d{2})\s*€\s+(-?\d[\d .]*,\d{2})\s*€/g;
  let m;
  while ((m = re.exec(T))){
    const n = +m[1];
    if (lignes.some(l => l.n === n)) continue;   // en-tête répété sur la page suivante
    lignes.push({n, date: lireDate(m[2]), nature: m[3].trim(), tva: lireMontant(m[4]), montant: lireMontant(m[5])});
  }
  const total = lireMontant((T.match(/Total\s+(\d[\d .]*,\d{2})\s*€/) || [])[1] || "");
  const entite = ((T.match(/Entit[ée] l[ée]gale\s*:\s*(.+)/i) || [])[1] || "").trim();
  return {numero: tete[1], periode: tete[2].trim(), declaree: lireDate(tete[3]), entite, lignes, total: total || somme(lignes, l => l.montant)};
}
/* Lignes d'une note : enregistrées à l'import, sinon relues dans le texte de la pièce. */
function lignesNoteFrais(j){
  if (!estNoteFrais(j)) return [];
  if (j.lignesNdf && j.lignesNdf.length) return j.lignesNdf;
  return extraireNoteFrais(j.texteOCR)?.lignes || [];
}
/* Nom de rangement, sur le modèle des notes déjà classées. */
function nomNoteFrais(ndf){
  const d = ndf.declaree || aujourdhui();
  return d.slice(0, 4) + " Note de frais " + ndf.numero + " " + ndf.periode.toLowerCase() + " - " + d.slice(8, 10) + "-" + d.slice(5, 7) + ".pdf";
}

/* ---------- Dépenses avancées ---------- */
const MOTS_NATURE_NDF = [
  [/train|sncf|tgv/i, /SNCF|TGV|OUIGO|TRAINLINE|INOUI|\bTER\b|INTERCITES|SNCF CONNECT/i],
  [/h[ôo]tel|nuit|h[ée]bergement/i, /HOTEL|HÔTEL|BOOKING|IBIS|NOVOTEL|MERCURE|ACCOR|B&B|KYRIAD|CAMPANILE|AIRBNB/i],
  [/p[ée]age|tunnel/i, /AUTOROUTE|PEAGE|PÉAGE|APRR|AREA|VINCI|SANEF|ASF|ESCOTA|BIP.?GO|ULYS|TUNNEL|TOL\b|WESTERSCHELDE|KILTUNNEL/i],
  [/taxi|vtc/i, /TAXI|UBER|G7|HEETCH|BOLT/i],
  [/d[ée]jeuner|d[îi]ner|repas|restaurant/i, /RESTAU|BRASSERIE|CAFE|BISTRO/i],
  [/carburant|essence|kilom/i, /TOTAL|ESSO|SHELL|BP |AVIA|INTERMARCHE|LECLERC|CARREFOUR/i]
];
function libelleColleNature(nature, op){
  const lib = (op.libelle || "") + " " + (op.detail || "");
  const c = op.commercant ? obtenir("commercants", op.commercant) : null;
  const tout = lib + " " + (c ? c.nom + " " + (c.alias || []).join(" ") : "");
  return MOTS_NATURE_NDF.some(([n, l]) => n.test(nature) && l.test(tout));
}
/* Débit pris par une autre note (ou une autre ligne de celle-ci). */
function debitPrisAilleurs(op, j){ return op.ndf && op.ndf.justificatif !== j.id; }

/* Proposition ligne → débit : chaque débit ne sert qu'une fois ; meilleurs scores d'abord. */
function rapprochementLignesNdf(j){
  const lignes = lignesNoteFrais(j);
  const [avant, apres] = FENETRE_LIGNE_NDF;
  const paires = [];
  const ops = vivants("operations").filter(op => op.montant < 0 && !debitPrisAilleurs(op, j));
  for (const l of lignes){
    if (!l.date || !l.montant) continue;
    const c = versCentimes(l.montant);
    for (const op of ops){
      if (-versCentimes(op.montant) !== c) continue;
      const dj = ecartJours(l.date, op.date);   // négatif : achat avant la date de la ligne
      if (dj < -avant || dj > apres) continue;
      const deja = op.ndf && op.ndf.justificatif === j.id && op.ndf.ligne === l.n;
      const score = (deja ? 1000 : 0) + (libelleColleNature(l.nature, op) ? 100 : 0) - Math.abs(dj) - (dj > 0 ? 3 : 0);
      paires.push({l, op, score, ecart: dj});
    }
  }
  paires.sort((a, b) => b.score - a.score);
  const parLigne = new Map(), prises = new Set();
  for (const p of paires){
    if (parLigne.has(p.l.n) || prises.has(p.op.id)) continue;
    parLigne.set(p.l.n, p); prises.add(p.op.id);
  }
  return lignes.map(l => ({ligne: l, op: parLigne.get(l.n)?.op || null, ecart: parLigne.get(l.n)?.ecart ?? null,
    nom: parLigne.has(l.n) && libelleColleNature(l.nature, parLigne.get(l.n).op)}));
}
/* Classe les débits trouvés dans la catégorie de la note. Renvoie le nombre de débits touchés. */
function classerDepensesNdf(j, rapprochement){
  if (!j.categorie) return 0;
  let n = 0;
  for (const r of rapprochement){
    const op = r.op; if (!op) continue;
    if (op.ndf && op.ndf.justificatif === j.id && op.categorie === j.categorie && (op.sousCategorie || "") === (j.sousCategorie || "")) continue;
    const avant = op.ndf?.avant || {categorie: op.categorie, sousCategorie: op.sousCategorie, nature: op.nature, statut: op.statut, verrou: !!op.verrou, natureExacte: op.natureExacte || ""};
    Object.assign(op, {categorie: j.categorie, sousCategorie: j.sousCategorie || "", nature: j.nature || natureParDefaut(j.categorie), statut: "classe", verrou: true,
      natureExacte: op.natureExacte || ("Note de frais n° " + (j.numero || "").replace(/^NDF\s*/i, "") + " · " + r.ligne.nature).trim(),
      ndf: {justificatif: j.id, ligne: r.ligne.n, avant}});
    op.justificatifs = [...new Set([...(op.justificatifs || []), j.id])];
    enregistrer("operations", op); n++;
  }
  return n;
}
/* Rétablit le classement d'avant pour les débits rattachés à la note. */
function declasserDepensesNdf(j){
  let n = 0;
  for (const op of vivants("operations").filter(o => o.ndf && o.ndf.justificatif === j.id)){
    const a = op.ndf.avant || {};
    Object.assign(op, {categorie: a.categorie || "À préciser", sousCategorie: a.sousCategorie || "", nature: a.nature || natureParDefaut(a.categorie), statut: a.statut || "a_preciser", verrou: !!a.verrou, natureExacte: a.natureExacte || ""});
    op.justificatifs = (op.justificatifs || []).filter(x => x !== j.id);
    delete op.ndf; enregistrer("operations", op); n++;
  }
  return n;
}

/* ---------- Fiche « Détail de la note » (écran Justificatifs) ---------- */
function blocDetailNoteFrais(j, avantClasser){
  const lignes = lignesNoteFrais(j);
  if (!lignes.length) return null;
  const rap = rapprochementLignesNdf(j);
  const trouves = rap.filter(r => r.op), dejaClasses = rap.filter(r => r.op?.ndf?.justificatif === j.id);
  const totalLignes = somme(lignes, l => l.montant);
  const bloc = h("details", {class: "detail-ndf", open: true, style: {marginTop: ".8rem"}},
    h("summary", null, h("strong", null, "Détail de la note · " + lignes.length + " dépense(s) avancée(s)"),
      " · " + trouves.length + " retrouvée(s) au relevé" + (dejaClasses.length ? ", " + dejaClasses.length + " classée(s) avec la note" : "")));
  if (Math.abs(totalLignes - (j.montant || 0)) >= 0.01) bloc.appendChild(h("p", {class: "note neg"}, "Somme des lignes : " + euros(totalLignes) + ", montant de la note : " + euros(j.montant || 0) + ". Vérifiez la lecture."));
  bloc.appendChild(tableau([{titre: "N°", num: true}, {titre: "Date"}, {titre: "Nature"}, {titre: "Montant", num: true}, {titre: "Débit retrouvé"}], rap, {classe: "serre", ligne: r => h("tr", null,
    h("td", {class: "num"}, String(r.ligne.n)), h("td", null, dateCourte(r.ligne.date)), h("td", null, r.ligne.nature), h("td", {class: "num"}, euros(r.ligne.montant)),
    h("td", {class: "petit"}, r.op ? [(r.op.ndf?.justificatif === j.id ? h("span", {class: "pos"}, "✓ ") : null), dateCourte(r.op.date) + " · " + r.op.libelle + " · " + libelleCompte(r.op.compte),
      h("span", {class: "discret"}, " (" + (r.ecart > 0 ? "+" : "") + r.ecart + " j" + (r.nom ? ", libellé cohérent" : "") + ")")] : h("span", {class: "discret"}, "non retrouvé (autre moyen de paiement, relevé non importé ?)")))}));
  const cat = j.categorie ? j.categorie + (j.sousCategorie ? " › " + j.sousCategorie : "") : "";
  const aClasser = trouves.length - dejaClasses.length;
  bloc.appendChild(h("p", {class: "note"}, "Débit de même montant, acheté jusqu'à " + FENETRE_LIGNE_NDF[0] + " jours avant la date de la ligne ou " + FENETRE_LIGNE_NDF[1]
    + " jours après ; à montant égal, le libellé (SNCF, hôtel, autoroute…) puis la date la plus proche départagent. Vérifiez les correspondances avant de classer."));
  bloc.appendChild(h("div", {class: "outils", style: {marginTop: ".4rem"}},
    h("button", {class: "mini" + (aClasser ? " primaire" : ""), disabled: !aClasser, title: cat ? "" : "Choisissez d'abord la catégorie de la note",
      onclick: async () => {
        if (avantClasser && avantClasser() === false) return;
        if (!j.categorie){ message("Choisissez d'abord la catégorie de la note (par exemple Transfert › Notes de frais), puis enregistrez.", true); return; }
        if (!(await confirmer("Classer " + aClasser + " débit(s) en « " + (j.categorie + (j.sousCategorie ? " › " + j.sousCategorie : "")) + " » et y joindre la note ? Leur classement actuel est gardé pour pouvoir le rétablir.", "Classer"))) return;
        const n = classerDepensesNdf(j, rapprochementLignesNdf(j)); message(n + " débit(s) classé(s) avec la note."); rafraichirEcran();
      }}, aClasser ? "Classer les " + aClasser + " débit(s) retrouvé(s)" + (cat ? " en « " + cat + " »" : "") : "Rien à classer"),
    dejaClasses.length ? h("button", {class: "mini discret", onclick: async () => {
      if (!(await confirmer("Rendre leur classement d'avant aux " + dejaClasses.length + " débit(s) rattachés à cette note ?", "Rétablir"))) return;
      const n = declasserDepensesNdf(j); message(n + " débit(s) rétabli(s)."); rafraichirEcran(); }}, "Rétablir leur classement d'avant") : null));
  return bloc;
}

/* ---------- Rangement de la pièce ---------- */
const DOSSIER_NOTES_FRAIS = {cle: "notes_frais_racine", libelle: "Dossier des notes de frais"};
async function dossierNotesFrais(interactif){
  let d = await reglage(DOSSIER_NOTES_FRAIS.cle, null);
  if (d){
    let p = await d.queryPermission({mode: "readwrite"});
    if (p !== "granted" && interactif) p = await d.requestPermission({mode: "readwrite"});
    return p === "granted" ? d : null;
  }
  if (!interactif || !window.showDirectoryPicker) return null;
  if (!(await confirmer("Où ranger les notes de frais sur cet appareil ? Choisissez le dossier où elles sont déjà classées (par exemple « Notes de frais » de l'activité professionnelle).", "Choisir…"))) return null;
  try {
    d = await window.showDirectoryPicker({id: "bf-notes-frais", mode: "readwrite", startIn: "documents"});
    const depot = await reglage(DOSSIERS_IMPORT.depot.cle, null);
    if (depot && await d.isSameEntry(depot)) throw new Error("Ce dossier est le dossier de dépôt : choisissez-en un autre.");
    await definirReglage(DOSSIER_NOTES_FRAIS.cle, d);
    return d;
  } catch (e){ if (e.name !== "AbortError") message(e.message, true); return null; }
}
async function choisirDossierNotesFrais(){
  const d = await window.showDirectoryPicker({id: "bf-notes-frais", mode: "readwrite", startIn: "documents"});
  const depot = await reglage(DOSSIERS_IMPORT.depot.cle, null);
  if (depot && await d.isSameEntry(depot)) throw new Error("Ce dossier est le dossier de dépôt : choisissez-en un autre.");
  await definirReglage(DOSSIER_NOTES_FRAIS.cle, d);
  return d;
}
/* Copie la note dans son dossier sous son nom de rangement, relit la copie, puis libère le dépôt. */
async function rangerNoteFrais(f){
  const d = await dossierNotesFrais(true);
  if (!d){ f.rangement = {reste: "dossier des notes de frais non désigné"}; return; }
  try {
    const octets = new Uint8Array(await (await f.source.poignee.getFile()).arrayBuffer());
    const deja = await copieIdentique(d, octets, d.name, 3);
    if (deja){ await f.source.dossier.removeEntry(f.source.nom); f.rangement = {chemin: deja, identique: true}; return; }
    const pris = new Set();
    for await (const [nom] of d.entries()) pris.add(nom);
    const final = nomLibre(nomNoteFrais(f.lu.noteFrais), pris);
    const fh = await d.getFileHandle(final, {create: true});
    const w = await fh.createWritable(); await w.write(octets); await w.close();
    if (!memesOctets(new Uint8Array(await (await fh.getFile()).arrayBuffer()), octets)) throw new Error("copie non conforme, le fichier reste au dépôt");
    await f.source.dossier.removeEntry(f.source.nom);
    f.rangement = {chemin: d.name + "/" + final, identique: false};
  } catch (e){ f.rangement = {erreur: e.message}; console.error(e); }
}
