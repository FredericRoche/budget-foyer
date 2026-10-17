/* ================= Trésorerie prévisionnelle et échéances ================= */
declarerEcran("tresorerie", {titre: "Trésorerie", rendre(c, etat){
  const p = LIVRE.parametres;
  const supplements = etat.supplements || [];
  const sim = simulerTresorerie({supplements});
  const ana = analyseTresorerie(sim);
  const bas = h("input", {type: "text", value: nombre(p.seuilBas, 0), style: {width: "6.5rem"}, onchange: e => { const v = lireMontant(e.target.value); if (!isNaN(v)){ modifierParametres({seuilBas: v}); rafraichirEcran(); } }});
  const haut = h("input", {type: "text", value: nombre(p.seuilHaut, 0), style: {width: "7.5rem"}, onchange: e => { const v = lireMontant(e.target.value); if (!isNaN(v)){ modifierParametres({seuilHaut: v}); rafraichirEcran(); } }});
  c.appendChild(entete("Trésorerie prévisionnelle", sim ? sim.compte.nom + " · " + dateFr(sim.depart) + " → " + dateFr(ajouterJours(sim.depart, 365)) + " · simulation au jour le jour" : "Aucun compte de trésorerie",
    [h("label", {style: {margin: 0}}, "Seuil bas"), bas, h("label", {style: {margin: 0}}, "Seuil haut"), haut, h("button", {class: "discret", onclick: () => editerEcheance(null)}, "Nouvelle échéance")]));
  if (!sim){ c.appendChild(h("p", {class: "vide"}, "Choisissez le compte de trésorerie dans Réglages › Comptes.")); return; }
  const anFin = +ajouterJours(sim.depart, 365).slice(0, 4);
  for (let an = +sim.depart.slice(0, 4); an <= anFin; an++) if (!budgetActif(an) && dernierBudgetAvant(an))
    c.appendChild(h("div", {class: "bandeau info"}, "Pas de budget " + an + " : la projection prolonge « " + dernierBudgetAvant(an).nom + " ». Créez le budget " + an + " (écran Budget, bouton « Copier pour " + an + " ») pour l'affiner."));
  if (!sim.soldeConnu) c.appendChild(h("div", {class: "bandeau info"}, "Aucun solde relevé pour ce compte : la projection part de 0 €. Importez l'export CSV du compte."));
  c.appendChild(h("section", {class: "carte"}, h("div", {class: "petit discret"}, "Solde de départ : " + euros(sim.soldeDepart ?? 0) + " (" + sourceSolde(sim.compte, sim.depart) + ")"),
    grapheTresorerie(sim, ana, 300, false), h("div", {class: "legende"},
      h("span", null, h("i", {style: {background: COULEURS.vert}}), "solde projeté (jour par jour)"), h("span", null, h("i", {style: {background: COULEURS.garnet, height: "2px"}}), "seuil bas (découvert)"),
      h("span", null, h("i", {style: {background: "repeating-linear-gradient(90deg,#6F8678 0 4px,transparent 4px 7px)", height: "2px"}}), "seuil haut (excédent à placer)"),
      h("span", null, h("i", {style: {background: COULEURS.or}}), "échéances de plus de 10 000 €"))));

  const g = h("div", {class: "large-etroit"});
  const gauche = h("section", null, h("h2", null, "Mois par mois"));
  gauche.appendChild(tableau([{titre: "Mois"}, {titre: "Début", num: true}, {titre: "Entrées", num: true}, {titre: "Sorties", num: true}, {titre: "Plus bas", num: true}, {titre: "Fin", num: true}], ana.mois, {ligne: m =>
    h("tr", null, h("td", null, moisFr(m.mois)), h("td", {class: "num"}, euros(m.debut, 0)), h("td", {class: "num pos"}, euros(m.entrees, 0)), h("td", {class: "num"}, euros(m.sorties, 0)),
      h("td", {class: "num" + (m.bas < p.seuilBas ? " neg" : "")}, h("strong", null, euros(m.bas, 0))), h("td", {class: "num" + (m.fin < p.seuilBas ? " neg" : "")}, euros(m.fin, 0)))}));
  /* Projets : hors marche courante, financés par l'épargne au besoin */
  if (sim.projets.length){
    gauche.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Projets"));
    gauche.appendChild(tableau([{titre: "Date"}, {titre: "Projet"}, {titre: "Paiement", num: true}, {titre: "Compte courant", num: true}, {titre: "Épargne à virer", num: true}], sim.projets, {classe: "serre", ligne: x =>
      h("tr", null, h("td", null, dateFr(x.date)), h("td", null, x.projet, h("div", {class: "petit discret"}, x.libelle)), montantCellule(x.montant),
        h("td", {class: "num"}, euros(x.duCourant, 0)), h("td", {class: "num" + (x.epargne > 0 ? " neg" : "")}, euros(x.epargne, 0)))}));
    const parProjet = regrouper(sim.projets, x => x.projet);
    gauche.appendChild(h("p", {class: "note"}, [...parProjet].map(([n, l]) => n + " : " + euros(-somme(l, x => x.montant), 0) + " sur 12 mois, dont " + euros(somme(l, x => x.epargne), 0) + " depuis l'épargne").join(" ; ") + ". "
      + "Un paiement de projet est pris sur le compte courant tant que celui-ci reste au-dessus du seuil bas jusqu'à la fin de la projection ; le reste vient de l'épargne, par virement de même date."));
  }
  g.appendChild(gauche);

  const droite = h("section");
  if (ana.premierBas){
    droite.appendChild(h("div", {class: "encadre", style: {marginBottom: "1rem"}}, h("h3", null, "Pour éviter le découvert"),
      h("p", null, "Virer ", h("strong", null, euros(ana.virement, 0)), " d'un livret vers " + sim.compte.nom + " avant le " + dateFr(ana.avant) + "."),
      h("div", {class: "outils", style: {marginTop: ".4rem"}},
        h("button", {class: "mini", onclick: () => { etat.supplements = [...supplements, {date: ana.avant, montant: ana.virement, libelle: "Virement simulé"}]; rafraichirEcran(); }}, "Simuler ce virement"),
        h("button", {class: "mini primaire", onclick: () => { enregistrer("echeances", {libelle: "Virement depuis l'épargne", montant: ana.virement, recurrence: "unique", debut: ana.avant, compte: sim.compte.id, categorie: "Transfert", sousCategorie: "Virement entre comptes"}); etat.supplements = []; rafraichirEcran(); }}, "Ajouter aux échéances"))));
  } else droite.appendChild(h("div", {class: "bandeau calme"}, "Pas de passage sous le seuil bas sur 12 mois. Plus bas : " + euros(ana.min.solde, 0) + " le " + dateFr(ana.min.date) + "."));
  if (supplements.length) droite.appendChild(h("p", {class: "note"}, supplements.length + " virement(s) simulé(s), non enregistré(s). ", h("button", {class: "lien", onclick: () => { etat.supplements = []; rafraichirEcran(); }}, "Retirer la simulation")));
  if (ana.excedent && ana.excedent.montant > 0) droite.appendChild(h("div", {class: "bandeau info"}, "Excédent durable au-dessus du seuil haut à partir du " + dateFr(ana.excedent.depuis) + " : environ " + euros(ana.excedent.montant, 0) + " à placer."));
  else if (ana.auDessus) droite.appendChild(h("p", {class: "note"}, "Seuil haut dépassé " + ana.auDessus + " jour(s), sans excédent durable (moins de 30 jours de suite) : rien à placer."));

  /* Débits différés à venir */
  const cartes = vivants("comptes").filter(x => x.type === "carte" && (x.compteDebit === sim.compte.id || !x.compteDebit));
  const lignesCartes = cartes.map(x => ({compte: x, encours: -somme(vivants("operations").filter(o => o.compte === x.id && !o.dateDebit && !(o.lien && o.montant > 0)), o => o.montant)})).filter(x => Math.abs(x.encours) > 0.005);
  if (lignesCartes.length){
    droite.appendChild(h("h2", null, "Débits différés à venir"));
    droite.appendChild(tableau([{titre: "Carte"}, {titre: "Débit prévu"}, {titre: "Encours connu", num: true}], lignesCartes, {classe: "serre", ligne: x => h("tr", {class: "cliquable", onclick: () => aller("operations", {compte: x.compte.id, nonDebitees: true, mois: ""})},
      h("td", null, x.compte.nom), h("td", null, dateFr(x.compte.carte === "AMEX" ? prochainJour(aujourdhui(), jourPrelevementAmex(sim.compte.id)) : dernierJourOuvre(aujourdhui()))), h("td", {class: "num"}, euros(x.encours)))}));
    droite.appendChild(h("p", {class: "note"}, "Encours = achats importés, comptés au budget à leur date d'achat, débités plus tard. S'y ajoute la part carte du budget du mois non encore dépensée."));
  }
  /* Grosses échéances de la période */
  droite.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Grosses échéances ponctuelles"));
  droite.appendChild(tableau([{titre: "Date"}, {titre: "Échéance"}, {titre: "Montant", num: true}], sim.evenements.filter(e => !e.recurrent && Math.abs(e.montant) >= 1000), {classe: "serre", vide: "Aucune.", ligne: e =>
    h("tr", null, h("td", null, dateFr(e.date)), h("td", null, e.libelle), montantCellule(e.montant))}));
  g.appendChild(droite);
  c.appendChild(g);

  /* Toutes les échéances */
  const ech = vivants("echeances").sort((a, b) => (a.debut || "") < (b.debut || "") ? -1 : 1);
  c.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Échéances (" + ech.length + ")"));
  c.appendChild(tableau([{titre: "Libellé", cle: e => e.libelle}, {titre: "Montant", num: true, cle: e => e.montant}, {titre: "Récurrence"}, {titre: "À partir du", cle: e => e.debut || ""}, {titre: "Jusqu'au"}, {titre: "Statut"}, {titre: ""}], ech, {classe: "serre", vide: "Aucune échéance.", ligne: e =>
    h("tr", {class: e.aConfirmer ? "choisie" : ""}, h("td", null, e.libelle, e.projet ? h("span", {class: "libbanque"}, "projet " + e.projet + (financeParEpargne(e) ? ", financé par l'épargne au besoin" : "")) : null, e.ligneBudget ? h("span", {class: "libbanque"}, "remplace sa ligne de budget en trésorerie") : null, e.note ? h("div", {class: "petit discret"}, e.note) : null), montantCellule(e.montant),
      h("td", null, e.recurrence || "unique"), h("td", null, dateFr(e.debut)), h("td", null, e.fin ? dateFr(e.fin) : "—"),
      h("td", null, e.active === false ? "inactive" : e.aConfirmer ? h("span", {class: "neg"}, "à confirmer") : "confirmée"),
      h("td", null, e.aConfirmer ? h("button", {class: "mini primaire", onclick: () => { enregistrer("echeances", Object.assign(e, {aConfirmer: false})); rafraichirEcran(); }}, "Confirmer") : null, " ",
        h("button", {class: "mini discret", onclick: () => editerEcheance(e)}, "Modifier")))}));
  c.appendChild(h("p", {class: "note"}, "Les échéances « à confirmer » proviennent de la reprise du classeur (hypothèses) : elles comptent déjà dans la projection. Vérifiez montants et dates (travaux : à éclater en appels de fonds ; cessions de titres : quantités et prix)."));
}});

