/* ================= Épargne et projets : hors marche courante du foyer =================
   Trois visions : la marche courante (écran Trésorerie), l'épargne (ses comptes, leurs revenus, les
   cessions de titres, et ce qu'elle finance) et les projets (travaux, voiture…). Un projet regroupe des échéances
   (paiements prévus) et des opérations (paiements faits). Une opération lui appartient si elle
   porte son nom (panneau de détail), ou si elle a la catégorie et la sous-catégorie d'une de ses
   échéances et la nature « Exceptionnelle ». */
function nomsProjets(){ return [...new Set(vivants("echeances").map(e => e.projet).filter(Boolean))].sort(); }
/* Rattachement d'office : nature « Exceptionnelle » et catégorie (avec sa sous-catégorie si elle est
   précisée) d'une échéance du projet ou de sa liste « rattache » ; le champ « Projet » d'une opération
   l'emporte toujours (vide = règle d'office). */
function operationsDuProjet(nom, echeances){
  const regles = echeances.flatMap(e => [...(e.rattache || []), e.categorie ? {categorie: e.categorie, sousCategorie: e.sousCategorie} : null]).filter(Boolean);
  const vaAuProjet = o => regles.some(r => r.categorie === o.categorie && (!r.sousCategorie || r.sousCategorie === o.sousCategorie));
  return vivants("operations").filter(o => o.projet === nom || (!o.projet && o.nature === "Exceptionnelle" && o.montant < 0 && vaAuProjet(o)));
}
/* Prochain paiement net : les échéances d'une même date se compensent (reprise du véhicule au jour du solde). */
function prochainPaiement(prevu){
  const parDate = new Map(); for (const p of prevu) parDate.set(p.date, (parDate.get(p.date) || 0) + p.montant);
  const d = [...parDate.keys()].sort().find(k => parDate.get(k) < -0.005);
  return d ? {date: d, montant: parDate.get(d)} : null;
}
function etatProjet(nom){
  const ech = vivants("echeances").filter(e => e.projet === nom && e.active !== false);
  const prevu = ech.flatMap(e => occurrences(e, ajouterJours(aujourdhui(), 1), "2100-12-31").map(d => ({date: d, montant: e.montant, echeance: e}))).sort((a, b) => a.date < b.date ? -1 : 1);
  const ops = operationsDuProjet(nom, ech);
  const paye = -somme(ops, o => o.montant), reste = -somme(prevu, x => x.montant);
  return {nom, ech, prevu, ops, paye, reste, total: paye + reste};
}

// Case d'indicateur ; avec « clic », elle devient un bouton qui ouvre ou referme son détail.
const carteInd = (lib, val, det, neg, clic, actif) => h(clic ? "button" : "div", {class: "indicateur" + (clic ? " cliquable" : "") + (actif ? " choisi" : ""), type: clic ? "button" : null,
  onclick: clic || null, "aria-expanded": clic ? String(!!actif) : null, title: clic ? (actif ? "Refermer le détail" : "Voir le détail") : null},
  h("div", {class: "lib"}, lib), h("div", {class: "val" + (neg ? " neg" : "")}, val), h("div", {class: "det"}, det));

/* ---------- Détail de l'épargne : se recalcule à chaque import (valorisations datées) ---------- */
const GROUPES_EPARGNE = [["Épargne réglementée", ["livret"]], ["Assurance-vie", ["assurance_vie", "prevoyance"]], ["Épargne retraite", ["retraite"]], ["PEA", ["pea"]]];
function joursEntre(a, b){ return Math.round((dateDe(b) - dateDe(a)) / 86400000); }
// Comptes mobilisables regroupés par nature : valorisation retenue, précédente, variation et part de chacun.
function detailComptesEpargne(ep){
  const total = ep.soldeDepart || 0;
  const ligne = x => {
    const v = derniereValorisation(x.compte.id, ep.depart);
    const avant = v ? vivants("valorisations").filter(w => w.compte === x.compte.id && w.date < v.date).sort((a, b) => a.date < b.date ? 1 : -1)[0] : null;
    return {compte: x.compte, solde: x.solde, date: v?.date || null, precedente: avant || null, variation: avant ? x.solde - avant.valeur : null,
      part: total ? x.solde / total : 0, ancien: !v || joursEntre(v.date, ep.depart) > 120};
  };
  const lignes = ep.comptes.map(ligne);
  const groupes = GROUPES_EPARGNE.map(([nom, types]) => ({nom, lignes: lignes.filter(l => types.includes(l.compte.type)).sort((a, b) => b.solde - a.solde)}));
  const autres = lignes.filter(l => !GROUPES_EPARGNE.some(g => g[1].includes(l.compte.type)));
  if (autres.length) groupes.push({nom: "Autres placements mobilisables", lignes: autres.sort((a, b) => b.solde - a.solde)});
  return groupes.filter(g => g.lignes.length).map(g => Object.assign(g, {total: somme(g.lignes, l => l.solde)}));
}
// De l'épargne d'aujourd'hui à celle dans 12 mois : un total par genre de mouvement.
function decompositionEpargne(ep){
  const s = f => somme(ep.evenements.filter(f), e => e.montant);
  return {depart: ep.soldeDepart, cessions: s(e => e.genre === "capital" && e.montant > 0), autresCapital: s(e => e.genre === "capital" && e.montant < 0),
    projets: s(e => e.genre === "projet"), courant: s(e => e.genre === "courant"),
    fin: ep.jours.length ? ep.jours[ep.jours.length - 1].solde : ep.soldeDepart};
}
// Financements par destination : chaque projet (net des reprises), puis le compte courant.
function financementsParDestination(ep){
  const m = new Map();
  for (const e of ep.evenements.filter(x => x.genre === "projet" || x.genre === "courant")){
    const cle = e.genre === "courant" ? "Compte courant" : "Projet " + (e.echeance?.projet || "sans nom");
    const g = m.get(cle) || {destination: cle, sorties: 0, entrees: 0, nombre: 0, premiere: e.date, derniere: e.date};
    if (e.montant < 0) g.sorties -= e.montant; else g.entrees += e.montant;
    g.nombre++; g.derniere = e.date; m.set(cle, g);
  }
  return [...m.values()].sort((a, b) => (a.destination === "Compte courant") - (b.destination === "Compte courant") || b.sorties - a.sorties);
}

