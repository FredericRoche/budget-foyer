/* ================= Notes de frais : détail, rangement, dépenses avancées =================
   Une note de frais exportée par l'outil de l'employeur (« NDF #2681 : Novembre 2026,
   déclarée le 02/11/2026 ») porte la liste des dépenses avancées : date, nature, montant.
   - Lecture : numéro, période, date de déclaration, entité, lignes, total.
   - Rangement : dans le dossier des notes de frais de l'appareil, sans sous-dossier
     d'année, sous le nom « 2026 Note de frais 2681 novembre 2026 - 02-11.pdf ».
   - Dépenses avancées : chaque ligne est rapprochée du débit de même montant (achat
     jusqu'à 60 jours avant la date de la ligne, ou 5 jours après), un débit ne sert
     qu'une fois ; le libellé (SNCF, hôtel, autoroute…) départage. Un débit du double
     du montant est admis (deux billets payés ensemble, un seul remboursé) : il est
     alors ventilé, la part remboursée avec la note, l'autre gardant son classement. Les débits trouvés
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
  const declarant = ((T.match(/D[ée]clarant\s*:\s*([^\n]+?)\s*(?:Etat|État|\n|$)/i) || [])[1] || "").trim();
  const entite = ((T.match(/Entit[ée] l[ée]gale\s*:\s*(.+)/i) || [])[1] || "").trim();
  return {numero: tete[1], periode: tete[2].trim(), declaree: lireDate(tete[3]), entite, declarant, lignes, total: total || somme(lignes, l => l.montant)};
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
  // Un parking de gare (« EFFIA VALENCE TGV ») n'est pas un billet de train
  if (/train|sncf|tgv/i.test(nature) && /EFFIA|PARKING|INDIGO|ONEPARK|Q-PARK|ZENPARK|SAEMES/i.test(tout)) return false;
  return MOTS_NATURE_NDF.some(([n, l]) => n.test(nature) && l.test(tout));
}
/* Débit pris par une autre note (ou une autre ligne de celle-ci). */
function debitPrisAilleurs(op, j){ return op.ndf && op.ndf.justificatif !== j.id; }

/* Proposition ligne → débit. Un débit ne sert qu'une fois, sauf à couvrir plusieurs lignes ;
   facteur 2 : deux billets payés ensemble (le vôtre et un autre), seul le vôtre est sur la note.
   0. Choix faits à la main (j.ndfManuel : n° de ligne → id du débit, ou null pour « aucun ») : ils priment.
   1. Débits déjà classés avec cette note : repris tels quels.
   2. Un débit par ligne, au montant égal ; meilleurs scores d'abord.
   3. Plusieurs lignes en un paiement (2 à 8 trajets, éventuellement à deux) : la somme des lignes, ou son
      double, égale le débit. Exigé : un libellé cohérent avec la nature (SNCF pour un train…), pour ne pas
      prendre une coïncidence de montant ; à défaut d'autre critère, les dates les plus resserrées l'emportent.
   4. Enfin, une ligne sur un débit du double (billets pour deux), libellé cohérent exigé. */
/* ---------- Justificatifs d'achat (SNCF Connect) ----------
   Enregistrés à l'import (collection « documents », genre achat_sncf), sans doublon. Chacun désigne un
   paiement et ses trajets : une ligne « Train » de la note dont le déclarant a voyagé ce jour-là est
   rattachée au débit de ce paiement (même jour ou jusqu'à 4 jours après, montant égal à 1 % près,
   libellé de train), quel que soit le nombre de trajets et de voyageurs du paiement. */
