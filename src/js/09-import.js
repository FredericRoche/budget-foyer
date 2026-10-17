/* ================= Intégration des fichiers lus dans le livre =================
   preparer…() calcule un aperçu (nouvelles lignes, doublons écartés, contrôles)
   sans rien écrire ; appliquer…() enregistre. Dédoublonnage par empreinte :
   compte + date + montant + libellé normalisé + rang d'occurrence dans le fichier. */

const cleEmpreinte = libelle => norm(libelle).toUpperCase().replace(/[^A-Z0-9]/g, "");
function empreintes(compteId, lignes){
  const rangs = new Map();
  return lignes.map(l => {
    const base = [compteId, l.date, versCentimes(l.montant), cleEmpreinte(l.libelle)].join("|");
    const r = (rangs.get(base) || 0) + 1; rangs.set(base, r);
    return base + "|" + r;
  });
}
function indexEmpreintes(){
  const m = new Map();
  for (const op of vivants("operations")) if (op.empreinte) m.set(op.empreinte, op);
  return m;
}
/* LCL double chaque ligne carte de l'export du compte : on garde ceil(n/2) exemplaires des lignes identiques. */
function dedoublonnerCartesLcl(lignes){
  const groupes = regrouper(lignes, l => [l.date, versCentimes(l.montant), l.libelle].join("|"));
  const r = [];
  for (const g of groupes.values()) r.push(...g.slice(0, Math.ceil(g.length / 2)));
  return {gardees: r, ecartees: lignes.length - r.length};
}

/* ---------- Comptes : recherche et création ---------- */
function trouverCompte(critere){
  return vivants("comptes").find(c =>
    (critere.carte && c.carte === critere.carte && (!critere.banque || c.banque === critere.banque)) ||
    (!critere.carte && critere.numero && c.numero === critere.numero && c.type === (critere.type || c.type)) ||
    (critere.id && c.id === critere.id)) || null;
}
function compteCourantLcl(numero){ return vivants("comptes").find(c => c.type === "courant" && c.banque === "LCL" && (!numero || c.numero === numero)); }
function compteCartesNonVentilees(debit){
  let c = vivants("comptes").find(x => x.type === "carte" && x.carte === "LCL-NV");
  if (!c) c = enregistrer("comptes", {nom: "Cartes LCL (sans titulaire)", type: "carte", banque: "LCL", carte: "LCL-NV", compteDebit: debit || "", actif: true,
    note: "Lignes carte venues de l'export du compte, avant les exports par carte."});
  return c;
}
/* Proposition de compte à créer pour un fichier dont le compte est inconnu. */
function compteAProposer(lu){
  if (lu.genre === "compte") return {nom: "Compte " + lu.banque + " …" + lu.numero.slice(-4), type: "courant", banque: lu.banque, numero: lu.numero, titulaire: "Joint"};
  if (lu.genre === "carte" && lu.banque === "Amex") return {nom: "Amex", type: "carte", banque: "Amex", carte: "AMEX", compteDebit: compteCourantLcl()?.id || ""};
  if (lu.genre === "carte") return {nom: "Carte " + (lu.libelleCarte || "LCL") + " " + lu.carte, type: "carte", banque: lu.banque, carte: lu.carte, numero: lu.numero,
    compteDebit: compteCourantLcl(lu.numero)?.id || ""};
  if (lu.genre === "valorisation") return {nom: lu.produit + (lu.numero ? " …" + String(lu.numero).slice(-4) : ""), type: lu.typeCompte, banque: lu.etablissement, numero: lu.numero || ""};
  return null;
}
function compteDuFichier(lu){
  if (lu.genre === "compte") return trouverCompte({numero: lu.numero, type: "courant"});
  if (lu.genre === "carte") return trouverCompte({carte: lu.carte, banque: lu.banque});
  if (lu.genre === "valorisation"){
    return vivants("comptes").find(c => lu.numero && c.numero && String(c.numero).replace(/\s/g, "") === String(lu.numero).replace(/\s/g, ""))
      || vivants("comptes").find(c => !lu.numero && c.type === lu.typeCompte && norm(c.produit || c.nom).includes(norm(lu.produit))) || null;
  }
  if (lu.genre === "facture_cb") return compteCourantLcl(lu.numero) || compteCourantLcl();
  return null;
}