function vueDetailEpargne(ep, quoi){
  const s = h("section", {class: "carte detail-epargne"});
  if (quoi === "comptes"){
    const groupes = detailComptesEpargne(ep);
    const partMax = Math.max(0.0001, ...groupes.flatMap(x => x.lignes).map(z => z.part));
    s.appendChild(h("h2", null, "Épargne disponible au " + dateFr(ep.depart) + ", compte par compte"));
    const tb = h("tbody");
    for (const g of groupes){
      tb.appendChild(h("tr", {class: "sous-titre"}, h("td", {colspan: 7}, g.nom)));
      for (const l of g.lignes) tb.appendChild(h("tr", null,
        h("td", null, l.compte.nom, h("div", {class: "petit discret"}, [TYPES_COMPTE[l.compte.type], l.compte.banque, l.compte.titulaire].filter(Boolean).join(" · "))),
        h("td", {class: l.ancien ? "neg" : ""}, l.date ? dateFr(l.date) : "aucune", l.ancien ? h("div", {class: "petit"}, "à actualiser") : null),
        h("td", {class: "num"}, euros(l.solde, 0)),
        h("td", {class: "num discret"}, l.precedente ? euros(l.precedente.valeur, 0) : "—"),
        l.variation === null ? h("td", {class: "num discret"}, "") : montantCellule(Math.round(l.variation), null, 0),
        h("td", {class: "num"}, (Math.round(l.part * 1000) / 10).toLocaleString("fr-FR") + " %"),
        h("td", null, h("span", {class: "barre-part"}, h("i", {style: {width: Math.min(100, l.part / partMax * 100) + "%"}})))));
      tb.appendChild(h("tr", {class: "total"}, h("td", {colspan: 2}, "Total " + g.nom.toLowerCase()), h("td", {class: "num"}, euros(g.total, 0)), h("td"), h("td"),
        h("td", {class: "num"}, (Math.round(g.total / (ep.soldeDepart || 1) * 1000) / 10).toLocaleString("fr-FR") + " %"), h("td")));
    }
    tb.appendChild(h("tr", {class: "total"}, h("td", {colspan: 2}, "Épargne disponible"), h("td", {class: "num"}, euros(ep.soldeDepart, 0)), h("td"), h("td"), h("td", {class: "num"}, "100 %"), h("td")));
    s.appendChild(h("div", {class: "tableau"}, h("table", {class: "serre"}, h("thead", null, h("tr", null, h("th", null, "Compte"), h("th", null, "Valorisation du"),
      h("th", {class: "num"}, "Valeur"), h("th", {class: "num"}, "Précédente"), h("th", {class: "num"}, "Variation"), h("th", {class: "num"}, "Part"), h("th", null, ""))), tb)));
    s.appendChild(h("p", {class: "note"}, "Valeurs brutes, à la dernière valorisation connue (relevé importé ou saisie dans Bilan) : chaque import de relevé met ce tableau à jour. "
      + "« À actualiser » au-delà de quatre mois. Les comptes-titres et les comptes marqués non mobilisables (Réglages) n'y figurent pas."));
  } else if (quoi === "cessions"){
    const ev = ep.evenements.filter(e => e.genre === "capital");
    s.appendChild(h("h2", null, "Cessions de titres et autres mouvements de capital (12 mois)"));
    s.appendChild(tableau([{titre: "Date"}, {titre: "Mouvement"}, {titre: "Compte crédité"}, {titre: "Montant", num: true}, {titre: ""}], ev, {classe: "serre", vide: "Aucune cession prévue dans les 12 mois.", ligne: e => h("tr", {class: e.echeance?.aConfirmer ? "choisie" : ""},
      h("td", null, dateFr(e.date)), h("td", null, e.libelle, e.echeance?.note ? h("div", {class: "petit discret"}, e.echeance.note) : null), h("td", null, e.echeance?.compte ? libelleCompte(e.echeance.compte) : ""),
      montantCellule(e.montant, null, 0), h("td", null, e.echeance ? h("button", {class: "mini discret", onclick: () => editerEcheance(e.echeance)}, "Modifier") : null))}));
    s.appendChild(h("p", {class: "note"}, "Total des encaissements : " + euros(somme(ev.filter(e => e.montant > 0), e => e.montant), 0) + ". Montants des échéances : prix et volumes restent à confirmer jusqu'à la cession."));
  } else if (quoi === "financements"){
    const parDest = financementsParDestination(ep);
    s.appendChild(h("h2", null, "Ce que l'épargne finance (12 mois)"));
    s.appendChild(tableau([{titre: "Destination"}, {titre: "Mouvements", num: true}, {titre: "Du"}, {titre: "Au"}, {titre: "Versé", num: true}, {titre: "Reçu en retour", num: true}, {titre: "Net", num: true}], parDest, {classe: "serre", vide: "Aucun financement prévu.", ligne: g => h("tr", null,
      h("td", null, g.destination), h("td", {class: "num"}, String(g.nombre)), h("td", null, dateFr(g.premiere)), h("td", null, dateFr(g.derniere)),
      h("td", {class: "num"}, euros(g.sorties, 0)), h("td", {class: "num"}, g.entrees ? euros(g.entrees, 0) : ""), h("td", {class: "num"}, euros(g.sorties - g.entrees, 0)))}));
    const ev = ep.evenements.filter(e => e.genre === "projet" || e.genre === "courant");
    if (ev.length) s.appendChild(tableau([{titre: "Date"}, {titre: "Mouvement"}, {titre: "Montant", num: true}], ev, {classe: "serre", ligne: e => h("tr", null, h("td", null, dateFr(e.date)), h("td", null, e.libelle), montantCellule(e.montant, null, 0))}));
    if (!ev.some(e => e.genre === "courant")) s.appendChild(h("p", {class: "note"}, "Aucun approvisionnement du compte courant n'est nécessaire sur 12 mois : ses encaissements prévus (cessions versées au compte joint, paie de sortie…) couvrent le déficit de la marche courante. Voir Trésorerie."));
  } else if (quoi === "fin"){
    const d = decompositionEpargne(ep);
    s.appendChild(h("h2", null, "De l'épargne d'aujourd'hui à celle dans 12 mois"));
    const lignes = [["Épargne disponible aujourd'hui", d.depart, true], ["Cessions de titres", d.cessions], ["Autres mouvements de capital", d.autresCapital],
      ["Projets (nets des reprises)", d.projets], ["Approvisionnements du compte courant", d.courant], ["Épargne dans 12 mois", d.fin, true]].filter(x => x[2] || Math.abs(x[1]) > 0.5);
    s.appendChild(h("div", {class: "tableau"}, h("table", {class: "serre"}, h("tbody", null, lignes.map(([lib, v, tot]) => h("tr", {class: tot ? "total" : ""}, h("td", null, lib), tot ? h("td", {class: "num"}, euros(v, 0)) : montantCellule(v, null, 0)))))));
    const mois = [];
    for (const j of ep.jours){ const k = j.date.slice(0, 7); let m = mois[mois.length - 1]; if (!m || m.mois !== k){ m = {mois: k, entrees: 0, sorties: 0, fin: 0}; mois.push(m); } if (j.flux > 0) m.entrees += j.flux; else m.sorties -= j.flux; m.fin = j.solde; }
    s.appendChild(h("h3", null, "Mois par mois"));
    s.appendChild(tableau([{titre: "Mois"}, {titre: "Entrées", num: true}, {titre: "Sorties", num: true}, {titre: "Épargne en fin de mois", num: true}], mois, {classe: "serre", ligne: m => h("tr", null,
      h("td", null, MOIS_LONG[+m.mois.slice(5) - 1] + " " + m.mois.slice(0, 4)), h("td", {class: "num"}, m.entrees ? euros(m.entrees, 0) : ""), h("td", {class: "num"}, m.sorties ? euros(m.sorties, 0) : ""), h("td", {class: "num" + (m.fin < 0 ? " neg" : "")}, euros(m.fin, 0)))}));
    s.appendChild(h("p", {class: "note"}, "Hors revenus futurs des placements (intérêts, plus-values), qui ne sont pas projetés : l'épargne réelle sera un peu plus élevée."));
  }
  return s;
}

