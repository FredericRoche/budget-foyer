/* ================= Contrôles de cohérence =================
   Deux familles, qui ne corrigent jamais rien d'office :
   - contrôles de forme, sans pièce : opérations importées en double, classements contradictoires, périodes
     d'un compte qui n'ont pas été clôturées sur un relevé PDF ;
   - contrôles par total : une pièce qui fait foi (relevé annuel des paiements d'une caisse, bulletin de paie
     de décembre, échéancier…) donne un total pour un fournisseur et une période ; il est comparé à la somme
     des opérations de ce fournisseur sur la période. Quelques pièces par an couvrent ainsi des centaines
     d'opérations. Le total se saisit à la main (trois champs) : aucune lecture de format n'est nécessaire.
   Une alerte de forme peut être écartée (« ce n'est pas une erreur ») : sa clé va dans parametres.controlesIgnores. */

const cleIgnoree = k => (LIVRE.parametres.controlesIgnores || []).includes(k);
function ignorerControle(k){ modifierParametres({controlesIgnores: [...new Set([...(LIVRE.parametres.controlesIgnores || []), k])]}); }

/* Opérations importées en double : même compte, même date, même montant, libellés de même début
   (deux exports qui tronquent différemment le même libellé). Les vrais achats identiques du même jour
   (deux abonnements, deux lignes de téléphone) s'écartent une fois pour toutes. */
/* Une période clôturée sur relevé PDF a vu chaque ligne appariée à une écriture du relevé : des opérations
   identiques y sont de vrais achats distincts (plusieurs abonnements le même jour), pas des doublons. */
function periodeCloturee(compteId, date){
  return Object.entries(LIVRE.parametres.clotures || {}).some(([k, c]) => k.split("|")[0] === compteId && c && c.debut <= date && date <= c.fin);
}
function doublonsOperations(){
  const groupes = new Map();
  for (const o of vivants("operations")){
    if (!o.empreinte || (o.ventilation || []).length || periodeCloturee(o.compte, o.date)) continue;
    const k = o.compte + "|" + o.date + "|" + versCentimes(o.montant);
    (groupes.get(k) || groupes.set(k, []).get(k)).push(o);
  }
  const r = [];
  for (const [k, ops] of groupes){
    if (ops.length < 2) continue;
    const g = ops.filter(o => ops.some(x => x !== o && libellesCompatibles(x.libelle, o.libelle)));
    if (g.length >= 2 && !cleIgnoree("doublon|" + k)) r.push({cle: "doublon|" + k, ops: g});
  }
  return r.sort((a, b) => a.ops[0].date < b.ops[0].date ? 1 : -1);
}

/* Classements contradictoires : la nature et la catégorie se démentent. */
function classementsIncoherents(){
  const r = [];
  for (const o of vivants("operations")){
    if ((o.ventilation || []).length) continue;
    let motif = "";
    if (o.categorie === "Transfert" && o.nature === "Revenu") motif = "transfert compté comme revenu";
    else if (o.categorie === "Revenus" && o.montant < 0) motif = "débit classé en revenu";
    else if (o.nature === "Revenu" && o.categorie && o.categorie !== "Revenus" && o.categorie !== "À préciser") motif = "revenu classé hors de la catégorie Revenus";
    if (motif && !cleIgnoree("classement|" + o.id)) r.push({cle: "classement|" + o.id, op: o, motif});
  }
  return r.sort((a, b) => a.op.date < b.op.date ? 1 : -1);
}

/* Périodes non clôturées : pour un compte déjà clôturé au moins une fois sur relevé PDF, trous entre la première
   clôture et la fin du mois avant-dernier (le relevé du mois écoulé arrive dans les jours qui suivent). */
function periodesNonCloturees(){
  const parCompte = new Map();
  for (const [k, c] of Object.entries(LIVRE.parametres.clotures || {})){
    const id = k.split("|")[0];
    if (!c || !c.debut || !c.fin) continue;
    (parCompte.get(id) || parCompte.set(id, []).get(id)).push({debut: c.debut, fin: c.fin});
  }
  const borne = finDeMois(ajouterJours(aujourdhui().slice(0, 8) + "01", -32));
  const r = [];
  for (const [id, ps] of parCompte){
    const compte = obtenir("comptes", id); if (!compte) continue;
    ps.sort((a, b) => a.debut < b.debut ? -1 : 1);
    let couvert = ps[0].fin;
    for (const p of ps.slice(1)){
      if (p.debut > ajouterJours(couvert, 1)) r.push({compte, debut: ajouterJours(couvert, 1), fin: ajouterJours(p.debut, -1)});
      if (p.fin > couvert) couvert = p.fin;
    }
    if (couvert < borne) r.push({compte, debut: ajouterJours(couvert, 1), fin: borne});
  }
  return r.filter(x => !cleIgnoree("cloture|" + x.compte.id + "|" + x.debut)).map(x => Object.assign(x, {cle: "cloture|" + x.compte.id + "|" + x.debut}));
}

/* Contrôle par total : somme des opérations du fournisseur sur la période, comparée au total de la pièce.
   sens « credit » : sommes reçues (pension, salaire) ; « debit » : sommes payées (échéancier). */
function ficheDuControle(c){ return obtenir("commercants", c.commercant) || vivants("commercants").find(x => norm(x.nom) === norm(c.commercantNom || "")) || null; }
function resultatControle(c){
  const f = ficheDuControle(c);
  const ops = f ? vivants("operations").filter(o => o.commercant === f.id && o.date >= c.debut && o.date <= c.fin) : [];
  const constate = somme(ops, o => o.montant);
  const attendu = c.sens === "debit" ? -Math.abs(c.montant) : Math.abs(c.montant);
  const ecart = Math.round((constate - attendu) * 100) / 100;
  return {fiche: f, ops, constate, attendu, ecart, ok: !!f && Math.abs(ecart) < 0.01};
}

/* Nombre d'alertes, pour la pastille du menu. */
function nombreAlertesControles(){
  try {
    return doublonsOperations().length + classementsIncoherents().length + periodesNonCloturees().length
      + vivants("controles").filter(c => !resultatControle(c).ok).length;
  } catch (e) { return 0; }
}