/* ---------- Relevés (compte courant ou carte) ---------- */
function preparerReleve(lu, compte){
  const idx = indexEmpreintes();
  const res = {lu, compte, nouvelles: [], deja: [], ecartees: [], reattribuees: [], controles: []};
  let lignes = lu.lignes.slice();
  if (lu.genre === "compte" && lu.banque === "LCL"){
    const cartes = lignes.filter(l => l.type === "Carte");
    lignes = lignes.filter(l => l.type !== "Carte");
    // Lignes carte : écartées si les exports par carte couvrent leur date, sinon gardées (dédoublonnées) sur le compte « sans titulaire ».
    const couvertes = periodesCartes();
    const aGarder = [];
    for (const l of cartes) (couvertes.some(p => l.date >= p.debut && l.date <= p.fin) ? res.ecartees : aGarder).push(l);
    const d = dedoublonnerCartesLcl(aGarder);
    res.doublonsLcl = d.ecartees;
    res.cartesSansTitulaire = d.gardees;
    // Contrôle du solde : solde initial + opérations hors carte + factures de cartes débitées = solde final
    const factures = vivants("factures").filter(f => f.compteDebit === compte?.id && f.dateDebit > lu.periode.debut && f.dateDebit <= lu.periode.fin);
    const calc = versCentimes(lu.soldeDebut) + somme(lignes, l => versCentimes(l.montant)) - somme(factures, f => versCentimes(f.montant));
    const ecart = versCentimes(lu.soldeFin) - calc;
    res.controles.push({ok: Math.abs(ecart) < 2, texte: Math.abs(ecart) < 2
      ? "solde " + euros(lu.soldeFin) + " (hors lignes carte, factures de cartes incluses)"
      : "écart de " + euros(ecart / 100) + " sur le solde : facture de cartes à importer ?"});
  }
  if (lu.genre === "carte" && lu.controle) res.controles.push(lu.controle);
  const cid = compte ? compte.id : "?";
  const emp = empreintes(cid, lignes);
  // Pour un export par carte : une ligne déjà venue de l'export du compte (compte « sans titulaire ») est réattribuée.
  const nv = lu.genre === "carte" && lu.banque === "LCL" ? vivants("comptes").find(c => c.carte === "LCL-NV") : null;
  const empNv = nv ? empreintes(nv.id, lignes) : [];
  lignes.forEach((l, i) => {
    if (idx.has(emp[i])) res.deja.push(l);
    else if (nv && idx.has(empNv[i])) res.reattribuees.push({ligne: l, op: idx.get(empNv[i]), empreinte: emp[i]});
    else res.nouvelles.push(Object.assign({}, l, {empreinte: emp[i]}));
  });
  if (res.cartesSansTitulaire?.length){
    const c = vivants("comptes").find(x => x.carte === "LCL-NV");
    const e2 = empreintes(c ? c.id : "LCL-NV", res.cartesSansTitulaire);
    res.cartesSansTitulaire = res.cartesSansTitulaire.map((l, i) => Object.assign({}, l, {empreinte: e2[i]})).filter(l => !idx.has(l.empreinte));
  }
  for (const n of res.nouvelles) n.proposition = proposerClassement({libelle: n.libelle, montant: n.montant, date: n.date, compte: cid, mcc: n.mcc, categorieBanque: n.categorieBanque});
  return res;
}
function periodesCartes(){
  return vivants("imports").filter(i => i.genre === "carte" && i.banque === "LCL").map(i => i.periode);
}
function creerOperation(compte, l, importId){
  const op = {compte: compte.id, date: l.date, montant: Math.round(l.montant * 100) / 100, libelle: l.libelle, detail: l.detail || "", type: l.type || "",
    mcc: l.mcc || "", categorieBanque: l.categorieBanque || "", ville: l.ville || "", empreinte: l.empreinte, import: importId, justificatifs: []};
  if (compte.type === "carte") op.dateDebit = null; else op.dateDebit = l.date;
  classerAutomatiquement(op);
  return enregistrer("operations", op);
}
function appliquerReleve(prep){
  const imp = enregistrer("imports", {genre: prep.lu.genre, banque: prep.lu.banque, fichier: prep.lu.nom, compte: prep.compte.id, periode: prep.lu.periode,
    date: new Date().toISOString(), nouvelles: prep.nouvelles.length, deja: prep.deja.length});
  for (const l of prep.nouvelles) creerOperation(prep.compte, l, imp.id);
  for (const r of prep.reattribuees) enregistrer("operations", Object.assign(r.op, {compte: prep.compte.id, empreinte: r.empreinte}));
  if (prep.cartesSansTitulaire?.length){
    const nv = compteCartesNonVentilees(prep.compte.id);
    // Empreintes recalculées avec l'identifiant réel du compte (il peut naître ici).
    const idx = indexEmpreintes();
    const emp = empreintes(nv.id, prep.cartesSansTitulaire);
    prep.cartesSansTitulaire.forEach((l, i) => { if (!idx.has(emp[i])) creerOperation(nv, Object.assign({}, l, {empreinte: emp[i]}), imp.id); });
  }
  if (prep.lu.genre === "compte"){
    enregistrer("soldes", {compte: prep.compte.id, date: prep.lu.periode.debut, solde: prep.lu.soldeDebut, source: prep.lu.nom, debut: true});
    enregistrer("soldes", {compte: prep.compte.id, date: prep.lu.periode.fin, solde: prep.lu.soldeFin, source: prep.lu.nom});
  }
  apresImport();
  return imp;
}

