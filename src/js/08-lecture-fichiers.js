/* ================= Lecture et reconnaissance des fichiers =================
   Chaque fichier déposé est reconnu (relevé, facture de cartes, valorisation,
   classeur de reprise, règles) et transformé en un objet neutre ; rien n'est
   enregistré ici. Tout est lu sur l'appareil. */

/* ---------- pdf.js, chargé à la demande ---------- */
let PDFJS = null;
async function chargerPdfjs(){
  if (PDFJS) return PDFJS;
  PDFJS = await import(new URL("vendor/pdfjs/pdf.min.mjs", location.href).href);
  // Adresse absolue : un chemin relatif serait résolu depuis le module, d'où « vendor/pdfjs/vendor/pdfjs/… ».
  PDFJS.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", location.href).href;
  return PDFJS;
}
/* Texte d'un PDF, ligne par ligne (les fragments sont regroupés par ordonnée). */
async function textePdf(octets, motDePasse){
  const pdfjs = await chargerPdfjs();
  const doc = await pdfjs.getDocument({data: octets.slice(), password: motDePasse || undefined, isEvalSupported: false, disableFontFace: true}).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++){
    const contenu = await (await doc.getPage(p)).getTextContent();
    const lignes = new Map();
    let xDebit = null, xCredit = null;
    for (const it of contenu.items){
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 2);
      if (!lignes.has(y)) lignes.set(y, []);
      const fin = it.transform[4] + (it.width || 0);
      if (it.str.trim() === "DEBIT") xDebit = fin;
      if (it.str.trim() === "CREDIT") xCredit = fin;
      lignes.get(y).push({x: it.transform[4], fin, t: it.str});
    }
    // Relevé à colonnes DEBIT / CREDIT : sur une ligne d'écriture (« jj.mm … »), un montant aligné sous CREDIT
    // reçoit la marque « [C] » (le texte seul ne dit pas le sens). Lu par extraireReleveCompteLcl.
    const marquer = l => {
      if (xDebit === null || xCredit === null || !/^\d{2}\.\d{2}\b/.test((l[0]?.t || "").trim())) return l;
      return l.map(x => /\d,\d{2}\s*$/.test(x.t) && Math.abs(x.fin - xCredit) < Math.abs(x.fin - xDebit) ? Object.assign({}, x, {t: x.t.replace(/\s*$/, "") + " [C]"}) : x);
    };
    pages.push([...lignes.entries()].sort((a, b) => b[0] - a[0]).map(([, l]) => marquer(l.sort((a, b) => a.x - b.x)).map(x => x.t).join(" ")).join("\n"));
  }
  await doc.destroy();
  return pages.join("\n\f\n").replace(/[   ]/g, " ").replace(/[ \t]+/g, " ");
}
class PdfProtege extends Error { constructor(){ super("PDF protégé par un mot de passe"); this.protege = true; } }

/* ---------- Point d'entrée ---------- */
async function lireFichier(fichier, motDePasse){
  const nom = fichier.name || "fichier";
  const ext = (nom.split(".").pop() || "").toLowerCase();
  const buffer = await fichier.arrayBuffer();
  const octets = new Uint8Array(buffer);
  if (ext === "csv" || ext === "txt") return lireCsv(nom, decoderTexte(buffer));
  if (ext === "xlsx" || ext === "xlsm") return lireXlsx(nom, buffer);
  if (ext === "json") return lireJson(nom, decoderTexte(buffer));
  if (ext === "pdf"){
    let texte;
    try { texte = await textePdf(octets, motDePasse); }
    catch (e){ if (e && (e.name === "PasswordException" || /password/i.test(e.message))) throw new PdfProtege(); throw e; }
    const r = reconnaitrePdf(nom, texte, octets);
    // Relevé d'une banque sans lecteur dédié : lecture générale, vérifiée avant import (08b-lecture-libre.js)
    if (r.genre === "justificatif_pdf" && ressembleReleve(texte)) return lireReleveLibrePdf(nom, octets, motDePasse, texte);
    return r;
  }
  if (/^(jpe?g|png|heic|webp)$/.test(ext)) return {genre: "image", nom, octets, mime: fichier.type || "image/jpeg"};
  if (ext === "zip") return lireZipJustificatifs(nom, buffer);
  return {genre: "inconnu", nom, raison: "format non reconnu (." + ext + ")"};
}

/* ---------- CSV ---------- */
function lireCsv(nom, texte){
  const lignes = analyserCSV(texte);
  if (!lignes.length) return {genre: "inconnu", nom, raison: "fichier vide"};
  const tete = lignes[0].map(x => norm(x).trim());
  if (tete[0] === "date" && tete[1] === "description" && tete[2] === "montant") return lireAmexCsv(nom, lignes);
  if (lignes[0].length <= 5 && /^\d{2}\/\d{2}\/\d{4}$/.test(lignes[0][0]) && /\d{5} \d{6}[A-Z]/.test(lignes[0][3] || "")) return lireLcl(nom, lignes);
  // Autre banque : colonnes à décrire une fois (08b-lecture-libre.js)
  return lireCsvLibre(nom, texte);
}

/* Export LCL : 1re ligne « date ; solde ; ; n° de compte », dernière ligne idem,
   entre les deux : date ; montant ; type ; n° chèque ; libellé ; libellé 2 ; code MCC ; catégorie LCL. */
