/* ================= Relevés d'une banque sans lecteur dédié (CSV et PDF) =================
   CSV : l'utilisateur désigne une fois les colonnes (date, libellé, montant ou débit et crédit,
   solde facultatif) et le compte concerné. Ce « modèle » est retenu dans les paramètres du livre
   et reconnu ensuite par la ligne d'en-tête du fichier.
   PDF : lecture générale des lignes « date … montant », présentée pour vérification avant import.
   Dans les deux cas, le résultat est un relevé ordinaire (genre « compte », marqué « libre »),
   dédoublonné et classé comme les autres. Les lecteurs dédiés (LCL, Amex…) passent avant. */

const RE_DATE_CELLULE = /^\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const estDateCellule = v => RE_DATE_CELLULE.test(String(v ?? ""));
const estMontantTexte = t => /\d[,.]\d{2}\s*(€|EUR)?\s*[-−–]?$/i.test(String(t).trim()) && /^[-−–+]?\s*[\d\s  .,']+[-−–]?\s*(€|EUR)?$/i.test(String(t).trim()) && !isNaN(lireMontant(t));

/* ---------- CSV ---------- */
function separateurProbable(texte){
  const l = texte.split(/\r?\n/).slice(0, 15);
  const max = c => Math.max(0, ...l.map(x => x.split(c).length - 1));
  // Le point-virgule d'abord : la virgule sert aussi de séparateur décimal dans les fichiers français.
  return max(";") >= 2 ? ";" : max("\t") >= 2 ? "\t" : ",";
}
const signatureCsv = (entete, nbCol) => entete ? "entete:" + entete.map(x => norm(x).trim()).join("|") : "colonnes:" + nbCol;

function lireCsvLibre(nom, texte){
  const lignes = analyserCSV(texte, separateurProbable(texte)).filter(l => l.some(x => String(x ?? "").trim()));
  // Première ligne de données : la première qui porte une date ; l'en-tête, s'il existe, la précède.
  const iDonnees = lignes.findIndex(l => l.some(estDateCellule));
  if (iDonnees < 0) return {genre: "inconnu", nom, raison: "CSV non reconnu : aucune date trouvée"};
  const entete = iDonnees > 0 && !lignes[iDonnees - 1].some(estDateCellule) ? lignes[iDonnees - 1].map(x => propre(x)) : null;
  const donnees = lignes.slice(iDonnees);
  const nbCol = Math.max(...donnees.slice(0, 20).map(l => l.length));
  return {genre: "csv_libre", nom, entete, donnees, nbCol, signature: signatureCsv(entete, nbCol)};
}
function modeleCsvPour(lu){ return (LIVRE.parametres.modelesCsv || []).find(m => m.signature === lu.signature) || null; }
const colonneChoisie = i => i !== null && i !== undefined && i !== "";

/* Lignes d'un CSV lues selon un modèle : [{date, montant, libelle, solde}] dans l'ordre du fichier. */
function lignesModeleCsv(lu, m){
  const ops = [];
  for (const l of lu.donnees){
    const date = lireDate(l[m.date], m.ordre);
    if (!date) continue;
    let montant;
    if (colonneChoisie(m.montant)) montant = lireMontant(l[m.montant]) * (m.inverser ? -1 : 1);
    else {
      const d = colonneChoisie(m.debit) ? lireMontant(l[m.debit]) : NaN, c = colonneChoisie(m.credit) ? lireMontant(l[m.credit]) : NaN;
      montant = isNaN(d) && isNaN(c) ? NaN : (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(d) ? 0 : Math.abs(d));
    }
    if (isNaN(montant) || !montant) continue;
    const libelle = (m.libelle || []).filter(colonneChoisie).map(i => propre(l[i] || "")).filter(Boolean).join(" ");
    ops.push({date, montant: Math.round(montant * 100) / 100, libelle: libelle || "(sans libellé)", solde: colonneChoisie(m.solde) ? lireMontant(l[m.solde]) : NaN});
  }
  return ops;
}
/* Relevé ordinaire tiré d'un CSV et de son modèle. */
function releveDepuisModele(lu, m){
  const ops = lignesModeleCsv(lu, m);
  if (!ops.length) return {genre: "inconnu", nom: lu.nom, raison: "aucune opération lue avec le modèle « " + m.nom + " »"};
  const dates = ops.map(o => o.date).sort();
  const r = {genre: "compte", banque: m.nom, nom: lu.nom, numero: "", periode: {debut: dates[0], fin: dates[dates.length - 1]}, libre: true, compteId: m.compte,
    lignes: ops.map(o => ({date: o.date, montant: o.montant, libelle: o.libelle}))};
  // Solde : celui de la ligne la plus récente, que le fichier soit rangé du plus ancien au plus récent ou l'inverse.
  const avecSolde = ops.filter(o => !isNaN(o.solde));
  if (avecSolde.length){
    const recentDabord = ops[0].date > ops[ops.length - 1].date;
    const dernier = (recentDabord ? avecSolde[0] : avecSolde[avecSolde.length - 1]).solde;
    r.soldeFin = dernier;
    r.soldeDebut = (versCentimes(dernier) - somme(ops, o => versCentimes(o.montant))) / 100;
  }
  return r;
}
/* Colonnes proposées à la première rencontre d'un format. */
function devinerModeleCsv(lu){
  const t = (lu.entete || []).map(x => norm(x));
  const cherche = (re, sauf) => { const i = t.findIndex((x, k) => k !== sauf && re.test(x)); return i >= 0 ? i : ""; };
  const ex = lu.donnees[0] || [];
  let date = cherche(/date/); if (date === "") date = ex.findIndex(estDateCellule);
  let libelle = cherche(/libell|description|intitul/, date); if (libelle === "") libelle = cherche(/operation|detail|nature/, date);
  if (libelle === "") { let lg = -1; ex.forEach((v, i) => { if (i !== date && String(v || "").length > lg && isNaN(lireMontant(v))){ lg = String(v || "").length; libelle = i; } }); }
  // Ordre des dates : jour/mois sauf si un premier nombre dépasse 12 ailleurs qu'en jour
  const premiers = lu.donnees.slice(0, 60).map(l => String(l[date] || "").match(/^(\d{1,2})[\/.\-](\d{1,2})/)).filter(Boolean);
  const ordre = premiers.some(x => +x[2] > 12) && !premiers.some(x => +x[1] > 12) ? "mj" : "jm";
  return {nom: "", date: String(date), libelle: [String(libelle), ""], montant: String(cherche(/montant|amount|somme/)), debit: String(cherche(/debit/)), credit: String(cherche(/credit/)),
    solde: String(cherche(/solde|balance/)), ordre, inverser: false, compte: ""};
}

/* ---------- PDF ---------- */
/* Un PDF ressemble à un relevé s'il compte au moins cinq lignes « date … montant ». */
function ressembleReleve(texte){
  return String(texte).split("\n").filter(l => /^\s*\d{1,2}[\/.]\d{1,2}([\/.]\d{2,4})?\b.*\d[,.]\d{2}\s*(€|EUR)?\s*$/i.test(l)).length >= 5;
}
/* Lignes d'un PDF avec la position horizontale de chaque fragment (centre), pour distinguer débit et crédit. */
async function lignesPositionneesPdf(octets, motDePasse){
  const pdfjs = await chargerPdfjs();
  const doc = await pdfjs.getDocument({data: octets.slice(), password: motDePasse || undefined, isEvalSupported: false, disableFontFace: true}).promise;
  const toutes = [];
  for (let p = 1; p <= doc.numPages; p++){
    const contenu = await (await doc.getPage(p)).getTextContent();
    const lignes = new Map();
    for (const it of contenu.items){
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 2);
      if (!lignes.has(y)) lignes.set(y, []);
      lignes.get(y).push({x: it.transform[4] + (it.width || 0) / 2, t: propre(it.str)});
    }
    for (const [, l] of [...lignes.entries()].sort((a, b) => b[0] - a[0])) toutes.push(l.sort((a, b) => a.x - b.x));
  }
  await doc.destroy();
  return toutes;
}
async function lireReleveLibrePdf(nom, octets, motDePasse, texte){
  const lignes = await lignesPositionneesPdf(octets, motDePasse);
  const r = analyserReleveLibre(lignes, texte);
  return Object.assign(r, {genre: r.lignes.length ? "releve_pdf_libre" : "justificatif_pdf", nom, texte, octets});
}
/* Analyse pure (sans pdf.js) : testée par la suite de contrôle. lignes = [[{x, t}]] */
function analyserReleveLibre(lignes, texte){
  const res = {lignes: [], soldeDebut: null, soldeFin: null};
  // Année de référence : la plus récente date complète du document (relevé de décembre lu en janvier : mois > mois de référence → année précédente)
  const completes = [...String(texte).matchAll(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/g)].map(m => m[3] + "-" + pad2(+m[2]) + "-" + pad2(+m[1])).filter(d => +d.slice(5, 7) >= 1 && +d.slice(5, 7) <= 12).sort();
  const reference = completes[completes.length - 1] || aujourdhui();
  const dateCourteVersIso = (j, m, a) => {
    if (a) return lireDate(j + "/" + m + "/" + a);
    let an = +reference.slice(0, 4); if (+m > +reference.slice(5, 7)) an--;
    return lireDate(j + "/" + m + "/" + an);
  };
  let colDebit = null, colCredit = null, colSolde = null, courante = null;
  const sensMontant = (frag) => {
    if (/^[-−–]|[-−–]$/.test(frag.t)) return -1;
    if (/^\+/.test(frag.t)) return 1;
    if (colDebit !== null && colCredit !== null) return Math.abs(frag.x - colDebit) <= Math.abs(frag.x - colCredit) ? -1 : 1;
    return 0;   // inconnu : à vérifier
  };
  for (const l of lignes){
    const txt = l.map(x => x.t).join(" "), n = norm(txt);
    // En-tête de colonnes : retenir la position de « Débit », « Crédit », « Solde »
    const fd = l.find(x => /^debits?\b|^debit\s*\(|^montant debit/.test(norm(x.t))), fc = l.find(x => /^credits?\b|^credit\s*\(|^montant credit/.test(norm(x.t)));
    if (fd && fc){ colDebit = fd.x; colCredit = fc.x; const fs = l.find(x => /^solde/.test(norm(x.t))); colSolde = fs ? fs.x : null; courante = null; continue; }
    const montants = l.filter(x => estMontantTexte(x.t) && !(colSolde !== null && Math.abs(x.x - colSolde) < Math.min(Math.abs(x.x - (colDebit ?? -1e9)), Math.abs(x.x - (colCredit ?? -1e9)))));
    if (/\b(ancien solde|solde precedent|solde initial|solde au debut|solde debut)/.test(n) && montants.length){
      if (res.soldeDebut === null){ const f = montants[montants.length - 1]; res.soldeDebut = Math.abs(lireMontant(f.t)) * (/debiteur/.test(n) || sensMontant(f) < 0 ? -1 : 1); }
      courante = null; continue;
    }
    if (/\b(nouveau solde|solde final|solde a reporter|solde en fin|solde au \d)/.test(n) && montants.length){
      const f = montants[montants.length - 1]; res.soldeFin = Math.abs(lireMontant(f.t)) * (/debiteur/.test(n) || sensMontant(f) < 0 ? -1 : 1);
      courante = null; continue;
    }
    const md = txt.match(/^\s*(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/);
    if (md && montants.length && !/^\s*\S+\s+(total|sous-total|report|solde)/.test(n)){
      const date = dateCourteVersIso(md[1], md[2], md[3]);
      if (!date){ courante = null; continue; }
      const f = montants[montants.length - 1];
      const sens = sensMontant(f);
      const libelle = l.filter(x => !montants.includes(x)).map(x => x.t).join(" ")
        .replace(/^\s*(\d{1,2}[\/.]\d{1,2}([\/.]\d{2,4})?\s*)+/, "").trim();
      courante = {date, libelle: libelle || "(sans libellé)", montant: Math.abs(lireMontant(f.t)) * (sens || -1), sur: sens !== 0, suite: 0};
      res.lignes.push(courante);
      continue;
    }
    // Ligne de suite du libellé (sans date ni montant), deux au plus
    if (courante && !montants.length && !md && courante.suite < 2 && !/total|solde|report|page \d/.test(n) && txt.trim().length > 1){ courante.libelle += " " + txt.trim(); courante.suite++; }
    else if (montants.length || md) courante = null;
  }
  for (const x of res.lignes){ x.montant = Math.round(x.montant * 100) / 100; delete x.suite; }
  return res;
}

/* ---------- Choix du compte d'un relevé libre ---------- */
function choixCompteLibre(defaut){
  const comptes = vivants("comptes").filter(c => ["courant", "livret"].includes(c.type) && c.actif !== false);
  const sel = selection([...comptes.map(c => [c.id, c.nom]), ["__nouveau", "Nouveau compte…"]], defaut && obtenir("comptes", defaut) ? defaut : (comptes[0]?.id || "__nouveau"));
  const nom = h("input", {type: "text", placeholder: "ex. Compte courant"});
  const type = selection([["courant", "Compte courant"], ["livret", "Livret d'épargne"]], "courant");
  const zone = h("div", {class: "grille-champs"}, champ("Nom du nouveau compte", nom), champ("Type", type));
  const maj = () => { zone.hidden = sel.value !== "__nouveau"; };
  sel.addEventListener("change", maj); maj();
  return {elements: [champ("Compte concerné", sel), zone],
    valide(){ if (sel.value === "__nouveau" && !nom.value.trim()){ message("Nommez le nouveau compte.", true); return false; } return true; },
    resoudre(banque){
      if (sel.value !== "__nouveau") return obtenir("comptes", sel.value);
      const c = enregistrer("comptes", {nom: nom.value.trim(), type: type.value, banque: banque || "", actif: true});
      if (c.type === "courant" && !LIVRE.parametres.compteTresorerie) modifierParametres({compteTresorerie: c.id});
      return c;
    }};
}

/* ---------- Fenêtre « Décrire les colonnes » (CSV) ---------- */
async function dialogueModeleCsv(f){
  const lu = f.brut;
  const m0 = modeleCsvPour(lu) || devinerModeleCsv(lu);
  const ex = lu.donnees[0] || [];
  const options = [["", "—"], ...[...Array(lu.nbCol).keys()].map(i => [String(i), (lu.entete?.[i] || "Colonne " + (i + 1)) + (ex[i] ? " (ex. « " + String(ex[i]).slice(0, 30) + " »)" : "")])];
  const s = cle => selection(options, String(m0[cle] ?? ""));
  const date = s("date"), lib1 = selection(options, String(m0.libelle?.[0] ?? "")), lib2 = selection(options, String(m0.libelle?.[1] ?? ""));
  const montant = s("montant"), debit = s("debit"), credit = s("credit"), solde = s("solde");
  const ordre = selection([["jm", "jour/mois/année"], ["mj", "mois/jour/année"]], m0.ordre || "jm");
  const inverser = h("input", {type: "checkbox", id: "csv-inv", checked: !!m0.inverser});
  const banque = h("input", {type: "text", value: m0.nom || "", placeholder: "ex. Banque X, compte courant"});
  const choix = choixCompteLibre(m0.compte);
  const apercu = h("div", {class: "tableau"});
  const modele = () => ({nom: banque.value.trim() || "Banque", date: date.value, libelle: [lib1.value, lib2.value], montant: montant.value, debit: debit.value, credit: credit.value,
    solde: solde.value, ordre: ordre.value, inverser: inverser.checked});
  const majApercu = () => {
    const ops = colonneChoisie(date.value) ? lignesModeleCsv(lu, modele()) : [];
    vider(apercu).appendChild(tableau([{titre: "Date"}, {titre: "Libellé"}, {titre: "Montant", num: true}], ops.slice(0, 6), {classe: "serre",
      vide: "Aucune ligne lue : vérifiez la colonne de la date et celle du montant.", ligne: o => h("tr", null, h("td", null, dateFr(o.date)), h("td", null, o.libelle), montantCellule(o.montant))}));
    apercu.appendChild(h("p", {class: "note"}, ops.length + " opération(s) lue(s). Les dépenses doivent apparaître en négatif."));
  };
  for (const el of [date, lib1, lib2, montant, debit, credit, solde, ordre, inverser]) el.addEventListener("change", majApercu);
  majApercu();
  const r = await dialogue({titre: "Relevé d'une autre banque : décrire les colonnes", large: true, corps: h("div", null,
    h("p", null, "Ce fichier ne vient pas d'une banque connue de l'application. Indiquez une fois à quoi sert chaque colonne : les prochains fichiers de même forme seront reconnus d'eux-mêmes."),
    h("div", {class: "grille-champs"}, champ("Nom de la banque ou du relevé", banque), ...choix.elements, champ("Date de l'opération", date), champ("Format des dates", ordre),
      champ("Libellé", lib1), champ("Libellé complémentaire (facultatif)", lib2), champ("Montant (une seule colonne)", montant), champ("… ou Débit", debit), champ("… et Crédit", credit),
      champ("Solde après l'opération (facultatif)", solde)),
    h("div", {class: "case"}, inverser, h("label", {for: "csv-inv"}, "Les dépenses figurent en positif dans ce fichier (inverser les signes)")),
    h("h3", null, "Aperçu"), apercu),
    actions: [{libelle: "Annuler", classe: "discret", valeur: null}, {libelle: "Retenir ce modèle", classe: "primaire", action: () => {
      const m = modele();
      if (!colonneChoisie(m.date) || !colonneChoisie(m.libelle[0]) || !(colonneChoisie(m.montant) || colonneChoisie(m.debit) || colonneChoisie(m.credit))){ message("Indiquez au moins la date, le libellé et le montant (ou débit et crédit).", true); return false; }
      if (!lignesModeleCsv(lu, m).length){ message("Aucune opération lue avec ces colonnes.", true); return false; }
      return choix.valide() ? m : false;
    }}]});
  if (!r) return;
  const compte = choix.resoudre(r.nom);
  const m = Object.assign({id: m0.id || "mod-" + idAleatoire(6), signature: lu.signature}, r, {compte: compte.id});
  modifierParametres({modelesCsv: [...(LIVRE.parametres.modelesCsv || []).filter(x => x.signature !== m.signature), m]});
  for (const autre of FICHIERS_EN_COURS.filter(x => x.brut?.genre === "csv_libre" && x.brut.signature === m.signature && x.statut !== "fait")){ autre.lu = autre.brut; preparerFichier(autre); }
  rafraichirEcran();
}

/* ---------- Fenêtre « Vérifier les lignes » (PDF) ---------- */
async function dialogueReleveLibrePdf(f){
  const lu = f.brut;
  const banque = h("input", {type: "text", placeholder: "ex. Banque X"});
  const choix = choixCompteLibre("");
  const lignes = lu.lignes.map(l => ({l, garde: h("input", {type: "checkbox", checked: true}), montant: h("input", {type: "text", inputmode: "decimal", value: nombre(l.montant, 2), style: {width: "7rem", textAlign: "right"}}),
    libelle: h("input", {type: "text", value: l.libelle, style: {width: "100%"}})}));
  const bilan = h("p", {class: "note"});
  const majBilan = () => {
    const ok = lignes.filter(x => x.garde.checked), total = somme(ok, x => versCentimes(lireMontant(x.montant.value) || 0));
    let t = ok.length + " ligne(s) retenue(s), solde des mouvements " + euros(total / 100) + ".";
    if (lu.soldeDebut !== null && lu.soldeFin !== null){
      const ecart = versCentimes(lu.soldeFin) - versCentimes(lu.soldeDebut) - total;
      t += Math.abs(ecart) < 2 ? " ✓ Cohérent avec les soldes du relevé (" + euros(lu.soldeDebut) + " → " + euros(lu.soldeFin) + ")." : " ⚠ Écart de " + euros(ecart / 100) + " avec les soldes du relevé (" + euros(lu.soldeDebut) + " → " + euros(lu.soldeFin) + ") : une ligne manque ou un signe est inversé.";
      bilan.className = "note" + (Math.abs(ecart) < 2 ? "" : " neg");
    }
    bilan.textContent = t;
  };
  for (const x of lignes){ x.garde.addEventListener("change", majBilan); x.montant.addEventListener("input", majBilan); }
  majBilan();
  const table = h("table", {class: "serre"}, h("thead", null, h("tr", null, h("th", null, ""), h("th", null, "Date"), h("th", null, "Libellé"), h("th", {class: "num"}, "Montant"))),
    h("tbody", null, lignes.map(x => h("tr", {class: x.l.sur ? "" : "neg", title: x.l.sur ? "" : "Sens non déterminé : vérifiez le signe"}, h("td", null, x.garde), h("td", null, dateFr(x.l.date)), h("td", null, x.libelle), h("td", {class: "num"}, x.montant)))));
  const r = await dialogue({titre: "Relevé PDF : vérifier les lignes lues", large: true, corps: h("div", null,
    h("p", null, "Lecture générale d'un relevé dont la banque n'a pas de lecteur dédié. Vérifiez chaque ligne : décochez ce qui n'est pas une opération, corrigez un montant ou un signe (dépense en négatif). Les lignes en rouge ont un sens incertain."),
    h("div", {class: "grille-champs"}, champ("Banque", banque), ...choix.elements), bilan, h("div", {class: "tableau"}, table)),
    actions: [{libelle: "Annuler", classe: "discret", valeur: null}, {libelle: "Importer ces lignes", classe: "primaire", action: () => {
      const ok = lignes.filter(x => x.garde.checked).map(x => ({date: x.l.date, libelle: propre(x.libelle.value) || "(sans libellé)", montant: Math.round(lireMontant(x.montant.value) * 100) / 100}));
      if (ok.some(o => isNaN(o.montant))){ message("Un montant est illisible.", true); return false; }
      if (!ok.length){ message("Aucune ligne retenue.", true); return false; }
      return choix.valide() ? ok : false;
    }}]});
  if (!r) return;
  const nomBanque = banque.value.trim() || "Relevé PDF";
  const compte = choix.resoudre(nomBanque);
  const dates = r.map(o => o.date).sort();
  const total = somme(r, o => versCentimes(o.montant));
  const coherent = lu.soldeDebut !== null && lu.soldeFin !== null && Math.abs(versCentimes(lu.soldeFin) - versCentimes(lu.soldeDebut) - total) < 2;
  f.lu = Object.assign({genre: "compte", banque: nomBanque, nom: lu.nom, numero: "", periode: {debut: dates[0], fin: dates[dates.length - 1]}, libre: true, compteId: compte.id, lignes: r},
    coherent ? {soldeDebut: lu.soldeDebut, soldeFin: lu.soldeFin} : {});
  preparerFichier(f);
  rafraichirEcran();
}