/* ---------- Factures des cartes LCL ---------- */
function preparerFacture(lu, compte){
  const deja = vivants("factures").find(f => f.arrete === lu.arrete && f.compteDebit === compte?.id);
  const precedente = vivants("factures").filter(f => f.compteDebit === compte?.id && f.arrete < lu.arrete).sort((a, b) => a.arrete < b.arrete ? 1 : -1)[0];
  // Achats du lendemain de la fin de période précédente jusqu'à la fin de période (deux jours ouvrés avant l'arrêté).
  // Sans facture précédente : la période précédente est supposée close à la fin du mois d'avant.
  const fin = finPeriodeCarte(lu.arrete);
  const debut = ajouterJours(precedente ? (precedente.finPeriode || finPeriodeCarte(precedente.arrete)) : finPeriodeCarte(dernierJourOuvre(ajouterMois(debutDeMois(lu.arrete), -1))), 1);
  const cartes = vivants("comptes").filter(c => c.type === "carte" && c.banque === "LCL" && (c.compteDebit === compte?.id || !c.compteDebit));
  const ops = vivants("operations").filter(o => cartes.some(c => c.id === o.compte) && o.date >= debut && o.date <= fin && (deja ? (!o.facture || o.facture === deja.id) : (!o.facture && (!o.dateDebit || o.debitEstime))));
  const total = -somme(ops, o => versCentimes(o.montant)) / 100;
  const parCarte = cartes.map(c => ({compte: c, total: -somme(ops.filter(o => o.compte === c.id), o => versCentimes(o.montant)) / 100})).filter(x => x.total);
  return {lu, compte, deja, debut, fin, ops, total, parCarte, ecart: Math.round((lu.montant - total) * 100) / 100};
}
function appliquerFacture(prep){
  const f = enregistrer("factures", Object.assign(prep.deja || {}, {arrete: prep.lu.arrete, dateDebit: prep.lu.dateDebit, dateValeur: prep.lu.dateValeur,
    montant: prep.lu.montant, compteDebit: prep.compte.id, fichier: prep.lu.nom, ecart: prep.ecart, debutPeriode: prep.debut, finPeriode: prep.fin}));
  for (const o of prep.ops) enregistrer("operations", Object.assign(o, {dateDebit: prep.lu.dateDebit, debitEstime: false, facture: f.id}));
  const empreinte = "facture|" + prep.compte.id + "|" + prep.lu.arrete;
  if (!vivants("operations").some(o => o.empreinte === empreinte)){
    enregistrer("operations", {compte: prep.compte.id, date: prep.lu.dateDebit, dateDebit: prep.lu.dateDebit, montant: -prep.lu.montant,
      libelle: "RELEVE CB AU " + dateFr(prep.lu.arrete), categorie: "Transfert", sousCategorie: "Facture cartes", nature: "Hors budget",
      statut: "classe", verrou: true, origine: "facture", facture: f.id, empreinte, justificatifs: []});
  }
  apresImport();
  return f;
}

/* ---------- Valorisations ---------- */
function appliquerValorisation(lu, compte){
  const deja = vivants("valorisations").find(v => v.compte === compte.id && v.date === lu.date);
  enregistrer("valorisations", Object.assign(deja || {}, {compte: compte.id, date: lu.date, valeur: lu.valeur, source: lu.nom,
    details: lu.lignes || null, partiel: !!lu.partiel, complements: {versements: lu.versements, renteMinimale: lu.renteMinimale, capitalDeces: lu.capitalDeces, cotisation: lu.cotisation}}));
}

