/* ================= Budget, réalisé, bilan, résultat =================
   Réalisé : opérations ventilées comptées à leur date d'ACHAT (débit différé ignoré),
   hors transferts et opérations « Hors budget ». Dépense = montant positif. */

function budgetActif(annee){
  const liste = vivants("budgets").filter(b => !b.fige && (!annee || b.annee === annee));
  return liste.find(b => b.actif) || liste[0] || vivants("budgets").find(b => !annee || b.annee === annee) || null;
}
function anneesBudget(){ return [...new Set(vivants("budgets").map(b => b.annee))].sort(); }
/* Poids mensuels d'une ligne : 1/12 par défaut, sinon profil saisi (12 poids). */
function poidsMois(ligne){
  if (Array.isArray(ligne.profil) && ligne.profil.length === 12){ const t = somme(ligne.profil); if (t) return ligne.profil.map(x => x / t); }
  return Array(12).fill(1 / 12);
}
function budgetDuMois(ligne, mois){ return ligne.annuel * poidsMois(ligne)[mois - 1]; }
function partLieu(ligne, lieu){
  if (!lieu) return 1;
  const r = ligne.repartition; if (!r) return lieu === "Autres" ? 1 : 0;
  return r[lieu] || 0;
}
const cleLigne = (c, s) => norm(c) + "|" + norm(s);

/* Parts d'opérations (ventilations dépliées) dans une période. */
/* Dépense d'un projet (travaux, voiture…) : champ « Projet » renseigné, ou catégorie d'une échéance de projet
   (ou de sa liste « rattache ») avec la nature « Exceptionnelle ». Pour une pièce pas encore au relevé
   (sans nature), la catégorie suffit (parCategorie). Même règle que l'écran Projets. */
function reglesProjets(){
  return vivants("echeances").filter(e => e.projet && e.active !== false)
    .flatMap(e => [...(e.rattache || []), e.categorie ? {categorie: e.categorie, sousCategorie: e.sousCategorie} : null].filter(Boolean));
}
function estDepenseProjet(o, regles, parCategorie){
  if (o.projet) return true;
  const cat = (regles || reglesProjets()).some(r => r.categorie === o.categorie && (!r.sousCategorie || r.sousCategorie === o.sousCategorie));
  return cat && (parCategorie || o.nature === "Exceptionnelle");
}
/* Dépenses de projets d'une période (montant positif), hors « Hors budget » et revenus. */
function depensesProjets(debut, fin, regles){
  return -somme(partsPeriode(debut, fin, p => !horsResultat(p) && p.nature !== "Revenu" && estDepenseProjet(p, regles)), p => p.montant);
}
function partsPeriode(debut, fin, filtre){
  const r = [];
  for (const op of vivants("operations")){
    if (op.date < debut || op.date > fin) continue;
    for (const p of partsDe(op)) if (!filtre || filtre(p)) r.push(p);
  }
  return r;
}
/* Réalisé par ligne de budget (clé catégorie|sous-catégorie) et par lieu. */
function realiseParLigne(debut, fin, lieu){
  const m = new Map(); const horsBudget = [];
  for (const p of partsPeriode(debut, fin, p => !horsResultat(p) && p.nature !== "Revenu")){
    if (lieu && (p.lieu || "Autres") !== lieu) continue;
    const k = cleLigne(p.categorie, p.sousCategorie);
    m.set(k, (m.get(k) || 0) - p.montant);
  }
  return m;
}
/* Tableau budget/réalisé du mois (ou d'une période de mois) pour un lieu. */
function tableauBudget(budget, annee, moisDebut, moisFin, lieu){
  // Un budget peut ne couvrir qu'une partie de l'année (« debut ») : le réalisé est alors compté à partir de cette date.
  const borne = d => (budget?.debut && budget.debut > d) ? budget.debut : d;
  const debut = borne(`${annee}-${pad2(moisDebut)}-01`), fin = finDeMois(`${annee}-${pad2(moisFin)}-01`);
  const realise = debut <= fin ? realiseParLigne(debut, fin, lieu) : new Map();
  const realiseAnnee = realiseParLigne(borne(`${annee}-01-01`), fin, lieu);
  const lignes = [];
  const vues = new Set();
  for (const l of budget?.lignes || []){
    const k = cleLigne(l.categorie, l.sousCategorie); vues.add(k);
    const part = partLieu(l, lieu);
    let b = 0; for (let mo = moisDebut; mo <= moisFin; mo++) b += budgetDuMois(l, mo) * part;
    lignes.push({ligne: l, nature: l.nature, categorie: l.categorie, sousCategorie: l.sousCategorie, budget: b, realise: realise.get(k) || 0,
      cumul: realiseAnnee.get(k) || 0, annuel: l.annuel * part});
  }
  // Dépenses sans ligne de budget
  for (const [k, v] of realise){
    if (vues.has(k) || Math.abs(v) < 0.005) continue;
    const [c, s] = k.split("|");
    const ex = partsPeriode(debut, fin, p => cleLigne(p.categorie, p.sousCategorie) === k)[0];
    lignes.push({ligne: null, nature: ex?.nature || "Courante", categorie: ex?.categorie || c, sousCategorie: ex?.sousCategorie || s, budget: 0, realise: v, cumul: realiseAnnee.get(k) || v, annuel: 0, horsBudget: true});
  }
  return lignes;
}
function ordreNatures(){ return LIVRE.parametres.natures.filter(n => !NATURES_HORS_RESULTAT.includes(n) && n !== "Revenu"); }

