/* ================= Bilan et compte de résultat ================= */
declarerEcran("patrimoine", {titre: "Bilan et résultat", rendre(c, etat){
  const date = etat.date || aujourdhui();
  const an = +date.slice(0, 4); const debut = an + "-01-01";
  const ref = ajouterJours(debut, -1);
  const b1 = bilan(date), b0 = bilan(ref);
  const dateSel = champDate({value: date, onchange: e => { etat.date = e.target.value || aujourdhui(); rafraichirEcran(); }});
  c.appendChild(entete("Bilan et compte de résultat", "Bilan au " + dateFr(date) + " · résultat du 1er janvier au " + dateFr(date), [dateSel,
    h("button", {class: "discret", onclick: () => saisirValorisation()}, "Saisir une valorisation"),
    h("button", {class: "discret", onclick: () => exporterPatrimoine(b1, b0, date)}, "Exporter en Excel")]));
  const g = h("div", {class: "deux bilan"});

  /* Bilan */
  const tb = h("tbody");
  const valeur0 = new Map(); for (const r of b0.rubriques) for (const l of r.lignes) valeur0.set(l.compte.id, l.valeur);
  for (const r of b1.rubriques){
    tb.appendChild(h("tr", {class: "groupe"}, h("td", {colspan: 5}, r.titre)));
    for (const l of r.lignes){
      const v0 = valeur0.get(l.compte.id) ?? null;
      tb.appendChild(h("tr", {class: "cliquable", onclick: () => saisirValorisation(l.compte)}, h("td", {class: "retrait"}, l.compte.nom, l.compte.titulaire ? h("span", {class: "libbanque"}, l.compte.titulaire) : null),
        h("td", {class: "petit discret"}, l.source), h("td", {class: "num" + (l.valeur < 0 ? " neg" : "")}, l.valeur === null ? "—" : euros(l.valeur, 0)),
        h("td", {class: "num" + (v0 < 0 ? " neg" : "")}, v0 === null ? "—" : euros(v0, 0)),
        h("td", {class: "num" + ((l.valeur ?? 0) - (v0 ?? 0) < 0 ? " neg" : "")}, l.valeur === null || v0 === null || Math.abs(l.valeur - v0) < 0.5 ? "—" : eurosSigne(Math.round(l.valeur - v0)))));
    }
  }
  const vc = variationComparable(b1, b0);
  tb.appendChild(h("tr", {class: "total"}, h("td", {colspan: 2}, "Patrimoine net"), h("td", {class: "num"}, euros(b1.total, 0)), h("td", {class: "num"}, euros(b0.total, 0)),
    h("td", {class: "num " + (vc.variation < 0 ? "neg" : "pos")}, eurosSigne(Math.round(vc.variation)))));
  if (vc.exclus) tb.appendChild(h("tr", null, h("td", {colspan: 5, class: "petit discret"}, "Variation à périmètre comparable : " + vc.exclus + " poste(s) sans valeur au " + dateFr(ref) + " exclu(s).")));
  g.appendChild(h("section", null, h("h2", null, "Bilan du foyer"), h("div", {class: "tableau"}, h("table", null, h("thead", null, h("tr", null, h("th", null, "Poste"), h("th", null, "Source"),
    h("th", {class: "num"}, dateFr(date)), h("th", {class: "num"}, dateFr(ref)), h("th", {class: "num"}, "Variation"))), tb)),
    h("p", {class: "note"}, "Comptes : dernier solde relevé, plus les opérations importées depuis. Cartes : achats non encore débités (dette). Placements et biens : dernière valorisation lue dans un relevé ou saisie, avec sa date. Un clic sur une ligne permet de saisir une valeur.")));

  /* Résultat */
  const res = resultat(debut, date);
  const budget = budgetActif(an);
  const moisFin = +date.slice(5, 7);
  const budgetPeriode = budget ? tableauBudget(budget, an, 1, moisFin, "") : [];
  const budgetAn = budget ? tableauBudget(budget, an, 1, 12, "") : [];
  const tr = h("tbody");
  const ligneNature = (n, montant, bp, ba) => h("tr", null, h("td", {class: "retrait"}, n), montantCellule(Math.round(montant), null, 0), h("td", {class: "num"}, bp === null ? "—" : eurosSigne(Math.round(bp))), h("td", {class: "num"}, ba === null ? "—" : eurosSigne(Math.round(ba))));
  const revenus = res.parNature.get("Revenu") || new Map();
  const echRevenus = vivants("echeances").filter(e => e.montant > 0 && e.categorie === "Revenus");
  const revenusPrevus = (fin2) => somme(echRevenus.flatMap(e => occurrences(e, debut, fin2).map(() => e.montant)));
  tr.appendChild(h("tr", {class: "groupe"}, h("td", {colspan: 4}, "Revenus")));
  for (const [k, v] of revenus) tr.appendChild(ligneNature(k, v, null, null));
  if (!revenus.size) tr.appendChild(h("tr", null, h("td", {class: "retrait discret", colspan: 4}, "Aucun revenu enregistré.")));
  tr.appendChild(h("tr", null, h("td", {class: "retrait discret"}, "Revenus prévus aux échéances"), h("td"), h("td", {class: "num discret"}, eurosSigne(Math.round(revenusPrevus(date)))), h("td", {class: "num discret"}, eurosSigne(Math.round(revenusPrevus(an + "-12-31"))))));
  tr.appendChild(h("tr", {class: "groupe"}, h("td", {colspan: 4}, "Dépenses")));
  for (const n of ordreNatures()){
    const m = res.parNature.get(n);
    const total = m ? somme([...m.values()]) : 0;
    const bp = -somme(budgetPeriode.filter(l => l.nature === n && l.ligne), l => l.budget), ba = -somme(budgetAn.filter(l => l.nature === n && l.ligne), l => l.budget);
    if (!total && !bp) continue;
    tr.appendChild(ligneNature(n, total, budget ? bp : null, budget ? ba : null));
  }
  const echExcept = vivants("echeances").filter(e => e.montant < 0 && e.nature === "Exceptionnelle");
  if (echExcept.length) tr.appendChild(h("tr", null, h("td", {class: "retrait discret"}, "Exceptionnelles prévues aux échéances"), h("td"), h("td", {class: "num discret"}, eurosSigne(Math.round(somme(echExcept.flatMap(e => occurrences(e, debut, date).map(() => e.montant)))))),
    h("td", {class: "num discret"}, eurosSigne(Math.round(somme(echExcept.flatMap(e => occurrences(e, debut, an + "-12-31").map(() => e.montant))))))));
  tr.appendChild(h("tr", {class: "groupe"}, h("td", {colspan: 4}, "Hors résultat, pour mémoire")));
  tr.appendChild(h("tr", null, h("td", {class: "retrait discret"}, h("em", null, "Versements d'épargne")), h("td", {class: "num discret"}, euros(res.memo.epargne, 0)), h("td"), h("td")));
  tr.appendChild(h("tr", null, h("td", {class: "retrait discret"}, h("em", null, "Cessions de titres (conversion d'actif)")), h("td", {class: "num discret"}, euros(res.memo.cessions, 0)), h("td"), h("td")));
  tr.appendChild(h("tr", {class: "total"}, h("td", null, "Résultat"), montantCellule(Math.round(res.total), null, 0), h("td"), h("td")));
  const pv = plusValuesLatentes(debut, date);
  const ecart = vc.variation - res.total - pv;
  tr.appendChild(h("tr", null, h("td", {colspan: 4, class: "petit"}, "Contrôle : variation du patrimoine net (" + eurosSigne(Math.round(vc.variation)) + ") = résultat (" + eurosSigne(Math.round(res.total)) +
    ") + variations de valeur des placements (" + eurosSigne(Math.round(pv)) + ")", Math.abs(ecart) < 50 ? h("span", {class: "pos"}, " ✓") : h("span", {class: "neg"}, " ; écart à expliquer : " + eurosSigne(Math.round(ecart)) + " (valorisations manquantes, versements non rattachés, relevés à importer)"))));
  g.appendChild(h("section", null, h("h2", null, "Compte de résultat par nature"), h("div", {class: "tableau"}, h("table", null, h("thead", null, h("tr", null, h("th", null, "Nature"), h("th", {class: "num"}, "Réalisé"),
    h("th", {class: "num"}, "Budget à date"), h("th", {class: "num"}, "Budget " + an))), tr)),
    h("p", {class: "note"}, "Lecture budgétaire : travaux et voiture comptés en charges exceptionnelles de l'année (réglage retenu le 17/10/2026). Transferts entre comptes et versements d'épargne hors résultat.")));
  c.appendChild(g);
}});

