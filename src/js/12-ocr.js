/* ================= Lecture des tickets (OCR local, Tesseract.js) =================
   Tout se passe dans le navigateur : moteur, modèle français et image restent
   sur l'appareil. L'extraction propose ; l'utilisateur valide ou corrige. */

let MOTEUR_OCR = null;
async function chargerOcr(progression){
  if (MOTEUR_OCR) return MOTEUR_OCR;
  if (!window.Tesseract) await chargerScript("vendor/tesseract/tesseract.min.js");
  const base = new URL("vendor/tesseract/", location.href).href;
  const options = {workerPath: base + "worker.min.js", corePath: base, langPath: base, gzip: true, cacheMethod: "none",
    logger: m => { if (progression && m.status === "recognizing text") progression(m.progress); }};
  // Le moteur pèse plusieurs mégaoctets : une seconde tentative couvre une coupure réseau passagère.
  try { MOTEUR_OCR = await Tesseract.createWorker("fra", 1, options); }
  catch (e){ await attendre(800); MOTEUR_OCR = await Tesseract.createWorker("fra", 1, options); }
  return MOTEUR_OCR;
}
function chargerScript(src){
  return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("chargement de " + src)); document.head.appendChild(s); });
}
/* Le ticket dans la photo : plus grande zone claire et peu colorée (le papier), repérée sur une vignette.
   Rien si elle est trop petite ou couvre presque toute l'image (ticket déjà bien cadré). */
function cadrerPapier(src){
  const w = 80, h = Math.max(1, Math.round(src.height * w / src.width));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, w, h);
  const p = ctx.getImageData(0, 0, w, h).data; const B = new Uint8Array(w * h);
  for (let i = 0, k = 0; k < w * h; i += 4, k++){ const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; const s = Math.max(p[i], p[i + 1], p[i + 2]) - Math.min(p[i], p[i + 1], p[i + 2]); B[k] = g > 170 && s < 25 ? 1 : 0; }
  const vu = new Uint8Array(w * h); let best = null;
  for (let k = 0; k < w * h; k++){
    if (!B[k] || vu[k]) continue;
    const pile = [k]; vu[k] = 1; let n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (pile.length){
      const q = pile.pop(); n++; const x = q % w, y = (q / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const r of [x + 1 < w ? q + 1 : -1, x > 0 ? q - 1 : -1, y + 1 < h ? q + w : -1, y > 0 ? q - w : -1]) if (r >= 0 && B[r] && !vu[r]){ vu[r] = 1; pile.push(r); }
    }
    if (!best || n > best.n) best = {n, x0, x1, y0, y1};
  }
  if (!best) return null;
  const part = best.n / (w * h); if (part < 0.04 || part > 0.7) return null;
  const f = src.width / w, mx = (best.x1 - best.x0 + 1) * 0.06, my = (best.y1 - best.y0 + 1) * 0.12;
  const x0 = Math.max(0, (best.x0 - mx) * f), y0 = Math.max(0, (best.y0 - my) * f);
  return {x: x0, y: y0, l: Math.min(src.width, (best.x1 + 1 + mx) * f) - x0, h: Math.min(src.height, (best.y1 + 1 + my) * f) - y0};
}
/* Réduit la photo (1 600 px au plus) pour la garder ; pour la lire, cadre sur le ticket, agrandit si besoin
   et passe en niveaux de gris contrastés. */
