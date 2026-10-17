/* ================= Épargne et projets : hors marche courante du foyer =================
   Trois visions : la marche courante (écran Trésorerie), l'épargne (ses comptes, leurs revenus, les
   cessions de titres, et ce qu'elle finance) et les projets (travaux, voiture…). Un projet regroupe des échéances
   (paiements prévus) et des opérations (paiements faits). Une opération lui appartient si elle
   porte son nom (panneau de détail), ou si elle a la catégorie et la sous-catégorie d'une de ses
   échéances et la nature « Exceptionnelle ». */
function nomsProjets(){ return [...new Set(vivants("echeances").map(e => e.projet).filter(Boolean))].sort(); }
function operationsDuProjet(nom, echeances){
  const cles = new Set(echeances.filter(e => e.categorie && e.sousCategorie).map(e => e.categorie + "|" + e.sousCategorie));
  return vivants("operations").filter(o => o.projet === nom || (!o.projet && o.nature === "Exceptionnelle" && cles.has(o.categorie + "|" + o.sousCategorie)));
}
function etatProjet(nom){
  const ech = vivants("echeances").filter(e => e.projet === nom && e.active !== false);
  const prevu = ech.flatMap(e => occurrences(e, ajouterJours(aujourdhui(), 1), "2100-12-31").map(d => ({date: d, montant: e.montant, echeance: e}))).sort((a, b) => a.date < b.date ? -1 : 1);
  const ops = operationsDuProjet(nom, ech);
  const paye = -somme(ops, o => o.montant), reste = -somme(prevu, x => x.montant);
  return {nom, ech, prevu, ops, paye, reste, total: paye + reste};
}

const carteInd = (lib, val, det, neg) => h("div", {class: "indicateur"}, h("div", {class: "lib"}, lib), h("div", {class: "val" + (neg ? " neg" : "")}, val), h("div", {class: "det"}, det));

declarerEcran("epargne", {titre: "Épargne", rendre(c, etat){
  const ep = simulerEpargne();
  c.appendChild(entete("Épargne", "Livrets, assurances-vie et PER (leurs revenus y restent ; valeurs brutes, sans fiscalité latente) · cessions de titres · financement des projets et du compte courant"));
  const min = ep.jours.length ? ep.jours.reduce((a, j) => j.solde < a.solde ? j : a, ep.jours[0]) : null;
  const fin = ep.jours.length ? ep.jours[ep.jours.length - 1].solde : ep.soldeDepart;
  const parGenre = g => -somme(ep.evenements.filter(e => e.genre === g && e.montant < 0), e => e.montant);
  const ind = h("div", {class: "indicateurs"});
  ind.append(carteInd("Épargne disponible aujourd'hui", euros(ep.soldeDepart, 0), ep.comptes.length + " compte(s) mobilisable(s)"),
    carteInd("Cessions de titres (12 mois)", euros(somme(ep.evenements.filter(e => e.genre === "capital" && e.montant > 0), e => e.montant), 0), "encaissements prévus"),
    carteInd("Financements (12 mois)", euros(parGenre("projet") + parGenre("courant"), 0), "projets " + euros(parGenre("projet"), 0) + " · compte courant " + euros(parGenre("courant"), 0)),
    carteInd("Épargne dans 12 mois", euros(fin, 0), min ? "au plus bas " + euros(min.solde, 0) + " le " + dateFr(min.date) : "", fin < 0 || (min && min.solde < 0)));
  c.appendChild(ind);
  if (min && min.solde < 0) c.appendChild(h("div", {class: "bandeau alerte"}, "L'épargne disponible passe sous zéro le " + dateFr(ep.jours.find(j => j.solde < 0).date)
    + " : il manque " + euros(-min.solde, 0) + " (avancer une cession, décaler un paiement de projet, ou mobiliser un autre placement)."));
  if (!ep.comptes.length) c.appendChild(h("div", {class: "bandeau info"}, "Aucune épargne mobilisable connue : importez les relevés des livrets, assurances-vie et PER (ou saisissez une valorisation dans Bilan), sinon l'épargne part de 0 €."));
  c.appendChild(h("section", {class: "carte"}, h("div", {class: "petit discret"}, "Au départ : " + euros(ep.soldeDepart, 0)
      + (ep.comptes.length ? " (" + ep.comptes.map(x => x.compte.nom + " " + euros(x.solde, 0)).join(", ") + ")" : "")),
    grapheTresorerie(ep, null, 260, false, {seuilBas: 0, seuilHaut: Infinity}),
    h("div", {class: "legende"}, h("span", null, h("i", {style: {background: COULEURS.vert}}), "épargne disponible"), h("span", null, h("i", {style: {background: COULEURS.garnet, height: "2px"}}), "zéro"),
      h("span", null, h("i", {style: {background: COULEURS.or}}), "mouvements de plus de 10 000 €"))));
  c.appendChild(h("h2", null, "Mouvements prévus (12 mois)"));
  c.appendChild(tableau([{titre: "Date"}, {titre: "Mouvement"}, {titre: "Vers / depuis"}, {titre: "Montant", num: true}, {titre: "Épargne après", num: true}, {titre: ""}], ep.evenements, {classe: "serre", vide: "Aucun mouvement prévu.", ligne: ev => {
    const jour = ep.jours.find(j => j.date === ev.date);
    return h("tr", {class: ev.echeance?.aConfirmer ? "choisie" : ""}, h("td", null, dateFr(ev.date)), h("td", null, ev.libelle, ev.echeance?.note ? h("div", {class: "petit discret"}, ev.echeance.note) : null),
      h("td", null, {projet: "projet", capital: "cession", courant: "compte courant"}[ev.genre]), montantCellule(ev.montant), h("td", {class: "num" + (jour && jour.solde < 0 ? " neg" : "")}, jour ? euros(jour.solde, 0) : ""),
      h("td", null, ev.echeance ? h("button", {class: "mini discret", onclick: () => editerEcheance(ev.echeance)}, "Modifier") : h("button", {class: "mini discret", onclick: () => aller("tresorerie")}, "Voir")));
  }}));
  c.appendChild(h("p", {class: "note"}, "Les cessions encaissées sur le compte joint et les paiements des projets qui en partent sont comptés ici : ils ne relèvent pas de la marche courante. "
    + "Les approvisionnements du compte courant sont ceux qui le maintiennent au-dessus du seuil bas (" + euros(LIVRE.parametres.seuilBas || 0, 0) + "). Les revenus de l'épargne restent dans l'épargne, jusqu'à un virement décidé."));
  const tout = simulerTresorerie({perimetre: "tout"}); const anaTout = analyseTresorerie(tout);
  if (tout && anaTout) c.appendChild(h("p", {class: "note"}, "Contrôle — " + tout.compte.nom + " réel, si cessions et projets y passent sans virement vers ou depuis l'épargne : au plus bas "
    + euros(anaTout.min.solde, 0) + " le " + dateFr(anaTout.min.date) + ", " + euros(tout.jours[tout.jours.length - 1].solde, 0) + " dans 12 mois."));
}});

