/* ================= Trésorerie prévisionnelle (12 mois, au jour le jour) =================
   Compte suivi : le compte de trésorerie (compte courant). Flux projetés :
   - échéances datées (loyer, pensions, impôts, travaux, voiture, cessions…) ;
   - budget courant restant, réparti selon son mode de paiement : prélèvements et
     virements étalés dans le mois ; achats par cartes LCL débités le dernier jour
     ouvré ; achats Amex débités au jour habituel du mois suivant ;
   - encours connus des cartes (achats importés, non encore débités).
   Une ligne de budget liée à une échéance n'est pas comptée deux fois.
   Trois visions séparées : la marche courante (cette simulation), l'épargne (simulerEpargne) et les
   projets. Les flux de capital (cessions de titres, paiements des projets) vont à l'épargne, même s'ils
   transitent par le compte joint ; « tout » les réunit pour retrouver le compte joint réel. */
function jourPrelevementAmex(compteId){
  const vus = vivants("operations").filter(x => (!compteId || x.compte === compteId) && x.montant < 0 && /AMERICAN EXPRESS/i.test(x.libelle))
    .sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 3).map(x => +x.date.slice(8, 10)).sort((a, b) => a - b);
  return LIVRE.parametres.amexJourPrelevement || (vus.length ? vus[Math.floor(vus.length / 2)] : 27);
}
const estCapital = e => !!e.projet || !!e.capital || e.categorie === "Patrimoine";
/* Épargne mobilisable : livrets, assurances-vie, épargne retraite (le PER sert de réserve d'appoint
   quand les revenus ne suffisent pas) et PEA ; réglable compte par compte (Réglages › Comptes).
   Valeurs brutes : la fiscalité latente n'est pas déduite. */
const estMobilisable = c => c.actif !== false && (c.mobilisable ?? ["livret", "assurance_vie", "retraite", "pea"].includes(c.type));

