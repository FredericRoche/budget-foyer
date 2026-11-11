/* ================= Trésorerie prévisionnelle et échéances ================= */
declarerEcran("tresorerie", {titre: "Trésorerie", rendre(c, etat){
  const p = LIVRE.parametres;
  const supplements = etat.supplements || [];
  const per = periodeProjection();
  const complet = simulerTresorerie({supplements, fin: per.fin}), sim = fenetreSimulation(complet, per.debut);
  const ana = analyseTresorerie(sim);
  const bas = h("input", {type: "text", value: nombre(p.seuilBas, 0), style: {width: "6.5rem"}, onchange: e => { const v = lireMontant(e.target.value); if (!isNaN(v)){ modifierParametres({seuilBas: v}); rafraichirEcran(); } }});
  const haut = h("input", {type: "text", value: nombre(p.seuilHaut, 0), style: {width: "7.5rem"}, onchange: e => { const v = lireMontant(e.target.value); if (!isNaN(v)){ modifierParametres({seuilHaut: v}); rafraichirEcran(); } }});
  c.appendChild(entete("Trésorerie prévisionnelle", sim ? "Marche courante · " + sim.compte.nom + " · " + per.libelle + " : " + dateFr(per.debut) + " → " + dateFr(per.fin) + " · simulation au jour le jour" : "Aucun compte de trésorerie",
    [selecteurPeriode(), h("label", {style: {margin: 0}}, "Seuil bas"), bas, h("label", {style: {margin: 0}}, "Seuil haut"), haut, h("button", {class: "discret", onclick: () => editerEcheance(null)}, "Nouvelle échéance")]));
  if (!sim){ c.appendChild(h("p", {class: "vide"}, "Choisissez le compte de trésorerie dans Réglages › Comptes.")); return; }
  const anFin = +per.fin.slice(0, 4);
  for (let an = +sim.depart.slice(0, 4); an <= anFin; an++) if (!budgetActif(an) && dernierBudgetAvant(an))
    c.appendChild(h("div", {class: "bandeau info"}, "Pas de budget " + an + " : la projection prolonge « " + dernierBudgetAvant(an).nom + " ». Créez le budget " + an + " (écran Budget, bouton « Copier pour " + an + " ») pour l'affiner."));
  if (!sim.soldeConnu) c.appendChild(h("div", {class: "bandeau info"}, "Aucun solde relevé pour ce compte : la projection part de 0 €. Importez l'export CSV du compte."));
  c.appendChild(h("section", {class: "carte"}, h("div", {class: "petit discret"}, sim.debutFenetre
      ? "Solde projeté au " + dateFr(ajouterJours(sim.debutFenetre, -1)) + " au soir : " + euros(sim.soldeOuverture ?? 0, 0) + " (projection depuis le solde connu au " + dateFr(sim.depart) + " : " + euros(sim.soldeDepart ?? 0) + ", " + sourceSolde(sim.compte, sim.depart) + ")"
      : "Solde de départ : " + euros(sim.soldeDepart ?? 0) + " (" + sourceSolde(sim.compte, sim.depart) + ")"),
    grapheTresorerie(sim, ana, 300, false), h("div", {class: "legende"},
      h("span", null, h("i", {style: {background: COULEURS.vert}}), "solde projeté (jour par jour)"), h("span", null, h("i", {style: {background: COULEURS.garnet, height: "2px"}}), "seuil bas (découvert)"),
      h("span", null, h("i", {style: {background: "repeating-linear-gradient(90deg,#6F8678 0 4px,transparent 4px 7px)", height: "2px"}}), "seuil haut (excédent à placer)"),
      h("span", null, h("i", {style: {background: COULEURS.or}}), "échéances de plus de 10 000 €"))));

  const g = h("div", {class: "large-etroit"});
  const gauche = h("section", null, h("h2", null, "Mois à venir (projection)"));
  gauche.appendChild(tableau([{titre: "Mois"}, {titre: "Début", num: true}, {titre: "Entrées", num: true}, {titre: "Sorties", num: true}, {titre: "Plus bas", num: true}, {titre: "Fin", num: true}], ana.mois, {ligne: m =>
    h("tr", null, h("td", null, moisFr(m.mois)), h("td", {class: "num"}, euros(m.debut, 0)), h("td", {class: "num pos"}, euros(m.entrees, 0)), h("td", {class: "num"}, euros(m.sorties, 0)),
      h("td", {class: "num" + (m.bas < p.seuilBas ? " neg" : "")}, h("strong", null, euros(m.bas, 0))), h("td", {class: "num" + (m.fin < p.seuilBas ? " neg" : "")}, euros(m.fin, 0)))}));
  const capitaux = vivants("echeances").filter(e => e.active !== false && estCapital(e) && !payeParCourant(e));
  if (capitaux.length) gauche.appendChild(h("p", {class: "note"}, "Marche courante seule : " + capitaux.length + " flux de capital (cessions de titres, projets) sont suivis à part, dans ",
    h("button", {class: "lien", onclick: () => aller("epargne")}, "Épargne"), " et ", h("button", {class: "lien", onclick: () => aller("projets")}, "Projets"), "."));
  /* Mois passés : flux réels du compte, d'après les relevés importés */
  const passes = fluxPasses(sim.compte, 12, sim.depart).reverse();
  gauche.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Mois passés (relevés)"));
  gauche.appendChild(tableau([{titre: "Mois"}, {titre: "Début", num: true}, {titre: "Entrées", num: true}, {titre: "Sorties", num: true}, {titre: "dont cartes", num: true},
    {titre: "Virements entre comptes", num: true}, {titre: "Plus bas", num: true}, {titre: "Fin", num: true}], passes, {classe: "serre", vide: "Aucun relevé importé pour ce compte.", ligne: m =>
    h("tr", {class: "cliquable", title: m.nb + " opération(s) : les voir", onclick: () => aller("operations", {compte: sim.compte.id, mois: m.mois.slice(0, 7), nonDebitees: false})},
      h("td", null, moisFr(m.mois.slice(0, 7))), h("td", {class: "num"}, m.debut == null ? "—" : euros(m.debut, 0)), h("td", {class: "num pos"}, euros(m.entrees, 0)), h("td", {class: "num"}, euros(m.sorties, 0)),
      h("td", {class: "num discret"}, m.cartes ? euros(m.cartes, 0) : "—"), h("td", {class: "num"}, Math.abs(m.transferts) < 0.5 ? "—" : eurosSigne(Math.round(m.transferts))),
      h("td", {class: "num" + (m.bas != null && m.bas < p.seuilBas ? " neg" : "")}, h("strong", null, m.bas == null ? "—" : euros(m.bas, 0))), h("td", {class: "num" + (m.fin != null && m.fin < p.seuilBas ? " neg" : "")}, m.fin == null ? "—" : euros(m.fin, 0)))}));
  gauche.appendChild(h("p", {class: "note"}, "Flux réels du compte, mois par mois (le mois en cours jusqu'au dernier relevé importé). Les soldes remontent le temps depuis le solde connu ; un mois incomplet (relevé manquant) fausse les soldes des mois d'avant. « dont cartes » : débits des cartes à débit différé et de l'Amex, déjà comptés dans les sorties. Les virements entre vos comptes sont isolés. Cliquez un mois pour voir ses opérations."));
  g.appendChild(gauche);

  const droite = h("section");
  if (ana.premierBas){
    droite.appendChild(h("div", {class: "encadre", style: {marginBottom: "1rem"}}, h("h3", null, "Pour éviter le découvert"),
      h("p", null, "Virer ", h("strong", null, euros(ana.virement, 0)), " d'un livret vers " + sim.compte.nom + " avant le " + dateFr(ana.avant) + ". Ces approvisionnements sont déjà déduits de l'épargne projetée (écran Épargne)."),
      h("div", {class: "outils", style: {marginTop: ".4rem"}},
        h("button", {class: "mini", onclick: () => { etat.supplements = [...supplements, {date: ana.avant, montant: ana.virement, libelle: "Virement simulé"}]; rafraichirEcran(); }}, "Simuler ce virement"),
        h("button", {class: "mini primaire", onclick: () => { enregistrer("echeances", {libelle: "Virement depuis l'épargne", montant: ana.virement, recurrence: "unique", debut: ana.avant, compte: sim.compte.id, categorie: "Transfert", sousCategorie: "Virement entre comptes"}); etat.supplements = []; rafraichirEcran(); }}, "Ajouter aux échéances"))));
  } else droite.appendChild(h("div", {class: "bandeau calme"}, "Pas de passage sous le seuil bas sur la période (" + per.court + "). Plus bas : " + euros(ana.min.solde, 0) + " le " + dateFr(ana.min.date) + "."));
  if (sim.debutFenetre && complet.jours.some(j => j.date < sim.debutFenetre && j.solde < p.seuilBas)) droite.appendChild(h("div", {class: "bandeau alerte"}, "Attention : le compte passe sous le seuil bas avant le début de la période choisie. Voir les 12 prochains mois."));
  if (supplements.length) droite.appendChild(h("p", {class: "note"}, supplements.length + " virement(s) simulé(s), non enregistré(s). ", h("button", {class: "lien", onclick: () => { etat.supplements = []; rafraichirEcran(); }}, "Retirer la simulation")));
  if (ana.excedent && ana.excedent.montant > 0) droite.appendChild(h("div", {class: "bandeau info"}, "Excédent durable au-dessus du seuil haut à partir du " + dateFr(ana.excedent.depuis) + " : environ " + euros(ana.excedent.montant, 0)
    + " à placer, sans repasser sous le seuil haut d'ici le " + dateFr(ana.excedent.jusquA) + "."));
  else if (ana.excedent) droite.appendChild(h("p", {class: "note"}, "Seuil haut dépassé durablement à partir du " + dateFr(ana.excedent.depuis) + ", mais le compte y redescend d'ici le " + dateFr(ana.excedent.jusquA)
    + " : rien à placer."));
  else if (ana.auDessus) droite.appendChild(h("p", {class: "note"}, "Seuil haut dépassé " + ana.auDessus + " jour(s), sans excédent durable (moins de 30 jours de suite) : rien à placer."));

  /* Débits différés à venir */
  const cartes = vivants("comptes").filter(x => x.type === "carte" && (x.compteDebit === sim.compte.id || !x.compteDebit));
  const lignesCartes = cartes.map(x => { const e = encoursCarte(x, sim.depart); return {compte: x, encours: -somme(e.recents, o => o.montant), anciens: e.anciens}; })
    .filter(x => Math.abs(x.encours) > 0.005 || x.anciens.length);
  const anciens = lignesCartes.flatMap(x => x.anciens);
  if (lignesCartes.length){
    droite.appendChild(h("h2", null, "Débits différés à venir"));
    droite.appendChild(tableau([{titre: "Carte"}, {titre: "Débit prévu"}, {titre: "Encours connu", num: true}], lignesCartes, {classe: "serre", ligne: x => h("tr", {class: "cliquable", onclick: () => aller("operations", {compte: x.compte.id, nonDebitees: true, mois: ""})},
      h("td", null, x.compte.nom), h("td", null, dateFr(x.compte.carte === "AMEX" ? prochainJour(aujourdhui(), jourPrelevementAmex(sim.compte.id)) : dernierJourOuvre(aujourdhui()))), h("td", {class: "num"}, euros(x.encours)))}));
    droite.appendChild(h("p", {class: "note"}, "Encours = achats importés, comptés au budget à leur date d'achat, débités plus tard. S'y ajoute la part carte du budget du mois non encore dépensée."));
    if (anciens.length) droite.appendChild(h("div", {class: "bandeau info"}, anciens.length + " achat(s) carte de plus de " + ANCIENNETE_ENCOURS + " jours sans date de débit ("
      + euros(-somme(anciens, o => o.montant), 0) + ", " + lignesCartes.filter(x => x.anciens.length).map(x => x.compte.nom).join(", ")
      + ") : ils ont forcément été débités ; la projection les ignore. Cliquez la carte pour les voir."));
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
    h("tr", {class: e.aConfirmer ? "choisie" : ""}, h("td", null, e.libelle, estCapital(e) ? h("span", {class: "libbanque"}, e.projet ? "projet " + e.projet : payeParCourant(e) ? "capital payé par le compte courant : en trésorerie, hors épargne et hors résultat" : "capital, hors marche courante") : null, e.ligneBudget ? h("span", {class: "libbanque"}, "remplace sa ligne de budget en trésorerie") : null, e.note ? h("div", {class: "petit discret"}, e.note) : null), montantCellule(e.montant),
      h("td", null, e.recurrence || "unique"), h("td", null, dateFr(e.debut)), h("td", null, e.fin ? dateFr(e.fin) : "—"),
      h("td", null, e.active === false ? "inactive" : e.aConfirmer ? h("span", {class: "neg"}, "à confirmer") : "confirmée"),
      h("td", null, e.aConfirmer ? h("button", {class: "mini primaire", onclick: () => { enregistrer("echeances", Object.assign(e, {aConfirmer: false})); rafraichirEcran(); }}, "Confirmer") : null, " ",
        h("button", {class: "mini discret", onclick: () => editerEcheance(e)}, "Modifier")))}));
  c.appendChild(h("p", {class: "note"}, "Les échéances « à confirmer » proviennent de la reprise du classeur (hypothèses) : elles comptent déjà dans la projection. Vérifiez montants et dates (travaux : à éclater en appels de fonds ; cessions de titres : quantités et prix)."));
}});