async function saisirValorisation(compte){
  const comptes = vivants("comptes").filter(c => !["courant", "carte", "especes"].includes(c.type));
  const sel = selection(comptes.map(c => [c.id, c.nom]), compte?.id || comptes[0]?.id);
  const date = champDate({value: aujourdhui()});
  const valeur = h("input", {type: "text", placeholder: "ex. 612 400"});
  const corps = h("div");
  if (compte && ["courant", "carte", "especes"].includes(compte.type)){ corps.appendChild(h("p", null, "Le solde de « " + compte.nom + " » vient des relevés importés.")); await dialogue({titre: compte.nom, corps}); return; }
  corps.append(comptes.length ? null : h("p", {class: "neg"}, "Créez d'abord le compte (Réglages › Comptes)."), h("div", {class: "grille-champs"}, champ("Compte", sel), champ("Date", date), champ("Valeur", valeur)),
    h("p", {class: "note"}, "Plus simple : déposez le relevé PDF dans « Importer », la valeur et la date y sont lues."));
  const ok = await dialogue({titre: "Saisir une valorisation", corps, actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Enregistrer", classe: "primaire", action: () => {
    const v = lireMontant(valeur.value); if (isNaN(v)){ message("Valeur illisible.", true); return false; }
    if (!dateSaisieOk(date, "Date de la valorisation")) return false;
    enregistrer("valorisations", {compte: sel.value, date: date.value, valeur: v, source: ""}); return true;
  }}]});
  if (ok) rafraichirEcran();
}
function exporterPatrimoine(b1, b0, date){
  const v0 = new Map(); for (const r of b0.rubriques) for (const l of r.lignes) v0.set(l.compte.id, l.valeur);
  const lignes = b1.rubriques.flatMap(r => r.lignes.map(l => [r.titre, l.compte.nom, l.source, l.valeur, v0.get(l.compte.id) ?? null]));
  telecharger(ecrireClasseur([{nom: "Bilan", colonnes: [{titre: "Rubrique", largeur: 24}, {titre: "Poste", largeur: 34}, {titre: "Source", largeur: 26}, {titre: "Au " + dateFr(date), type: "euros", largeur: 16}, {titre: "Au " + dateFr(b0.date), type: "euros", largeur: 16}], lignes}]), "bilan-" + date + ".xlsx");
}