declarerEcran("epargne", {titre: "Épargne", rendre(c, etat){
  const ep = simulerEpargne();
  c.appendChild(entete("Épargne", "Livrets, assurances-vie et PER (leurs revenus y restent ; valeurs brutes, sans fiscalité latente) · cessions de titres · financement des projets et du compte courant"));
  const min = ep.jours.length ? ep.jours.reduce((a, j) => j.solde < a.solde ? j : a, ep.jours[0]) : null;
  const fin = ep.jours.length ? ep.jours[ep.jours.length - 1].solde : ep.soldeDepart;
  const parGenre = g => -somme(ep.evenements.filter(e => e.genre === g && e.montant < 0), e => e.montant);
  const ind = h("div", {class: "indicateurs"});
  const bascule = q => () => { etat.detail = etat.detail === q ? null : q; rafraichirEcran(); };
  ind.append(carteInd("Épargne disponible aujourd'hui", euros(ep.soldeDepart, 0), ep.comptes.length + " compte(s) mobilisable(s)", false, bascule("comptes"), etat.detail === "comptes"),
    carteInd("Cessions de titres (12 mois)", euros(somme(ep.evenements.filter(e => e.genre === "capital" && e.montant > 0), e => e.montant), 0), "encaissements prévus", false, bascule("cessions"), etat.detail === "cessions"),
    carteInd("Financements (12 mois)", euros(parGenre("projet") + parGenre("courant"), 0), "projets " + euros(parGenre("projet"), 0) + " · compte courant " + euros(parGenre("courant"), 0), false, bascule("financements"), etat.detail === "financements"),
    carteInd("Épargne dans 12 mois", euros(fin, 0), min ? "au plus bas " + euros(min.solde, 0) + " le " + dateFr(min.date) : "", fin < 0 || (min && min.solde < 0), bascule("fin"), etat.detail === "fin"));
  c.appendChild(ind);
  if (etat.detail) c.appendChild(vueDetailEpargne(ep, etat.detail));
  if (min && min.solde < 0) c.appendChild(h("div", {class: "bandeau alerte"}, "L'épargne disponible passe sous zéro le " + dateFr(ep.jours.find(j => j.solde < 0).date)
    + " : il manque " + euros(-min.solde, 0) + " (avancer une cession, décaler un paiement de projet, ou mobiliser un autre placement)."));
  if (!ep.comptes.length) c.appendChild(h("div", {class: "bandeau info"}, "Aucune épargne mobilisable connue : importez les relevés des livrets, assurances-vie et PER (ou saisissez une valorisation dans Bilan), sinon l'épargne part de 0 €."));
  c.appendChild(h("section", {class: "carte"}, h("div", {class: "petit discret"}, "Au départ : " + euros(ep.soldeDepart, 0) + " sur " + ep.comptes.length + " compte(s). Cliquez sur une case ci-dessus pour son détail."),
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
  const proch = etats.map(x => Object.assign({projet: x.nom}, prochainPaiement(x.prevu) || {date: "9999"})).filter(x => x.montant).sort((a, b) => a.date < b.date ? -1 : 1)[0];
  const ind = h("div", {class: "indicateurs"});
  ind.append(carteInd("Coût total des projets", euros(somme(etats, x => x.total), 0), noms.length + " projet(s)"),
    carteInd("Déjà payé", euros(somme(etats, x => x.paye), 0), somme(etats, x => x.ops.length) + " opération(s)"),
    carteInd("Reste à payer", euros(somme(etats, x => x.reste), 0), "selon les échéances"),
    carteInd("Prochain paiement", proch ? euros(-proch.montant, 0) : "—", proch ? dateFr(proch.date) + " · " + proch.projet : ""));
  c.appendChild(ind);
  c.appendChild(tableau([{titre: "Projet"}, {titre: "Coût total", num: true}, {titre: "Payé", num: true}, {titre: "Reste", num: true}, {titre: "Avancement"}, {titre: "Prochain paiement"}], etats, {ligne: x => {
    const pr = prochainPaiement(x.prevu); const pct = x.total ? Math.round(x.paye / x.total * 100) : 0;
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
    h("p", {class: "note"}, "Rattachement : champ « Projet » du détail d'une opération, ou d'office pour une dépense « Exceptionnelle » de la catégorie d'une échéance du projet (ou des catégories qui lui sont rattachées).")));
  c.appendChild(g);
}});
