/* ================= Tableau de bord ================= */
function moisCourant(etat){ return etat.mois || aujourdhui().slice(0, 7); }
function selecteurMois(etat, apres){
  const m = moisCourant(etat);
  const prec = ajouterMois(m + "-01", -1).slice(0, 7), suiv = ajouterMois(m + "-01", 1).slice(0, 7);
  return h("div", {class: "segments"},
    h("button", {onclick: () => { etat.mois = prec; apres(); }}, "‹ " + MOIS_COURT[+prec.slice(5) - 1]),
    h("button", {class: "choisi"}, MOIS_LONG[+m.slice(5) - 1] + " " + m.slice(0, 4)),
    h("button", {onclick: () => { etat.mois = suiv; apres(); }}, MOIS_COURT[+suiv.slice(5) - 1] + " ›"));
}

declarerEcran("accueil", {titre: "Tableau de bord", rendre(c, etat){
  const m = moisCourant(etat); const an = +m.slice(0, 4), mo = +m.slice(5, 7);
  const budget = budgetActif(an);
  const dernierImport = vivants("imports").sort((a, b) => a.date < b.date ? 1 : -1)[0];
  const annee = etat.vue === "annee";
  c.appendChild(entete("Tableau de bord", (annee ? "Année " + an : moisFr(m)) + (dernierImport ? " · dernier import le " + dateFr(dernierImport.date.slice(0, 10)) : " · aucun relevé importé"),
    [segments([["mois", "Mois"], ["annee", "Année"]], annee ? "annee" : "mois", v => { etat.vue = v; rafraichirEcran(); }), selecteurMois(etat, rafraichirEcran),
     annee && budget ? h("button", {class: "discret", onclick: () => imprimerSynthese(budget, an)}, "Synthèse imprimable") : null]));

  const lignes = budget ? tableauBudget(budget, an, mo, mo, "") : [];
  const tb = somme(lignes.filter(l => l.ligne), l => l.budget), tr = somme(lignes, l => l.realise);
  const cumulB = budget ? somme(tableauBudget(budget, an, 1, mo, ""), l => l.budget) : 0;
  const cumulR = budget ? somme(tableauBudget(budget, an, 1, mo, ""), l => l.realise) : 0;
  const sim = simulerTresorerie(); const ana = ETAT_TRESO_CACHE || analyseTresorerie(sim);
  const bil = bilan(aujourdhui()); const bil0 = bilan(an + "-01-01");
  const ind = h("div", {class: "indicateurs"});
  if (annee && budget){
    const dA = donneesImpressionBudget(budget, an, 1, 12, ""), rA = lignesResultat(dA, 12);
    ind.appendChild(h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Charges " + an), h("div", {class: "val"}, euros(dA.budget, 0)),
      h("div", {class: "det"}, "réalisé au " + dateCourte(finDeMois(m + "-01")) + " : " + euros(cumulR, 0) + " pour " + euros(cumulB, 0) + " budgétés"),
      h("div", {class: "jauge"}, h("span", {class: cumulR > cumulB ? "depasse" : "", style: {width: Math.min(100, cumulB ? cumulR / cumulB * 100 : 0) + "%"}}))));
    ind.appendChild(h("div", {class: "indicateur" + (rA.courant < 0 ? " attention" : "")}, h("div", {class: "lib"}, "Résultat courant " + an),
      h("div", {class: "val" + (rA.courant < 0 ? " neg" : "")}, eurosSigne(Math.round(rA.courant))),
      h("div", {class: "det"}, eurosSigne(Math.round(rA.courant / 12)) + " par mois · solde de l'année " + eurosSigne(Math.round(rA.soldeFinal)))));
  } else {
  ind.appendChild(h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Dépensé en " + MOIS_LONG[mo - 1]),
    h("div", {class: "val"}, euros(tr, 0)), h("div", {class: "det"}, budget ? "pour un budget de " + euros(tb, 0) : "aucun budget pour " + an),
    h("div", {class: "jauge"}, h("span", {class: tr > tb ? "depasse" : "", style: {width: Math.min(100, tb ? tr / tb * 100 : 0) + "%"}}))));
  ind.appendChild(h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Reste à dépenser"),
    h("div", {class: "val" + (tb - tr < 0 ? " neg" : "")}, euros(tb - tr, 0)),
    h("div", {class: "det"}, "cumul " + an + " : ", h("span", {class: cumulB - cumulR >= 0 ? "pos" : "neg"}, euros(Math.abs(cumulB - cumulR), 0)), cumulB - cumulR >= 0 ? " sous le budget" : " au-dessus du budget")));
  }
  ind.appendChild(h("div", {class: "indicateur" + (ana?.premierBas ? " alerte" : "")}, h("div", {class: "lib"}, "Trésorerie au plus bas (12 mois)"),
    h("div", {class: "val"}, ana ? euros(ana.min.solde, 0) : "—"), h("div", {class: "det"}, ana ? "le " + dateFr(ana.min.date) + " · seuil " + euros(LIVRE.parametres.seuilBas, 0) : "pas de compte de trésorerie")));
  const vc = variationComparable(bil, bil0); const varNet = vc.variation;
  ind.appendChild(h("div", {class: "indicateur"}, h("div", {class: "lib"}, libellePatrimoine(bil)),
    h("div", {class: "val"}, bil.total >= 1e6 ? nombre(bil.total / 1e6) + " M€" : euros(bil.total, 0)),
    h("div", {class: "det"}, h("span", {class: varNet < 0 ? "neg" : "pos"}, eurosSigne(Math.round(varNet))), " depuis le 1er janvier" + (vc.exclus ? " (périmètre comparable)" : ""))));
  c.appendChild(ind);

  const a = compteATraiter();
  const grille = h("div", {class: "large-etroit"});
  const carteTreso = h("section", {class: "carte"}, h("h2", null, "Trésorerie de " + (sim ? sim.compte.nom : "—") + ", 12 mois"));
  if (sim) carteTreso.append(grapheTresorerie(sim, ana, 230, true), h("div", {class: "legende"},
    h("span", null, h("i", {style: {background: COULEURS.vert}}), "solde projeté"), h("span", null, h("i", {style: {background: COULEURS.garnet, height: "2px"}}), "seuil bas"),
    h("span", null, h("i", {style: {background: "repeating-linear-gradient(90deg,#6F8678 0 4px,transparent 4px 7px)", height: "2px"}}), "seuil haut")));
  else carteTreso.appendChild(h("p", {class: "vide"}, "Indiquez le compte de trésorerie dans les Réglages."));
  const li = (n, texte, ecran, bouton) => n ? h("li", null, h("span", null, h("span", {class: "compte-traiter"}, String(n)), " " + texte), h("button", {class: "mini", onclick: () => aller(ecran)}, bouton)) : null;
  const autos = vivants("justificatifs").filter(j => j.auto && !j.vu).length;
  const listeT = h("ul", {class: "liste-traiter"}, li(a.ops, "opération(s) à classer", "traiter", "Classer"), li(a.js, "justificatif(s) à rapprocher", "justificatifs", "Ouvrir"),
    li(BOITE_CACHE.length, "saisie(s) dans la boîte du téléphone", "boite", "Fusionner"), li(a.factures, "écart(s) de facture de cartes", "traiter", "Voir"),
    li(a.echeances, "échéance(s) à confirmer", "tresorerie", "Voir"), li(ana?.premierBas ? 1 : 0, "alerte de trésorerie", "tresorerie", "Voir"));
  if (!listeT.children.length) listeT.appendChild(h("li", null, h("span", {class: "discret"}, "Rien en attente.")));
  grille.append(carteTreso, h("section", {class: "carte"}, h("h2", null, "À traiter"), listeT,
    autos ? h("p", {class: "note"}, autos + " rapprochement(s) fait(s) d'office, réversibles (« À traiter »).") : null));
  c.appendChild(grille);

  // Revenus et résultat de l'année : mêmes chiffres que la version imprimable du budget
  if (budget){
    const d = donneesImpressionBudget(budget, an, 1, 12, "");
    const recurrents = d.revenusPrevus - d.revenusPonctuels, solde = recurrents - d.annuel;
    const nature = r => r.ponctuel && Math.abs(r.ponctuel - r.prevu) < 0.5 ? "ponctuel" : "récurrent";
    const res = (lib, v, cls) => h("tr", {class: cls || ""}, h("td", null, lib), h("td", {class: "num" + (v < 0 ? " neg" : "")}, typeof v === "number" ? eurosSigne(Math.round(v)) : v));
    const carteRev = h("section", {class: "carte"}, h("h2", null, "Revenus et résultat " + an),
      h("div", {class: "deux-colonnes"},
        tableau([{titre: "Revenu"}, {titre: "Nature"}, {titre: "Prévu " + an, num: true}, {titre: "Encaissé", num: true}], d.revenus, {classe: "serre", vide: "Aucun revenu prévu.", ligne: r => h("tr", null,
          h("td", null, r.poste || r.categorie, r.aConfirmer ? h("span", {class: "petit discret"}, " (à confirmer)") : null, r.calcule ? h("span", {class: "petit discret"}, " (estimé)") : null),
          h("td", {class: "discret"}, nature(r)), h("td", {class: "num"}, euros(r.prevu, 0)), h("td", {class: "num"}, r.realise ? euros(r.realise, 0) : "—"))}),
        h("div", {class: "tableau"}, h("table", {class: "serre"}, h("tbody", null,
          lignesResultat(d, 12).lignes.map(x => res(x.lib, x.v, x.total ? "total" : "")))))),
      h("p", {class: "note"}, "Encaissé à ce jour : " + euros(d.revenusRealises, 0) + " de revenus pour " + euros(d.realise, 0) + " de charges. Produits de l'épargne estimés aux taux des comptes (Réglages). Détail et impression : écran Budget, « Version imprimable »."));
    c.appendChild(carteRev);
  }

  const deux = h("div", {class: "deux"});
  if (annee && budget){
    const aDate = tableauBudget(budget, an, 1, mo, ""), anL = tableauBudget(budget, an, 1, 12, "");
    const cats = [...new Set(anL.map(l => l.categorie))].map(cat => ({categorie: cat, annuel: somme(anL.filter(l => l.categorie === cat), l => l.annuel),
      budget: somme(aDate.filter(l => l.categorie === cat), l => l.budget), realise: somme(aDate.filter(l => l.categorie === cat), l => l.realise)}))
      .filter(x => Math.abs(x.annuel) > 0.5 || Math.abs(x.realise) > 0.5).sort((a, b) => b.annuel - a.annuel);
    deux.appendChild(h("section", {class: "carte"}, h("h2", null, "Charges par catégorie, " + an),
      tableau([{titre: "Catégorie"}, {titre: "Budget " + an, num: true}, {titre: "Budget au " + dateCourte(finDeMois(m + "-01")), num: true}, {titre: "Réalisé", num: true}, {titre: "Écart", num: true}], cats, {classe: "serre", ligne: x => h("tr", null,
        h("td", null, x.categorie), h("td", {class: "num"}, euros(x.annuel, 0)), h("td", {class: "num"}, euros(x.budget, 0)), h("td", {class: "num"}, euros(x.realise, 0)),
        h("td", {class: "num " + (x.budget - x.realise < 0 ? "neg" : "pos")}, eurosSigne(Math.round(x.budget - x.realise))))})));
  } else {
  const ecarts = lignes.filter(l => l.budget > 0 || l.realise > 0).map(l => Object.assign({}, l, {ecart: l.budget - l.realise})).sort((x, y) => Math.abs(y.ecart) - Math.abs(x.ecart)).slice(0, 6);
  deux.appendChild(h("section", {class: "carte"}, h("h2", null, "Plus forts écarts du mois"),
    tableau([{titre: "Poste"}, {titre: "Budget", num: true}, {titre: "Réalisé", num: true}, {titre: "Écart", num: true}], ecarts, {ligne: l => h("tr", {class: "cliquable", onclick: () => aller("operations", {categorie: l.categorie + "|" + l.sousCategorie, mois: m})},
      h("td", null, l.categorie + " › " + l.sousCategorie, l.horsBudget ? h("span", {class: "petit discret"}, " (hors budget)") : null), h("td", {class: "num"}, euros(l.budget, 0)), h("td", {class: "num"}, euros(l.realise, 0)),
      h("td", {class: "num " + (l.ecart < 0 ? "neg" : "pos")}, eurosSigne(Math.round(l.ecart)))), vide: "Aucune dépense ce mois-ci."})));
  }
  const lieux = LIVRE.parametres.lieux;
  const [p1, p2] = annee ? [1, 12] : [mo, mo];
  const parLieu = lieux.map(lx => ({lieu: lx, budget: budget ? somme(tableauBudget(budget, an, p1, p2, lx).filter(l => l.ligne), l => l.budget) : 0, realise: budget ? somme(tableauBudget(budget, an, p1, p2, lx), l => l.realise) : 0}));
  deux.appendChild(h("section", {class: "carte"}, h("h2", null, (annee ? "Répartition de l'année : " : "Répartition du mois : ") + lieux.join(", ")), grapheLieux(parLieu), h("p", {class: "note"}, "Budget en clair, réalisé en foncé (garnet en cas de dépassement).")));
  c.appendChild(deux);
}});

