/* ================= Projets : travaux, voiture… hors marche courante du foyer =================
   Un projet regroupe des échéances (paiements prévus) et des opérations (paiements faits).
   Une opération lui appartient si elle porte son nom (panneau de détail), ou si elle a la
   catégorie et la sous-catégorie d'une de ses échéances et la nature « Exceptionnelle ». */
function nomsProjets(){ return [...new Set(vivants("echeances").map(e => e.projet).filter(Boolean))].sort(); }
function operationsDuProjet(nom, echeances){
  const cles = new Set(echeances.filter(e => e.categorie && e.sousCategorie).map(e => e.categorie + "|" + e.sousCategorie));
  return vivants("operations").filter(o => o.projet === nom || (!o.projet && o.nature === "Exceptionnelle" && cles.has(o.categorie + "|" + o.sousCategorie)));
}
function etatProjet(nom, sim){
  const ech = vivants("echeances").filter(e => e.projet === nom && e.active !== false);
  const prevu = ech.flatMap(e => occurrences(e, ajouterJours(aujourdhui(), 1), "2100-12-31").map(d => ({date: d, montant: e.montant, echeance: e})));
  const ops = operationsDuProjet(nom, ech);
  const paye = -somme(ops, o => o.montant), reste = -somme(prevu, x => x.montant);
  const plan = (sim?.projets || []).filter(x => x.projet === nom);
  return {nom, ech, prevu, ops, paye, reste, total: paye + reste, epargne12: somme(plan, x => x.epargne), courant12: somme(plan, x => x.duCourant), plan};
}

declarerEcran("projets", {titre: "Projets", rendre(c, etat){
  const sim = simulerTresorerie();
  const noms = nomsProjets();
  c.appendChild(entete("Projets", "Hors marche courante du foyer · financés par le compte courant tant qu'il suffit, sinon par l'épargne",
    [h("button", {class: "discret", onclick: () => editerEcheance(null)}, "Nouvelle échéance de projet")]));
  if (!noms.length){ c.appendChild(h("p", {class: "vide"}, "Aucun projet : dans Trésorerie, modifiez une échéance (travaux, voiture…) et donnez-lui un nom de projet.")); return; }
  const etats = noms.map(n => etatProjet(n, sim));
  const ind = h("div", {class: "indicateurs"});
  const carte = (lib, val, det, neg) => h("div", {class: "indicateur"}, h("div", {class: "lib"}, lib), h("div", {class: "val" + (neg ? " neg" : "")}, val), h("div", {class: "det"}, det));
  ind.append(carte("Coût total des projets", euros(somme(etats, x => x.total), 0), noms.length + " projet(s)"),
    carte("Déjà payé", euros(somme(etats, x => x.paye), 0), somme(etats, x => x.ops.length) + " opération(s)"),
    carte("Reste à payer", euros(somme(etats, x => x.reste), 0), "selon les échéances"),
    carte("Épargne à mobiliser (12 mois)", euros(somme(etats, x => x.epargne12), 0), "le reste : " + euros(somme(etats, x => x.courant12), 0) + " par le compte courant", somme(etats, x => x.epargne12) > 0));
  c.appendChild(ind);
  c.appendChild(tableau([{titre: "Projet"}, {titre: "Coût total", num: true}, {titre: "Payé", num: true}, {titre: "Reste", num: true}, {titre: "Avancement"}, {titre: "Prochain paiement"}, {titre: "Épargne 12 mois", num: true}], etats, {ligne: x => {
    const proch = x.prevu.sort((a, b) => a.date < b.date ? -1 : 1)[0]; const pct = x.total ? Math.round(x.paye / x.total * 100) : 0;
    return h("tr", {class: "cliquable" + (etat.projet === x.nom ? " choisie" : ""), onclick: () => { etat.projet = x.nom; rafraichirEcran(); }},
      h("td", null, h("strong", null, x.nom)), h("td", {class: "num"}, euros(x.total, 0)), h("td", {class: "num"}, euros(x.paye, 0)), h("td", {class: "num"}, euros(x.reste, 0)),
      h("td", null, h("div", {class: "jauge"}, h("span", {style: {width: Math.min(100, pct) + "%"}})), h("span", {class: "petit discret"}, pct + " %")),
      h("td", null, proch ? dateFr(proch.date) + " · " + euros(-proch.montant, 0) : "—"), h("td", {class: "num" + (x.epargne12 > 0 ? " neg" : "")}, euros(x.epargne12, 0)));
  }}));
  const x = etats.find(e => e.nom === etat.projet) || etats[0];
  const g = h("div", {class: "deux"});
  g.appendChild(h("section", null, h("h2", null, "Échéancier : " + x.nom),
    tableau([{titre: "Date"}, {titre: "Paiement"}, {titre: "Montant", num: true}, {titre: "Compte courant", num: true}, {titre: "Épargne", num: true}, {titre: ""}],
      x.prevu.sort((a, b) => a.date < b.date ? -1 : 1), {classe: "serre", vide: "Aucun paiement prévu.", ligne: pv => {
        const f = x.plan.find(y => y.date === pv.date && y.libelle === pv.echeance.libelle);
        return h("tr", {class: pv.echeance.aConfirmer ? "choisie" : ""}, h("td", null, dateFr(pv.date)), h("td", null, pv.echeance.libelle, pv.echeance.note ? h("div", {class: "petit discret"}, pv.echeance.note) : null),
          montantCellule(pv.montant), h("td", {class: "num"}, f ? euros(f.duCourant, 0) : h("span", {class: "discret"}, "au-delà de 12 mois")), h("td", {class: "num" + (f?.epargne > 0 ? " neg" : "")}, f ? euros(f.epargne, 0) : ""),
          h("td", null, h("button", {class: "mini discret", onclick: () => editerEcheance(pv.echeance)}, "Modifier")));
      }}),
    h("p", {class: "note"}, "Un appel de fonds se saisit comme une échéance unique, avec le nom du projet. Les dates et montants restent modifiables jusqu'au paiement.")));
  g.appendChild(h("section", null, h("h2", null, "Paiements faits : " + x.nom),
    tableau([{titre: "Date"}, {titre: "Libellé"}, {titre: "Compte"}, {titre: "Montant", num: true}], x.ops.sort((a, b) => a.date < b.date ? 1 : -1), {classe: "serre", vide: "Aucun paiement rattaché pour l'instant.", ligne: o =>
      h("tr", {class: "cliquable", onclick: () => aller("operations", {choisie: o.id, mois: ""})}, h("td", null, dateFr(o.date)), h("td", null, obtenir("commercants", o.commercant)?.nom || o.libelle), h("td", null, libelleCompte(o.compte)), montantCellule(o.montant))}),
    h("p", {class: "note"}, "Rattachement : champ « Projet » du détail d'une opération, ou catégorie et sous-catégorie d'une échéance du projet avec la nature « Exceptionnelle ».")));
  c.appendChild(g);
}});