async function preparerImage(blob, cote){
  const img = await createImageBitmap(blob);
  const k = Math.min(1, (cote || 1600) / Math.max(img.width, img.height));
  const photo = document.createElement("canvas"); photo.width = Math.round(img.width * k); photo.height = Math.round(img.height * k);
  photo.getContext("2d").drawImage(img, 0, 0, photo.width, photo.height);
  const couleur = await new Promise(r => photo.toBlob(r, "image/jpeg", 0.8));
  const z = cadrerPapier(img) || {x: 0, y: 0, l: img.width, h: img.height};
  const kz = Math.min(3, Math.max(1, 1200 / z.l), 2000 / Math.max(z.l, z.h));
  const c = document.createElement("canvas"); c.width = Math.round(z.l * kz); c.height = Math.round(z.h * kz);
  const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, z.x, z.y, z.l, z.h, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height); const p = d.data;
  const gris = new Float32Array(c.width * c.height);
  for (let i = 0, k = 0; i < p.length; i += 4, k++) gris[k] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  const canevas = v => { const x = document.createElement("canvas"); x.width = c.width; x.height = c.height; const cx = x.getContext("2d"); const e = cx.createImageData(c.width, c.height);
    for (let k = 0, i = 0; k < v.length; k++, i += 4){ e.data[i] = e.data[i + 1] = e.data[i + 2] = v[k]; e.data[i + 3] = 255; } cx.putImageData(e, 0, 0); return x; };
  const seuil = new Float32Array(gris.length); for (let k = 0; k < gris.length; k++){ const g = gris[k]; seuil[k] = g > 160 ? 255 : g < 90 ? 0 : g; }
  // Préparations de secours (banc d'essai du 07/11/2026 sur 26 photos mal lues : 7 montants justes → 14) :
  // niveaux de gris étirés sans seuil, puis seuil adaptatif (moyenne locale) qui résiste aux ombres et au papier courbé
  return {jpeg: new Uint8Array(await couleur.arrayBuffer()), lecture: canevas(seuil),
    secours: [() => canevas(etirerGris(gris)), () => canevas(seuilAdaptatif(gris, c.width, c.height))]};
}
function etirerGris(g){
  const t = Array.from(g).sort((a, b) => a - b), lo = t[Math.floor(t.length * 0.02)], hi = t[Math.floor(t.length * 0.98)];
  const r = new Float32Array(g.length); for (let k = 0; k < g.length; k++) r[k] = Math.max(0, Math.min(255, (g[k] - lo) * 255 / Math.max(1, hi - lo)));
  return r;
}
// Seuil de Bradley : un point est noir s'il est 15 % plus sombre que la moyenne de son voisinage (1/16 de la largeur)
function seuilAdaptatif(g, w, h){
  const s = Math.max(15, Math.round(w / 16)) | 1, m = s >> 1, I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++){ let ligne = 0; for (let x = 0; x < w; x++){ ligne += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + ligne; } }
  const r = new Float32Array(g.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const x0 = Math.max(0, x - m), x1 = Math.min(w - 1, x + m), y0 = Math.max(0, y - m), y1 = Math.min(h - 1, y + m);
    const n = (x1 - x0 + 1) * (y1 - y0 + 1), somme = I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0];
    r[y * w + x] = g[y * w + x] * n < somme * 0.85 ? 0 : 255;
  }
  return r;
}
/* Lecture en trois passes au plus : la préparation habituelle ; si le montant n'est pas sûr, les niveaux de gris ; puis le
   seuil adaptatif lu comme un seul bloc de texte. La première lecture au montant sûr l'emporte ; sinon, la première. */
async function lireTicket(blob, progression){
  const {jpeg, lecture, secours} = await preparerImage(blob);
  const moteur = await chargerOcr(progression);
  const passes = [[() => lecture, "3"], [secours[0], "3"], [secours[1], "6"]];
  let premier = null;
  try {
    for (const [i, [image, mode]] of passes.entries()){
      if (i) await moteur.setParameters({tessedit_pageseg_mode: mode});
      const r = await moteur.recognize(image());
      const t = Object.assign(extraireTicket(r.data.text || ""), {passe: i + 1});
      if (!premier) premier = t;
      if (t.confiance.montant === "sûr") return Object.assign(t, {photo: {mime: "image/jpeg", octets: jpeg}});
    }
  } finally { await moteur.setParameters({tessedit_pageseg_mode: "3"}).catch(() => {}); }
  return Object.assign(premier, {photo: {mime: "image/jpeg", octets: jpeg}});
}