async function editerEcheance(e){
  const x = e || {libelle: "", montant: 0, recurrence: "unique", debut: aujourdhui(), compte: LIVRE.parametres.compteTresorerie};
  const lib = h("input", {type: "text", value: x.libelle});
  const mt = h("input", {type: "text", value: x.montant ? nombre(x.montant) : "", placeholder: "négatif = sortie"});
  const rec = selection([["unique", "unique"], ["mensuelle", "mensuelle"], ["trimestrielle", "trimestrielle"], ["semestrielle", "semestrielle"], ["annuelle", "annuelle"]], x.recurrence || "unique");
  const d1 = h("input", {type: "date", value: x.debut || aujourdhui()}); const d2 = h("input", {type: "date", value: x.fin || ""});
  const cat = selectionCategorie(x.categorie || "", x.sousCategorie || "");
  const nat = selectionNature(x.nature || "Courante");
  const budget = budgetActif(+(x.debut || aujourdhui()).slice(0, 4));
  const lb = selection([["", "—"], ...(budget?.lignes || []).map(l => [l.id, l.categorie + " › " + l.sousCategorie])], x.ligneBudget || "");
  const active = h("input", {type: "checkbox", checked: x.active !== false, id: "ech-active"});
  const projets = [...new Set(vivants("echeances").map(y => y.projet).filter(Boolean))];
  const proj = h("input", {type: "text", value: x.projet || "", list: "ech-projets", placeholder: "vide : marche courante du foyer"});
  const listeProj = h("datalist", {id: "ech-projets"}, ...projets.map(n => h("option", {value: n})));
  const epar = h("input", {type: "checkbox", checked: x.financement !== "courant", id: "ech-epargne"});
  const ok = await dialogue({titre: e ? "Modifier l'échéance" : "Nouvelle échéance", large: true, corps: h("div", null, h("div", {class: "grille-champs"},
    champ("Libellé", lib), champ("Montant (négatif = sortie)", mt), champ("Récurrence", rec), champ("Date (ou première date)", d1), champ("Jusqu'au (facultatif)", d2),
    champ("Catégorie", cat), champ("Nature", nat), champ("Remplace en trésorerie la ligne de budget", lb, "Évite de compter deux fois le loyer, par exemple."),
    champ("Projet (hors marche courante)", h("span", null, proj, listeProj), "Travaux, voiture… : suivis à part, avec leur financement.")),
    h("div", {class: "case"}, epar, h("label", {for: "ech-epargne"}, "Projet financé par virement d'épargne quand le compte courant ne suffit pas")),
    h("div", {class: "case"}, active, h("label", {for: "ech-active"}, "Active"))),
    actions: [e ? {libelle: "Supprimer", classe: "danger", action: () => { supprimer("echeances", e.id); return true; }} : null, {libelle: "Annuler", classe: "discret", valeur: false},
      {libelle: "Enregistrer", classe: "primaire", action: () => {
        const m = lireMontant(mt.value); if (isNaN(m) || !lib.value.trim()){ message("Libellé et montant requis.", true); return false; }
        const v = valeurCategorie(cat);
        enregistrer("echeances", Object.assign(x, {libelle: lib.value.trim(), montant: m, recurrence: rec.value, debut: d1.value, fin: d2.value || null, ligneBudget: lb.value || null,
          active: active.checked, aConfirmer: false, nature: nat.value, projet: proj.value.trim() || null, financement: epar.checked ? "epargne" : "courant"}, v.categorie === "À préciser" ? {} : v));
        return true;
      }}].filter(Boolean)});
  if (ok) rafraichirEcran();
}