/* ---------- Après chaque import : transferts, débits différés, rapprochements ---------- */
function apresImport(){
  apparierTransferts();
  affecterDebitsAmex();
  estimerDebitsCartes();
  rapprocherTout();
}
/* Prélèvement Amex sur le compte courant ↔ paiement reçu sur le compte Amex ; virements entre comptes du foyer. */
function apparierTransferts(){
  const ops = vivants("operations");
  const libres = ops.filter(o => !o.lien && (o.categorie === "Transfert" || /AMERICAN EXPRESS|PRELEVEMENT AUTOMATIQUE/i.test(o.libelle)));
  for (const a of libres){
    if (a.lien || a.montant >= 0) continue;
    const b = libres.find(x => !x.lien && x !== a && x.compte !== a.compte && versCentimes(x.montant) === -versCentimes(a.montant) && Math.abs(ecartJours(a.date, x.date)) <= 5);
    if (!b) continue;
    for (const [o, autre] of [[a, b], [b, a]]){
      Object.assign(o, {lien: autre.id, categorie: "Transfert", sousCategorie: /AMERICAN|AMEX|PRELEVEMENT AUTOMATIQUE/i.test(a.libelle + b.libelle) ? "Paiement Amex" : "Virement entre comptes",
        nature: "Hors budget", statut: "classe"});
      enregistrer("operations", o);
    }
  }
}
/* Date de débit des achats Amex : au prélèvement, les achats non encore débités dont la somme égale le montant prélevé. */
function affecterDebitsAmex(){
  const amex = vivants("comptes").find(c => c.carte === "AMEX"); if (!amex) return;
  const paiements = vivants("operations").filter(o => o.compte === amex.id && o.montant > 0 && o.lien).sort((a, b) => a.date < b.date ? -1 : 1);
  for (const p of paiements){
    const prlv = obtenir("operations", p.lien); if (!prlv) continue;
    if (vivants("operations").some(o => o.compte === amex.id && o.paiementAmex === p.id)) continue;
    const achats = vivants("operations").filter(o => o.compte === amex.id && !o.dateDebit && o.date <= prlv.date && o.id !== p.id && !(o.montant > 0 && o.lien))
      .sort((a, b) => a.date < b.date ? -1 : 1);
    let cumul = 0, n = -1;
    for (let i = 0; i < achats.length; i++){ cumul += -versCentimes(achats[i].montant); if (Math.abs(cumul - versCentimes(p.montant)) <= 100){ n = i; break; } }
    if (n < 0) continue;
    for (const o of achats.slice(0, n + 1)) enregistrer("operations", Object.assign(o, {dateDebit: prlv.date, paiementAmex: p.id}));
  }
}

/* Achats carte repris d'un historique, sans facture ni prélèvement rattachés : date de débit estimée (debitEstime).
   Cartes LCL : facture au dernier jour ouvré du mois, pour les achats jusqu'à deux jours ouvrés plus tôt ; au-delà, mois suivant.
   Amex : chaque prélèvement « American Express » du compte de débit solde, dans l'ordre, les achats les plus anciens
   dont la somme lui est égale (à 1 € près) ; un achat ancien resté seul va au prélèvement qui le suit.
   Un débit postérieur à la dernière donnée connue reste « à venir » : c'est l'encours. Renvoie le nombre d'opérations modifiées. */
function estimerDebitsCartes(){
  const ops = vivants("operations");
  const fin = ops.reduce((m, o) => o.date > m ? o.date : m, "");
  const visee = o => o.origine === "reprise" && !o.facture && !o.paiementAmex && !(o.lien && o.montant > 0)
    && (!o.dateDebit || o.debitEstime || o.dateDebit === o.date);
  const parDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  const voulu = new Map();
  for (const c of vivants("comptes").filter(c => c.type === "carte")){
    const achats = ops.filter(o => o.compte === c.id && visee(o)).sort(parDate);
    if (c.banque === "LCL"){
      for (const o of achats){
        let a = dernierJourOuvre(o.date);
        if (o.date > finPeriodeCarte(a)) a = dernierJourOuvre(ajouterMois(debutDeMois(o.date), 1));
        voulu.set(o, a <= fin ? a : null);
      }
    } else if (c.carte === "AMEX"){
      const prlvs = ops.filter(o => o.compte === c.compteDebit && o.montant < 0 && /AMERICAN EXPRESS/i.test(o.libelle)).sort(parDate);
      let reste = achats.slice(), dernier = null;
      for (const p of prlvs){
        const cand = reste.filter(o => o.date < p.date);
        let cumul = 0, n = -1;
        for (let i = 0; i < cand.length; i++){ cumul += -versCentimes(cand[i].montant); if (Math.abs(cumul + versCentimes(p.montant)) <= 100){ n = i; break; } }
        if (n < 0) continue;
        for (const o of cand.slice(0, n + 1)) voulu.set(o, p.date);
        reste = reste.filter(o => !voulu.has(o)); dernier = p.date;
      }
      for (const o of reste){
        const suivant = dernier && o.date < ajouterJours(dernier, -40) ? prlvs.find(p => p.date > o.date) : null;
        voulu.set(o, suivant ? suivant.date : null);
      }
    }
  }
  let n = 0;
  for (const [o, d] of voulu){
    if ((o.dateDebit || null) === d && !!o.debitEstime === !!d) continue;
    enregistrer("operations", Object.assign(o, {dateDebit: d, debitEstime: !!d})); n++;
  }
  return n;
}