function lireLcl(nom, lignes){
  const premiere = lignes[0], derniere = lignes[lignes.length - 1];
  const numero = (premiere[3] || "").trim();
  const corps = lignes.slice(1, -1).filter(l => /^\d{2}\/\d{2}\/\d{4}$/.test(l[0]));
  const ops = corps.map(l => ({
    date: lireDate(l[0]), montant: lireMontant(l[1]), type: propre(l[2]), cheque: propre(l[3]),
    libelle: propre([l[4], l[5]].filter(Boolean).join(" ")), mcc: (l[6] || "").trim(), categorieBanque: propre(l[7])
  })).filter(o => o.date && !isNaN(o.montant));
  const mCarte = nom.match(/_carte_(.+?)_(X\d{3,4})_du_(\d{2}-\d{2}-\d{4})_au_(\d{2}-\d{2}-\d{4})/i);
  const mPeriode = nom.match(/_du_(\d{2}-\d{2}-\d{4})_au_(\d{2}-\d{2}-\d{4})/);
  const periode = {debut: lireDate(premiere[0]), fin: lireDate(derniere[0])};
  if (mPeriode){ periode.debut = lireDate(mPeriode[1]); periode.fin = lireDate(mPeriode[2]); }
  const toutesCartes = ops.length && ops.every(o => o.type === "Carte");
  const total = somme(ops, o => versCentimes(o.montant));
  const encours = versCentimes(lireMontant(premiere[1]));
  if (mCarte || (toutesCartes && Math.abs(encours + total) < 1 && lireMontant(derniere[1]) === 0)){
    return {genre: "carte", banque: "LCL", nom, numero: numero.replace(/^\d{5} /, ""), carte: mCarte ? mCarte[2].toUpperCase() : "",
      libelleCarte: mCarte ? mCarte[1].replace(/_/g, " ").replace(/^Carte /i, "") : "", periode, encours: encours / 100,
      controle: {ok: Math.abs(encours + total) < 1, texte: "encours " + euros(encours / 100) + (Math.abs(encours + total) < 1 ? " = somme des lignes" : " ≠ somme des lignes " + euros(-total / 100))},
      lignes: ops};
  }
  return {genre: "compte", banque: "LCL", nom, numero: numero.replace(/^\d{5} /, ""), periode,
    soldeDebut: lireMontant(premiere[1]), soldeFin: lireMontant(derniere[1]), lignes: ops};
}

/* Export CSV Amex : Date,Description,Montant ; dates mm/jj/aaaa ; débit positif. */
function lireAmexCsv(nom, lignes){
  const ops = lignes.slice(1).filter(l => l[0]).map(l => ({date: lireDate(l[0], "mj"), montant: -lireMontant(l[2]), libelle: propre(l[1]), type: "Carte"}))
    .filter(o => o.date && !isNaN(o.montant));
  const dates = ops.map(o => o.date).sort();
  return {genre: "carte", banque: "Amex", nom, numero: "", carte: "AMEX", periode: {debut: dates[0], fin: dates[dates.length - 1]}, lignes: ops};
}

/* ---------- Relevé de compte LCL en PDF : paiements par carte du mois ----------
   « PAIEMENTS PAR CARTE D'OCTOBRE 2025 », puis par carte « CARTE N° 12 3456 M JEAN DUPONT »,
   « SOUS TOTAL : 3 996,27 » et une ligne par achat « LIBELLÉ LE 22/10 1 581,00 ». Les lignes de devise
   (« Rotterdam 1581,00 EUR ») sont ignorées. La carte est reconnue par ses 3 derniers chiffres (X456).
   Le texte ne distingue pas un remboursement d'un achat : la somme est contrôlée contre le sous-total, et
   un écart égal au double d'une ligne la désigne comme remboursement. */