/* ---------- Extraction (pure, testable) ---------- */
// Montants avec centimes (48,60 ; 1 234,56), ou entiers suivis de « € » comme sur les factures (1070 € ; 4 272 €)
const RE_MONTANT = /(\d{1,3}(?:[ .\u00a0\u202f]\d{3})*|\d+)[,.](\d{2})(?!\d)/g;
const RE_MONTANT_ENTIER = /(?<![\d,.])(\d{1,3}(?:[ .\u00a0\u202f]\d{3})+|\d+)\s?(?:€|EUR\b|euros?\b)/gi;
function montantsDe(ligne){
  const r = []; for (const m of ligne.matchAll(RE_MONTANT)) r.push(parseFloat(m[1].replace(/[ .\u00a0\u202f]/g, "") + "." + m[2]));
  if (!r.length) for (const m of ligne.matchAll(RE_MONTANT_ENTIER)) r.push(parseFloat(m[1].replace(/[ .\u00a0\u202f]/g, "")));
  return r;
}
/* Montant lu avec des lettres pour des chiffres (« Z0.40 », « 1O,5O ») : dans un groupe « x,yy » qui porte au moins
   un chiffre, O/Q → 0, Z → 2, S → 5, I/l/| → 1, B → 8. Le reste de la ligne n'est pas touché. */