function enregistrerAchatsSncf(lu){
  let n = 0;
  const cle = a => a.transaction || (a.date + "|" + a.montant + "|" + (a.references || []).join(","));
  const existants = vivants("documents").filter(d => d.genre === "achat_sncf");
  const deja = new Set(existants.map(cle));
  // Une commande déjà connue par une autre source (PDF puis e-mail) : même référence de commande
  const refs = new Set(existants.flatMap(d => d.references || []));
  for (const a of lu.achats || []){
    if (deja.has(cle(a)) || (a.references || []).some(r => refs.has(r))) continue;
    (a.references || []).forEach(r => refs.add(r));
    enregistrer("documents", Object.assign({genre: "achat_sncf", fichier: lu.nom, titre: a.trajets.length + " trajet(s)"}, a)); deja.add(cle(a)); n++;
  }
  return n;
}
function achatsSncf(){ return vivants("documents").filter(d => d.genre === "achat_sncf" && d.date && d.montant); }
const motsNomVoyageur = s => norm(s).replace(/[^a-z ]/g, " ").split(/\s+/).filter(x => x.length > 1);
function voyageurEstDeclarant(voyageur, declarant){
  const d = motsNomVoyageur(declarant), v = motsNomVoyageur(voyageur);
  return d.length ? d.every(x => v.includes(x)) : false;
}
/* Paiement → débit : un débit par paiement, le plus proche en montant puis en date. */
function debitsDesAchats(j){
  const paires = [];
  const ops = vivants("operations").filter(op => debitUtilisable(op, j) && libelleColleNature("Train", op));
  for (const a of achatsSncf()){
    for (const op of ops){
      const dj = ecartJours(a.date, op.date), ecart = Math.abs(-op.montant - a.montant);
      if (dj < -1 || dj > 4 || ecart > Math.max(1, a.montant * 0.01)) continue;
      paires.push({a, op, score: -ecart * 10 - Math.abs(dj)});
    }
  }
  paires.sort((x, y) => y.score - x.score);
  const res = new Map(), pris = new Set();
  for (const p of paires){ if (res.has(p.a.id) || pris.has(p.op.id)) continue; res.set(p.a.id, p.op); pris.add(p.op.id); }
  // Commandes passées le même jour et payées en une fois (relevées une par une dans les e-mails) : leur somme
  const restants = regrouper(achatsSncf().filter(a => !res.has(a.id)), a => a.date);
  for (const [jour, liste] of restants){
    if (liste.length < 2) continue;
    const total = somme(liste, a => a.montant);
    const op = ops.filter(o => !pris.has(o.id) && ecartJours(jour, o.date) >= -1 && ecartJours(jour, o.date) <= 4 && Math.abs(-o.montant - total) <= Math.max(1, total * 0.01))
      .sort((x, y) => Math.abs(-x.montant - total) - Math.abs(-y.montant - total) || Math.abs(ecartJours(jour, x.date)) - Math.abs(ecartJours(jour, y.date)))[0];
    if (op){ for (const a of liste) res.set(a.id, op); pris.add(op.id); }
  }
  return res;
}
function debitUtilisable(op, j){ return op && !op.supprime && op.montant < 0 && !debitPrisAilleurs(op, j) && (!op.ventilation || op.ndf?.justificatif === j.id); }
function rapprochementLignesNdf(j){
  const lignes = lignesNoteFrais(j).filter(l => l.date && l.montant);
  const [avant, apres] = FENETRE_LIGNE_NDF;
  const dansFenetre = (l, op) => { const dj = ecartJours(l.date, op.date); return dj >= -avant && dj <= apres; };
  const res = new Map();   // n de ligne → {op, manuel}
  const prises = new Set();
  const manuel = j.ndfManuel || {};
  // 0. Choix à la main
  for (const [n, id] of Object.entries(manuel)){
    if (id === null){ res.set(+n, {op: null, manuel: true}); continue; }
    const op = obtenir("operations", id);
    if (debitUtilisable(op, j)){ res.set(+n, {op, manuel: true}); prises.add(op.id); }
  }
  // 0 bis. Justificatifs d'achat : le trajet du déclarant à la date de la ligne désigne le paiement
  const declarant = extraireNoteFrais(j.texteOCR)?.declarant || "";
  if (declarant && achatsSncf().length){
    const debitDe = debitsDesAchats(j);
    const achats = achatsSncf().filter(x => debitDe.has(x.id));
    const reste = new Map(achats.map(a => [a.id, versCentimes(a.montant)]));   // place restante dans chaque paiement
    // Plusieurs paiements pour un même jour : d'abord celui qui égale la ligne, puis le plus juste qui la contient encore
    const candidatsDe = l => achats.filter(x => (x.trajets || []).some(t => t.date === l.date && (t.voyageurs || []).some(v => voyageurEstDeclarant(v, declarant))));
    const aTraiter = lignes.filter(l => !res.has(l.n) && /train|sncf|tgv/i.test(l.nature) && candidatsDe(l).length)
      .sort((x, y) => candidatsDe(x).some(a => versCentimes(a.montant) === versCentimes(x.montant)) ? -1 : candidatsDe(y).some(a => versCentimes(a.montant) === versCentimes(y.montant)) ? 1 : 0);
    for (const l of aTraiter){
      const c = versCentimes(l.montant);
      const a = candidatsDe(l).filter(x => reste.get(x.id) >= c).sort((x, y) => (reste.get(x.id) === c ? -1 : 0) - (reste.get(y.id) === c ? -1 : 0) || reste.get(x.id) - reste.get(y.id))[0];
      if (!a) continue;
      const op = debitDe.get(a.id); res.set(l.n, {op, achat: a}); prises.add(op.id); reste.set(a.id, reste.get(a.id) - c);
    }
  }
  // 1. Déjà classés
  for (const op of vivants("operations").filter(o => o.ndf && o.ndf.justificatif === j.id)){
    for (const n of op.ndf.lignes || [op.ndf.ligne]) if (!res.has(n)) res.set(n, {op});
    prises.add(op.id);
  }
  const libres = () => lignes.filter(l => !res.has(l.n));
  const ops = vivants("operations").filter(op => op.montant < 0 && !op.ndf && !op.ventilation && !prises.has(op.id));
  // 2. Une ligne, un débit
  const paires = [];
  for (const l of libres()){
    const c = versCentimes(l.montant);
    for (const op of ops){
      const d = -versCentimes(op.montant);
      const facteur = d === c ? 1 : d === 2 * c ? 2 : 0;
      // Le double (billets pour deux) n'est retenu que si le libellé va avec la nature : pas de coïncidence de montant
      if (!facteur || !dansFenetre(l, op) || (facteur === 2 && !libelleColleNature(l.nature, op))) continue;
      const dj = ecartJours(l.date, op.date);
      paires.push({l, op, facteur, score: (libelleColleNature(l.nature, op) ? 100 : 0) - Math.abs(dj) - (dj > 0 ? 3 : 0) - (facteur === 2 ? 20 : 0)});
    }
  }
  paires.sort((a, b) => b.score - a.score);
  for (const p of paires.filter(x => x.facteur === 1)){
    if (res.has(p.l.n) || prises.has(p.op.id)) continue;
    res.set(p.l.n, {op: p.op}); prises.add(p.op.id);
  }
  // 3. Plusieurs lignes, un débit (répété : deux débits identiques ne se disputent pas les mêmes lignes)
  for (let tour = 0; tour < 20; tour++){
  const propositions = [];
  for (const op of ops.filter(o => !prises.has(o.id))){
    const d = -versCentimes(op.montant);
    const proches = libres().filter(l => dansFenetre(l, op) && libelleColleNature(l.nature, op) && versCentimes(l.montant) < d)
      .sort((a, b) => Math.abs(ecartJours(a.date, op.date)) - Math.abs(ecartJours(b.date, op.date))).slice(0, 12);
    if (proches.length < 2) continue;
    let meilleur = null;
    const essayer = (choix) => {
      const t = somme(choix, l => versCentimes(l.montant));
      const facteur = t === d ? 1 : 2 * t === d ? 2 : 0;
      if (!facteur) return;
      const dates = choix.map(l => l.date).sort();
      const score = -ecartJours(dates[0], dates[dates.length - 1]) - somme(choix, l => Math.abs(ecartJours(l.date, op.date))) / choix.length - (facteur === 2 ? 5 : 0);
      if (!meilleur || score > meilleur.score) meilleur = {op, choix: choix.slice(), score};
    };
    const parcourir = (debut, choix, total) => {
      if (choix.length >= 2) essayer(choix);
      if (choix.length >= 8) return;
      for (let i = debut; i < proches.length; i++){
        const t = total + versCentimes(proches[i].montant);
        if (t > d) continue;
        choix.push(proches[i]); parcourir(i + 1, choix, t); choix.pop();
      }
    };
    parcourir(0, [], 0);
    if (meilleur) propositions.push(meilleur);
  }
  propositions.sort((a, b) => b.score - a.score);
  let pris = 0;
  for (const p of propositions){
    if (prises.has(p.op.id) || p.choix.some(l => res.has(l.n))) continue;
    for (const l of p.choix) res.set(l.n, {op: p.op});
    prises.add(p.op.id); pris++;
  }
  if (!pris) break;
  }
  // 4. En dernier, une ligne sur un débit du double (deux billets) : après les groupes, pour ne pas prendre
  //    pour « à deux » un aller-retour payé en une fois (99 + 99 = 198)
  for (const p of paires.filter(x => x.facteur === 2)){
    if (res.has(p.l.n) || prises.has(p.op.id)) continue;
    res.set(p.l.n, {op: p.op}); prises.add(p.op.id);
  }
  // Groupes et facteur, d'après l'ensemble des lignes rattachées à chaque débit
  const parOp = new Map();
  for (const l of lignes){ const r = res.get(l.n); if (r?.op) (parOp.get(r.op.id) || parOp.set(r.op.id, []).get(r.op.id)).push(l); }
  return lignesNoteFrais(j).map(l => {
    const r = res.get(l.n);
    if (!r?.op) return {ligne: l, op: null, manuel: !!r?.manuel, aucun: !!r?.manuel, facteur: 1, groupe: null, ecart: null, nom: false, achat: null};
    const ls = parOp.get(r.op.id) || [l];
    const t = somme(ls, x => versCentimes(x.montant)), d = -versCentimes(r.op.montant);
    return {ligne: l, op: r.op, manuel: !!r.manuel, achat: r.achat || null, facteur: t === d ? 1 : 2 * t === d ? 2 : 0, groupe: ls.length > 1 ? ls.map(x => x.n) : null,
      ecart: ecartJours(l.date, r.op.date), nom: libelleColleNature(l.nature, r.op)};
  });
}
/* Le débit est-il classé avec la note pour exactement ces lignes-là ? */
function debitDejaClasse(op, j, ns){
  if (!op.ndf || op.ndf.justificatif !== j.id) return false;
  const a = (op.ndf.lignes || [op.ndf.ligne]).slice().sort((x, y) => x - y).join(","), b = ns.slice().sort((x, y) => x - y).join(",");
  return a === b;
}
function retablirDebit(op, j){
  const a = op.ndf.avant || {};
  Object.assign(op, {categorie: a.categorie || "À préciser", sousCategorie: a.sousCategorie || "", nature: a.nature || natureParDefaut(a.categorie), statut: a.statut || "a_preciser", verrou: !!a.verrou, natureExacte: a.natureExacte || ""});
  op.justificatifs = (op.justificatifs || []).filter(x => x !== j.id);
  if (op.ndf.partiel) delete op.ventilation;
  delete op.ndf;
}
/* Classe les débits trouvés avec la note. Un débit qui couvre exactement une ligne prend la catégorie de la note ;
   un débit plus large (deux billets, plusieurs trajets, billet d'un autre prix) est ventilé : une part par ligne
   avec la note, le reste gardant le classement du débit. Renvoie le nombre de débits touchés. */