declarerEcran("projets", {titre: "Projets", rendre(c, etat){
  const noms = nomsProjets();
  c.appendChild(entete("Projets", "Hors marche courante du foyer · financés par l'épargne (écran Épargne)",
    [h("button", {class: "discret", onclick: () => editerEcheance(null)}, "Nouvelle échéance de projet")]));
  if (!noms.length){ c.appendChild(h("p", {class: "vide"}, "Aucun projet : dans Trésorerie, modifiez une échéance (travaux, voiture…) et donnez-lui un nom de projet.")); return; }
  const etats = noms.map(etatProjet);
  const proch = etats.flatMap(x => x.prevu.map(p => Object.assign({projet: x.nom}, p))).sort((a, b) => a.date < b.date ? -1 : 1)[0];
  const ind = h("div", {class: "indicateurs"});
  ind.append(carteInd("Coût total des projets", euros(somme(etats, x => x.total), 0), noms.length + " projet(s)"),
    carteInd("Déjà payé", euros(somme(etats, x => x.paye), 0), somme(etats, x => x.ops.length) + " opération(s)"),
    carteInd("Reste à payer", euros(somme(etats, x => x.reste), 0), "selon les échéances"),
    carteInd("Prochain paiement", proch ? euros(-proch.montant, 0) : "—", proch ? dateFr(proch.date) + " · " + proch.projet : ""));
  c.appendChild(ind);
  c.appendChild(tableau([{titre: "Projet"}, {titre: "Coût total", num: true}, {titre: "Payé", num: true}, {titre: "Reste", num: true}, {titre: "Avancement"}, {titre: "Prochain paiement"}], etats, {ligne: x => {
    const pr = x.prevu[0]; const pct = x.total ? Math.round(x.paye / x.total * 100) : 0;
    return h("tr", {class: "cliquable" + (etat.projet === x.nom ? " choisie" : ""), onclick: () => { etat.projet = x.nom; rafraichirEcran(); }},
      h("td", null, h("strong", null, x.nom)), h("td", {class: "num"}, euros(x.total, 0)), h("td", {class: "num"}, euros(x.paye, 0)), h("td", {class: "num"}, euros(x.reste, 0)),
      h("td", null, h("div", {class: "jauge"}, h("span", {style: {width: Math.min(100, pct) + "%"}})), h("span", {class: "petit discret"}, pct + " %")),
      h("td", null, pr ? dateFr(pr.date) + " · " + euros(-pr.montant, 0) : "—"));
  }}));
  const x = etats.find(e => e.nom === etat.projet) || etats[0];
  const g = h("div", {class: "deux"});
  g.appendChild(h("section", null, h("h2", null, "Échéancier : " + x.nom),
    tableau([{titre: "Date"}, {titre: "Paiement"}, {titre: "Montant", num: true}, {titre: ""}], x.prevu, {classe: "serre", vide: "Aucun paiement prévu.", ligne: pv =>
      h("tr", {class: pv.echeance.aConfirmer ? "choisie" : ""}, h("td", null, dateFr(pv.date)), h("td", null, pv.echeance.libelle, pv.echeance.note ? h("div", {class: "petit discret"}, pv.echeance.note) : null), montantCellule(pv.montant),
        h("td", null, h("button", {class: "mini discret", onclick: () => editerEcheance(pv.echeance)}, "Modifier")))}),
    h("p", {class: "note"}, "Un appel de fonds se saisit comme une échéance unique portant le nom du projet ; dates et montants restent modifiables jusqu'au paiement.")));
  g.appendChild(h("section", null, h("h2", null, "Paiements faits : " + x.nom),
    tableau([{titre: "Date"}, {titre: "Libellé"}, {titre: "Compte"}, {titre: "Montant", num: true}], x.ops.sort((a, b) => a.date < b.date ? 1 : -1), {classe: "serre", vide: "Aucun paiement rattaché pour l'instant.", ligne: o =>
      h("tr", {class: "cliquable", onclick: () => aller("operations", {choisie: o.id, mois: ""})}, h("td", null, dateFr(o.date)), h("td", null, obtenir("commercants", o.commercant)?.nom || o.libelle), h("td", null, libelleCompte(o.compte)), montantCellule(o.montant))}),
    h("p", {class: "note"}, "Rattachement : champ « Projet » du détail d'une opération, ou catégorie et sous-catégorie d'une échéance du projet avec la nature « Exceptionnelle ».")));
  c.appendChild(g);
}});
