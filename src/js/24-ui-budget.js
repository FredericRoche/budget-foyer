/* ================= Budget et réalisé ================= */
// Dépassement : réalisé au-delà de 10 % et de 50 € d'une ligne de dépense ; une ligne de crédit (budget négatif : points, remboursements) n'est jamais en dépassement.
function postesEnDepassement(lignes){ return lignes.filter(l => l.budget > 0 && l.realise > l.budget * 1.1 && l.realise - l.budget > 50); }
declarerEcran("budget", {titre: "Budget et réalisé", rendre(c, etat){
  const m = moisCourant(etat); const an = +m.slice(0, 4), mo = +m.slice(5, 7);
  const budgets = vivants("budgets").filter(b => b.annee === an);
  const budget = (etat.budget && obtenir("budgets", etat.budget)?.annee === an) ? obtenir("budgets", etat.budget) : budgetActif(an);
  const periode = etat.periode || "mois"; const lieu = etat.lieu || "";
  const [d1, d2] = periode === "mois" ? [mo, mo] : periode === "cumul" ? [1, mo] : [1, 12];
  c.appendChild(entete("Budget et réalisé", budget ? budget.nom + (budget.fige ? " · version figée" : "") + (budget.debut ? " · à partir du " + dateFr(budget.debut) : "") : "Aucun budget pour " + an, [
    segments([["", "Tous"], ...LIVRE.parametres.lieux.map(l => [l, l])], lieu, v => { etat.lieu = v; rafraichirEcran(); }),
    segments([["mois", MOIS_LONG[mo - 1]], ["cumul", "Cumul au " + dateCourte(finDeMois(m + "-01"))], ["annee", "Année " + an]], periode, v => { etat.periode = v; rafraichirEcran(); }),
    segments([["liste", "Liste"], ["lieux", "Par lieu"]], etat.vue || "liste", v => { etat.vue = v; rafraichirEcran(); }),
    selecteurMois(etat, rafraichirEcran),
    budgets.length > 1 ? selection(budgets.map(b => [b.id, b.nom]), budget?.id, {onchange: e => { etat.budget = e.target.value; rafraichirEcran(); }}) : null,
    budget ? h("button", {class: "discret", onclick: () => exporterBudget(budget, an, lieu)}, "Exporter en Excel") : null,
    budget ? h("button", {class: "discret", onclick: () => imprimerBudget(budget, an, d1, d2, lieu, periode)}, "Version imprimable") : null,
    budget && !budget.fige ? h("button", {class: "discret", onclick: () => editerLigne(budget, null)}, "Ajouter une ligne") : null,
    budget && !budgetActif(an + 1) ? h("button", {class: "discret", onclick: async () => {
      if (!(await confirmer("Créer le budget " + (an + 1) + " en copiant « " + budget.nom + " » ? Vous l'ajusterez ensuite ligne par ligne.", "Copier"))) return;
      const b = enregistrer("budgets", {annee: an + 1, nom: "Budget " + (an + 1) + " (copie de " + an + ")", fige: false, actif: true, lignes: JSON.parse(JSON.stringify(budget.lignes)).map(l => Object.assign(l, {id: "lb-" + idAleatoire(8)}))});
      etat.mois = (an + 1) + "-01"; etat.budget = b.id; rafraichirEcran();
    }}, "Copier pour " + (an + 1)) : null]));
  if (!budget){ c.appendChild(h("p", {class: "vide"}, "Reprenez le budget depuis le classeur d'inventaire (écran Importer), ou copiez celui d'une autre année (Réglages).")); return; }
  if (etat.vue === "lieux"){ vueParLieu(c, budget, an, d1, d2); return; }
  const lignes = tableauBudget(budget, an, d1, d2, lieu);
  const lb = lignes.filter(l => l.ligne);
  const tb = somme(lb, l => l.budget), tr = somme(lignes, l => l.realise);
  const depasse = postesEnDepassement(lignes);
  c.appendChild(h("div", {class: "indicateurs"},
    h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Budget"), h("div", {class: "val"}, euros(tb, 0)), h("div", {class: "det"}, "budget annuel : " + euros(somme(lb, l => l.annuel), 0))),
    h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Réalisé"), h("div", {class: "val"}, euros(tr, 0)), h("div", {class: "det"}, tb ? Math.round(tr / tb * 100) + " % du budget" : "")),
    h("div", {class: "indicateur" + (tb - tr < 0 ? " attention" : "")}, h("div", {class: "lib"}, "Écart"), h("div", {class: "val" + (tb - tr < 0 ? " neg" : "")}, eurosSigne(Math.round(tb - tr))), h("div", {class: "det"}, "positif = sous le budget")),
    h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Postes en dépassement"), h("div", {class: "val"}, String(depasse.length)), h("div", {class: "det"}, "au-delà de 10 % et de 50 €"))));
  const corps = h("tbody");
  const debut = `${an}-${pad2(d1)}-01`, fin = finDeMois(`${an}-${pad2(d2)}-01`);
  for (const nat of [...new Set([...ordreNatures(), ...lignes.map(l => l.nature)])]){
    const ls = lignes.filter(l => l.nature === nat); if (!ls.length) continue;
    corps.appendChild(h("tr", {class: "groupe"}, h("td", null, nat), h("td", {class: "num"}, euros(somme(ls, l => l.budget), 0)), h("td", {class: "num"}, euros(somme(ls, l => l.realise), 0)), h("td", {colspan: 6})));
    ls.sort((a, b) => (a.categorie + a.sousCategorie).localeCompare(b.categorie + b.sousCategorie, "fr"));
    for (const l of ls){
      const ecart = l.budget - l.realise;
      corps.appendChild(h("tr", {class: "cliquable", onclick: () => aller("operations", {categorie: l.categorie + "|" + l.sousCategorie, mois: periode === "mois" ? m : "", recherche: "", compte: ""})},
        h("td", {class: "retrait", title: l.ligne?.note || ""}, l.categorie + " › " + l.sousCategorie, l.horsBudget ? h("span", {class: "petit neg"}, " (sans ligne de budget)") : null, l.ligne?.nouvelle ? h("span", {class: "petit discret"}, " (nouvelle)") : null),
        h("td", {class: "num"}, euros(l.budget, 0)), h("td", {class: "num"}, euros(l.realise, 0)), h("td", {class: "num " + (ecart < 0 ? "neg" : "")}, eurosSigne(Math.round(ecart))),
        h("td", null, barreConsomme(l.budget, l.realise)), h("td", {class: "num"}, euros(l.cumul, 0)), h("td", {class: "num"}, euros(l.annuel - l.cumul, 0)),
        h("td", null, l.ligne && !budget.fige ? h("button", {class: "mini discret", onclick: e => { e.stopPropagation(); editerLigne(budget, l.ligne); }}, "Modifier") : null), h("td")));
    }
  }
  corps.appendChild(h("tr", {class: "total"}, h("td", null, "Total"), h("td", {class: "num"}, euros(tb, 0)), h("td", {class: "num"}, euros(tr, 0)), h("td", {class: "num " + (tb - tr < 0 ? "neg" : "pos")}, eurosSigne(Math.round(tb - tr))),
    h("td"), h("td", {class: "num"}, euros(somme(lignes, l => l.cumul), 0)), h("td", {class: "num"}, euros(somme(lb, l => l.annuel - l.cumul), 0)), h("td"), h("td")));
  c.appendChild(h("div", {class: "tableau"}, h("table", null, h("thead", null, h("tr", null, h("th", null, "Nature · catégorie · sous-catégorie"), h("th", {class: "num"}, "Budget"), h("th", {class: "num"}, "Réalisé"),
    h("th", {class: "num"}, "Écart"), h("th", null, "Consommé"), h("th", {class: "num"}, "Cumul " + an), h("th", {class: "num"}, "Reste sur l'année"), h("th"), h("th"))), corps)));
  const revenus = partsPeriode(debut, fin, p => p.nature === "Revenu" && (!lieu || p.lieu === lieu));
  c.appendChild(h("p", {class: "note"}, "Réalisé compté à la date d'achat (débit différé ignoré), hors transferts et opérations « Hors budget ». Revenus de la période : " + euros(somme(revenus, p => p.montant), 0) +
    ". Un clic sur une ligne ouvre ses opérations."));
}});

/* Vue « Par lieu » : chaque ligne (catégorie › sous-catégorie) en budget et réalisé pour chaque lieu, avec le coût
   du logement en tête, puis les autres catégories ; même période que la liste. */
function tableauParLieu(budget, an, d1, d2){
  const lieux = LIVRE.parametres.lieux;
  const parLieu = lieux.map(lx => tableauBudget(budget, an, d1, d2, lx));
  const lignes = new Map();
  parLieu.forEach((ls, i) => { for (const l of ls){
    const k = cleLigne(l.categorie, l.sousCategorie);
    if (!lignes.has(k)) lignes.set(k, {categorie: l.categorie, sousCategorie: l.sousCategorie, ligne: l.ligne, horsBudget: l.horsBudget, logement: estLogement(l), b: lieux.map(() => 0), r: lieux.map(() => 0)});
    const x = lignes.get(k); x.b[i] += l.budget; x.r[i] += l.realise; if (l.ligne) x.ligne = l.ligne;
  } });
  const toutes = [...lignes.values()].filter(x => x.b.some(v => Math.abs(v) > 0.5) || x.r.some(v => Math.abs(v) > 0.5))
    .sort((a, b) => (a.categorie + a.sousCategorie).localeCompare(b.categorie + b.sousCategorie, "fr"));
  const somme2 = (xs, f) => lieux.map((_, i) => somme(xs, x => f(x)[i]));
  const logement = toutes.filter(x => x.logement);
  const groupes = [...new Set(toutes.filter(x => !x.logement).map(x => x.categorie))].map(cat => ({nom: cat, lignes: toutes.filter(x => !x.logement && x.categorie === cat)}));
  return {lieux, logement, groupes, total: {b: somme2(toutes, x => x.b), r: somme2(toutes, x => x.r)}, sousTotal: xs => ({b: somme2(xs, x => x.b), r: somme2(xs, x => x.r)})};
}
function vueParLieu(c, budget, an, d1, d2){
  const t = tableauParLieu(budget, an, d1, d2);
  const cellules = (b, r) => [...t.lieux.flatMap((_, i) => [h("td", {class: "num"}, euros(b[i], 0)), h("td", {class: "num" + (r[i] > b[i] * 1.1 && r[i] - b[i] > 50 ? " neg" : "")}, euros(r[i], 0))]),
    h("td", {class: "num"}, euros(somme(b), 0)), h("td", {class: "num"}, euros(somme(r), 0))];
  const corps = h("tbody");
  const bloc = (titre, xs, classe) => {
    if (!xs.length) return;
    const st = t.sousTotal(xs);
    corps.appendChild(h("tr", {class: classe || "groupe"}, h("td", null, titre), ...cellules(st.b, st.r)));
    for (const x of xs) corps.appendChild(h("tr", null, h("td", {class: "retrait"}, (classe ? x.categorie + " › " : "") + x.sousCategorie, x.horsBudget ? h("span", {class: "petit neg"}, " (sans ligne de budget)") : null), ...cellules(x.b, x.r)));
  };
  bloc("Coût du logement", t.logement, "groupe logement");
  for (const g of t.groupes) bloc(g.nom, g.lignes);
  corps.appendChild(h("tr", {class: "total"}, h("td", null, "Total"), ...cellules(t.total.b, t.total.r)));
  const tete2 = h("tr", null, h("th"), ...t.lieux.flatMap(() => [h("th", {class: "num"}, "Budget"), h("th", {class: "num"}, "Réalisé")]), h("th", {class: "num"}, "Budget"), h("th", {class: "num"}, "Réalisé"));
  const tete1 = h("tr", null, h("th", null, "Catégorie · sous-catégorie"), ...t.lieux.map(lx => h("th", {colspan: 2, class: "num"}, lx)), h("th", {colspan: 2, class: "num"}, "Total"));
  const st = t.sousTotal(t.logement);
  c.appendChild(h("div", {class: "indicateurs"}, t.lieux.map((lx, i) => h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Logement · " + lx), h("div", {class: "val"}, euros(st.b[i], 0)),
    h("div", {class: "det"}, "réalisé " + euros(st.r[i], 0))))));
  c.appendChild(h("div", {class: "tableau"}, h("table", null, h("thead", null, tete1, tete2), corps)));
  c.appendChild(h("p", {class: "note"}, "Une dépense sans lieu précis suit la répartition de sa ligne de budget (Modifier la ligne › Répartition par lieu) ; une dépense qui porte un lieu le garde. " +
    "« Coût du logement » : catégorie Logement, et toute ligne cochée « Coût du logement » (assurance habitation, box, ramonage…)."));
}
async function editerLigne(budget, ligne){
  const l = ligne || {id: "lb-" + idAleatoire(8), nature: "Courante", categorie: "", sousCategorie: "", annuel: 0, paiement: {compte: 1, cartes: 0, amex: 0}};
  const cat = selectionCategorie(l.categorie, l.sousCategorie);
  const nat = selectionNature(l.nature);
  const annuel = h("input", {type: "text", value: nombre(l.annuel)});
  const lieux = LIVRE.parametres.lieux;
  const reps = lieux.map(lx => h("input", {type: "text", value: nombre(Math.round(((l.repartition || {})[lx] ?? (lx === "Autres" && !l.repartition ? 1 : 0)) * 100), 0), style: {width: "4.5rem"}}));
  const pay = ["compte", "cartes", "amex"].map(k => h("input", {type: "text", value: nombre(Math.round((l.paiement?.[k] || 0) * 100), 0), style: {width: "4.5rem"}}));
  const logement = h("input", {type: "checkbox", id: "lb-logement", checked: l.logement !== undefined && l.logement !== null ? !!l.logement : norm(l.categorie || "") === "logement"});
  const profil = h("input", {type: "text", value: Array.isArray(l.profil) ? l.profil.join(" ") : "", placeholder: "vide = 1/12 par mois ; sinon 12 poids, ex. 0 0 0 0 0 0 0 0 0 1 0 0"});
  const cpt = obtenir("comptes", LIVRE.parametres.compteTresorerie) || comptesDeType("courant")[0];
  const habituel = cpt && l.categorie ? joursHabituels(cpt.id, aujourdhui()).get(cleLigne(l.categorie, l.sousCategorie)) : null;
  const jour = h("input", {type: "text", inputmode: "numeric", value: l.jour ? String(l.jour) : "", style: {width: "5rem"}, placeholder: habituel ? String(habituel) : "—"});
  const ok = await dialogue({titre: ligne ? "Modifier la ligne" : "Nouvelle ligne de budget", large: true, corps: h("div", null,
    h("div", {class: "grille-champs"}, champ("Catégorie", cat), champ("Nature", nat), champ("Montant annuel", annuel)),
    h("label", null, "Répartition par lieu (%)"), h("div", {class: "outils", style: {marginBottom: ".6rem"}}, lieux.map((lx, i) => h("span", null, lx + " ", reps[i]))),
    h("div", {class: "case", style: {marginBottom: ".6rem"}}, logement, h("label", {for: "lb-logement"}, "Coût du logement (sous-total par lieu dans la vue « Par lieu »)")),
    h("label", null, "Mode de paiement (%), pour la trésorerie"), h("div", {class: "outils", style: {marginBottom: ".6rem"}}, h("span", null, "compte ", pay[0]), h("span", null, "cartes LCL ", pay[1]), h("span", null, "Amex ", pay[2])),
    champ("Profil mensuel", profil, "Par exemple pour une taxe payée en octobre : 0 0 0 0 0 0 0 0 0 1 0 0."),
    champ("Jour de prélèvement sur le compte", jour, habituel ? "Vide = jour habituel tiré des opérations (le " + habituel + ")." : "Vide = étalé sur le mois (pas de jour habituel dans les opérations).")),
    actions: [ligne ? {libelle: "Supprimer la ligne", classe: "danger", action: () => { budget.lignes = budget.lignes.filter(x => x !== ligne); enregistrer("budgets", budget); return true; }} : null,
      {libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Enregistrer", classe: "primaire", action: () => {
        const v = valeurCategorie(cat); if (v.categorie === "À préciser"){ message("Choisissez une catégorie.", true); return false; }
        const a = lireMontant(annuel.value); if (isNaN(a)){ message("Montant illisible.", true); return false; }
        const r = {}; let tr = 0; lieux.forEach((lx, i) => { const x = lireMontant(reps[i].value) || 0; if (x) r[lx] = x / 100; tr += x; });
        const p = ["compte", "cartes", "amex"].map((k, i) => lireMontant(pay[i].value) || 0); const tp = somme(p);
        const prof = profil.value.trim() ? profil.value.trim().split(/[\s;]+/).map(Number) : null;
        if (prof && (prof.length !== 12 || prof.some(isNaN))){ message("Le profil doit compter 12 nombres.", true); return false; }
        const jr = jour.value.trim() ? Number(jour.value.trim()) : null;
        if (jr !== null && !(Number.isInteger(jr) && jr >= 1 && jr <= 31)){ message("Le jour doit être un nombre de 1 à 31.", true); return false; }
        Object.assign(l, v, {logement: logement.checked, nature: nat.value, annuel: a, repartition: tr ? Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x * 100 / tr])) : null,
          paiement: tp ? {compte: p[0] / tp, cartes: p[1] / tp, amex: p[2] / tp} : {compte: 1, cartes: 0, amex: 0}, profil: prof, jour: jr});
        if (!ligne) budget.lignes.push(l);
        enregistrer("budgets", budget); return true;
      }}].filter(Boolean)});
  if (ok) rafraichirEcran();
}
/* ---------- Version imprimable (PDF par « Imprimer », à la charte) ---------- */
// Mois couverts par le profil d'une ligne et jour de prélèvement : « oct. · le 25 », « juil.–déc. » ; vide si 1/12 sans jour.
function echeanceLigne(l){
  const p = poidsMois(l), mois = p.map((x, i) => x > 0 ? i : -1).filter(i => i >= 0);
  let txt = "";
  if (mois.length && mois.length < 12){
    const suite = mois.every((m, i) => !i || m === mois[i - 1] + 1);
    txt = suite && mois.length > 2 ? MOIS_COURT[mois[0]] + "–" + MOIS_COURT[mois[mois.length - 1]] : mois.map(m => MOIS_COURT[m]).join(", ");
  }
  return [txt, l.jour ? "le " + l.jour : ""].filter(Boolean).join(" · ");
}
// Données de la version imprimable : natures › catégories › sous-catégories, totaux, lieux et mois.
function donneesImpressionBudget(budget, an, d1, d2, lieu){
  const lignes = tableauBudget(budget, an, d1, d2, lieu);
  const natures = [];
  for (const nat of [...new Set([...ordreNatures(), ...lignes.map(l => l.nature)])]){
    const ls = lignes.filter(l => l.nature === nat); if (!ls.length) continue;
    const cats = [...new Set(ls.map(l => l.categorie))].sort((a, b) => a.localeCompare(b, "fr")).map(cat => {
      const lc = ls.filter(l => l.categorie === cat).sort((a, b) => a.sousCategorie.localeCompare(b.sousCategorie, "fr"));
      return {categorie: cat, lignes: lc, annuel: somme(lc, l => l.annuel), budget: somme(lc, l => l.budget), realise: somme(lc, l => l.realise)};
    });
    natures.push({nature: nat, categories: cats, annuel: somme(cats, x => x.annuel), budget: somme(cats, x => x.budget), realise: somme(cats, x => x.realise)});
  }
  const parLieu = lieu ? [] : LIVRE.parametres.lieux.map(lx => ({lieu: lx, annuel: somme(budget.lignes, l => l.annuel * partLieu(l, lx))})).filter(x => Math.abs(x.annuel) > 0.5);
  const cats = [...new Set(budget.lignes.map(l => l.categorie))].sort((a, b) => a.localeCompare(b, "fr"));
  const parMois = cats.map(cat => {
    const ls = budget.lignes.filter(l => l.categorie === cat);
    const m = Array.from({length: 12}, (_, i) => somme(ls, l => budgetDuMois(l, i + 1) * partLieu(l, lieu)));
    return {categorie: cat, mois: m, total: somme(m)};
  }).filter(x => Math.abs(x.total) > 0.5);
  const debut = (budget.debut && budget.debut > an + "-" + pad2(d1) + "-01") ? budget.debut : an + "-" + pad2(d1) + "-01", fin = finDeMois(an + "-" + pad2(d2) + "-01");
  const rev = new Map(), cle = (cat, sous, lib) => (cat || "Revenus") + "|" + (sous || lib || "");
  const poste = k => rev.get(k) || rev.set(k, {categorie: k.split("|")[0], poste: k.split("|")[1], prevu: 0, ponctuel: 0, realise: 0, aConfirmer: false}).get(k);
  for (const e of vivants("echeances").filter(x => x.active !== false && x.montant > 0 && !estCapital(x) && x.categorie !== "Transfert")){
    const n = occurrences(e, debut, fin).length; if (!n) continue;
    const x = poste(cle(e.categorie, e.sousCategorie, e.libelle)); x.prevu += e.montant * n; x.aConfirmer = x.aConfirmer || !!e.aConfirmer;
    if (!e.recurrence || e.recurrence === "unique") x.ponctuel += e.montant * n;
  }
  for (const pa of partsPeriode(debut, fin, q => q.nature === "Revenu" && (!lieu || q.lieu === lieu))) poste(cle(pa.categorie, pa.sousCategorie)).realise += pa.montant;
  // Produits de l'épargne : intérêts des livrets virés en janvier, rendement des assurances-vie tenu pour disponible
  // (à l'exercice : produits acquis pendant la période, quelle que soit la date de leur versement)
  const pe = produitsEpargne(aujourdhui()), prorata = (d2 - d1 + 1) / 12;
  if (pe.livrets) Object.assign(poste("Produits de l'épargne|Intérêts des livrets de l'année (virés le 15 janvier suivant)"), {prevu: Math.round(pe.livrets * prorata), calcule: true});
  if (pe.assurancesVie) Object.assign(poste("Produits de l'épargne|Rendement des assurances-vie (disponible, reste sur les contrats)"), {prevu: Math.round(pe.assurancesVie * prorata), calcule: true});
  if (fin > aujourdhui()){
    const ep = simulerEpargne({jours: ecartJours(aujourdhui(), fin)});
    const nouveau = Math.round(somme(ep.evenements.filter(e => e.genre === "rendement" && e.date >= debut && e.date <= fin), e => e.nouveau || 0));
    if (Math.abs(nouveau) > 0.5) Object.assign(poste(nouveau > 0 ? "Produits de l'épargne|Produits financiers du placement des cessions (net des sommes prélevées)"
      : "Produits de l'épargne|Produits financiers perdus sur l'épargne prélevée (projets, déficit), net des cessions"), {prevu: nouveau, calcule: true});
  }
  const revenus = [...rev.values()].filter(x => Math.abs(x.prevu) > 0.5 || Math.abs(x.realise) > 0.5).sort((a, b) => b.prevu - a.prevu || b.realise - a.realise);
  return {natures, parLieu, parMois, revenus, revenusPrevus: somme(revenus, x => x.prevu), revenusPonctuels: somme(revenus, x => x.ponctuel), revenusRealises: somme(revenus, x => x.realise),
    annuel: somme(natures, x => x.annuel), budget: somme(natures, x => x.budget), realise: somme(natures, x => x.realise)};
}
// Résultat en deux temps : courant (récurrents − charges), puis solde de la période avec les revenus ponctuels.
function lignesResultat(d, nbMois){
  const recurrents = d.revenusPrevus - d.revenusPonctuels, courant = recurrents - d.budget, soldeFinal = courant + d.revenusPonctuels;
  const parMois = v => " (" + eurosSigne(Math.round(v / nbMois)) + " par mois)";
  const l = [
    {lib: "Revenus récurrents (pensions, produits de l'épargne)", v: recurrents},
    {lib: "Charges budgétées", v: -d.budget},
    {lib: (courant < 0 ? "Résultat courant : déficit" : "Résultat courant : excédent") + parMois(courant), v: courant, total: true}];
  if (d.revenusPonctuels){
    l.push({lib: "Revenus ponctuels (paie de sortie, restitutions…)", v: d.revenusPonctuels});
    l.push({lib: soldeFinal < 0 ? "Solde de la période : à financer par l'épargne" : "Solde de la période : excédent, à placer", v: soldeFinal, total: true});
  } else if (courant < 0) l[2].lib += ", à financer par l'épargne";
  return {lignes: l, recurrents, courant, soldeFinal};
}
function imprimerBudget(budget, an, d1, d2, lieu, periode){
  const d = donneesImpressionBudget(budget, an, d1, d2, lieu);
  const libPeriode = periode === "annee" || (d1 === 1 && d2 === 12) ? "année " + an : periode === "cumul" ? "du 1er janvier au " + dateFr(finDeMois(an + "-" + pad2(d2) + "-01")) : MOIS_LONG[d1 - 1] + " " + an;
  const annee = d1 === 1 && d2 === 12;
  const e0 = v => euros(v, 0);
  const z = vider(document.getElementById("impression") || document.body.appendChild(h("div", {id: "impression"})));
  z.appendChild(h("header", {class: "imp-tete"}, h("div", {class: "imp-foyer"}, LIVRE.parametres.nomFoyer || "Budget du foyer"), h("h1", null, budget.nom),
    h("div", {class: "imp-soustitre"}, "Budget et réalisé · " + libPeriode + " · " + (lieu ? lieu : "tous lieux") + " · édité le " + dateFr(aujourdhui()))));
  const recurrents = d.revenusPrevus - d.revenusPonctuels, solde = recurrents - d.budget, nbMois = d2 - d1 + 1;
  const chiffres = [["Revenus récurrents", e0(recurrents)], ["Charges budgétées", e0(d.budget)], [solde < 0 ? "Déficit courant" : "Excédent courant", e0(Math.abs(solde))], ["Soit par mois", e0(Math.abs(solde) / nbMois)]];
  z.appendChild(h("div", {class: "imp-chiffres"}, chiffres.map(([l, v], i) => h("div", {class: i === 2 && solde < 0 ? "deficit" : ""}, h("div", {class: "lib"}, l), h("div", {class: "val"}, v)))));
  if (d.realise || d.revenusRealises) z.appendChild(h("p", {class: "imp-note"}, "Réalisé à ce jour : revenus " + e0(d.revenusRealises) + ", charges " + e0(d.realise) + ", solde " + eurosSigne(Math.round(d.revenusRealises - d.realise)) + "."));
  if (d.parLieu.length > 1) z.appendChild(h("div", {class: "imp-lieux-titre"}, "Charges de l'année par lieu"));
  if (d.parLieu.length > 1) z.appendChild(h("table", {class: "imp-lieux"}, h("tbody", null, d.parLieu.map(x => h("tr", null, h("td", null, x.lieu), h("td", {class: "num"}, e0(x.annuel)),
    h("td", {class: "num discret"}, Math.round(x.annuel / (d.annuel || 1) * 100) + " %"))))));
  const cols = annee ? ["Poste", "Échéance", "Budget", "Réalisé", "Écart"] : ["Poste", "Échéance", "Budget annuel", "Budget période", "Réalisé", "Écart"];
  const ligne = (cls, lib, ech, x) => h("tr", {class: cls}, h("td", null, lib), h("td", {class: "ech"}, ech || ""),
    annee ? null : h("td", {class: "num"}, e0(x.annuel)), h("td", {class: "num"}, e0(x.budget)), h("td", {class: "num"}, x.realise ? e0(x.realise) : "—"),
    h("td", {class: "num" + (x.budget - x.realise < -0.5 ? " neg" : "")}, x.realise ? eurosSigne(Math.round(x.budget - x.realise)) : ""));
  const tb = h("tbody");
  for (const n of d.natures){
    tb.appendChild(ligne("imp-nature", n.nature, "", n));
    for (const ca of n.categories){
      tb.appendChild(ligne("imp-cat", ca.categorie, "", ca));
      if (ca.lignes.length > 1 || ca.lignes[0].sousCategorie !== ca.categorie) for (const l of ca.lignes) tb.appendChild(ligne("imp-sous", l.sousCategorie + (l.horsBudget ? " (sans ligne de budget)" : ""), l.ligne ? echeanceLigne(l.ligne) : "", l));
      else tb.lastChild.children[1].textContent = ca.lignes[0].ligne ? echeanceLigne(ca.lignes[0].ligne) : "";
    }
  }
  tb.appendChild(ligne("imp-total", "Total", "", d));
  z.appendChild(h("h2", null, "Charges"));
  z.appendChild(h("table", {class: "imp-budget"}, h("thead", null, h("tr", null, cols.map((x, i) => h("th", {class: i > 1 ? "num" : ""}, x)))), tb));
  z.appendChild(h("h2", null, "Revenus"));
  if (d.revenus.length){
    const tr = h("tbody");
    for (const r of d.revenus) tr.appendChild(h("tr", null, h("td", null, r.poste || r.categorie, r.aConfirmer ? h("span", {class: "discret"}, " (à confirmer)") : null, r.calcule ? h("span", {class: "discret"}, " (estimé)") : null), h("td", {class: "ech"}, r.ponctuel && Math.abs(r.ponctuel - r.prevu) < 0.5 ? "ponctuel" : r.ponctuel ? "dont ponctuel " + e0(r.ponctuel) : "récurrent"),
      h("td", {class: "num"}, r.prevu ? e0(r.prevu) : "—"), h("td", {class: "num"}, r.realise ? e0(r.realise) : "—")));
    tr.appendChild(h("tr", {class: "imp-total"}, h("td", null, "Total des revenus"), h("td"), h("td", {class: "num"}, e0(d.revenusPrevus)), h("td", {class: "num"}, d.revenusRealises ? e0(d.revenusRealises) : "—")));
    z.appendChild(h("table", {class: "imp-budget"}, h("thead", null, h("tr", null, h("th", null, "Revenu"), h("th", null, "Nature"), h("th", {class: "num"}, "Prévu"), h("th", {class: "num"}, "Réalisé"))), tr));
  } else z.appendChild(h("p", {class: "imp-note"}, "Aucun revenu prévu en échéance ni encaissé sur la période."));
  z.appendChild(h("h2", null, "Résultat"));
  z.appendChild(h("table", {class: "imp-budget imp-resultat"}, h("tbody", null, lignesResultat(d, nbMois).lignes.map(x =>
    h("tr", {class: x.total ? "imp-total" : ""}, h("td", null, x.lib), h("td", {class: "num" + (x.v < 0 ? " neg" : "")}, eurosSigne(Math.round(x.v))))))));
  z.appendChild(h("p", {class: "imp-note"}, "Charges : lignes du budget, réalisé à la date d'achat, hors transferts et opérations « Hors budget ». Échéance : mois couverts par la ligne quand elle n'est pas répartie par douzièmes, et jour de prélèvement fixé. "
    + "Revenus : échéances positives de la période (pensions, paie, restitutions), hors cessions de titres et virements depuis l'épargne ; produits de l'épargne estimés aux taux de chaque compte (Réglages) sur les valorisations du jour, "
    + "produits comptés à l'exercice (acquis pendant la période) : intérêts des livrets, virés au compte courant le 15 janvier suivant ; rendement des assurances-vie, laissé sur les contrats mais tenu pour disponible ; produits financiers du placement des cessions (produit des cessions placé au taux des nouveaux placements, net des sommes prélevées sur l'épargne)."));
  const annexe = h("section", {class: "imp-annexe"}, h("h2", null, "Budget mois par mois, par catégorie" + (lieu ? " · " + lieu : "")));
  const tm = h("tbody");
  for (const x of d.parMois) tm.appendChild(h("tr", null, h("td", null, x.categorie), x.mois.map(v => h("td", {class: "num"}, Math.abs(v) < 0.5 ? "" : e0(v))), h("td", {class: "num fort"}, e0(x.total))));
  const totMois = Array.from({length: 12}, (_, i) => somme(d.parMois, x => x.mois[i]));
  tm.appendChild(h("tr", {class: "imp-total"}, h("td", null, "Total"), totMois.map(v => h("td", {class: "num"}, e0(v))), h("td", {class: "num"}, e0(somme(totMois)))));
  annexe.appendChild(h("table", {class: "imp-mois"}, h("thead", null, h("tr", null, h("th", null, "Catégorie"), MOIS_COURT.map(m => h("th", {class: "num"}, m)), h("th", {class: "num"}, "Total"))), tm));
  z.appendChild(annexe);
  const fin = () => { vider(z); window.removeEventListener("afterprint", fin); };
  window.addEventListener("afterprint", fin);
  window.print();
}
function exporterBudget(budget, an, lieu){
  const lignes = [];
  for (let mo = 1; mo <= 12; mo++) for (const l of tableauBudget(budget, an, mo, mo, lieu)) lignes.push([an + "-" + pad2(mo), l.nature, l.categorie, l.sousCategorie, Math.round(l.budget * 100) / 100, Math.round(l.realise * 100) / 100, Math.round((l.budget - l.realise) * 100) / 100]);
  telecharger(ecrireClasseur([{nom: "Budget et réalisé", colonnes: [{titre: "Mois", largeur: 10}, {titre: "Nature", largeur: 22}, {titre: "Catégorie", largeur: 22}, {titre: "Sous-catégorie", largeur: 34},
    {titre: "Budget", type: "euros", largeur: 13}, {titre: "Réalisé", type: "euros", largeur: 13}, {titre: "Écart", type: "euros", largeur: 13}], lignes}]), "budget-realise-" + an + (lieu ? "-" + lieu : "") + ".xlsx");
}
