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
    for (const it of contenu.items){
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 2);
      if (!lignes.has(y)) lignes.set(y, []);
      lignes.get(y).push({x: it.transform[4], t: it.str});
    }
    pages.push([...lignes.entries()].sort((a, b) => b[0] - a[0]).map(([, l]) => l.sort((a, b) => a.x - b.x).map(x => x.t).join(" ")).join("\n"));
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
    return reconnaitrePdf(nom, texte, octets);
  }
  if (/^(jpe?g|png|heic|webp)$/.test(ext)) return {genre: "image", nom, octets, mime: fichier.type || "image/jpeg"};
  return {genre: "inconnu", nom, raison: "format non reconnu (." + ext + ")"};
}

/* ---------- CSV ---------- */
function lireCsv(nom, texte){
  const lignes = analyserCSV(texte);
  if (!lignes.length) return {genre: "inconnu", nom, raison: "fichier vide"};
  const tete = lignes[0].map(x => norm(x).trim());
  if (tete[0] === "date" && tete[1] === "description" && tete[2] === "montant") return lireAmexCsv(nom, lignes);
  if (lignes[0].length <= 5 && /^\d{2}\/\d{2}\/\d{4}$/.test(lignes[0][0]) && /\d{5} \d{6}[A-Z]/.test(lignes[0][3] || "")) return lireLcl(nom, lignes);
  return {genre: "inconnu", nom, raison: "CSV non reconnu (ni export LCL, ni export Amex)"};
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

/* ---------- Classeurs ---------- */
async function lireXlsx(nom, buffer){
  const c = await lireClasseur(buffer);
  if (c.feuilles["Opérations"] && c.feuilles["Synthèse"]) return {genre: "reprise_v7", nom, classeur: c};
  for (const n of c.noms){
    const m = c.feuilles[n];
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

function reconnaitrePdf(nom, texte, octets){
  const T = texte; const N = norm(texte);
  const base = {nom, texte: T, octets};
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
      valeur: lireMontant(premier(T, new RegExp("SOLDE EN EUROS\\s*" + reMontant)))});
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
  // Assurance-vie, relevé trimestriel (« valeur de votre adhésion »)
  if (/valeur de votre adh[ée]sion s.[ée]l[èe]ve/i.test(T)){
    return Object.assign(base, {genre: "valorisation", etablissement: premier(T, /Assureur\s*:\s*([A-Za-zÀ-ÿ ]+?)\s*(?:N°|\n)/) || "Assurance-vie", typeCompte: "assurance_vie",
      produit: premier(T, /adh[ée]sion au contrat (.+?) formule/i) || "Assurance-vie",
      numero: premier(T, /N° Adh[ée]sion\s*:\s*([\d ]+[A-Z])/).replace(/\s/g, ""),
      date: dateTexte(premier(T, /relev[ée] trimestriel au (\d{1,2}(?:er)? \S+ \d{4})/i)),
      valeur: lireMontant(premier(T, /valeur de votre adh[ée]sion s.[ée]l[èe]ve [àa]\s*([\d .,]+)\s*euros/i))});
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
    return Object.assign(base, {genre: "document", sousGenre: "avis_impot", titre: quoi + (an ? " " + an : ""), date: an ? an + "-12-31" : null});
  }
  if (/^COMPTEDEDEPOTS_/.test(nom)) return Object.assign(base, {genre: "inconnu", raison: "relevé de compte PDF : importez plutôt l'export CSV du compte (plus complet)"});
  // Pièce justificative (facture, ticket)
  return Object.assign(base, {genre: "justificatif_pdf"});
}