function occurrences(e, debut, fin){
  const r = []; const d0 = e.debut || debut;
  if (e.recurrence === "unique" || !e.recurrence){ if (d0 >= debut && d0 <= fin) r.push(d0); return r; }
  const pas = {mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12}[e.recurrence] || 1;
  let d = d0;
  while (d < debut) d = ajouterMois(d, pas);
  while (d <= fin && (!e.fin || d <= e.fin)){ r.push(d); d = ajouterMois(d, pas); }
  return r;
}
function simulerTresorerie(options){
  const o = Object.assign({jours: 365, depart: aujourdhui(), supplements: [], perimetre: "courant"}, options);
  const compte = obtenir("comptes", LIVRE.parametres.compteTresorerie) || comptesDeType("courant")[0];
  if (!compte) return null;
  const fin = ajouterJours(o.depart, o.jours);
  const soldeDepart = soldeCompte(compte, o.depart);
  const flux = new Map(); const evenements = [];
  const ajouter = (date, montant, libelle, genre, gros, recurrent) => {
    if (date <= o.depart || date > fin) return;
    flux.set(date, (flux.get(date) || 0) + montant);
    if (gros) evenements.push({date, montant, libelle, genre, recurrent: !!recurrent});
  };
  // 1. Échéances
  const lignesLiees = new Set();
  for (const e of vivants("echeances").filter(x => x.active !== false && (!x.compte || x.compte === compte.id))){
    if (e.ligneBudget) lignesLiees.add(e.ligneBudget);
    if (o.perimetre === "courant" && estCapital(e)) continue;
    for (const d of occurrences(e, ajouterJours(o.depart, 1), fin)) ajouter(d, e.montant, e.libelle, "echeance", Math.abs(e.montant) >= 1000 || e.recurrence === "unique", e.recurrence && e.recurrence !== "unique");
  }
  for (const s of o.supplements) ajouter(s.date, s.montant, s.libelle, "simulation", true);
  // 2. Encours connus des cartes rattachées à ce compte
  const amexJour = jourPrelevementAmex(compte.id);
  for (const c of vivants("comptes").filter(c => c.type === "carte" && (c.compteDebit === compte.id || !c.compteDebit))){
    const encours = vivants("operations").filter(x => x.compte === c.id && !x.dateDebit && !(x.lien && x.montant > 0) && x.date <= o.depart);
    if (!encours.length) continue;
    const total = somme(encours, x => x.montant);
    const date = c.carte === "AMEX" ? prochainJour(o.depart, amexJour) : dernierJourOuvre(o.depart);
    ajouter(date > o.depart ? date : dernierJourOuvre(ajouterMois(o.depart, 1)), total, "Débit différé " + c.nom + " (encours connu)", "carte", true);
  }
  // 3. Budget courant restant, mois par mois
  const budgetsParAnnee = {};
  let mois = debutDeMois(o.depart);
  while (mois <= fin){
    const an = +mois.slice(0, 4), m = +mois.slice(5, 7);
    // Année sans budget : on prolonge le dernier budget connu (signalé dans l'écran de trésorerie).
    const b = budgetsParAnnee[an] !== undefined ? budgetsParAnnee[an] : (budgetsParAnnee[an] = budgetActif(an) || dernierBudgetAvant(an));
    if (b){
      const finMois = finDeMois(mois);
      const realise = mois === debutDeMois(o.depart) ? realiseParLigne(mois, o.depart) : new Map();
      let compteMois = 0, cartesMois = 0, amexMois = 0;
      for (const l of b.lignes){
        if (lignesLiees.has(l.id) || l.nature === "Exceptionnelle") continue;
        const reste = Math.max(0, budgetDuMois(l, m) - (realise.get(cleLigne(l.categorie, l.sousCategorie)) || 0));
        const p = l.paiement || {compte: 1, cartes: 0, amex: 0};
        compteMois += reste * (p.compte || 0); cartesMois += reste * (p.cartes || 0); amexMois += reste * (p.amex || 0);
      }
      // prélèvements et virements étalés sur les jours restants du mois
      const premierJour = mois === debutDeMois(o.depart) ? ajouterJours(o.depart, 1) : mois;
      const nbJours = ecartJours(premierJour, finMois) + 1;
      if (nbJours > 0) for (let d = premierJour; d <= finMois; d = ajouterJours(d, 1)) ajouter(d, -compteMois / nbJours, "budget courant", "budget", false);
      if (cartesMois) ajouter(dernierJourOuvre(mois), -cartesMois, "Cartes LCL (budget du mois)", "carte", false);
      if (amexMois) ajouter(prochainJour(finMois, amexJour), -amexMois, "Amex (budget du mois)", "carte", false);
    }
    mois = ajouterMois(mois, 1);
  }
  // 4. Cumul jour par jour
  const jours = []; let solde = soldeDepart ?? 0;
  for (let d = ajouterJours(o.depart, 1); d <= fin; d = ajouterJours(d, 1)){
    const f = flux.get(d) || 0; solde += f;
    jours.push({date: d, flux: f, solde});
  }
  return {compte, depart: o.depart, soldeDepart, soldeConnu: soldeDepart !== null, jours, perimetre: o.perimetre, evenements: evenements.sort((a, b) => a.date < b.date ? -1 : 1)};
}
/* Approvisionnements du compte courant par l'épargne : à chaque passage sous le seuil bas de la
   marche courante, le virement qui l'y ramène (arrondi à la centaine supérieure). */
function approvisionnementsCourant(sim){
  const seuil = LIVRE.parametres.seuilBas || 0; let apport = 0; const r = [];
  for (const j of sim?.jours || []){ const manque = seuil - (j.solde + apport); if (manque > 0){ const m = Math.ceil(manque / 100) * 100; r.push({date: j.date, montant: m}); apport += m; } }
  return r;
}
const estVirementDepuisEpargne = (e, compte) => e.categorie === "Transfert" && e.montant > 0 && (!e.compte || e.compte === compte?.id);
/* Trésorerie de l'épargne : épargne mobilisable au départ (ses revenus y restent), plus les cessions de
   titres, moins le financement des projets et les approvisionnements du compte courant, prévus en
   échéance ou rendus nécessaires par la marche courante. */