/* Choix de la période de projection (Trésorerie, Épargne) : 12 prochains mois, une année civile, ou deux dates. */
function selecteurPeriode(){
  const per = periodeProjection(), an = +aujourdhui().slice(0, 4);
  const options = [["12", "12 prochains mois"], ...[an, an + 1, an + 2].map(y => [String(y), "Année " + y]), ["libre", per.choix === "libre" ? per.libelle : "Autre période…"]];
  const s = selection(options, per.choix, {title: "Période de la projection", onchange: async ev => {
    const v = ev.target.value;
    if (v === "12") choisirPeriodeProjection(null);
    else if (/^\d{4}$/.test(v)) choisirPeriodeProjection({choix: v, debut: v + "-01-01", fin: v + "-12-31"});
    else {
      const d1 = champDate({value: per.debut}), d2 = champDate({value: per.fin});
      const ok = await dialogue({titre: "Période de la projection", corps: h("div", null, h("div", {class: "grille-champs"}, champ("Du", d1), champ("Au", d2)),
        h("p", {class: "note"}, "La projection part toujours du solde connu d'aujourd'hui ; seule la période choisie est montrée, au plus " + HORIZON_MAX_ANS + " ans devant.")),
        actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Appliquer", classe: "primaire", action: () => {
          if (!dateSaisieOk(d1, "Du") || !dateSaisieOk(d2, "Au")) return false;
          if (d2.value <= aujourdhui() || d1.value > d2.value){ message("La période doit finir après aujourd'hui, et commencer avant de finir.", true); return false; }
          choisirPeriodeProjection({choix: "libre", debut: d1.value, fin: d2.value}); return true; }}]});
      if (!ok){ ev.target.value = per.choix; return; }
    }
    rafraichirEcran(); if (typeof afficherBandeaux === "function") afficherBandeaux();
  }});
  return h("label", {style: {margin: 0}}, "Période ", s);
}