/* ---------- Plan importé d'un fichier JSON : budgets, échéances et règles ----------
   Un budget de même nom et de même année est remplacé ; une échéance de même libellé et de
   même date de début aussi. Rien d'autre n'est modifié. */
function appliquerPlan(contenu){
  const r = {budgets: 0, echeances: 0, regles: 0};
  for (const b of contenu.budgets || []){
    for (const l of b.lignes || []){ if (!l.id) l.id = "lb-" + idAleatoire(8); ajouterCategorieSilencieuse(l.categorie, l.sousCategorie); }
    for (const lx of Object.keys(b.lignes?.[0]?.repartition || {})) ajouterLieu(lx);
    for (const l of b.lignes || []) if (l.nature && !LIVRE.parametres.natures.includes(l.nature)) modifierParametres({natures: [...LIVRE.parametres.natures, l.nature]});
    const existant = vivants("budgets").find(x => x.nom === b.nom && x.annee === b.annee);
    if (!existant && b.actif) for (const autre of vivants("budgets").filter(x => x.annee === b.annee && x.actif)) enregistrer("budgets", Object.assign(autre, {actif: false}));
    enregistrer("budgets", Object.assign(existant || {}, b)); r.budgets++;
  }
  const courant = obtenir("comptes", LIVRE.parametres.compteTresorerie) || comptesDeType("courant")[0];
  for (const e of contenu.echeances || []){
    const existant = vivants("echeances").find(x => x.libelle === e.libelle && x.debut === e.debut);
    if (e.categorie) ajouterCategorieSilencieuse(e.categorie, e.sousCategorie);
    enregistrer("echeances", Object.assign(existant || {}, {compte: courant?.id || ""}, e)); r.echeances++;
  }
  if (contenu.regles?.length) r.regles = appliquerRegles({regles: contenu.regles});
  return r;
}

/* ---------- Règles importées d'un fichier JSON ---------- */
function appliquerRegles(contenu){
  let n = 0;
  for (const r of contenu.regles || []){
    const existante = vivants("regles").find(x => x.nom === r.nom);
    enregistrer("regles", Object.assign(existante || {}, r, {active: r.active !== false}));
    if (r.categorie) ajouterCategorieSilencieuse(r.categorie, r.sousCategorie);
    if (r.lieu) ajouterLieu(r.lieu);
    n++;
  }
  for (const c of contenu.commercants || []){
    const fiche = assurerCommercant(c.alias?.[0] || c.nom, c.nom);
    if (!fiche) continue;
    fiche.nom = c.nom;
    for (const a of c.alias || []) ajouterAlias(fiche, a);
    Object.assign(fiche, {categorie: c.categorie || fiche.categorie, sousCategorie: c.sousCategorie || fiche.sousCategorie, nature: c.nature || fiche.nature || "Courante",
      lieu: c.lieu || fiche.lieu || "", fixe: !!c.categorie});
    if (c.categorie) ajouterCategorieSilencieuse(c.categorie, c.sousCategorie);
    if (c.lieu) ajouterLieu(c.lieu);
    enregistrer("commercants", fiche);
  }
  for (const l of contenu.lieux || []) ajouterLieu(l);
  for (const n2 of contenu.natures || []) if (!LIVRE.parametres.natures.includes(n2)) modifierParametres({natures: [...LIVRE.parametres.natures, n2]});
  invaliderIndex();
  return n;
}