// Sans bien immobilier valorisé, le patrimoine affiché n'est que financier : on le dit.
function libellePatrimoine(bil){
  const immo = bil.rubriques.some(r => r.lignes.some(l => l.compte.type === "immobilier" && l.valeur));
  return immo ? "Patrimoine net" : "Patrimoine financier net";
}
/* ---------- Synthèse annuelle imprimable : pour des conseils, sans le détail ----------
   Charges par catégorie, revenus regroupés, résultat, épargne et patrimoine ; aucun fournisseur, sous-catégorie ni numéro de compte. */
function imprimerSynthese(budget, an){
  const d = donneesImpressionBudget(budget, an, 1, 12, ""), r = lignesResultat(d, 12), e0 = v => euros(v, 0);
  const z = vider(document.getElementById("impression") || document.body.appendChild(h("div", {id: "impression"})));
  z.appendChild(h("header", {class: "imp-tete"}, h("div", {class: "imp-foyer"}, LIVRE.parametres.nomFoyer || "Budget du foyer"), h("h1", null, "Synthèse " + an),
    h("div", {class: "imp-soustitre"}, "Revenus, charges, épargne et patrimoine · édité le " + dateFr(aujourdhui()) + " · montants annuels, estimations à la date d'édition")));
  z.appendChild(h("div", {class: "imp-chiffres"}, [["Revenus récurrents", e0(r.recurrents)], ["Charges", e0(d.budget)], ["Résultat courant", eurosSigne(Math.round(r.courant))], ["Par mois", eurosSigne(Math.round(r.courant / 12))]]
    .map(([l, v], i) => h("div", {class: i === 2 && r.courant < 0 ? "deficit" : ""}, h("div", {class: "lib"}, l), h("div", {class: "val"}, v)))));
  // Revenus regroupés
  const grp = new Map();
  for (const x of d.revenus){
    const g = x.categorie === "Produits de l'épargne" ? "Produits de l'épargne (estimés)" : x.ponctuel && Math.abs(x.ponctuel - x.prevu) < 0.5 ? "Revenus ponctuels" : /pension|retraite/i.test(x.poste) ? "Pensions de retraite" : "Autres revenus récurrents";
    grp.set(g, (grp.get(g) || 0) + x.prevu);
  }
  z.appendChild(h("h2", null, "Revenus"));
  z.appendChild(h("table", {class: "imp-budget imp-resultat"}, h("tbody", null, [...grp].sort((a, b) => b[1] - a[1]).map(([g, v]) => h("tr", null, h("td", null, g), h("td", {class: "num"}, e0(v)))),
    h("tr", {class: "imp-total"}, h("td", null, "Total des revenus"), h("td", {class: "num"}, e0(d.revenusPrevus))))));
  // Charges par catégorie
  const cats = new Map();
  for (const n of d.natures) for (const ca of n.categories) cats.set(ca.categorie, (cats.get(ca.categorie) || 0) + ca.annuel);
  const lc = [...cats].filter(x => Math.abs(x[1]) > 0.5).sort((a, b) => b[1] - a[1]);
  z.appendChild(h("h2", null, "Charges par catégorie"));
  z.appendChild(h("table", {class: "imp-budget"}, h("thead", null, h("tr", null, h("th", null, "Catégorie"), h("th", {class: "num"}, "Budget " + an), h("th", {class: "num"}, "Part"))),
    h("tbody", null, lc.map(([cat, v]) => h("tr", null, h("td", null, cat), h("td", {class: "num"}, e0(v)), h("td", {class: "num discret"}, Math.round(v / (d.budget || 1) * 100) + " %"))),
      h("tr", {class: "imp-total"}, h("td", null, "Total des charges"), h("td", {class: "num"}, e0(d.budget)), h("td")))));
  if (d.parLieu.length > 1) z.appendChild(h("p", {class: "imp-note"}, "Par lieu : " + d.parLieu.map(x => x.lieu + " " + e0(x.annuel) + " (" + Math.round(x.annuel / (d.annuel || 1) * 100) + " %)").join(", ") + "."));
  z.appendChild(h("h2", null, "Résultat"));
  z.appendChild(h("table", {class: "imp-budget imp-resultat"}, h("tbody", null, r.lignes.map(x => h("tr", {class: x.total ? "imp-total" : ""}, h("td", null, x.lib), h("td", {class: "num" + (x.v < 0 ? " neg" : "")}, eurosSigne(Math.round(x.v))))))));
  // Épargne et patrimoine
  const ep = simulerEpargne(), dec = decompositionEpargne(ep), bil = bilan(aujourdhui());
  z.appendChild(h("h2", null, "Épargne disponible et patrimoine"));
  const lignesEp = [["Épargne disponible au " + dateFr(ep.depart), dec.depart, true], ["Cessions de titres prévues (12 mois)", dec.cessions], ["Projets (nets des reprises)", dec.projets],
    ["Prélèvements pour le compte courant", dec.courant], ["Rendement estimé des placements", dec.rendement], ["Épargne disponible dans 12 mois", dec.fin, true]].filter(x => x[2] || Math.abs(x[1]) > 0.5);
  z.appendChild(h("table", {class: "imp-budget imp-resultat"}, h("tbody", null, lignesEp.map(([l, v, tot]) => h("tr", {class: tot ? "imp-total" : ""}, h("td", null, l), h("td", {class: "num"}, tot ? e0(v) : eurosSigne(Math.round(v))))))));
  z.appendChild(h("table", {class: "imp-budget imp-resultat"}, h("tbody", null,
    bil.rubriques.map(rb => { const v = somme(rb.lignes.filter(l => l.valeur !== null), l => l.valeur); return Math.abs(v) > 0.5 ? h("tr", null, h("td", null, rb.titre), h("td", {class: "num"}, e0(v))) : null; }),
    h("tr", {class: "imp-total"}, h("td", null, libellePatrimoine(bil) + " au " + dateFr(bil.date)), h("td", {class: "num"}, e0(bil.total))))));
  z.appendChild(h("p", {class: "imp-note"}, "Valeurs brutes, sans fiscalité latente. Revenus : pensions et autres revenus prévus ; produits de l'épargne estimés aux taux retenus, comptés à l'exercice. "
    + "Charges : budget de l'année. Épargne disponible : livrets, assurances-vie, épargne retraite et PEA, à leur dernière valorisation. Patrimoine : dernières valeurs connues de tous les comptes" + (libellePatrimoine(bil) === "Patrimoine net" ? "." : ", hors biens immobiliers.")));
  const fin = () => { vider(z); window.removeEventListener("afterprint", fin); };
  window.addEventListener("afterprint", fin);
  window.print();
}