async function editerEcheance(e){
  const x = e || {libelle: "", montant: 0, recurrence: "unique", debut: aujourdhui(), compte: LIVRE.parametres.compteTresorerie};
  const lib = h("input", {type: "text", value: x.libelle});
  const mt = h("input", {type: "text", value: x.montant ? nombre(x.montant) : "", placeholder: "négatif = sortie"});
  const rec = selection([["unique", "unique"], ["mensuelle", "mensuelle"], ["trimestrielle", "trimestrielle"], ["semestrielle", "semestrielle"], ["annuelle", "annuelle"]], x.recurrence || "unique");
  const d1 = champDate({value: x.debut || aujourdhui()}); const d2 = champDate({value: x.fin || ""});
  const cat = selectionCategorie(x.categorie || "", x.sousCategorie || "");
  const nat = selectionNature(x.nature || "Courante");
  const budget = budgetActif(+(x.debut || aujourdhui()).slice(0, 4));
  const lb = selection([["", "—"], ...(budget?.lignes || []).map(l => [l.id, l.categorie + " › " + l.sousCategorie])], x.ligneBudget || "");
  const active = h("input", {type: "checkbox", checked: x.active !== false, id: "ech-active"});
  const projets = [...new Set(vivants("echeances").map(y => y.projet).filter(Boolean))];
  const proj = h("input", {type: "text", value: x.projet || "", list: "ech-projets", placeholder: "vide : marche courante du foyer"});
  const listeProj = h("datalist", {id: "ech-projets"}, ...projets.map(n => h("option", {value: n})));
  const capi = h("input", {type: "checkbox", checked: !!x.capital || x.categorie === "Patrimoine", id: "ech-capital"});
  const env = h("input", {type: "checkbox", checked: !!x.enveloppe, id: "ech-enveloppe"});
  const resteCourant = h("input", {type: "checkbox", checked: !!x.resteCourant, id: "ech-reste-courant"});
  const ok = await dialogue({titre: e ? "Modifier l'échéance" : "Nouvelle échéance", large: true, corps: h("div", null, h("div", {class: "grille-champs"},
    champ("Libellé", lib), champ("Montant (négatif = sortie)", mt), champ("Récurrence", rec), champ("Date (ou première date)", d1), champ("Jusqu'au (facultatif)", d2),
    champ("Catégorie", cat), champ("Nature", nat), champ("Remplace en trésorerie la ligne de budget", lb, "Évite de compter deux fois le loyer, par exemple."),
    champ("Projet (hors marche courante)", h("span", null, proj, listeProj), "Travaux, voiture… : suivis à part, avec leur financement.")),
    h("div", {class: "case"}, capi, h("label", {for: "ech-capital"}, "Flux de capital (cession de titres, placement…) : hors marche courante, suivi dans Projets ; un projet l'est toujours")),
    h("div", {class: "case"}, resteCourant, h("label", {for: "ech-reste-courant"}, "Flux de capital payé par le compte courant (ex. avance d'impôt par le PAS) : compté dans sa trésorerie, mais ni dans l'épargne ni dans le résultat courant")),
    h("div", {class: "case"}, env, h("label", {for: "ech-enveloppe"}, "Enveloppe du projet : les paiements du projet s'imputent sur ce montant, le reste à payer diminue d'autant")),
    h("div", {class: "case"}, active, h("label", {for: "ech-active"}, "Active"))),
    actions: [e ? {libelle: "Supprimer", classe: "danger", action: () => { supprimer("echeances", e.id); return true; }} : null, {libelle: "Annuler", classe: "discret", valeur: false},
      {libelle: "Enregistrer", classe: "primaire", action: () => {
        const m = lireMontant(mt.value); if (isNaN(m) || !lib.value.trim()){ message("Libellé et montant requis.", true); return false; }
        const v = valeurCategorie(cat);
        if (!dateSaisieOk(d1, "Date") || !dateSaisieOk(d2, "Jusqu'au", true)) return false;
        enregistrer("echeances", Object.assign(x, {libelle: lib.value.trim(), montant: m, recurrence: rec.value, debut: d1.value, fin: d2.value || null, ligneBudget: lb.value || null,
          active: active.checked, aConfirmer: false, nature: nat.value, projet: proj.value.trim() || null, capital: capi.checked, resteCourant: capi.checked && resteCourant.checked, enveloppe: env.checked && !!proj.value.trim()}, v.categorie === "À préciser" ? {} : v));
        return true;
      }}].filter(Boolean)});
  if (ok) rafraichirEcran();
}