function classerDepensesNdf(j, rapprochement){
  if (!j.categorie) return 0;
  const parOp = new Map();
  for (const r of rapprochement) if (r.op) (parOp.get(r.op.id) || parOp.set(r.op.id, []).get(r.op.id)).push(r);
  const nature = j.nature || natureParDefaut(j.categorie);
  const num = (j.numero || "").replace(/^NDF\s*/i, "");
  let n = 0;
  for (const rs of parOp.values()){
    const op = rs[0].op;
    const lignesOp = rs.map(r => r.ligne.n);
    if (debitDejaClasse(op, j, lignesOp)) continue;
    if (versCentimes(somme(rs, r => Math.abs(r.ligne.montant))) > -versCentimes(op.montant)) continue;   // lignes au-delà du débit : choix incohérent, rien n'est touché
    if (op.ndf && op.ndf.justificatif === j.id) retablirDebit(op, j);   // lignes changées : on repart du classement d'avant
    const avant = {categorie: op.categorie, sousCategorie: op.sousCategorie, nature: op.nature, statut: op.statut, verrou: !!op.verrou, natureExacte: op.natureExacte || ""};
    const libNote = r => ("Note de frais n° " + num + " · ligne " + r.ligne.n + " · " + r.ligne.nature).trim();
    const couvert = somme(rs, r => Math.abs(r.ligne.montant));
    if (rs.length === 1 && versCentimes(couvert) === -versCentimes(op.montant)){
      Object.assign(op, {categorie: j.categorie, sousCategorie: j.sousCategorie || "", nature, statut: "classe", verrou: true,
        natureExacte: op.natureExacte || libNote(rs[0]), ndf: {justificatif: j.id, ligne: lignesOp[0], lignes: lignesOp, avant}});
    } else {
      const reste = Math.round((op.montant + couvert) * 100) / 100;
      Object.assign(op, {statut: "classe", verrou: true, ndf: {justificatif: j.id, ligne: lignesOp[0], lignes: lignesOp, avant, partiel: true},
        ventilation: rs.map(r => ({montant: -Math.abs(r.ligne.montant), categorie: j.categorie, sousCategorie: j.sousCategorie || "", nature, lieu: op.lieu || "",
          natureExacte: libNote(r), justificatif: j.id}))
          .concat(reste < -0.004 ? [{montant: reste, categorie: avant.categorie, sousCategorie: avant.sousCategorie || "", nature: avant.nature || natureParDefaut(avant.categorie), lieu: op.lieu || "",
            natureExacte: avant.natureExacte || "Part non remboursée"}] : [])});
    }
    op.justificatifs = [...new Set([...(op.justificatifs || []), j.id])];
    enregistrer("operations", op); n++;
  }
  return n;
}
/* Rétablit le classement d'avant pour les débits rattachés à la note. */
function declasserDepensesNdf(j){
  let n = 0;
  for (const op of vivants("operations").filter(o => o.ndf && o.ndf.justificatif === j.id)){ retablirDebit(op, j); enregistrer("operations", op); n++; }
  return n;
}
/* Choix à la main : débits dont le libellé va avec la nature, d'un montant au moins égal à la ligne,
   achetés jusqu'à 120 jours avant (ou 5 jours après) ; les plus proches d'abord. */
