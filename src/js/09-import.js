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
const numeroCourt = n => { const t = String(n || "").replace(/[\s.-]/g, "").toUpperCase().replace(/[A-Z]$/, "").replace(/^0+/, ""); return t.length >= 5 ? t : ""; };
/* Réparation (05/11/2026) : un même placement créé deux fois (numéro avec et sans lettre clé, ex. PEA « 089331 » et
   « 089331B ») : les valeurs du compte en double rejoignent le compte actif, le double est désactivé. */
function reunirPlacementsEnDouble(){
  let n = 0;
  const placements = vivants("comptes").filter(c => !["courant", "carte", "especes"].includes(c.type) && numeroCourt(c.numero));
  for (const c of placements.filter(x => x.actif !== false)){
    for (const d of placements.filter(x => x.id !== c.id && x.type === c.type && numeroCourt(x.numero) === numeroCourt(c.numero) && x.actif === false)){
      for (const v of vivants("valorisations").filter(v => v.compte === d.id)){
        const deja = vivants("valorisations").find(w => w.compte === c.id && w.date === v.date);
        if (deja && deja.source && !v.source) continue;   // une valeur de relevé n'est pas remplacée par une saisie
        if (deja) supprimer("valorisations", deja.id);
        enregistrer("valorisations", Object.assign(v, {compte: c.id})); n++;
      }
    }
  }
  return n;
}
function compteDuFichier(lu){
  if (lu.genre === "compte") return trouverCompte({numero: lu.numero, type: "courant"});
  if (lu.genre === "carte") return trouverCompte({carte: lu.carte, banque: lu.banque});
  if (lu.genre === "valorisation"){
    // Numéro exact, sinon au même numéro court (sans zéros de tête ni lettre clé finale : « 089331 » = « 089331B »),
    // de préférence un compte actif du même type
    const exact = vivants("comptes").find(c => lu.numero && c.numero && String(c.numero).replace(/\s/g, "") === String(lu.numero).replace(/\s/g, ""));
    const court = numeroCourt(lu.numero);
    const proches = court ? vivants("comptes").filter(c => numeroCourt(c.numero) === court) : [];
    return (exact && exact.actif !== false ? exact : null)
      || proches.find(c => c.actif !== false && c.type === lu.typeCompte) || proches.find(c => c.actif !== false) || exact || proches[0]
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
    // Lignes carte (dédoublonnées) : écartées seulement si le même achat (date, montant ; à un jour près) est déjà
    // sur une carte LCL ; sinon gardées sur le compte « sans titulaire ». Avant le 05/11/2026, elles étaient écartées dès
    // qu'un export par carte couvrait leur date : un export d'encours tiré avant que les paiements récents (téléphone)
    // n'y figurent faisait perdre ces achats.
    const d = dedoublonnerCartesLcl(cartes);
    res.doublonsLcl = d.ecartees;
    const lcl = new Set(vivants("comptes").filter(c => c.type === "carte" && c.banque === "LCL").map(c => c.id));
    const reserve = new Map();
    for (const o of vivants("operations").filter(o => lcl.has(o.compte))){ const k = o.date + "|" + versCentimes(o.montant); if (!reserve.has(k)) reserve.set(k, []); reserve.get(k).push(o); }
    const prendre = k => { const l = reserve.get(k); return l && l.length ? l.shift() : null; };
    // Les lignes carte de l'export du compte sont celles débitées en fin de mois (débit différé) : date de débit connue
    const dDebit = dernierJourOuvre(lu.periode.fin) <= aujourdhui() ? dernierJourOuvre(lu.periode.fin) : null;
    res.debitsCartes = [];
    const restent = [];
    for (const l of d.gardees){ const o = prendre(l.date + "|" + versCentimes(l.montant)); if (o){ res.ecartees.push(l); res.debitsCartes.push(o); } else restent.push(l); }
    res.cartesSansTitulaire = restent.filter(l => {
      const c = versCentimes(l.montant);
      const o = prendre(ajouterJours(l.date, -1) + "|" + c) || prendre(ajouterJours(l.date, 1) + "|" + c);
      if (o){ res.ecartees.push(l); res.debitsCartes.push(o); return false; }
      return true;
    }).map(l => Object.assign({}, l, {dateDebit: dDebit}));
    res.dateDebitCartes = dDebit;
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
    if (idx.has(emp[i])){ res.deja.push(l); if (l.cheque){ const o = idx.get(emp[i]); if (o && !o.cheque) (res.cheques = res.cheques || []).push({op: o, cheque: l.cheque}); } }
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
/* Détail des cartes lu dans un relevé PDF : une préparation par carte. Une ligne déjà présente sur la carte
   (ou sur « Cartes LCL (sans titulaire) ») à la même date et pour le même montant n'est pas recréée, quel que
   soit son libellé (celui du PDF diffère de celui des exports CSV) ; deux achats identiques du même jour restent deux. */
function preparerCartesPdf(lu){
  const nv = vivants("comptes").find(c => c.carte === "LCL-NV");
  const preps = [];
  for (const c of lu.cartes){
    const compte = trouverCompte({carte: c.carte, banque: "LCL"}) || nv || null;
    const sansTitulaire = !trouverCompte({carte: c.carte, banque: "LCL"});
    const cle = (d, m) => d + "|" + versCentimes(m);
    const existants = new Map();
    for (const op of vivants("operations").filter(o => compte && (o.compte === compte.id || (nv && o.compte === nv.id))))
      existants.set(cle(op.date, op.montant), (existants.get(cle(op.date, op.montant)) || 0) + 1);
    const vus = new Map(), nouvelles = [], deja = [];
    for (const l of c.lignes){
      const k = cle(l.date, l.montant); const n = (vus.get(k) || 0) + 1; vus.set(k, n);
      (n <= (existants.get(k) || 0) ? deja : nouvelles).push(l);
    }
    const emp = empreintes(compte ? compte.id : "?", nouvelles);
    preps.push({lu: Object.assign({}, lu, {genre: "carte", carte: c.carte, lignes: c.lignes, periode: {debut: c.lignes.map(l => l.date).sort()[0], fin: c.lignes.map(l => l.date).sort().pop()}}),
      carte: c, compte, sansTitulaire, deja, reattribuees: [], ecartees: [], controles: [c.controle],
      nouvelles: nouvelles.map((l, i) => Object.assign({}, l, {empreinte: emp[i], proposition: proposerClassement({libelle: l.libelle, montant: l.montant, date: l.date, compte: compte ? compte.id : "?"})}))});
  }
  return {cartes: preps, nouvelles: preps.flatMap(p => p.nouvelles),
    controles: preps.map(p => p.controles[0]).concat(preps.filter(p => p.sansTitulaire).map(p => ({ok: true, texte: "carte " + p.carte.numero + " (" + p.carte.titulaire + ") inconnue : lignes sur « Cartes LCL (sans titulaire) »"})))};
}
function appliquerCartesPdf(prep){
  let n = 0;
  for (const p of prep.cartes){
    if (!p.compte) p.compte = compteCartesNonVentilees(compteCourantLcl()?.id || "");
    if (!p.nouvelles.length) continue;
    appliquerReleve(p); n += p.nouvelles.length;
  }
  return n;
}
/* ---------- Clôture du mois sur le relevé PDF LCL (la pièce qui fait foi) ----------
   Compare les écritures du relevé à celles de l'application sur la même période : chaque écriture du relevé
   cherche une opération de même montant à 4 jours près. Restent : les manquantes (à ajouter, cochées d'office)
   et celles de l'application absentes du relevé (doublons, lignes en trop : à décider, jamais supprimées d'office).
   Même contrôle pour les cartes sur les dates du détail des cartes. Solde final comparé au centime. */
function compteDuReleveLcl(numero){
  const n = String(numero || "").replace(/\s/g, "").replace(/^0+/, "");
  return vivants("comptes").find(c => c.type === "courant" && c.banque === "LCL" && n && String(c.numero || "").replace(/\s/g, "").replace(/^0+/, "").endsWith(n))
    || compteCourantLcl();
}
function apparier(pdf, app, tolerance){
  const libres = new Set(app), paires = [];
  const cands = [];
  pdf.forEach((l, i) => { for (const o of app) if (versCentimes(o.montant) === versCentimes(l.montant)){ const d = Math.abs(ecartJours(l.date, o.date)); if (d <= tolerance) cands.push({i, o, d}); } });
  cands.sort((a, b) => a.d - b.d);
  const prisPdf = new Set();
  for (const c of cands) if (!prisPdf.has(c.i) && libres.has(c.o)){ prisPdf.add(c.i); libres.delete(c.o); paires.push(c); }
  return {manquants: pdf.filter((l, i) => !prisPdf.has(i)), enTrop: [...libres], conformes: paires.length};
}
function preparerClotureLcl(lu){
  const r = lu.releveCompte, compte = compteDuReleveLcl(lu.numero);
  if (!compte) return null;
  const {debut, fin} = r.periode;
  const opsCompte = vivants("operations").filter(o => o.compte === compte.id && o.date >= debut && o.date <= fin);
  const cpt = apparier(r.operations, opsCompte, 4);
  const emp = empreintes(compte.id, cpt.manquants);
  const manquants = cpt.manquants.map((l, i) => Object.assign({}, l, {empreinte: "pdf|" + emp[i], proposition: proposerClassement({libelle: l.libelle, montant: l.montant, date: l.date, compte: compte.id})}));
  // Cartes : lignes du relevé contre les achats des cartes LCL (et « sans titulaire ») sur les mêmes dates
  const lignesCartes = (lu.cartes || []).flatMap(c => c.lignes);
  let enTropCartes = [], conformesCartes = 0;
  if (lignesCartes.length){
    const d0 = lignesCartes.map(l => l.date).sort()[0], d1 = lignesCartes.map(l => l.date).sort().pop();
    const lcl = new Set(vivants("comptes").filter(c => c.type === "carte" && c.banque === "LCL").map(c => c.id));
    const app = vivants("operations").filter(o => lcl.has(o.compte) && o.date >= d0 && o.date <= d1);
    const a = apparier(lignesCartes, app, 1);
    enTropCartes = a.enTrop; conformesCartes = a.conformes;
  }
  const cartes = (lu.cartes || []).length ? preparerCartesPdf(lu) : null;
  const soldeApp = soldeCompte(compte, fin);
  const ecartSolde = r.soldeFin === null || soldeApp === null ? null : Math.round((r.soldeFin - (soldeApp + somme(manquants, l => l.montant))) * 100) / 100;
  const controles = [r.controle,
    {ok: !manquants.length && !cpt.enTrop.length, texte: "compte : " + cpt.conformes + " écriture(s) conforme(s)" + (manquants.length ? ", " + manquants.length + " manquante(s)" : "") + (cpt.enTrop.length ? ", " + cpt.enTrop.length + " en trop dans l'application" : "")},
    lignesCartes.length ? {ok: !(cartes?.nouvelles?.length) && !enTropCartes.length, texte: "cartes : " + conformesCartes + " achat(s) conforme(s)" + (cartes?.nouvelles?.length ? ", " + cartes.nouvelles.length + " manquant(s)" : "") + (enTropCartes.length ? ", " + enTropCartes.length + " en trop dans l'application" : "")} : null,
    ecartSolde === null ? null : {ok: Math.abs(ecartSolde) < 0.01, texte: Math.abs(ecartSolde) < 0.01 ? "solde au " + dateFr(fin) + " : " + euros(r.soldeFin) + ", identique" : "solde au " + dateFr(fin) + " : relevé " + euros(r.soldeFin) + ", application " + euros(r.soldeFin - ecartSolde) + " (après ajouts)"}
  ].filter(Boolean);
  // Doublons exacts parmi les lignes en trop : même compte, jour, montant et libellé qu'une autre opération gardée
  const cleDbl = o => [o.compte, o.date, versCentimes(o.montant), (o.libelle || "").trim().toUpperCase()].join("|");
  const enTropIds = new Set([...cpt.enTrop, ...enTropCartes].map(o => o.id));
  const groupes = regrouper(vivants("operations"), cleDbl);
  const doublonsExacts = new Set();
  for (const o of [...cpt.enTrop, ...enTropCartes]){
    const g = groupes.get(cleDbl(o)) || [];
    if (g.length < 2) continue;
    const garde = g.find(x => !enTropIds.has(x.id)) || g[0];
    if (garde.id !== o.id) doublonsExacts.add(o.id);
  }
  return {lu, compte, manquants, enTrop: cpt.enTrop, enTropCartes, doublonsExacts, conformes: cpt.conformes, cartes, controles, nb: manquants.length + (cartes?.nouvelles?.length || 0),
    choixManquants: new Set(manquants.map((l, i) => i)), choixEnTrop: new Set()};
}
function appliquerClotureLcl(prep){
  const r = prep.lu.releveCompte, compte = prep.compte;
  const imp = enregistrer("imports", {genre: "releve_lcl", banque: "LCL", fichier: prep.lu.nom, compte: compte.id, periode: r.periode, date: new Date().toISOString(),
    nouvelles: prep.choixManquants.size, deja: prep.conformes});
  let ajoutees = 0, supprimees = 0;
  prep.manquants.forEach((l, i) => { if (!prep.choixManquants.has(i)) return;
    const op = creerOperation(compte, l, imp.id); ajoutees++;
    // Débit mensuel des cartes à débit différé : virement interne vers les comptes cartes, hors budget
    if (/^RELEVE CB AU/.test(l.libelle)) enregistrer("operations", Object.assign(op, {categorie: "Transfert", sousCategorie: "Facture cartes", nature: natureParDefaut("Transfert"), statut: "classe"}));
  });
  for (const o of [...prep.enTrop, ...prep.enTropCartes]) if (prep.choixEnTrop.has(o.id) && obtenir("operations", o.id)){
    for (const id of o.justificatifs || []){ const j = obtenir("justificatifs", id); if (j) delier(j); }
    supprimer("operations", o.id); supprimees++;
  }
  const cartes = prep.cartes ? appliquerCartesPdf(prep.cartes) : 0;
  // Les soldes du relevé deviennent la référence du compte
  enregistrer("soldes", {compte: compte.id, date: r.periode.debut, solde: r.soldeDebut, source: prep.lu.nom, debut: true});
  if (r.soldeFin !== null) enregistrer("soldes", {compte: compte.id, date: r.periode.fin, solde: r.soldeFin, source: prep.lu.nom});
  const clotures = Object.assign({}, LIVRE.parametres.clotures || {});
  clotures[compte.id + "|" + r.periode.fin] = {debut: r.periode.debut, fin: r.periode.fin, le: new Date().toISOString(), fichier: prep.lu.nom, ajoutees, supprimees, cartes,
    conforme: prep.controles.every(c => c.ok) || (ajoutees === prep.manquants.length && supprimees === prep.enTrop.length + prep.enTropCartes.length)};
  modifierParametres({clotures});
  return {ajoutees, supprimees, cartes};
}
function periodesCartes(){
  return vivants("imports").filter(i => i.genre === "carte" && i.banque === "LCL").map(i => i.periode);
}
function creerOperation(compte, l, importId){
  // Chèque : le numéro (colonne à part dans l'export LCL) est gardé ; il sert au rapprochement avec la pièce
  const op = {compte: compte.id, date: l.date, montant: Math.round(l.montant * 100) / 100, libelle: l.libelle || (l.cheque ? "CHQ. " + l.cheque : ""), detail: l.detail || "", type: l.type || "", cheque: l.cheque || undefined,
    mcc: l.mcc || "", categorieBanque: l.categorieBanque || "", ville: l.ville || "", empreinte: l.empreinte, import: importId, justificatifs: []};
  if (compte.type === "carte") op.dateDebit = l.dateDebit || null; else op.dateDebit = l.date;
  classerAutomatiquement(op);
  return enregistrer("operations", op);
}
function appliquerReleve(prep){
  const imp = enregistrer("imports", {genre: prep.lu.genre, banque: prep.lu.banque, fichier: prep.lu.nom, compte: prep.compte.id, periode: prep.lu.periode,
    date: new Date().toISOString(), nouvelles: prep.nouvelles.length, deja: prep.deja.length});
  for (const l of prep.nouvelles) creerOperation(prep.compte, l, imp.id);
  for (const r of prep.reattribuees) enregistrer("operations", Object.assign(r.op, {compte: prep.compte.id, empreinte: r.empreinte}));
  // Chèques déjà importés sans leur numéro (avant le 05/11/2026) : numéro et libellé complétés
  for (const c of prep.cheques || []) enregistrer("operations", Object.assign(c.op, {cheque: c.cheque, libelle: c.op.libelle || "CHQ. " + c.cheque}));
  // Achats carte retrouvés dans l'export du compte : débités en fin de mois (sans écraser une date de débit établie)
  if (prep.dateDebitCartes) for (const o of prep.debitsCartes || []) if (!o.dateDebit || o.debitEstime) enregistrer("operations", Object.assign(o, {dateDebit: prep.dateDebitCartes, debitEstime: false}));
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
  const ops = vivants("operations").filter(o => cartes.some(c => c.id === o.compte) && o.date >= debut && o.date <= fin && (deja ? (!o.facture || o.facture === deja.id) : (!o.facture && (!o.dateDebit || o.debitEstime || o.dateDebit === lu.dateDebit))));   // déjà datés au même débit par l'export du compte
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
  // Soldes de fin d'année lus dans le même relevé (livrets) : une valeur au 31/12, sans écraser une autre source de ce jour
  for (const v of lu.intermediaires || []){
    const d2 = vivants("valorisations").find(x => x.compte === compte.id && x.date === v.date);
    if (!d2 || d2.source === lu.nom) enregistrer("valorisations", Object.assign(d2 || {}, {compte: compte.id, date: v.date, valeur: v.valeur, source: lu.nom}));
  }
}

/* ---------- Après chaque import : transferts, débits différés, rapprochements ---------- */
function apresImport(){
  apparierTransferts();
  affecterDebitsAmex();
  estimerDebitsCartes();
  rapprocherTout();
  classerParAvisImpot();
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
/* Achats (triés par date) d'une suite de jours dont la somme vaut cible (centimes, positive) ; le dernier jour
   peut n'être pris qu'en partie. Renvoie la liste retenue, ou null. */
function suiteSoldee(cand, cible){
  const jours = [...new Set(cand.map(o => o.date))].sort();
  const par = Object.fromEntries(jours.map(d => [d, cand.filter(o => o.date === d)]));
  const sousEnsembles = l => {
    if (l.length > 8) return [l];
    const r = [];
    for (let m = (1 << l.length) - 1; m > 0; m--) r.push(l.filter((_, i) => m & (1 << i)));
    return r.sort((a, b) => b.length - a.length);
  };
  const total = l => somme(l, o => -versCentimes(o.montant));
  for (const tol of [1, 100]){
    for (let e = jours.length - 1; e >= 0; e--){
      const fins = sousEnsembles(par[jours[e]]).map(l => ({l, t: total(l)}));
      let base = 0, pleins = [];
      for (let s = e; s >= 0; s--){
        if (s < e){ base += total(par[jours[s]]); pleins = par[jours[s]].concat(pleins); }
        const f = fins.find(x => Math.abs(base + x.t - cible) < tol);
        if (f) return pleins.concat(f.l);
      }
    }
  }
  return null;
}
function estimerDebitsCartes(){
  const ops = vivants("operations");
  const fin = ops.reduce((m, o) => o.date > m ? o.date : m, "");
  // Achats carte lus dans un relevé de compte PDF avant le 05/11/2026 : créés sans date de débit, ils
  // passaient pour un encours à débiter (double compte en trésorerie). Ils sont datés comme les autres.
  const pdf = new Set(vivants("imports").filter(i => i.genre === "carte" && /\.pdf$/i.test(i.fichier || "")).map(i => i.id));
  const visee = o => (o.origine === "reprise" || pdf.has(o.import)) && !o.facture && !o.paiementAmex && !(o.lien && o.montant > 0)
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
      // Chaque prélèvement solde les achats d'une suite de jours des 45 jours qui le précèdent, de somme égale
      // (au centime, puis à 1 € près) ; le dernier jour peut n'être pris qu'en partie (arrêté en cours de
      // journée). La suite qui finit le plus tard est retenue. Le prélèvement du relevé antérieur au début
      // des données n'a pas ses achats : il reste sans correspondance.
      const prlvs = ops.filter(o => o.compte === c.compteDebit && o.montant < 0 && /AMERICAN EXPRESS/i.test(o.libelle)).sort(parDate);
      let reste = achats.slice();
      for (const p of prlvs){
        const choix = suiteSoldee(reste.filter(o => o.date < p.date && o.date >= ajouterJours(p.date, -45)), -versCentimes(p.montant));
        if (!choix) continue;
        for (const o of choix) voulu.set(o, p.date);
        reste = reste.filter(o => !voulu.has(o));
      }
      // Achats restés seuls : au prélèvement qui les suit s'ils sont anciens ; les plus récents forment l'encours.
      const dernier = prlvs.length ? prlvs[prlvs.length - 1].date : null;
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

/* ---------- Liens « remplace sa ligne de budget » des échéances ----------
   Quand le budget actif d'une année change (plan qui le remplace, copie pour l'année suivante),
   ses lignes ont de nouveaux id : une échéance qui pointait vers l'ancienne ligne ne la retire plus
   de la trésorerie et la dépense compte deux fois. On reporte le lien vers la ligne du budget actif
   de même catégorie et sous-catégorie, si elle est unique ; sinon le lien est laissé et signalé.
   « avant » : instantané des lignes de budget connues (id → {annee, categorie, sousCategorie}).
   Concernées : les échéances qui commencent dans l'année, ou dont l'ancienne ligne était de l'année. */
function instantaneLignesBudget(){
  const m = new Map();
  for (const b of vivants("budgets")) for (const l of b.lignes || []) if (l.id) m.set(l.id, {annee: b.annee, categorie: l.categorie, sousCategorie: l.sousCategorie});
  return m;
}
function reporterLiensBudget(annee, avant){
  const r = {reportes: 0, nonReportes: []};
  const budget = budgetActif(annee);
  if (!budget) return r;
  const ids = new Set((budget.lignes || []).map(l => l.id));
  for (const e of vivants("echeances")){
    if (!e.ligneBudget || ids.has(e.ligneBudget)) continue;
    const ancienne = avant.get(e.ligneBudget);
    if (!(ancienne?.annee === annee || +(e.debut || "").slice(0, 4) === annee)) continue;
    const k = cleLigne(ancienne ? ancienne.categorie : e.categorie, ancienne ? ancienne.sousCategorie : e.sousCategorie);
    const cibles = (budget.lignes || []).filter(l => cleLigne(l.categorie, l.sousCategorie) === k);
    if (cibles.length === 1){ enregistrer("echeances", Object.assign(e, {ligneBudget: cibles[0].id})); r.reportes++; }
    else r.nonReportes.push(e.libelle + (cibles.length ? " (plusieurs lignes possibles)" : " (aucune ligne de même catégorie)"));
  }
  return r;
}

/* ---------- Plan importé d'un fichier JSON : budgets, échéances et règles ----------
   Un budget de même nom et de même année est remplacé ; une échéance de même libellé et de
   même date de début aussi. Rien d'autre n'est modifié. */
function appliquerPlan(contenu){
  const r = {budgets: 0, echeances: 0, regles: 0};
  const lignesAvant = instantaneLignesBudget();
  for (const b of contenu.budgets || []){
    for (const l of b.lignes || []){ if (!l.id) l.id = "lb-" + idAleatoire(8); ajouterCategorieSilencieuse(l.categorie, l.sousCategorie); }
    for (const lx of Object.keys(b.lignes?.[0]?.repartition || {})) ajouterLieu(lx);
    for (const l of b.lignes || []) if (l.nature && !LIVRE.parametres.natures.includes(l.nature)) modifierParametres({natures: [...LIVRE.parametres.natures, l.nature]});
    const existant = vivants("budgets").find(x => x.nom === b.nom && x.annee === b.annee);
    if (!existant && b.actif) for (const autre of vivants("budgets").filter(x => x.annee === b.annee && x.actif)) enregistrer("budgets", Object.assign(autre, {actif: false}));
    enregistrer("budgets", Object.assign(existant || {}, b)); r.budgets++;
  }
  const courant = obtenir("comptes", LIVRE.parametres.compteTresorerie) || comptesDeType("courant")[0];
  for (let e of contenu.echeances || []){
    // « remplace » : libellé et date d'une échéance existante à reprendre (date ou libellé modifiés).
    const cle = e.remplace || e; e = Object.assign({}, e); delete e.remplace;
    const existant = vivants("echeances").find(x => x.libelle === cle.libelle && x.debut === cle.debut);
    if (e.categorie) ajouterCategorieSilencieuse(e.categorie, e.sousCategorie);
    enregistrer("echeances", Object.assign(existant || {}, {compte: courant?.id || ""}, e)); r.echeances++;
  }
  // Budgets remplacés ou créés : les échéances liées à une ligne disparue suivent la ligne équivalente.
  for (const an of new Set((contenu.budgets || []).map(b => b.annee))){
    const x = reporterLiensBudget(an, lignesAvant);
    if (x.reportes) r.liensReportes = (r.liensReportes || 0) + x.reportes;
    if (x.nonReportes.length) r.liensNonReportes = [...(r.liensNonReportes || []), ...x.nonReportes];
  }
  // Budgets à supprimer, désignés par nom et année ; le budget actif de l'année n'est jamais supprimé.
  // Les opérations ne sont pas touchées.
  for (const x of contenu.supprimerBudgets || []){
    const b = vivants("budgets").find(y => y.nom === x.nom && y.annee === x.annee);
    if (!b) (r.budgetsIntrouvables = r.budgetsIntrouvables || []).push(x.nom + " (" + x.annee + ")");
    else if (b.actif || budgetActif(b.annee)?.id === b.id) (r.budgetsNonSupprimes = r.budgetsNonSupprimes || []).push(b.nom + " (" + b.annee + ", budget actif)");
    else { supprimer("budgets", b.id); r.budgetsSupprimes = (r.budgetsSupprimes || 0) + 1; }
  }
  // Comptes (ex. compte-titres) et leurs valorisations datées ; un compte de même nom et de même type est repris.
  for (const cp of contenu.comptes || []){
    const {valorisations, ...champs} = cp;
    const existant = vivants("comptes").find(x => x.nom === cp.nom && x.type === cp.type);
    const compte = enregistrer("comptes", Object.assign(existant || {actif: true}, champs));
    for (const v of valorisations || []){
      const deja = vivants("valorisations").find(x => x.compte === compte.id && x.date === v.date);
      enregistrer("valorisations", Object.assign(deja || {}, {compte: compte.id, date: v.date, valeur: v.valeur, source: v.source || "plan"}));
    }
    r.comptes = (r.comptes || 0) + 1;
  }
  // Catégories et sous-catégories à créer : {"Catégorie": ["Sous-catégorie", …]}
  for (const [cat, sous] of Object.entries(contenu.categories || {})){ for (const s of sous) ajouterCategorieSilencieuse(cat, s); r.categories = (r.categories || 0) + sous.length; }
  if (contenu.regles?.length || contenu.commercants?.length) r.regles = appliquerRegles({regles: contenu.regles || [], commercants: contenu.commercants || []});
  // Reclassement ciblé d'opérations déjà enregistrées, désignées par date, montant et, au besoin, libellé
  for (const x of contenu.reclasser || []){
    const cibles = vivants("operations").filter(o => o.date === x.date && Math.abs(o.montant - x.montant) < 0.005 && (!x.contient || norm(o.libelle + " " + (o.detail || "")).toUpperCase().includes(norm(x.contient).toUpperCase())));
    for (const o of cibles) enregistrer("operations", Object.assign(o, {categorie: x.categorie, sousCategorie: x.sousCategorie || "", nature: x.nature || o.nature, statut: "classe", verrou: true}, x.lieu ? {lieu: x.lieu} : {}, x.natureExacte ? {natureExacte: x.natureExacte} : {}));
    if (x.categorie) ajouterCategorieSilencieuse(x.categorie, x.sousCategorie);
    r.reclassees = (r.reclassees || 0) + cibles.length;
  }
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
      lieu: c.lieu || fiche.lieu || "", fixe: !!c.categorie}, c.verifie ? {verifie: true} : {});
    if (c.natureExacte) fiche.natures = Object.assign(fiche.natures || {}, {[c.natureExacte]: (fiche.natures?.[c.natureExacte] || 0) + 1});
    if (c.categorie) ajouterCategorieSilencieuse(c.categorie, c.sousCategorie);
    if (c.lieu) ajouterLieu(c.lieu);
    enregistrer("commercants", fiche);
  }
  for (const l of contenu.lieux || []) ajouterLieu(l);
  for (const n2 of contenu.natures || []) if (!LIVRE.parametres.natures.includes(n2)) modifierParametres({natures: [...LIVRE.parametres.natures, n2]});
  invaliderIndex();
  return n;
}