function reparerMontantsOcr(l){
  const carte = {O: "0", o: "0", Q: "0", Z: "2", z: "2", S: "5", s: "5", I: "1", l: "1", "|": "1", B: "8"};
  return String(l).replace(/(^|[\s:=\-])([0-9OoQZzSsIl|B]{1,6})([,.])([0-9OoQZzSsIl|B]{2})(?!\d)/g,
    (t, avant, e, sep, c) => /\d/.test(e + c) && /\d/.test(e.slice(-1) + c) ? avant + e.replace(/[^\d]/g, x => carte[x] || x) + sep + c.replace(/[^\d]/g, x => carte[x] || x) : t);
}
function extraireTicket(texte){
  const lignes = texte.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const N = lignes.map(l => norm(l).toUpperCase());
  const res = {texte, montant: null, date: null, heure: "", raisonSociale: "", enseigne: "", type: "ticket", carte4: "", siret: "", numero: "", confiance: {}};

  /* Type */
  const facturette = N.some(l => /TICKET CLIENT|A CONSERVER|NO AUTO|N° AUTO|AUTOR|SANS CONTACT|CONTACTLESS|DEBIT|CARTE BANCAIRE|VISA|MASTERCARD|CB EMV|AID A0/.test(l))
    && N.length < 40 && !N.some(l => /TVA \d|QTE|QUANTITE/.test(l));
  const facture = N.some(l => /^FACTURE|FACTURE N|N° DE FACTURE|DATE DE FACTURE|ECHEANCE|CONDITIONS DE PAIEMENT/.test(l));
  const noteFrais = N.some(l => /NOTE DE FRAIS|NOTES DE FRAIS|NOTE DE DEPENSES|EXPENSE REPORT|EXPENSE CLAIM|^NDF ?# ?\d/.test(l));
  res.type = noteFrais ? "notefrais" : facture ? "facture" : facturette ? "facturette" : "ticket";

  /* Montant. Mesuré le 07/11/2026 sur 67 pièces réelles : les erreurs venaient de « 20,60 EUR » délaissé pour
     un montant d'article, de « Total: 104 44 » (virgule non lue), de « Total Avantages » ou « Total TTC (tva incl.) »
     mal triés, de « Z0.40 » (2 lu Z). Ordre : facturette (montant suivi de « EUR ») ; ligne de total ; total HT + TVA
     s'il contredit le total lu ; sinon le plus grand montant (à vérifier). */
  const L = lignes.map(reparerMontantsOcr);
  const motsTotal = /(TOTAL TTC|NET A PAYER|A PAYER|TOTAL|MONTANT( TTC)?|SOMME|TTC|PAYE|CB )/;
  const horsTotal = l => /SOUS.?TOTAL|RENDU|REMISE|ECONOMIE|AVANTAGE|FIDELITE|POINTS|ELIGIBLE/.test(l)
    || (/TVA|\bHT\b/.test(l) && !/TVA INCL/.test(l));
  // Montant d'une ligne de total : avec centimes, ou « 104 44 » (virgule perdue) en fin de ligne
  const montantsTotal = s => { const m = montantsDe(s); if (m.length) return m; const x = s.match(/(\d{1,5}) (\d{2})\s*[€E]?\s*$/); return x ? [+(x[1] + "." + x[2])] : []; };
  let candidat = null;
  // Facturette : le montant payé suit « MONTANT » (même ligne ou les deux suivantes), imprimé « 12,10 EUR ». Seulement
  // là : un ticket de caisse imprime aussi « 1,48 EUR » sur chaque article (pris pour le total le 07/11/2026).
  const iMontant = N.findIndex(l => /M?ONTANT/.test(l) && !/ELIGIBLE/.test(l));
  if (iMontant >= 0) for (const [k, l] of L.slice(iMontant, iMontant + 3).entries()){
    if (/TVA|\bHT\b/.test(N[iMontant + k])) continue;
    const m = l.match(/(\d{1,5})[,.](\d{2})\s*EUR\b/i); if (m){ candidat = +(m[1] + "." + m[2]); break; }
  }
  if (candidat === null) N.forEach((l, i) => {
    if (!motsTotal.test(l) || horsTotal(l)) return;
    const m = montantsTotal(L[i]).concat(i + 1 < L.length && !montantsTotal(L[i]).length ? montantsDe(L[i + 1]) : []);
    if (m.length){ const v = Math.max(...m); if (candidat === null || /TOTAL TTC|NET A PAYER|A PAYER/.test(l) || v > candidat) candidat = v; }
  });
  // Total HT + TVA : si la somme figure ailleurs sur la pièce et contredit le total lu, elle l'emporte (36,60 lu pour 36,00)
  const ht = N.findIndex(l => /TOTAL HT|MONTANT HT/.test(l)), tva = N.findIndex(l => /TOTAL TVA|MONTANT TVA/.test(l));
  if (ht >= 0 && tva >= 0){
    const [a] = montantsDe(L[ht]), [b] = montantsDe(L[tva]);
    if (a > 0 && b >= 0){
      const s = Math.round((a + b) * 100) / 100;
      if (candidat !== null && versCentimes(s) !== versCentimes(candidat) && L.some(l => montantsDe(l).some(v => versCentimes(v) === versCentimes(s)))) candidat = s;
    }
  }
  if (candidat !== null && candidat >= 100000) candidat = null;
  if (candidat !== null){ res.montant = candidat; res.confiance.montant = "sûr"; }
  else {
    // Sans ligne de total lisible (07/11/2026 : moitié haute du ticket perdue à la lecture, « 1112.12 » de « Ver 1.1.12.1 » retenu) :
    // le montant en EUR ou € qui revient le plus souvent (le total est imprimé plusieurs fois), sinon le plus grand montant,
    // hors numéros de téléphone et de version
    const bruit = i => /\bT[EÉ]L\b|\bVER\b|SIRET|SIREN/.test(N[i]);
    const eur = L.flatMap((l, i) => bruit(i) ? [] : [...l.matchAll(/(\d{1,5})[,.](\d{2})\s*(?:EUR|€)/gi)].map(m => +(m[1] + "." + m[2]))).filter(v => v > 0 && v < 100000);
    if (eur.length){
      const n = new Map(); for (const v of eur) n.set(v, (n.get(v) || 0) + 1);
      res.montant = [...n].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]; res.confiance.montant = "à vérifier";
    } else {
      const tous = L.flatMap((l, i) => bruit(i) ? [] : montantsDe(l)).filter(v => v < 100000);
      if (tous.length){ res.montant = Math.max(...tous); res.confiance.montant = "à vérifier"; }
    }
  }

  /* Numéro de facture : « Facture n° X », « N°D26-011 », ou le n° posé sur la ligne suivante (les dates en sont retirées) */
  res.numero = numeroFacture(lignes);

  /* Date et heure */
  const dates = [], datesHeure = [];
  for (const l of lignes){
    const n0 = dates.length;
    // (les PDF découpent parfois la date : « 12 / 10 /202 6 »)
    for (const m of l.matchAll(/\b(\d{1,2}) ?[\/.\-] ?(\d{1,2}) ?[\/.\-] ?(\d ?\d ?\d ?\d|\d{2})(?!\d)/g)){ const d = lireDate(m[0].replace(/ /g, "")); if (d) dates.push(d); }
    for (const m of norm(l).matchAll(/\b(\d{1,2}) (janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*\.? (\d{4})\b/g)){
      const mois = ["janv", "fevr", "mars", "avr", "mai", "juin", "juil", "aout", "sept", "oct", "nov", "dec"].indexOf(m[2]) + 1;
      dates.push(`${m[3]}-${pad2(mois)}-${pad2(m[1])}`);
    }
    const h = l.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)(?:[:]([0-5]\d))?\b/); if (h && !res.heure) res.heure = pad2(h[1]) + ":" + h[2];
    // Date imprimée avec l'heure (« 18:00:16 7/11/2026 ») : c'est celle de l'achat ; elle passe avant toute autre suite de chiffres
    if (h && dates.length > n0){ datesHeure.push(...dates.slice(n0)); res.heure = pad2(h[1]) + ":" + h[2]; }
  }
  const auj = aujourdhui();
  if (!dates.length) for (const l of lignes){
    const m = l.match(/(?<![\d\/.])(\d{1,2}) ?[\/.] ?(\d{1,2})(?![\d\/.]| ?[\/.] ?\d)/);
    if (!m || +m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12) continue;
    let d = auj.slice(0, 4) + "-" + pad2(+m[2]) + "-" + pad2(+m[1]);
    if (d > ajouterJours(auj, 1)) d = (+auj.slice(0, 4) - 1) + "-" + pad2(+m[2]) + "-" + pad2(+m[1]);
    if (lireDate(d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4))){ dates.push(d); break; }
  }
  const plausibles = [...datesHeure, ...dates].filter(d => d <= ajouterJours(auj, 1) && d >= ajouterJours(auj, -400));
  if (plausibles.length){ res.date = plausibles[0]; res.confiance.date = "sûr"; }

  /* Carte (4 derniers chiffres), SIRET, TVA */
  for (const l of N){
    const c = l.match(/(?:X{4,}|\*{4,}|#{4,}|[X*#]{2,}\s?[X*#]{2,})[ X*#]*?(\d{4})\b/) || l.match(/CARTE\D{0,12}(\d{4})\s*$/);
    if (c && !res.carte4) res.carte4 = c[1];
    const s = l.match(/SIRET\D{0,6}(\d{3} ?\d{3} ?\d{3} ?\d{5})/) || l.match(/\b(\d{3} \d{3} \d{3} \d{5})\b/);
    if (s && !res.siret) res.siret = s[1].replace(/\s/g, "");
  }
  /* Raison sociale et enseigne : premières lignes significatives */
  const ignorer = /ARTICLES?\b|VENDUS|=|BIENVENUE|MERCI|TICKET|CAISSE|\bTEL\b|WWW|HTTP|@|^\d|SIRET|TVA|FACTURE|DUPLICATA|CLIENT|CONSERVER|CARTE BANCAIRE|SANS CONTACT|VENDEUR|VOUS A SERVI|SERVI PAR|CAISSIER|CAISSIERE|HOTESSE|OPERATEUR|^DEBIT|^MONTANT|^CB\b|VISA|MASTERCARD|^X{4}/;
  const nomPossible = i => /[A-Za-z]{3}/.test(lignes[i]) && !ignorer.test(N[i]) && !estBanqueTerminal(lignes[i]) && nomPlausible(lignes[i]) && !/TOTAL|NET A PAYER|^DATE|^N° ?[A-Z0-9]|^DEVIS|^OBJET/.test(N[i]) && !montantsDe(lignes[i]).length && lignes[i].length <= 40;
  const tete = lignes.slice(0, 8).filter((l, i) => nomPossible(i));
  /* Facturette CB : le commerçant suit la ligne « LE jj/mm/aa A hh:mm » ; ce qui précède (banque, AID, broderie
     de la nappe lue avec le ticket) est écarté. À défaut de cette ligne, une ligne en capitales est préférée. */
  let nomFacturette = "";
  if (res.type === "facturette"){
    const iLe = N.findIndex(l => /^LE \d{1,2} ?[\/.] ?\d{1,2}/.test(l));
    if (iLe >= 0) for (let i = iLe + 1; i < Math.min(lignes.length, iLe + 4) && !nomFacturette; i++) if (nomPossible(i)) nomFacturette = lignes[i];
    const capitales = l => { const x = (l.match(/[A-Za-z]/g) || []); return x.length && x.filter(ch => ch === ch.toUpperCase()).length / x.length >= 0.8; };
    if (!nomFacturette) nomFacturette = tete.find(capitales) || "";
  }
  const forme = lignes.find(l => /\b(SARL|SAS|SASU|EURL|SA|SNC|SCP|SELARL)\b/i.test(l));
  res.enseigne = nomFacturette || tete[0] || "";
  res.raisonSociale = forme ? forme.replace(/\s+(CAPITAL|AU CAPITAL|RCS).*$/i, "").trim() : res.enseigne;
  res.confiance.commercant = forme ? "lu" : "à vérifier";
  return res;
}
const RE_DATE_LIGNE = /\b\d{1,2} ?[\/.\-] ?\d{1,2} ?[\/.\-] ?(?:\d ?\d ?\d ?\d|\d{2})(?!\d)/g;
function numeroFacture(lignes){
  const propre = s => s.replace(RE_DATE_LIGNE, " ").replace(/\b(DATE|DU|LE|FACTURE|N°|NO|NUMERO|DE|:)\b/gi, " ").trim();
  for (let i = 0; i < lignes.length; i++){
    const l = norm(lignes[i]).toUpperCase();
    const m = l.match(/(?:FACTURE|INVOICE)?\s*(?:N°|NO\b|NUMERO|N\s?O\b)\s*:?\s*([A-Z]{0,4}[\s\-]?\d[\w\s\-–\/.]{1,20})/) || (/FACTURE/.test(l) && l.match(/FACTURE\s*:?\s*([A-Z]{0,4}\d[\w\-–\/.]{2,20})/));
    let brut = m ? propre(m[1]) : "";
    if (!/\d/.test(brut) && /(?:^|\s)(N°|NO|NUMERO)(\s|$)/.test(l) && i + 1 < lignes.length) brut = propre(norm(lignes[i + 1]).toUpperCase());
    const cle = cleNumero(brut);
    if (cle.length >= 3 && /\d/.test(cle)) return cle;
  }
  return "";
}
// Clé de comparaison : lettres et chiffres seuls (« 26 – 07 – 102 » = « 2607102 »)
const cleNumero = s => norm(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

/* Fournisseur connu nommé dans le texte de la pièce : tous les mots (4 lettres et plus, deux au moins) de son nom
   y figurent. Les fiches de la famille, des virements internes et des revenus sont écartées. */
const MOTS_GENERIQUES = new Set(["sarl", "sas", "sasu", "eurl", "cedex", "france", "societe", "chez", "prlv", "sepa", "virement", "carte", "facture", "architecte"]);
const motsNom = s => [...new Set(norm(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !MOTS_GENERIQUES.has(w)))];
/* Mots de lieu et d'adresse : ils figurent aussi dans l'adresse du client (la vôtre) imprimée sur la facture ; seuls,
   ils ne prouvent rien (le 04/11, un alias fait de lieux avait fait prendre des factures d'hébergeur pour la charcuterie). */
const MOTS_LIEUX = new Set(["paris", "lyon", "valence", "saint", "sainte", "germain", "boulevard", "avenue", "place", "route",
  "chemin", "quai", "allee", "impasse", "centre", "ville", "gare", "marche"]);
/* Lecture tolérante (mesurée le 07/11/2026 : « LA SAVOURFINE », « BOUCHERITE JLM », « SOUCHERTE PARISIENNE ») :
   un mot de 5 lettres et plus est retrouvé à une lettre près (deux à partir de 8 lettres) ; les mots courts
   (« JLM », « BHV ») doivent être exacts. */
const MOTS_OUTILS_NOM = new Set(["les", "des", "une", "sur", "par", "aux", "rue", "pour", "avec", "the", "and", "ste", "cie", "dit"]);
const motsFiche = s => [...new Set(norm(s || "").toLowerCase().replace(/['’]/g, " ").split(/[^a-z0-9]+/)
  .filter(w => w.length >= 3 && !/^\d+$/.test(w) && !MOTS_OUTILS_NOM.has(w) && !MOTS_GENERIQUES.has(w)))];
// Noms de métier : jamais distinctifs seuls, même portés par une seule fiche (« BOUCHERIE » ne désigne pas une boucherie précise)
const METIERS = new Set(["boucherie", "boulangerie", "patisserie", "pharmacie", "fromagerie", "poissonnerie", "epicerie", "primeurs",
  "librairie", "pressing", "garage", "station", "restaurant", "brasserie", "traiteur", "charcuterie", "caviste", "superette",
  "supermarche", "magasin", "bijouterie", "fleuriste", "opticien", "tabac", "presse", "parfumerie", "quincaillerie", "droguerie",
  "pizzeria", "boutique", "marche", "cordonnerie", "coiffure", "coiffeur", "cafe", "hotel", "bazar"]);
function distanceAuPlus(a, b, max){
  if (Math.abs(a.length - b.length) > max) return false;
  let prec = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++){
    const cur = [i]; let mini = i;
    for (let j = 1; j <= b.length; j++){ cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < mini) mini = cur[j]; }
    if (mini > max) return false;
    prec = cur;
  }
  return prec[b.length] <= max;
}
function commercantDansTexte(texte, fiches){
  const brut = norm(texte || "").toLowerCase().replace(/['’]/g, " ").split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const exacts = new Set(brut), longs = [...exacts].filter(w => w.length >= 4);
  const memo = new Map();
  const present = w => {
    if (memo.has(w)) return memo.get(w);
    const r = exacts.has(w) || (w.length >= 5 && longs.some(t => distanceAuPlus(w, t, w.length >= 8 ? 2 : 1)));
    memo.set(w, r); return r;
  };
  const presentUn = w => exacts.has(w) || longs.some(t => distanceAuPlus(w, t, 1));
  // Ni famille, ni virements, ni crédit, banque ou impôts : ces fiches ne délivrent pas de ticket (« Echeance Pret… » proposé le 07/11/2026)
  const retenues = fiches.filter(f => !["Famille", "Transfert", "Revenus", "Patrimoine", "Épargne", "Crédit", "Crédits", "Emprunts", "Banque", "Impôts"].includes(f.categorie));
  // Mot distinctif : propre à une seule fiche, 6 lettres et plus, pas un lieu ; il suffit seul à désigner la fiche
  const freq = new Map();
  for (const f of retenues) for (const w of new Set([f.nom, ...(f.alias || [])].flatMap(motsFiche))) freq.set(w, (freq.get(w) || 0) + 1);
  let meilleur = null, score = 0, egalite = false;
  for (const f of retenues){
    let s = 0;
    for (const nom of [f.nom, ...(f.alias || [])]){
      const m = motsFiche(nom), utiles = m.filter(w => !MOTS_LIEUX.has(w));
      if (m.length >= 2 && utiles.length && m.every(present)) s = Math.max(s, somme(utiles, w => w.length) + 1);
      // Seul, un mot n'est admis à une lettre près qu'à partir de 7 lettres (« TENANT » lu ne désigne pas « Tenart »)
      // (et jamais à deux lettres près : « ECHANGE » lu avait désigné « Echeance »)
      for (const w of utiles) if (w.length >= 6 && freq.get(w) === 1 && !METIERS.has(w) && (w.length >= 7 ? presentUn(w) : exacts.has(w))) s = Math.max(s, w.length);
    }
    if (!s) continue;
    if (s > score){ meilleur = f; score = s; egalite = false; } else if (s === score && meilleur !== f) egalite = true;
  }
  return egalite ? null : meilleur;
}
/* Alias et nom lu : égaux, ou l'un commence l'autre, les deux d'au moins 6 caractères (un nom de ville lu seul
   faisait prendre le bureau de poste pour l'alias « VILLE… » d'un autre commerce). */
const aliasCorrespond = (a, k) => a === k || (a.length >= 6 && k.length >= 6 && (k.startsWith(a) || a.startsWith(k)));
/* Alias faible : un seul mot court qui figure dans le nom de plusieurs fiches (le nom de la ville, appris comme alias
   d'un supermarché, désignait toute pièce où il était lu seul) ou un nom de lieu. Il ne sert pas à reconnaître. */
function aliasFaibles(fiches){
  const n = new Map();
  for (const f of fiches) for (const w of motsFiche(f.nom)) n.set(w, (n.get(w) || 0) + 1);
  return a => { const w = norm(a).toLowerCase(); return !/\s/.test(w) && w.length < 8 && ((n.get(w) || 0) >= 2 || MOTS_LIEUX.has(w)); };
}
/* Reconnaissance sûre : alias (raison sociale, enseigne) ou SIRET. Le reste n'est qu'une supposition, à faire confirmer. */
function commercantSur(t, liste){
  const fiches = liste || vivants("commercants");
  const cles = [t.raisonSociale, t.enseigne].filter(Boolean).map(cleLibelle).filter(Boolean);
  const faible = aliasFaibles(fiches);
  for (const f of fiches){
    if (t.siret && f.siret === t.siret) return f;
    for (const a of f.alias || []) if (!faible(a)) for (const k of cles) if (aliasCorrespond(a, k)) return f;
  }
  return null;
}
/* Commerçant connu pour un ticket : par alias (raison sociale, enseigne) ou SIRET, sinon par son nom dans le texte. */
function commercantPourTicket(t, liste){
  const fiches = liste || vivants("commercants");
  const cles = [t.raisonSociale, t.enseigne].filter(Boolean).map(cleLibelle).filter(Boolean);
  const faible = aliasFaibles(fiches);
  for (const f of fiches){
    if (t.siret && f.siret === t.siret) return f;
    for (const a of f.alias || []) if (!faible(a)) for (const k of cles) if (aliasCorrespond(a, k)) return f;
  }
  if (!t.texte) return null;
  // Alias imprimé sur une ligne quelconque de la pièce (raison sociale « SAS … » sous un logo illisible, alors que
  // l'en-tête lu est une autre ligne) : la ligne commence par l'alias, d'au moins 6 caractères
  const lignesCles = t.texte.split(/\n/).map(cleLibelle).filter(k => k && k.length >= 6);
  for (const f of fiches) for (const a of f.alias || [])
    if (a.length >= 6 && !faible(a) && lignesCles.some(k => k === a || k.startsWith(a + " "))) return f;
  const parTexte = commercantDansTexte(t.texte, fiches);
  // Émetteur lisible sur la pièce et inconnu des fiches : une fiche trouvée ailleurs dans le texte n'est retenue que si
  // l'un de ses mots figure dans ce nom (sinon, nouveau fournisseur à ce nom plutôt qu'un rapprochement de hasard)
  // Seulement pour une facture ou un devis (l'adresse du client y figure) ; sur un ticket, l'émetteur lu est trop souvent
  // une ligne mal lue (« CARTE BANCaIkE ») pour écarter une fiche nommée dans le texte. Comparaison tolérante.
  const emetteur = [t.raisonSociale, t.enseigne].filter(s => s && nomPlausible(s)).join(" ");
  if (parTexte && emetteur && !["ticket", "facturette"].includes(t.type)){
    const motsEmetteur = norm(emetteur).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    const dans = w => motsEmetteur.some(e => e === w || (w.length >= 5 && distanceAuPlus(w, e, w.length >= 8 ? 2 : 1)));
    if (![parTexte.nom, ...(parTexte.alias || [])].some(n => motsFiche(n).some(w => !MOTS_LIEUX.has(w) && dans(w)))) return null;
  }
  return parTexte;
}
