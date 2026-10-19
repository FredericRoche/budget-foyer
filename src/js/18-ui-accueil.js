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
  c.appendChild(entete("Tableau de bord", moisFr(m) + (dernierImport ? " · dernier import le " + dateFr(dernierImport.date.slice(0, 10)) : " · aucun relevé importé"),
    selecteurMois(etat, rafraichirEcran)));

  const lignes = budget ? tableauBudget(budget, an, mo, mo, "") : [];
  const tb = somme(lignes.filter(l => l.ligne), l => l.budget), tr = somme(lignes, l => l.realise);
  const cumulB = budget ? somme(tableauBudget(budget, an, 1, mo, ""), l => l.budget) : 0;
  const cumulR = budget ? somme(tableauBudget(budget, an, 1, mo, ""), l => l.realise) : 0;
  const sim = simulerTresorerie(); const ana = ETAT_TRESO_CACHE || analyseTresorerie(sim);
  const bil = bilan(aujourdhui()); const bil0 = bilan(an + "-01-01");
  const ind = h("div", {class: "indicateurs"});
  ind.appendChild(h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Dépensé en " + MOIS_LONG[mo - 1]),
    h("div", {class: "val"}, euros(tr, 0)), h("div", {class: "det"}, budget ? "pour un budget de " + euros(tb, 0) : "aucun budget pour " + an),
    h("div", {class: "jauge"}, h("span", {class: tr > tb ? "depasse" : "", style: {width: Math.min(100, tb ? tr / tb * 100 : 0) + "%"}}))));
  ind.appendChild(h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Reste à dépenser"),
    h("div", {class: "val" + (tb - tr < 0 ? " neg" : "")}, euros(tb - tr, 0)),
    h("div", {class: "det"}, "cumul " + an + " : ", h("span", {class: cumulB - cumulR >= 0 ? "pos" : "neg"}, euros(Math.abs(cumulB - cumulR), 0)), cumulB - cumulR >= 0 ? " sous le budget" : " au-dessus du budget")));
  ind.appendChild(h("div", {class: "indicateur" + (ana?.premierBas ? " alerte" : "")}, h("div", {class: "lib"}, "Trésorerie au plus bas (12 mois)"),
    h("div", {class: "val"}, ana ? euros(ana.min.solde, 0) : "—"), h("div", {class: "det"}, ana ? "le " + dateFr(ana.min.date) + " · seuil " + euros(LIVRE.parametres.seuilBas, 0) : "pas de compte de trésorerie")));
  const vc = variationComparable(bil, bil0); const varNet = vc.variation;
  ind.appendChild(h("div", {class: "indicateur"}, h("div", {class: "lib"}, "Patrimoine net"),
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
          res("Revenus récurrents", recurrents), res("Charges budgétées", -d.annuel),
          res(solde < 0 ? "Déficit courant, financé par l'épargne" : "Excédent courant", solde, "total"),
          res("soit par mois", solde / 12),
          d.revenusPonctuels ? res("Revenus ponctuels", d.revenusPonctuels) : null,
          d.revenusPonctuels ? res("Solde de l'année", solde + d.revenusPonctuels, "total") : null)))),
      h("p", {class: "note"}, "Encaissé à ce jour : " + euros(d.revenusRealises, 0) + " de revenus pour " + euros(d.realise, 0) + " de charges. Produits de l'épargne estimés aux taux des comptes (Réglages). Détail et impression : écran Budget, « Version imprimable »."));
    c.appendChild(carteRev);
  }

  const deux = h("div", {class: "deux"});
  const ecarts = lignes.filter(l => l.budget > 0 || l.realise > 0).map(l => Object.assign({}, l, {ecart: l.budget - l.realise})).sort((x, y) => Math.abs(y.ecart) - Math.abs(x.ecart)).slice(0, 6);
  deux.appendChild(h("section", {class: "carte"}, h("h2", null, "Plus forts écarts du mois"),
    tableau([{titre: "Poste"}, {titre: "Budget", num: true}, {titre: "Réalisé", num: true}, {titre: "Écart", num: true}], ecarts, {ligne: l => h("tr", {class: "cliquable", onclick: () => aller("operations", {categorie: l.categorie + "|" + l.sousCategorie, mois: m})},
      h("td", null, l.categorie + " › " + l.sousCategorie, l.horsBudget ? h("span", {class: "petit discret"}, " (hors budget)") : null), h("td", {class: "num"}, euros(l.budget, 0)), h("td", {class: "num"}, euros(l.realise, 0)),
      h("td", {class: "num " + (l.ecart < 0 ? "neg" : "pos")}, eurosSigne(Math.round(l.ecart)))), vide: "Aucune dépense ce mois-ci."})));
  const lieux = LIVRE.parametres.lieux;
  const parLieu = lieux.map(lx => ({lieu: lx, budget: budget ? somme(tableauBudget(budget, an, mo, mo, lx).filter(l => l.ligne), l => l.budget) : 0, realise: budget ? somme(tableauBudget(budget, an, mo, mo, lx), l => l.realise) : 0}));
  deux.appendChild(h("section", {class: "carte"}, h("h2", null, "Répartition du mois : " + lieux.join(", ")), grapheLieux(parLieu), h("p", {class: "note"}, "Budget en clair, réalisé en foncé (garnet en cas de dépassement).")));
  c.appendChild(deux);
}});