/* ---------- Bilan ---------- */
/* Solde d'un compte bancaire à une date : dernier solde relevé connu (≤ date) + opérations postérieures. */
function soldeCompte(compte, date){
  if (compte.type === "carte"){
    // Encours : achats non encore débités à cette date (dette)
    return somme(vivants("operations").filter(o => o.compte === compte.id && o.date <= date && (!o.dateDebit || o.dateDebit > date) && !(o.lien && o.montant > 0)), o => o.montant);
  }
  if (["courant", "especes"].includes(compte.type)){
    const releves = vivants("soldes").filter(s => s.compte === compte.id && s.date <= date).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (a.debut ? 1 : -1));
    const ref = releves[0];
    if (!ref){
      if (compte.type === "especes") return somme(vivants("operations").filter(o => o.compte === compte.id && o.date <= date && o.montant > 0), o => o.montant)
        + somme(vivants("operations").filter(o => o.compte === compte.id && o.date <= date && o.montant < 0), o => o.montant);
      return null;
    }
    // Après le dernier relevé : opérations du compte (hors lignes carte, comptées sur les comptes carte) jusqu'à la date
    const apres = vivants("operations").filter(o => o.compte === compte.id && o.date > ref.date && o.date <= date);
    return ref.solde + somme(apres, o => o.montant);
  }
  const v = derniereValorisation(compte.id, date);
  return v ? v.valeur : null;
}
function derniereValorisation(compteId, date){
  return vivants("valorisations").filter(v => v.compte === compteId && v.date <= date).sort((a, b) => a.date < b.date ? 1 : -1)[0] || null;
}
function sourceSolde(compte, date){
  if (compte.type === "carte") return "achats non débités";
  if (["courant", "especes"].includes(compte.type)){
    const s = vivants("soldes").filter(x => x.compte === compte.id && x.date <= date).sort((a, b) => a.date < b.date ? 1 : -1)[0];
    return s ? "relevé du " + dateFr(s.date) + (s.date < date ? " + opérations" : "") : "aucun relevé";
  }
  const v = derniereValorisation(compte.id, date);
  return v ? (v.source ? "relevé" : "saisie") + " du " + dateFr(v.date) : "aucune valorisation";
}
function bilan(date){
  const rubriques = [];
  let total = 0;
  for (const [titre, types] of RUBRIQUES_BILAN){
    const lignes = [];
    for (const c of vivants("comptes").filter(c => types.includes(c.type) && c.actif !== false)){
      const v = soldeCompte(c, date);
      if (v === null && c.type !== "carte") { lignes.push({compte: c, valeur: null, source: sourceSolde(c, date)}); continue; }
      const val = c.type === "dette" ? -Math.abs(v || 0) : (v || 0);
      if (c.type === "carte" && Math.abs(val) < 0.005) continue;
      lignes.push({compte: c, valeur: val, source: sourceSolde(c, date)}); total += val;
    }
    if (lignes.length) rubriques.push({titre, lignes});
  }
  return {date, rubriques, total};
}

/* Variation du patrimoine net à périmètre comparable : seuls les postes valorisés aux deux dates. */
function variationComparable(b1, b0){
  const v0 = new Map(); for (const r of b0.rubriques) for (const l of r.lignes) if (l.valeur !== null) v0.set(l.compte.id, l.valeur);
  let d = 0, exclus = 0;
  for (const r of b1.rubriques) for (const l of r.lignes){
    if (l.valeur === null) continue;
    if (v0.has(l.compte.id)) d += l.valeur - v0.get(l.compte.id);
    else if (l.compte.type === "carte") d += l.valeur;
    else exclus++;
  }
  return {variation: d, exclus};
}

/* ---------- Compte de résultat ---------- */
function resultat(debut, fin){
  const parNature = new Map(); const memo = {epargne: 0, cessions: 0};
  for (const p of partsPeriode(debut, fin)){
    if (p.categorie === "Épargne") { memo.epargne += -p.montant; continue; }
    if (p.categorie === "Patrimoine") { memo.cessions += p.montant; continue; }
    if (horsResultat(p)) continue;
    const n = p.nature === "Revenu" || p.montant > 0 && p.categorie === "Revenus" ? "Revenu" : p.nature || "Courante";
    if (!parNature.has(n)) parNature.set(n, new Map());
    const m = parNature.get(n); const k = n === "Revenu" ? p.sousCategorie || p.categorie : p.categorie;
    m.set(k, (m.get(k) || 0) + p.montant);
  }
  return {parNature, memo, total: somme([...parNature.values()].flatMap(m => [...m.values()]))};
}
/* Variation de valeur des placements non expliquée par les versements (plus-values latentes). */
function plusValuesLatentes(debut, fin){
  /* Variation de valeur des placements valorisés aux deux dates, moins les versements d'épargne de la période. */
  let variation = 0;
  for (const c of vivants("comptes").filter(c => ["livret", "assurance_vie", "retraite", "prevoyance", "pea", "titres", "immobilier"].includes(c.type))){
    const v0 = derniereValorisation(c.id, ajouterJours(debut, -1)), v1 = derniereValorisation(c.id, fin);
    if (v0 && v1) variation += v1.valeur - v0.valeur;
  }
  const versements = somme(partsPeriode(debut, fin, p => p.categorie === "Épargne"), p => -p.montant);
  return variation - versements;
}
