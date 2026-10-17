/* ================= Reprise du classeur « Dépenses 2025-2026 – inventaire » =================
   Lit, sans le modifier, le classeur choisi par l'auteur :
   - « Opérations » : historique classé (sert aussi d'apprentissage aux fiches commerçants) ;
   - « Synthèse » : budget de l'année (colonne « Base … », lignes « Nouvelle » comprises) ;
   - « Analytique … » : répartition par lieu, appliquée aux lignes de chaque catégorie ;
   - « Projection épargne » : hypothèses proposées comme échéances, à confirmer. */

function colonnes(entete){ const m = {}; entete.forEach((v, i) => { if (v != null) m[norm(v).trim()] = i; }); return m; }
const valeurNum = v => typeof v === "number" ? v : lireMontant(v);

function preparerReprise(lu){
  const F = lu.classeur.feuilles;
  const res = {lu, operations: [], budget: null, echeances: [], lieux: [], natures: new Set(), numeroCompte: "", alertes: []};

  /* Paramètres : numéro du compte courant cité dans les sources */
  for (const l of F["Paramètres"] || []) for (const v of l || []){ const m = String(v || "").match(/(\d{5}) (\d{6}[A-Z])/); if (m && !res.numeroCompte) res.numeroCompte = m[2]; }

  /* Opérations */
  const ops = F["Opérations"]; const c = colonnes(ops[0] || []);
  const col = nom => c[norm(nom)];
  const iLieu = Object.entries(c).find(([k]) => /\/ autres$/.test(k))?.[1];
  for (const l of ops.slice(1)){
    if (!l || l[col("date")] == null) continue;
    const d = l[col("date")];
    const date = typeof d === "number" ? dateExcel(d) : lireDate(d);
    if (!date) continue;
    const lieu = propre(l[iLieu] ?? "");
    res.operations.push({date, source: propre(l[col("source")]), libelle: propre(l[col("libelle")]), detail: propre(l[col("detail (releve pdf)")] || ""),
      montant: valeurNum(l[col("montant bancaire")]), categorie: propre(l[col("categorie")] || ""), sousCategorie: propre(l[col("sous-categorie")] || ""),
      nature: propre(l[col("nature")] || ""), pertinent: propre(l[col("pertinent 2027")] || ""), reference: propre(l[col("reference")] || ""),
      ville: propre(l[col("ville du commercant")] || ""), lieu});
    if (lieu && !res.lieux.includes(lieu)) res.lieux.push(lieu);
  }

  /* Synthèse : budget */
  const syn = F["Synthèse"];
  const iTete = syn.findIndex(l => l && norm(l[0]) === "nature" && norm(l[1]) === "categorie");
  if (iTete >= 0){
    const t = syn[iTete].map(x => norm(x));
    const iBase = t.findIndex(x => /^base \d{4} \(hors/.test(x));
    const annee = +(String(syn[iTete][iBase] || "").match(/\d{4}/) || [new Date().getFullYear() + 1])[0];
    const iCompte = t.indexOf("lcl compte"), iCartes = t.findIndex(x => /cartes annualisees/.test(x)), iAmex = t.indexOf("amex");
    const lignes = [];
    for (const l of syn.slice(iTete + 1)){
      if (!l || !l[0] || !l[1]) continue;
      const nature = propre(l[0]);
      if (/^sous-total|^total|^base/i.test(nature)) continue;
      const base = valeurNum(l[iBase]);
      if (!base || isNaN(base)) continue;
      const pc = Math.max(0, valeurNum(l[iCompte]) || 0), pk = Math.max(0, valeurNum(l[iCartes]) || 0), pa = Math.max(0, valeurNum(l[iAmex]) || 0);
      const tot = pc + pk + pa;
      lignes.push({id: "lb-" + idAleatoire(8), nature: nature === "Nouvelle" ? "Courante" : nature, nouvelle: nature === "Nouvelle",
        categorie: propre(l[1]), sousCategorie: propre(l[2] || l[1]), annuel: Math.round(base * 100) / 100,
        paiement: tot ? {compte: pc / tot, cartes: pk / tot, amex: pa / tot} : {compte: 1, cartes: 0, amex: 0}, profil: null, repartition: null});
      if (nature !== "Nouvelle") res.natures.add(nature);
    }
    const ligneTotal = syn.find(l => l && /^Base \d{4} complète/i.test(String(l[0] || "")));
    res.budget = {annee, nom: "Budget " + annee + " (classeur v7)", lignes, totalAttendu: ligneTotal ? valeurNum(ligneTotal[iBase]) : null};
  }

  /* Analytique : répartition par lieu */
  const ana = F[lu.classeur.noms.find(n => /^analytique/i.test(n))];
  if (ana && res.budget){
    const iT = ana.findIndex(l => l && norm(l[0]) === "analytique");
    if (iT >= 0){
      const t = ana[iT].map(x => propre(x || ""));
      const iTotal = t.findIndex(x => norm(x) === "total");
      const lieux = t.slice(3, iTotal).filter(Boolean);
      for (const lx of lieux) if (!res.lieux.includes(lx)) res.lieux.push(lx);
      const parCategorie = {}, parDetail = {};
      for (const l of ana.slice(iT + 1)){
        if (!l || !l[0] || !l[1]) continue;
        const tot = valeurNum(l[iTotal]); if (!tot) continue;
        const rep = {}; lieux.forEach((lx, k) => { rep[lx] = (valeurNum(l[3 + k]) || 0) / tot; });
        if (norm(l[0]) === "reconduite") parCategorie[propre(l[1])] = rep;
        else if (l[2]) parDetail[propre(l[2])] = rep;
      }
      for (const lb of res.budget.lignes) lb.repartition = parDetail[lb.sousCategorie] || parCategorie[lb.categorie] || {[lieux[lieux.length - 1] || "Autres"]: 1};
    }
  }
  if (res.budget){
    res.budget.total = Math.round(somme(res.budget.lignes, l => l.annuel) * 100) / 100;
    if (res.budget.totalAttendu && Math.abs(res.budget.total - res.budget.totalAttendu) > 0.05)
      res.alertes.push("Total repris " + euros(res.budget.total) + " ≠ total du classeur " + euros(res.budget.totalAttendu) + ".");
  }

  /* Projection épargne : hypothèses → échéances proposées */
  const pro = F["Projection épargne"];
  if (pro && res.budget){
    const val = re => { const l = pro.find(x => x && re.test(String(x[0] || ""))); return l ? valeurNum(l[1]) : null; };
    const an = res.budget.annee;
    const pensions = val(/^Pensions brutes annuelles/i), prel = val(/^Prélèvements sociaux sur les pensions/i);
    if (pensions) res.echeances.push({libelle: "Pensions (nettes de prélèvements sociaux, estimation)", montant: Math.round(pensions * (1 - (prel || 0)) / 12), recurrence: "mensuelle", jour: 9, debut: an + "-01-09", categorie: "Revenus", sousCategorie: "Pensions", aConfirmer: true});
    const bmw = val(/solde à la livraison/i);
    if (bmw) res.echeances.push({libelle: "Voiture : solde à la livraison", montant: -bmw, recurrence: "unique", debut: an + "-07-15", categorie: "Voiture", sousCategorie: "Achat", nature: "Exceptionnelle", aConfirmer: true});
    const ligneTravaux = pro.find(x => x && /^Travaux/i.test(String(x[0] || "")));
    if (ligneTravaux && valeurNum(ligneTravaux[1])){
      const nomTravaux = String(ligneTravaux[0]).replace(/\s*\(\d{4}\)\s*$/, "");
      res.echeances.push({libelle: nomTravaux + " (échéancier à préciser)", montant: -valeurNum(ligneTravaux[1]), recurrence: "unique", debut: an + "-06-30", categorie: "Travaux", sousCategorie: nomTravaux, nature: "Exceptionnelle", aConfirmer: true});
    }
    const variable = val(/^Rémunération variable/i);
    if (variable) res.echeances.push({libelle: "Rémunération variable (nette, estimation)", montant: variable, recurrence: "unique", debut: an + "-01-31", categorie: "Revenus", sousCategorie: "Rémunération", aConfirmer: true});
    const loyer = val(/^Loyer actuel/i);
    if (loyer){
      const lb = res.budget.lignes.find(l => /^loyer$/i.test(l.sousCategorie));
      res.echeances.push({libelle: "Loyer (charges comprises)", montant: -Math.round(loyer / 12 * 100) / 100, recurrence: "mensuelle", jour: 1, debut: an + "-01-01", categorie: "Logement", sousCategorie: "Loyer", ligneBudget: lb?.id, aConfirmer: true});
    }
  }
  return res;
}

function appliquerReprise(prep, options){
  const o = Object.assign({operations: true, budget: true, echeances: true}, options);
  for (const l of prep.lieux) ajouterLieu(l);
  if (LIVRE.parametres.lieux.length > 1 && LIVRE.parametres.lieux[0] === "Autres") modifierParametres({lieux: [...LIVRE.parametres.lieux.slice(1), "Autres"]});
  for (const n of prep.natures) if (!LIVRE.parametres.natures.includes(n)) modifierParametres({natures: [...LIVRE.parametres.natures, n]});

  /* Comptes de la reprise */
  let courant = compteCourantLcl(prep.numeroCompte || undefined) || compteCourantLcl();
  if (!courant) courant = enregistrer("comptes", {nom: "Compte joint LCL" + (prep.numeroCompte ? " …" + prep.numeroCompte.slice(-4) : ""), type: "courant", banque: "LCL", numero: prep.numeroCompte, titulaire: "Joint", actif: true});
  if (!LIVRE.parametres.compteTresorerie) modifierParametres({compteTresorerie: courant.id});
  const cartesNv = compteCartesNonVentilees(courant.id);
  let amex = trouverCompte({carte: "AMEX", banque: "Amex"});
  if (!amex && prep.operations.some(x => x.source === "Amex")) amex = enregistrer("comptes", {nom: "Amex", type: "carte", banque: "Amex", carte: "AMEX", compteDebit: courant.id, actif: true});
  const compteDeSource = s => s === "LCL compte" ? courant : s === "LCL carte" ? cartesNv : s === "Amex" ? amex : courant;

  let n = 0;
  if (o.operations){
    const idx = indexEmpreintes();
    const parCompte = regrouper(prep.operations, x => compteDeSource(x.source).id);
    for (const [cid, liste] of parCompte){
      const compte = obtenir("comptes", cid);
      const emp = empreintes(cid, liste);
      liste.forEach((x, i) => {
        if (idx.has(emp[i])) return;
        const op = {compte: cid, date: x.date, dateDebit: compte.type === "carte" ? x.date : x.date, montant: Math.round(x.montant * 100) / 100,
          libelle: x.libelle, detail: x.detail, ville: x.ville, ref: x.reference, categorie: x.categorie || "À préciser", sousCategorie: x.sousCategorie || "",
          nature: x.nature || "Courante", lieu: x.lieu, pertinent: x.pertinent, empreinte: emp[i], origine: "reprise", statut: "classe", verrou: true, justificatifs: []};
        if (x.categorie) ajouterCategorieSilencieuse(x.categorie, x.sousCategorie);
        const c = assurerCommercant(x.libelle); if (c) op.commercant = c.id;
        enregistrer("operations", op);
        if (op.nature !== "Hors budget" && op.categorie !== "Transfert") apprendre(op);
        n++;
      });
    }
  }
  let budget = null;
  if (o.budget && prep.budget){
    for (const l of prep.budget.lignes) ajouterCategorieSilencieuse(l.categorie, l.sousCategorie);
    budget = enregistrer("budgets", {annee: prep.budget.annee, nom: prep.budget.nom, fige: true, lignes: prep.budget.lignes, source: prep.lu.nom});
    enregistrer("budgets", {annee: prep.budget.annee, nom: "Budget " + prep.budget.annee + " (version de travail)", fige: false, actif: true,
      lignes: JSON.parse(JSON.stringify(prep.budget.lignes)), origine: budget.id});
  }
  if (o.echeances) for (const e of prep.echeances) enregistrer("echeances", Object.assign({compte: courant.id}, e));
  apparierTransferts();
  return {operations: n, budget};
}