function simulerEpargne(options){
  const o = Object.assign({jours: 365, depart: aujourdhui()}, options);
  const fin = ajouterJours(o.depart, o.jours);
  const comptes = vivants("comptes").filter(estMobilisable).map(c => ({compte: c, solde: soldeCompte(c, o.depart) || 0}));
  const soldeDepart = somme(comptes, x => x.solde);
  const courant = simulerTresorerie({depart: o.depart, jours: o.jours});
  const flux = new Map(), evenements = [];
  const ajouter = (d, m, libelle, genre, echeance) => { flux.set(d, (flux.get(d) || 0) + m); evenements.push({date: d, montant: m, libelle, genre, echeance}); };
  for (const e of vivants("echeances").filter(x => x.active !== false))
    for (const d of occurrences(e, ajouterJours(o.depart, 1), fin)){
      if (estCapital(e)) ajouter(d, e.montant, e.libelle + (e.projet ? " (projet " + e.projet + ")" : ""), e.projet ? "projet" : "capital", e);
      else if (courant && estVirementDepuisEpargne(e, courant.compte)) ajouter(d, -e.montant, e.libelle + " (vers " + courant.compte.nom + ")", "courant", e);
    }
  const appro = approvisionnementsCourant(courant);
  for (const a of appro) ajouter(a.date, -a.montant, "Approvisionnement du compte courant (déficit de la marche courante)", "courant", null);
  const jours = []; let solde = soldeDepart;
  for (let d = ajouterJours(o.depart, 1); d <= fin; d = ajouterJours(d, 1)){ const f = flux.get(d) || 0; solde += f; jours.push({date: d, flux: f, solde}); }
  return {titre: "Épargne disponible", depart: o.depart, soldeDepart, comptes, jours, approvisionnements: appro, evenements: evenements.sort((a, b) => a.date < b.date ? -1 : 1)};
}
function dernierBudgetAvant(an){
  const annees = anneesBudget().filter(a => a < an);
  return annees.length ? budgetActif(annees[annees.length - 1]) : null;
}
function prochainJour(apres, jour){
  let d = apres.slice(0, 8) + pad2(Math.min(jour, +finDeMois(apres).slice(8)));
  if (d <= apres) d = ajouterMois(d.slice(0, 8) + "01", 1).slice(0, 8) + pad2(jour);
  return d;
}
function analyseTresorerie(sim){
  if (!sim || !sim.jours.length) return null;
  const p = LIVRE.parametres;
  const min = sim.jours.reduce((a, j) => j.solde < a.solde ? j : a, sim.jours[0]);
  const premierBas = sim.jours.find(j => j.solde < p.seuilBas);
  const hauts = sim.jours.filter(j => j.solde > p.seuilHaut);
  let virement = 0, avant = null;
  if (premierBas){ virement = Math.ceil((p.seuilBas - min.solde + 5000) / 5000) * 5000; avant = ajouterJours(premierBas.date, -1); }
  // Excédent durable : au-dessus du seuil haut pendant 30 jours consécutifs ou plus
  let serie = 0, excedent = null;
  for (const j of sim.jours){ if (j.solde > p.seuilHaut){ serie++; if (serie >= 30 && !excedent) excedent = {depuis: ajouterJours(j.date, -29), montant: 0}; } else serie = 0; }
  if (excedent) excedent.montant = Math.floor((Math.min(...sim.jours.filter(j => j.date >= excedent.depuis).slice(0, 90).map(j => j.solde)) - p.seuilHaut) / 5000) * 5000;
  const parMois = new Map();
  for (const j of sim.jours){
    const k = j.date.slice(0, 7);
    if (!parMois.has(k)) parMois.set(k, {mois: k, debut: j.solde - j.flux, entrees: 0, sorties: 0, bas: Infinity, haut: -Infinity, fin: 0});
    const m = parMois.get(k);
    if (j.flux > 0) m.entrees += j.flux; else m.sorties -= j.flux;
    m.bas = Math.min(m.bas, j.solde); m.haut = Math.max(m.haut, j.solde); m.fin = j.solde;
  }
  return {min, premierBas, virement, avant, excedent, auDessus: hauts.length, mois: [...parMois.values()]};
}
