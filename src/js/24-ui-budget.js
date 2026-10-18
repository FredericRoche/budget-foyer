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
    selecteurMois(etat, rafraichirEcran),
    budgets.length > 1 ? selection(budgets.map(b => [b.id, b.nom]), budget?.id, {onchange: e => { etat.budget = e.target.value; rafraichirEcran(); }}) : null,
    budget ? h("button", {class: "discret", onclick: () => exporterBudget(budget, an, lieu)}, "Exporter en Excel") : null,
    budget && !budget.fige ? h("button", {class: "discret", onclick: () => editerLigne(budget, null)}, "Ajouter une ligne") : null,
    budget && !budgetActif(an + 1) ? h("button", {class: "discret", onclick: async () => {
      if (!(await confirmer("Créer le budget " + (an + 1) + " en copiant « " + budget.nom + " » ? Vous l'ajusterez ensuite ligne par ligne.", "Copier"))) return;
      const b = enregistrer("budgets", {annee: an + 1, nom: "Budget " + (an + 1) + " (copie de " + an + ")", fige: false, actif: true, lignes: JSON.parse(JSON.stringify(budget.lignes)).map(l => Object.assign(l, {id: "lb-" + idAleatoire(8)}))});
      etat.mois = (an + 1) + "-01"; etat.budget = b.id; rafraichirEcran();
    }}, "Copier pour " + (an + 1)) : null]));
  if (!budget){ c.appendChild(h("p", {class: "vide"}, "Reprenez le budget depuis le classeur d'inventaire (écran Importer), ou copiez celui d'une autre année (Réglages).")); return; }
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

async function editerLigne(budget, ligne){
  const l = ligne || {id: "lb-" + idAleatoire(8), nature: "Courante", categorie: "", sousCategorie: "", annuel: 0, paiement: {compte: 1, cartes: 0, amex: 0}};
  const cat = selectionCategorie(l.categorie, l.sousCategorie);
  const nat = selectionNature(l.nature);
  const annuel = h("input", {type: "text", value: nombre(l.annuel)});
  const lieux = LIVRE.parametres.lieux;
  const reps = lieux.map(lx => h("input", {type: "text", value: nombre(Math.round(((l.repartition || {})[lx] ?? (lx === "Autres" && !l.repartition ? 1 : 0)) * 100), 0), style: {width: "4.5rem"}}));
  const pay = ["compte", "cartes", "amex"].map(k => h("input", {type: "text", value: nombre(Math.round((l.paiement?.[k] || 0) * 100), 0), style: {width: "4.5rem"}}));
  const profil = h("input", {type: "text", value: Array.isArray(l.profil) ? l.profil.join(" ") : "", placeholder: "vide = 1/12 par mois ; sinon 12 poids, ex. 0 0 0 0 0 0 0 0 0 1 0 0"});
  const ok = await dialogue({titre: ligne ? "Modifier la ligne" : "Nouvelle ligne de budget", large: true, corps: h("div", null,
    h("div", {class: "grille-champs"}, champ("Catégorie", cat), champ("Nature", nat), champ("Montant annuel", annuel)),
    h("label", null, "Répartition par lieu (%)"), h("div", {class: "outils", style: {marginBottom: ".6rem"}}, lieux.map((lx, i) => h("span", null, lx + " ", reps[i]))),
    h("label", null, "Mode de paiement (%), pour la trésorerie"), h("div", {class: "outils", style: {marginBottom: ".6rem"}}, h("span", null, "compte ", pay[0]), h("span", null, "cartes LCL ", pay[1]), h("span", null, "Amex ", pay[2])),
    champ("Profil mensuel", profil, "Par exemple pour une taxe payée en octobre : 0 0 0 0 0 0 0 0 0 1 0 0.")),
    actions: [ligne ? {libelle: "Supprimer la ligne", classe: "danger", action: () => { budget.lignes = budget.lignes.filter(x => x !== ligne); enregistrer("budgets", budget); return true; }} : null,
      {libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Enregistrer", classe: "primaire", action: () => {
        const v = valeurCategorie(cat); if (v.categorie === "À préciser"){ message("Choisissez une catégorie.", true); return false; }
        const a = lireMontant(annuel.value); if (isNaN(a)){ message("Montant illisible.", true); return false; }
        const r = {}; let tr = 0; lieux.forEach((lx, i) => { const x = lireMontant(reps[i].value) || 0; if (x) r[lx] = x / 100; tr += x; });
        const p = ["compte", "cartes", "amex"].map((k, i) => lireMontant(pay[i].value) || 0); const tp = somme(p);
        const prof = profil.value.trim() ? profil.value.trim().split(/[\s;]+/).map(Number) : null;
        if (prof && (prof.length !== 12 || prof.some(isNaN))){ message("Le profil doit compter 12 nombres.", true); return false; }
        Object.assign(l, v, {nature: nat.value, annuel: a, repartition: tr ? Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x * 100 / tr])) : null,
          paiement: tp ? {compte: p[0] / tp, cartes: p[1] / tp, amex: p[2] / tp} : {compte: 1, cartes: 0, amex: 0}, profil: prof});
        if (!ligne) budget.lignes.push(l);
        enregistrer("budgets", budget); return true;
      }}].filter(Boolean)});
  if (ok) rafraichirEcran();
}
function exporterBudget(budget, an, lieu){
  const lignes = [];
  for (let mo = 1; mo <= 12; mo++) for (const l of tableauBudget(budget, an, mo, mo, lieu)) lignes.push([an + "-" + pad2(mo), l.nature, l.categorie, l.sousCategorie, Math.round(l.budget * 100) / 100, Math.round(l.realise * 100) / 100, Math.round((l.budget - l.realise) * 100) / 100]);
  telecharger(ecrireClasseur([{nom: "Budget et réalisé", colonnes: [{titre: "Mois", largeur: 10}, {titre: "Nature", largeur: 22}, {titre: "Catégorie", largeur: 22}, {titre: "Sous-catégorie", largeur: 34},
    {titre: "Budget", type: "euros", largeur: 13}, {titre: "Réalisé", type: "euros", largeur: 13}, {titre: "Écart", type: "euros", largeur: 13}], lignes}]), "budget-realise-" + an + (lieu ? "-" + lieu : "") + ".xlsx");
}