/* Montant des autres lignes de la note déjà portées par un débit (pour ne jamais dépasser le débit). */
function dejaPorteNdf(j, op, saufLigne, rap){
  return somme((rap || rapprochementLignesNdf(j)).filter(r => r.op && r.op.id === op.id && r.ligne.n !== saufLigne), r => Math.abs(r.ligne.montant));
}
function debitsPossiblesNdf(j, ligne){
  const rap = rapprochementLignesNdf(j);
  return vivants("operations").filter(op => debitUtilisable(op, j) && -op.montant >= ligne.montant + dejaPorteNdf(j, op, ligne.n, rap) - 0.005 && libelleColleNature(ligne.nature, op)
    && ecartJours(ligne.date, op.date) >= -120 && ecartJours(ligne.date, op.date) <= 5)
    .sort((a, b) => Math.abs(ecartJours(ligne.date, a.date)) - Math.abs(ecartJours(ligne.date, b.date))).slice(0, 10);
}
function choisirDebitNdf(j, n, opId){
  const m = Object.assign({}, j.ndfManuel || {});
  if (opId === undefined) delete m[n]; else m[n] = opId;
  j.ndfManuel = m; enregistrer("justificatifs", j);
}

/* ---------- Fiche « Détail de la note » (écran Justificatifs) ---------- */
let NDF_CHOIX_OUVERT = null;   // « id de note:n° de ligne » dont la liste de débits est dépliée
function blocDetailNoteFrais(j, avantClasser){
  const lignes = lignesNoteFrais(j);
  if (!lignes.length) return null;
  const rap = rapprochementLignesNdf(j);
  const trouves = rap.filter(r => r.op);
  const classee = r => r.op && debitDejaClasse(r.op, j, r.groupe || [r.ligne.n]);
  const dejaClasses = rap.filter(classee), aClasser = trouves.filter(r => !classee(r)).length;
  const totalLignes = somme(lignes, l => l.montant);
  const bloc = h("details", {class: "detail-ndf", open: true, style: {marginTop: ".8rem"}},
    h("summary", null, h("strong", null, "Détail de la note · " + lignes.length + " dépense(s) avancée(s)"),
      " · " + trouves.length + " retrouvée(s) au relevé" + (dejaClasses.length ? ", " + dejaClasses.length + " classée(s) avec la note" : "")));
  if (Math.abs(totalLignes - (j.montant || 0)) >= 0.01) bloc.appendChild(h("p", {class: "note neg"}, "Somme des lignes : " + euros(totalLignes) + ", montant de la note : " + euros(j.montant || 0) + ". Vérifiez la lecture."));
  const ouvrir = n => { NDF_CHOIX_OUVERT = NDF_CHOIX_OUVERT === j.id + ":" + n ? null : j.id + ":" + n; rafraichirEcran(); };
  const celluleDebit = r => {
    const n = r.ligne.n, ouvert = NDF_CHOIX_OUVERT === j.id + ":" + n, fige = classee(r);
    const contenu = [];
    if (r.op){
      contenu.push(fige ? h("span", {class: "pos"}, "✓ ") : null, dateCourte(r.op.date) + " · " + r.op.libelle + " · " + libelleCompte(r.op.compte),
        h("span", {class: "discret"}, " (" + (r.ecart > 0 ? "+" : "") + r.ecart + " j" + (r.nom ? ", libellé cohérent" : "") + (r.manuel ? ", choisi à la main" : "") + ")"),
        r.achat ? h("div", {class: "petit pos"}, "d'après le justificatif SNCF Connect du " + dateCourte(r.achat.date) + " (" + euros(r.achat.montant) + ", " + (r.achat.trajets || []).length + " trajet(s))") : null);
      if (r.groupe || r.facteur !== 1) contenu.push(h("div", {class: "petit"}, "un paiement de " + euros(-r.op.montant) + (r.groupe ? " pour les lignes " + r.groupe.join(", ") : "")
        + (r.facteur === 2 ? ", à deux (billets payés pour deux personnes)" : r.facteur === 0 ? ", dont " + euros(-r.op.montant - somme(rap.filter(x => x.op === r.op), x => x.ligne.montant)) + " hors note" : "")
        + " : ventilé, la part de la note d'un côté, le reste garde son classement"));
    } else contenu.push(h("span", {class: "discret"}, r.aucun ? "aucun débit (payé autrement), choisi à la main" : "non retrouvé : billet d'un autre prix pour la seconde personne, achat plus ancien, autre moyen de paiement ?"));
    if (!fige) contenu.push(" ", h("button", {class: "mini discret", onclick: () => ouvrir(n)}, ouvert ? "Fermer" : r.op ? "Changer…" : "Choisir le débit…"),
      r.manuel ? h("button", {class: "mini discret", onclick: () => { choisirDebitNdf(j, n, undefined); rafraichirEcran(); }}, "Annuler le choix") : null);
    if (ouvert){
      const possibles = debitsPossiblesNdf(j, r.ligne);
      const liste = h("div", {class: "choix-ndf", style: {margin: ".3rem 0 .2rem", paddingLeft: ".6rem", borderLeft: "2px solid var(--trait, #ccc)"}});
      if (!possibles.length) liste.appendChild(h("div", {class: "discret"}, "Aucun débit « " + r.ligne.nature + " » d'au moins " + euros(r.ligne.montant) + " entre le " + dateCourte(ajouterJours(r.ligne.date, -120)) + " et le " + dateCourte(ajouterJours(r.ligne.date, 5)) + " : relevé non importé ?"));
      for (const op of possibles){
        const autres = rap.filter(x => x.op === op && x.ligne.n !== n).map(x => x.ligne.n);
        // Débit déjà pris par d'autres lignes : elles le gardent (un même paiement pour plusieurs trajets)
        liste.appendChild(h("div", null, h("button", {class: "mini", onclick: () => { for (const k of autres) choisirDebitNdf(j, k, op.id); choisirDebitNdf(j, n, op.id); NDF_CHOIX_OUVERT = null; rafraichirEcran(); }}, "Prendre"), " ",
          dateCourte(op.date) + " · " + op.libelle + " · " + euros(-op.montant) + " · " + libelleCompte(op.compte),
          h("span", {class: "discret"}, " (" + ecartJours(r.ligne.date, op.date) + " j" + (autres.length ? ", déjà pour la ligne " + autres.join(", ") : "") + ")")));
      }
      liste.appendChild(h("div", {style: {marginTop: ".2rem"}}, h("button", {class: "mini discret", onclick: () => { choisirDebitNdf(j, n, null); NDF_CHOIX_OUVERT = null; rafraichirEcran(); }}, "Aucun : payé autrement")));
      contenu.push(liste);
    }
    return h("td", {class: "petit"}, contenu);
  };
  bloc.appendChild(tableau([{titre: "N°", num: true}, {titre: "Date"}, {titre: "Nature"}, {titre: "Montant", num: true}, {titre: "Débit retrouvé"}], rap, {classe: "serre", ligne: r => h("tr", null,
    h("td", {class: "num"}, String(r.ligne.n)), h("td", null, dateCourte(r.ligne.date)), h("td", null, r.ligne.nature), h("td", {class: "num"}, euros(r.ligne.montant)), celluleDebit(r))}));
  const cat = j.categorie ? j.categorie + (j.sousCategorie ? " › " + j.sousCategorie : "") : "";
  bloc.appendChild(h("p", {class: "note"}, "Débit de même montant, acheté jusqu'à " + FENETRE_LIGNE_NDF[0] + " jours avant la date de la ligne ou " + FENETRE_LIGNE_NDF[1]
    + " jours après ; un paiement peut aussi couvrir plusieurs lignes, ou le double (billets pour deux personnes), si son libellé est cohérent : il sera ventilé. Sinon, « Choisir le débit… » propose les débits proches au libellé cohérent ; la part au-delà de la ligne garde son classement. Vérifiez les correspondances avant de classer."));
  bloc.appendChild(h("div", {class: "outils", style: {marginTop: ".4rem"}},
    h("button", {class: "mini" + (aClasser ? " primaire" : ""), disabled: !aClasser, title: cat ? "" : "Choisissez d'abord la catégorie de la note",
      onclick: async () => {
        if (avantClasser && avantClasser() === false) return;
        if (!j.categorie){ message("Choisissez d'abord la catégorie de la note (par exemple Transfert › Notes de frais), puis enregistrez.", true); return; }
        if (!(await confirmer("Classer " + aClasser + " dépense(s) en « " + (j.categorie + (j.sousCategorie ? " › " + j.sousCategorie : "")) + " » et y joindre la note ? Le classement actuel des débits est gardé pour pouvoir le rétablir.", "Classer"))) return;
        const n = classerDepensesNdf(j, rapprochementLignesNdf(j)); message(n + " débit(s) classé(s) avec la note."); rafraichirEcran();
      }}, aClasser ? "Classer les " + aClasser + " dépense(s) retrouvée(s)" + (cat ? " en « " + cat + " »" : "") : "Rien à classer"),
    dejaClasses.length ? h("button", {class: "mini discret", onclick: async () => {
      if (!(await confirmer("Rendre leur classement d'avant aux débits rattachés à cette note ?", "Rétablir"))) return;
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