function extraireCartesReleveLcl(texte){
  const T = String(texte || "").replace(/[\u00a0\u202f\u2009]/g, " ");
  if (!/PAIEMENTS PAR CARTE/i.test(T) || !/CARTE N°\s*\d/i.test(T)) return null;
  const MOIS = {janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12};
  const numero = ((T.match(/Compte\s*:\s*([0-9 ]+[A-Z])/) || [])[1] || "").replace(/\s/g, "");
  const lignes = T.split(/\n/).map(l => l.trim());
  const cartes = [];
  let moisCarte = 0, anCarte = 0, carte = null;
  for (const l of lignes){
    const s = l.match(/PAIEMENTS PAR CARTE D[E'’ ]+\s*([A-ZÉÛa-zéû]+)\s+(\d{4})/i);
    if (s){ moisCarte = MOIS[norm(s[1]).toLowerCase()] || 0; anCarte = +s[2]; carte = null; continue; }
    if (!moisCarte) continue;
    const c = l.match(/CARTE N°\s*(\d{2})\s*(\d{4})\s+(?:M|MME|MLLE|MR)\.?\s+(.+)$/i);
    if (c){ carte = {numero: c[1] + " " + c[2], carte: "X" + c[2].slice(-3), titulaire: c[3].trim(), sousTotal: null, lignes: [], mois: anCarte + "-" + pad2(moisCarte)}; cartes.push(carte); continue; }
    if (!carte) continue;
    const st = l.match(/^SOUS TOTAL\s*:\s*([\d .]+,\d{2})/i);
    if (st){ carte.sousTotal = lireMontant(st[1]); continue; }
    if (/^TOTAUX\b|^MONTANT COMPTABILISE/i.test(l)){ carte = null; continue; }
    const a = l.match(/^(.+?)\s+LE\s+(\d{2})\/(\d{2})\s+(\d[\d .]*,\d{2})$/);
    if (!a) continue;
    // Année : celle du mois de la carte, sauf un achat de fin d'année réglé en janvier
    const mm = +a[3], an = mm > moisCarte + 1 ? anCarte - 1 : anCarte;
    // Débit différé : le total de la section est prélevé sur le compte le dernier jour ouvré de son mois
    carte.lignes.push({date: an + "-" + a[3] + "-" + a[2], montant: -lireMontant(a[4]), libelle: propre(a[1]), type: "Carte", dateDebit: dernierJourOuvre(carte.mois + "-01")});
  }
  const pleines = cartes.filter(c => c.lignes.length);
  if (!pleines.length) return null;
  for (const c of pleines){
    const t = -somme(c.lignes, l => versCentimes(l.montant));
    const st = c.sousTotal === null ? null : versCentimes(c.sousTotal);
    if (st !== null && t !== st){
      const remb = c.lignes.find(l => -versCentimes(l.montant) * 2 === t - st);
      if (remb) remb.montant = -remb.montant;   // remboursement : crédit sur la carte
    }
    const t2 = -somme(c.lignes, l => versCentimes(l.montant));
    c.controle = {ok: st === null || t2 === st, texte: "carte " + c.numero + " : " + c.lignes.length + " ligne(s), " + euros(t2 / 100)
      + (st === null ? "" : t2 === st ? " = sous-total" : " ≠ sous-total " + euros(st / 100))};
  }
  const dates = pleines.flatMap(c => c.lignes.map(l => l.date)).sort();
  return {genre: "cartes_lcl", banque: "LCL", numero, cartes: pleines, periode: {debut: dates[0], fin: dates[dates.length - 1]},
    titre: "Détail des cartes " + pleines.map(c => c.carte).join(", ") + " · " + pleines[0].mois};
}

/* ---------- Relevé de compte LCL (PDF mensuel, la pièce qui fait foi) : écritures du compte et soldes ----------
   « jj.mm LIBELLE [valeur jj.mm.aa] montant [C] » : le sens vient de la colonne (marque [C] posée par textePdf).
   Contrôle : ancien solde + crédits − débits = solde final, au centime. */
function extraireReleveCompteLcl(texte){
  const T = String(texte || "").replace(/[   ]/g, " ");
  if (!/ECRITURES DE LA PERIODE/.test(T) || !/ANCIEN SOLDE/.test(T)) return null;
  const per = T.match(/du (\d{2})\.(\d{2})\.(\d{4}) au (\d{2})\.(\d{2})\.(\d{4})/);
  if (!per) return null;
  const debut = per[3] + "-" + per[2] + "-" + per[1], fin = per[6] + "-" + per[5] + "-" + per[4];
  const dateDe = (j, m) => { for (const an of [+per[6], +per[3], +per[6] + 1, +per[3] - 1]){ const d = an + "-" + m + "-" + j; if (d >= ajouterJours(debut, -10) && d <= ajouterJours(fin, 10)) return d; } return per[6] + "-" + m + "-" + j; };
  const numero = ((T.match(/Compte\s*:\s*([0-9 ]+[A-Z])\b/) || [])[1] || "").replace(/\s/g, "");
  const operations = []; let ancien = null, final = null, derniere = null;
  for (const brut of T.split(/\n/)){
    const l = brut.trim();
    if (/^PAIEMENTS PAR CARTE/i.test(l)) break;
    const m = l.match(/^(\d{2})\.(\d{2}) (.+?) (\d{1,3}(?: \d{3})*,\d{2})( \[C\])?(?: \.)?$/);
    if (!m){ if (derniere && /^(LIBELLE:|REF\.CLIENT)/.test(l) && !derniere.detail) derniere.detail = l.replace(/^LIBELLE:/, "").trim(); continue; }
    const montant = lireMontant(m[4]) * (m[5] ? 1 : -1);
    if (/^ANCIEN SOLDE/.test(m[3])){ ancien = montant; continue; }
    if (/^SOLDE EN EUROS/.test(m[3])){ final = montant; continue; }
    const libelle = m[3].replace(/ \d{2}\.\d{2}\.\d{2}$/, "").trim();
    derniere = {date: dateDe(m[1], m[2]), montant: Math.round(montant * 100) / 100, libelle, type: /^CHQ/.test(libelle) ? "Chèque" : ""};
    operations.push(derniere);
  }
  if (ancien === null || !operations.length) return null;
  const calc = versCentimes(ancien) + somme(operations, o => versCentimes(o.montant));
  const ok = final !== null && calc === versCentimes(final);
  return {numero, periode: {debut, fin}, soldeDebut: ancien, soldeFin: final, operations,
    controle: {ok, texte: "relevé du compte : " + operations.length + " écriture(s)" + (final === null ? ", solde final illisible" : ok ? ", soldes cohérents au centime" : ", écart de " + euros((versCentimes(final) - calc) / 100) + " entre les écritures et le solde final")}};
}

/* ---------- Relevé mensuel Amex (PDF, la pièce qui fait foi) ----------
   En-tête « Solde Précédent − Nouveau Crédit + Nouveau Débit = Nouveau Solde » ; période « Le relevé du 7 octobre
   au 6 novembre 2026 » ; prélèvement « à partir du jj/mm/aaaa ». Écritures « 6 oct 7 oct LIBELLE 11,15 » : date de
   la transaction, date d'enregistrement, libellé (parfois sur la ligne suivante), montant ; un « CR » qui suit
   marque un crédit (paiement reçu, remboursement). Contrôle : somme des débits et des crédits égale à l'en-tête. */
const MOIS_AMEX = {jan: 1, fev: 2, mar: 3, avr: 4, mai: 5, juin: 6, juil: 7, jui: 7, aou: 8, sep: 9, oct: 10, nov: 11, dec: 12};
const moisAmex = t => { const n = norm(t).replace(/\./g, ""); return MOIS_AMEX[n.slice(0, 4)] || MOIS_AMEX[n.slice(0, 3)] || null; };
function extraireReleveAmex(texte){
  const T = String(texte || "").replace(/[   ]/g, " ");
  if (!/American Express/i.test(T) || !/Solde Pr[ée]c[ée]dent/i.test(T) || !/Nouveau Solde/i.test(T)) return null;
  const mt = "(\\d{1,3}(?: \\d{3})*,\\d{2})";
  const tete = T.match(new RegExp(mt + " - " + mt + " \\+ " + mt + " = " + mt));
  const per = norm(T).match(/le releve du (\d{1,2}) ([a-z]+) au (\d{1,2}) ([a-z]+) (\d{4})/);
  if (!tete || !per || !MOIS_TEXTE[per[2]] || !MOIS_TEXTE[per[4]]) return null;
  const anFin = +per[5], moisFin = MOIS_TEXTE[per[4]];
  const fin = anFin + "-" + pad2(moisFin) + "-" + pad2(per[3]);
  const debut = (MOIS_TEXTE[per[2]] > moisFin ? anFin - 1 : anFin) + "-" + pad2(MOIS_TEXTE[per[2]]) + "-" + pad2(per[1]);
  const dateDe = (j, m) => (m > moisFin + 1 ? anFin - 1 : anFin) + "-" + pad2(m) + "-" + pad2(j);
  const prelevement = lireDate(premier(T, /pr[ée]l[èe]vement automatique sur votre compte bancaire [àa] partir du (\d{2}\/\d{2}\/\d{4})/i)) || null;
  const numero = premier(T, /x{4}-x{6}-(\d{4,6})/i);
  const operations = []; let derniere = null, attendLibelle = false, titulaire = "";
  const reLigne = /^(\d{1,2}) ([a-zéûô]+)\.? (\d{1,2}) ([a-zéûô]+)\.?(?: (.*))?$/i;
  for (const brut of T.split(/\n/)){
    const l = brut.trim();
    const pour = l.match(/^Op[ée]rations pour (.+)$/i); if (pour){ titulaire = pour[1].trim(); attendLibelle = false; continue; }
    if (/^Autres transactions/i.test(l)){ titulaire = ""; attendLibelle = false; continue; }
    if (l === "CR"){ if (derniere && derniere.montant < 0) derniere.montant = -derniere.montant; continue; }
    const m = l.match(reLigne);
    const reste = m ? (m[5] || "").trim() : "", cr = / ?\bCR$/.test(reste), sansCr = reste.replace(/ ?\bCR$/, "");
    const mm = m ? sansCr.match(/(?:^| )(\d{1,3}(?: \d{3})*,\d{2})$/) : null;
    if (m && moisAmex(m[2]) && moisAmex(m[4]) && mm){
      derniere = {date: dateDe(+m[1], moisAmex(m[2])), dateEnregistrement: dateDe(+m[3], moisAmex(m[4])), libelle: sansCr.slice(0, mm.index).trim(), montant: -lireMontant(mm[1]), detail: titulaire};
      if (cr) derniere.montant = -derniere.montant;
      operations.push(derniere); attendLibelle = !derniere.libelle; continue;
    }
    if (attendLibelle && derniere && l && !/^(Total|Carte |Num[ée]ro|Nom |Date de)/i.test(l)){ derniere.libelle = l; attendLibelle = false; }
  }
  if (!operations.length) return null;
  const [soldeDebut, credits, debits, soldeFin] = tete.slice(1, 5).map(lireMontant);
  const sd = somme(operations.filter(o => o.montant < 0), o => -versCentimes(o.montant)), sc = somme(operations.filter(o => o.montant > 0), o => versCentimes(o.montant));
  const ok = sd === versCentimes(debits) && sc === versCentimes(credits) && versCentimes(soldeDebut) - versCentimes(credits) + versCentimes(debits) === versCentimes(soldeFin);
  for (const o of operations) o.montant = Math.round(o.montant * 100) / 100;
  return {numero, periode: {debut, fin}, prelevement, soldeDebut, soldeFin, credits, debits, operations,
    controle: {ok, texte: "relevé Amex : " + operations.length + " écriture(s)" + (ok ? ", débits, crédits et soldes cohérents au centime"
      : ", écart : débits " + euros(sd / 100) + " pour " + euros(debits) + ", crédits " + euros(sc / 100) + " pour " + euros(credits))}};
}

/* Relevé annuel d'un livret (période de février à janvier) : solde au 31/12 compris dans la période, tiré des
   écritures (ancien solde + écritures jusqu'au 31/12). Sert de valeur de fin d'année pour la comparaison du patrimoine. */
function soldesFinAnnee(texte){
  const rc = extraireReleveCompteLcl(texte);
  if (!rc || !rc.controle.ok) return [];
  const r = [];
  for (let an = +rc.periode.debut.slice(0, 4); an <= +rc.periode.fin.slice(0, 4); an++){
    const d = an + "-12-31";
    if (d < rc.periode.debut || d >= rc.periode.fin) continue;
    r.push({date: d, valeur: Math.round((rc.soldeDebut + somme(rc.operations.filter(o => o.date <= d), o => o.montant)) * 100) / 100});
  }
  return r;
}

/* ---------- Justificatifs d'achat SNCF Connect ----------
   Un PDF par paiement : date de la transaction, montant, carte, et pour chaque trajet sa date, son heure
   et ses voyageurs. Les trajets d'une même commande (aller et retour) partagent un prix de bloc. */
function extraireAchatSncf(texte){
  const T = String(texte || "").replace(/[\u00a0\u202f\u2009]/g, " ").replace(/\ufb01/g, "fi");
  // Le lecteur PDF coupe la ligature « fi » : « Justi fi catif d'achat »
  if (!/Justi\s*fi\s*catif\s+d.\s*achat/i.test(T) || !/SNCF ?Connect/i.test(T)) return null;
  const tx = T.match(/Date de transaction\s*:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!tx) return null;
  const montants = [...T.matchAll(/Montant (?:de la transaction|total) \(TTC\)\s*:\s*([\d .]+,\d{2})\s*€/g)].map(m => lireMontant(m[1]));
  const lignes = T.split(/\n/).map(l => l.trim());
  const trajets = [];
  for (let i = 0; i < lignes.length; i++){
    const m = lignes[i].match(/(Aller|Retour)\s+(\d{2}\/\d{2}\/\d{4})\s+à\s+(\d{2}:\d{2})/);
    if (!m) continue;
    const voyageurs = [];
    // Voyageurs sur la même ligne (texte fusionné) ou les suivantes
    const reste = [lignes[i].slice(m.index + m[0].length)].concat(lignes.slice(i + 1, i + 12));
    for (const l of reste){
      const vs = [...l.matchAll(/Voyageur\s*\d+\s*:\s*([^-\n]+?)\s*(?:-|$)/g)].map(x => x[1].trim());
      if (vs.length) voyageurs.push(...vs);
      else if (!l || /^[\d\s.,]+€$/.test(l)) continue;   // prix du bloc, parfois rendu entre deux voyageurs
      else if (voyageurs.length || /(Aller|Retour)\s+\d{2}\//.test(l)) break;
    }
    trajets.push({sens: m[1], date: lireDate(m[2]), heure: m[3], voyageurs});
  }
  if (!trajets.length) return null;
  return {date: lireDate(tx[1]), montant: montants.length ? Math.max(...montants) : 0, transaction: ((T.match(/Transaction n°\s*(\d+)/) || [])[1] || ""),
    carte4: ((T.match(/Numéro de carte\s*:\s*#*(\d{4})/) || [])[1] || ""), references: ((T.match(/Référence commande\s*([A-Z0-9, ]+)/) || [])[1] || "").split(/[ ,]+/).filter(Boolean), trajets};
}
/* ZIP de justificatifs (« JustificatifAchat_SNCFCONNECT.zip ») : chaque PDF est lu. */
async function lireZipJustificatifs(nom, buffer){
  const zip = extraireZip(buffer);
  const achats = [];
  for (const n of Object.keys(zip.entrees).filter(x => /\.pdf$/i.test(x)).sort()){
    try { const a = extraireAchatSncf(await textePdf(await octetsDuZip(zip, n))); if (a) achats.push(a); } catch (e){ console.error(n, e); }
  }
  if (!achats.length) return {genre: "inconnu", nom, raison: "archive sans justificatif d'achat SNCF Connect"};
  const dates = achats.map(a => a.date).sort();
  return {genre: "document", sousGenre: "achat_sncf", nom, achats, periode: {debut: dates[0], fin: dates[dates.length - 1]}, date: dates[dates.length - 1], titre: achats.length + " paiement(s)"};
}

/* ---------- Classeurs ---------- */
/* Export CSV Amex ouvert puis enregistré dans Excel : chaque ligne CSV tient dans la première cellule. */
function amexCsvDansFeuille(nom, m){
  const lignes = (m || []).filter(l => l && l[0] !== null && l[0] !== undefined && String(l[0]).trim());
  if (!lignes.length || !/^date,description,montant/.test(norm(String(lignes[0][0])).replace(/\s/g, ""))) return null;
  return lireCsv(nom, lignes.map(l => String(l[0])).join("\n"));
}
async function lireXlsx(nom, buffer){
  const c = await lireClasseur(buffer);
  if (c.feuilles["Opérations"] && c.feuilles["Synthèse"]) return {genre: "reprise_v7", nom, classeur: c};
  for (const n of c.noms){
    const m = c.feuilles[n];
    const enCsv = amexCsvDansFeuille(nom, m);
    if (enCsv) return enCsv;
    const iTete = m.findIndex(l => l && norm(l[0]) === "date" && norm(l[1]) === "description" && /montant/.test(norm(l[2])));
    if (iTete >= 0){
      const t = m[iTete].map(x => norm(x));
      const iRef = t.indexOf("reference"), iVille = t.indexOf("ville");
      const ops = m.slice(iTete + 1).filter(l => l && l[0] && l[2] !== null && l[2] !== undefined).map(l => ({
        date: typeof l[0] === "number" ? dateExcel(l[0]) : lireDate(l[0], "mj"), montant: -lireMontant(l[2]), libelle: propre(l[1]),
        ville: iVille >= 0 ? propre(l[iVille]) : "", reference: iRef >= 0 ? String(l[iRef] || "") : "", categorieBanque: propre(l[t.indexOf("categorie")] || ""), type: "Carte"
      })).filter(o => o.date && !isNaN(o.montant));
      const dates = ops.map(o => o.date).sort();
      return {genre: "carte", banque: "Amex", nom, numero: "", carte: "AMEX", periode: {debut: dates[0], fin: dates[dates.length - 1]}, lignes: ops};
    }
  }
  return {genre: "inconnu", nom, raison: "classeur non reconnu"};
}
function lireJson(nom, texte){
  let o; try { o = JSON.parse(texte); } catch (e) { return {genre: "inconnu", nom, raison: "JSON illisible"}; }
  if (o.format === "budget-foyer-regles") return {genre: "regles", nom, contenu: o};
  if (o.format === "budget-foyer-plan") return {genre: "plan", nom, contenu: o};
  if (o.format === "budget-foyer-corrections") return lireCorrections(nom, o);
  // Achats SNCF Connect relevés dans les e-mails de confirmation (quand le site ne remonte plus assez loin)
  if (o.format === "budget-foyer-achats-sncf"){
    const achats = (o.achats || []).filter(a => a && /^\d{4}-\d{2}-\d{2}$/.test(a.date || "") && a.montant > 0 && (a.trajets || []).length)
      .map(a => ({date: a.date, montant: +a.montant, transaction: a.transaction || "", carte4: a.carte4 || "", references: a.references || [], source: o.source || "",
        trajets: a.trajets.map(t => ({sens: t.sens || "Aller", date: t.date, heure: t.heure || "", voyageurs: t.voyageurs || []}))}));
    if (!achats.length) return {genre: "inconnu", nom, raison: "aucun achat lisible"};
    const dates = achats.map(a => a.date).sort();
    return {genre: "document", sousGenre: "achat_sncf", nom, achats, periode: {debut: dates[0], fin: dates[dates.length - 1]}, date: dates[dates.length - 1], titre: achats.length + " paiement(s), " + (o.source || "relevé")};
  }
  return {genre: "inconnu", nom, raison: "JSON non reconnu"};
}

/* ---------- PDF : factures de cartes et relevés de valorisation ---------- */
const reMontant = "(-?\\d[\\d .]*,\\d{2})";
const MOIS_TEXTE = {janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12};
function dateTexte(t){
  const m = norm(t).match(/(\d{1,2})(?:er)? ([a-z]+) (\d{4})/);
  if (m && MOIS_TEXTE[m[2]]) return `${m[3]}-${pad2(MOIS_TEXTE[m[2]])}-${pad2(m[1])}`;
  return lireDate(t);
}
function premier(texte, re){ const m = texte.match(re); return m ? m[1].trim() : ""; }
/* Échéances prélevées d'un avis d'impôt (DGFiP) : échéancier « 26 octobre 2026 : 1 655,00 € » (impôt sur le revenu),
   sinon « Somme à payer » avec la date de prélèvement (« prélevée … le jj/mm/aaaa ») ou la date limite + 10 jours. */
function echeancesAvisImpot(texte, quoi){
  const T = String(texte || "").replace(/[  ]/g, " ");
  const r = [];
  for (const m of T.matchAll(/(\d{1,2}(?:er)? [a-zéû]+ \d{4})\s*:\s*(\d{1,3}(?: \d{3})*,\d{2})\s*€/gi)){ const d = dateTexte(m[1]); if (d) r.push({date: d, montant: lireMontant(m[2])}); }
  if (r.length) return r;
  const montant = lireMontant(premier(T, /(?:Somme (?:à|qu.il vous reste à) payer|Montant de votre taxe d.habitation)[\s\S]{0,120}?(\d{1,3}(?: \d{3})*,\d{2})\s*€/i));
  if (!(montant > 0)) return r;
  const prelev = lireDate(premier(T, /pr[ée]lev[ée]e? automatiquement le (\d{2}\/\d{2}\/\d{4})/i));
  const limite = lireDate(premier(T, /Date limite de paiement\s*:\s*(\d{2}\/\d{2}\/\d{4})/i));
  const date = prelev || (limite ? ajouterJours(limite, 10) : null);
  if (date) r.push({date, montant});
  return r;
}

function reconnaitrePdf(nom, texte, octets){
  const T = texte; const N = norm(texte);
  const base = {nom, texte: T, octets};
  // Relevé mensuel Amex : clôture du mois de la carte, il fait foi (le CSV ne sert qu'au suivi du mois en cours)
  const amex = extraireReleveAmex(T);
  if (amex) return Object.assign(base, {genre: "releve_amex", banque: "Amex", releveAmex: amex, numero: amex.numero, periode: amex.periode,
    titre: "Relevé Amex du " + dateFr(amex.periode.debut) + " au " + dateFr(amex.periode.fin)});
  // Relevé de compte LCL : on n'en garde que le détail des cartes (le compte vient des exports CSV)
  const cartesPdf = extraireCartesReleveLcl(T);
  // Relevé mensuel complet (écritures du compte + détail des cartes) : clôture du mois, il fait foi
  // Seulement un relevé de compte courant : un livret ou un PEA ont le même format d'écritures mais sont lus plus bas
  const epargne = /^(LIVRET|PEA|PLAN|COMPTEEPARGNE|CEL|PEL)/i.test(nom) || /\bLIVRET\b|PLAN D.?[EÉ]PARGNE|[EÉ]PARGNE LOGEMENT/i.test(T);
  const releve = epargne && !/^COMPTEDEDEPOTS/i.test(nom) ? null : extraireReleveCompteLcl(T);
  if (releve) return Object.assign(base, cartesPdf || {cartes: []}, {nom, genre: "releve_lcl", banque: "LCL", releveCompte: releve, numero: releve.numero, periode: releve.periode,
    titre: "Relevé LCL du " + dateFr(releve.periode.debut) + " au " + dateFr(releve.periode.fin)});
  if (cartesPdf) return Object.assign(base, cartesPdf, {nom});
  // Facture des cartes LCL (« RELEVE CB AU jj/mm/aa »)
  if (/RELEVE CB AU/.test(T) && /DIFFERE|Montant/i.test(T)){
    return Object.assign(base, {genre: "facture_cb", banque: "LCL",
      montant: Math.abs(lireMontant(premier(T, new RegExp("Montant\\s*" + reMontant)))),
      arrete: lireDate(premier(T, /RELEVE CB AU (\d{2}\/\d{2}\/\d{2,4})/)),
      dateDebit: lireDate(premier(T, /Date de l.op[ée]ration\s*(\d{2}\/\d{2}\/\d{4})/)),
      dateValeur: lireDate(premier(T, /Date de valeur\s*(\d{2}\/\d{2}\/\d{4})/)),
      numero: premier(T, /Compte\s+\d{5}\s?(\d{6}[A-Z])/)});
  }
  const fn = nom.match(/^([A-Z]+)_(\d{11})_(\d{8})/);
  // Livrets LCL (relevé annuel)
  if (fn && /^LIVRET/.test(fn[1]) && /SOLDE EN EUROS/.test(T)){
    return Object.assign(base, {genre: "valorisation", etablissement: "LCL", typeCompte: "livret",
      produit: /DEVDURABLE/.test(fn[1]) ? "Livret de développement durable et solidaire" : (fn[1] === "LIVRETA" ? "Livret A" : fn[1]),
      numero: fn[2].slice(5), date: `${fn[3].slice(0, 4)}-${fn[3].slice(4, 6)}-${fn[3].slice(6, 8)}`,
      valeur: lireMontant(premier(T, new RegExp("SOLDE EN EUROS\\s*" + reMontant))), intermediaires: soldesFinAnnee(T)});
  }
  // PEA LCL : relevé du compte espèces avec l'évaluation globale
  if (/Evaluation globale de votre PEA/i.test(T)){
    return Object.assign(base, {genre: "valorisation", etablissement: "LCL", typeCompte: "pea", produit: "PEA",
      numero: fn ? fn[2].slice(5) : "", date: lireDate(premier(T, /PEA au (\d{2}\/\d{2}\/\d{4})/)) || (fn ? `${fn[3].slice(0, 4)}-${fn[3].slice(4, 6)}-${fn[3].slice(6, 8)}` : null),
      valeur: lireMontant(premier(T, /Evaluation globale de votre PEA\s*:\s*([\d.,\s]+)\s*euros/i)),
      versements: lireMontant(premier(T, /Cumul des versements depuis l.ouverture\s*:\s*([\d.,\s]+)\s*euros/i))});
  }
  // Relevé de valeurs mobilières (portefeuille titres)
  if (/RELEVE DE VALEURS MOBILIERES/.test(T) && /EVALUATION TOTALE/.test(T)){
    const lignes = [];
    for (const m of T.matchAll(/(\d[\d ]*?) [CNP] \d [A-Z]\s+([\d,]+)\s*([A-Z][A-Z0-9 .'&-]+?) ([A-Z]{2}\d{9}[0-9A-Z])\s+([\d,]+)\s+([\d ]+,\d{2})/g))
      lignes.push({quantite: lireMontant(m[1]), prixRevient: lireMontant(m[2]), titre: m[3].trim(), isin: m[4], cours: lireMontant(m[5]), valeur: lireMontant(m[6])});
    const surPea = /plan d.[ée]pargne en actions/i.test(T);
    return Object.assign(base, {genre: "valorisation", etablissement: "LCL", typeCompte: surPea ? "pea" : "titres", produit: surPea ? "PEA" : "Compte-titres",
      numero: premier(T, /\d{5}-(\d{6}[A-Z])/), date: lireDate(premier(T, /[ée]tabli au (\d{2}\/\d{2}\/\d{4})/)),
      valeur: lireMontant(premier(T, new RegExp("EVALUATION TOTALE\\s*" + reMontant))), lignes, partiel: surPea});
  }
  // Assurance-vie : relevé trimestriel (« la valeur de votre adhésion s'élève à … euros »), information
  // trimestrielle (« la valeur de votre adhésion au 30 septembre 2025 s'élève à … € ») et relevé annuel (« … au 31 décembre 2025 est de : … € »)
  if (/valeur de votre adh[ée]sion (?:au \d{1,2}(?:er)? \S+ \d{4} )?(?:s.[ée]l[èe]ve|est de)/i.test(T)){
    const m = T.match(/valeur de votre adh[ée]sion (?:au (\d{1,2}(?:er)? \S+ \d{4}) )?(?:s.[ée]l[èe]ve [àa]|est de\s*:?)\s*(\d{1,3}(?:[  .]\d{3})*,\d{2})\s*(?:€|euros)/i);
    const dateLue = (m && m[1]) || premier(T, /relev[ée] (?:trimestriel|annuel)[^\n]*? (?:au|établi au) (\d{1,2}(?:er)? \S+ \d{4})/i);
    return Object.assign(base, {genre: "valorisation", etablissement: premier(T, /Assureur\s*:\s*([A-Za-zÀ-ÿ ]+?)\s*(?:N°|\n)/) || "Assurance-vie", typeCompte: "assurance_vie",
      produit: premier(T, /adh[ée]sion au contrat (.+?) formule/i) || premier(T, /N° Adh[ée]sion\s*:\s*[\d ]+[A-Z][ \t]+([A-Z][A-Z ]{3,40})/) || "Assurance-vie",
      numero: premier(T, /N° Adh[ée]sion\s*:\s*([\d ]+[A-Z])/).replace(/\s/g, ""),
      date: dateTexte(dateLue), valeur: m ? lireMontant(m[2]) : NaN});
  }
  // Contrat de retraite (« valeur de transfert »)
  if (/Valeur de transfert/i.test(T)){
    return Object.assign(base, {genre: "valorisation", etablissement: premier(T, /^(.+?)\n/) || "Assureur", typeCompte: "retraite",
      produit: premier(T, /adh[ée]sion ([\s\S]{3,80}?)\.\s*Vous/i).replace(/\s+/g, " ") || "Contrat retraite",
      numero: premier(T, /num[ée]ro de contrat\s*(\w+)/i), date: lireDate(premier(T, /SITUATION DE VOTRE CONTRAT AU (\d{2}\.\d{2}\.\d{4})/)),
      valeur: lireMontant(premier(T, new RegExp("Valeur de transfert\\s*\\(\\d\\)\\s*" + reMontant))),
      renteMinimale: lireMontant(premier(T, new RegExp("au terme\\s*\\(\\d\\)\\s*" + reMontant)))});
  }
  // Épargne disponible (valeur de rachat) d'un contrat d'assurance
  if (/Epargne disponible \(valeur de rachat\)/i.test(T)){
    return Object.assign(base, {genre: "valorisation", etablissement: premier(T, /^(.+?)\n/) || "Assureur", typeCompte: "assurance_vie",
      produit: premier(T, /adh[ée]sion ([A-Z][A-Z ]+?)\. Vous/) || "Contrat d'assurance",
      numero: premier(T, /num[ée]ro de contrat\s*(\w+)/i), date: lireDate(premier(T, /SITUATION DE VOTRE CONTRAT AU (\d{2}\.\d{2}\.\d{4})/)),
      valeur: lireMontant(premier(T, new RegExp("Epargne disponible \\(valeur de rachat\\)\\s*" + reMontant, "i"))),
      cotisation: lireMontant(premier(T, new RegExp("Cotisation [A-Z]+\\s*" + reMontant)))});
  }
  // Contrat vie entière (prévoyance) avec valeur de rachat
  if (/Valeur de rachat/i.test(T) && /VIE ENTIERE|capital de/i.test(T)){
    return Object.assign(base, {genre: "valorisation", etablissement: premier(T, /^(.+?)\n/) || "Assureur", typeCompte: "prevoyance",
      produit: premier(T, /Contrat ([A-Z][A-Z ]*?)\s{0,2}(?:m |En)/) || "Contrat vie entière",
      numero: premier(T, /n° de contrat\s*:\s*(\w+)/i), date: lireDate(premier(T, /avant le (\d{2}\/\d{2}\/\d{4})/)) || null,
      valeur: lireMontant(premier(T, new RegExp("Valeur de rachat\\s*" + reMontant))),
      capitalDeces: lireMontant(premier(T, new RegExp("capital de\\s*" + reMontant)))});
  }
  // Avis d'opéré (vente ou achat de titres)
  if (/AVIS DE (VENTE|ACHAT) DE VALEURS MOBILIERES/.test(T)){
    const m = T.match(/(Vente|Achat) de (\d[\d ]*) (.+?) \(code ([A-Z0-9]{12})\)/);
    return Object.assign(base, {genre: "document", sousGenre: "avis_opere", sens: m ? m[1] : "", quantite: m ? lireMontant(m[2]) : null, titre: m ? m[3] : "",
      isin: m ? m[4] : "", montant: lireMontant(premier(T, /cr[ée]dit[ée] en date du \d{2}\/\d{2}\/\d{4} de ([\d .,]+) EUR/)),
      date: lireDate(premier(T, /en date du (\d{2}\/\d{2}\/\d{4})/))});
  }
  // Avis d'imposition (DGFiP) : gardé pour le rangement, sans écriture comptable
  if (/\bAVIS_(TF|TH|IR|PS|THRS)_/.test(T) || (/FINANCES PUBLIQUES/.test(T) && /avis d.imp[oô]t|taxes? fonci[eè]res?|taxe d.habitation/i.test(T))){
    const an = premier(N, /(?:avis d.impot|taxes? foncieres?|taxe d.habitation)\s*(\d{4})/) || premier(nom, /(20\d{2})/);
    const quoi = /\bAVIS_TF_|taxes? fonci/i.test(T + nom) ? "Taxe foncière" : /\bAVIS_TH|taxe d.habitation/i.test(T + nom) ? "Taxe d'habitation" : "Impôt sur le revenu";
    const echeances = echeancesAvisImpot(T, quoi);
    return Object.assign(base, {genre: "document", sousGenre: "avis_impot", titre: quoi + (an ? " " + an : "") + (echeances.length === 1 ? " · " + euros(echeances[0].montant) : ""),
      date: an ? an + "-12-31" : null, quoi, echeances, montant: somme(echeances, e => e.montant) || null});
  }
  if (/^COMPTEDEDEPOTS_/.test(nom)) return Object.assign(base, {genre: "inconnu", raison: "relevé de compte PDF : importez plutôt l'export CSV du compte (plus complet)"});
  // Justificatif d'achat SNCF Connect : paiement et trajets (sert au rapprochement des notes de frais)
  const achat = extraireAchatSncf(T);
  if (achat) return Object.assign(base, {genre: "document", sousGenre: "achat_sncf", achats: [achat], date: achat.date, montant: achat.montant, titre: achat.trajets.length + " trajet(s)"});
  // Pièce justificative (facture, ticket, note de frais détaillée)
  const ndf = extraireNoteFrais(T);
  return Object.assign(base, {genre: "justificatif_pdf"}, ndf ? {noteFrais: ndf, date: ndf.declaree} : {});
}
