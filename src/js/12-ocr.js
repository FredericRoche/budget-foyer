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
  for (let i = 0; i < p.length; i += 4){ const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; const v = g > 160 ? 255 : g < 90 ? 0 : g; p[i] = p[i + 1] = p[i + 2] = v; }
  ctx.putImageData(d, 0, 0);
  return {jpeg: new Uint8Array(await couleur.arrayBuffer()), lecture: c};
}
async function lireTicket(blob, progression){
  const {jpeg, lecture} = await preparerImage(blob);
  const moteur = await chargerOcr(progression);
  const r = await moteur.recognize(lecture);
  return Object.assign(extraireTicket(r.data.text || ""), {photo: {mime: "image/jpeg", octets: jpeg}});
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
function extraireTicket(texte){
  const lignes = texte.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const N = lignes.map(l => norm(l).toUpperCase());
  const res = {texte, montant: null, date: null, heure: "", raisonSociale: "", enseigne: "", type: "ticket", carte4: "", siret: "", numero: "", confiance: {}};

  /* Type */
  const facturette = N.some(l => /TICKET CLIENT|A CONSERVER|NO AUTO|N° AUTO|AUTOR|SANS CONTACT|CONTACTLESS|DEBIT|CARTE BANCAIRE|VISA|MASTERCARD|CB EMV|AID A0/.test(l))
    && N.length < 40 && !N.some(l => /TVA \d|QTE|QUANTITE/.test(l));
  const facture = N.some(l => /^FACTURE|FACTURE N|N° DE FACTURE|DATE DE FACTURE|ECHEANCE|CONDITIONS DE PAIEMENT/.test(l));
  res.type = facture ? "facture" : facturette ? "facturette" : "ticket";

  /* Montant : ligne « TOTAL / À PAYER / NET / MONTANT », sinon le plus grand montant */
  const motsTotal = /(TOTAL TTC|NET A PAYER|A PAYER|TOTAL|MONTANT( TTC)?|SOMME|TTC|PAYE|CB )/;
  let candidat = null;
  N.forEach((l, i) => {
    if (!motsTotal.test(l) || /SOUS.?TOTAL|TVA|HT\b|RENDU|REMISE|ECONOMIE/.test(l)) return;
    const m = montantsDe(lignes[i]).concat(i + 1 < lignes.length && !montantsDe(lignes[i]).length ? montantsDe(lignes[i + 1]) : []);
    if (m.length){ const v = Math.max(...m); if (!candidat || /TOTAL TTC|NET A PAYER|A PAYER/.test(l) || v > candidat) candidat = v; }
  });
  if (candidat !== null){ res.montant = candidat; res.confiance.montant = "sûr"; }
  else { const tous = lignes.flatMap(montantsDe).filter(v => v < 100000); if (tous.length){ res.montant = Math.max(...tous); res.confiance.montant = "à vérifier"; } }

  /* Numéro de facture : « Facture n° X », « N°D26-011 », ou le n° posé sur la ligne suivante (les dates en sont retirées) */
  res.numero = numeroFacture(lignes);

  /* Date et heure */
  const dates = [];
  for (const l of lignes){
    // (les PDF découpent parfois la date : « 12 / 10 /202 6 »)
    for (const m of l.matchAll(/\b(\d{1,2}) ?[\/.\-] ?(\d{1,2}) ?[\/.\-] ?(\d ?\d ?\d ?\d|\d{2})(?!\d)/g)){ const d = lireDate(m[0].replace(/ /g, "")); if (d) dates.push(d); }
    for (const m of norm(l).matchAll(/\b(\d{1,2}) (janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*\.? (\d{4})\b/g)){
      const mois = ["janv", "fevr", "mars", "avr", "mai", "juin", "juil", "aout", "sept", "oct", "nov", "dec"].indexOf(m[2]) + 1;
      dates.push(`${m[3]}-${pad2(mois)}-${pad2(m[1])}`);
    }
    const h = l.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)(?:[:]([0-5]\d))?\b/); if (h && !res.heure) res.heure = pad2(h[1]) + ":" + h[2];
  }
  const auj = aujourdhui();
  if (!dates.length) for (const l of lignes){
    const m = l.match(/(?<![\d\/.])(\d{1,2}) ?[\/.] ?(\d{1,2})(?![\d\/.]| ?[\/.] ?\d)/);
    if (!m || +m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12) continue;
    let d = auj.slice(0, 4) + "-" + pad2(+m[2]) + "-" + pad2(+m[1]);
    if (d > ajouterJours(auj, 1)) d = (+auj.slice(0, 4) - 1) + "-" + pad2(+m[2]) + "-" + pad2(+m[1]);
    if (lireDate(d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4))){ dates.push(d); break; }
  }
  const plausibles = dates.filter(d => d <= ajouterJours(auj, 1) && d >= ajouterJours(auj, -400));
  if (plausibles.length){ res.date = plausibles[0]; res.confiance.date = "sûr"; }

  /* Carte (4 derniers chiffres), SIRET, TVA */
  for (const l of N){
    const c = l.match(/(?:X{4,}|\*{4,}|#{4,}|[X*#]{2,}\s?[X*#]{2,})[ X*#]*?(\d{4})\b/) || l.match(/CARTE\D{0,12}(\d{4})\s*$/);
    if (c && !res.carte4) res.carte4 = c[1];
    const s = l.match(/SIRET\D{0,6}(\d{3} ?\d{3} ?\d{3} ?\d{5})/) || l.match(/\b(\d{3} \d{3} \d{3} \d{5})\b/);
    if (s && !res.siret) res.siret = s[1].replace(/\s/g, "");
  }
  /* Raison sociale et enseigne : premières lignes significatives */
  const ignorer = /BIENVENUE|MERCI|TICKET|CAISSE|\bTEL\b|WWW|HTTP|@|^\d|SIRET|TVA|FACTURE|DUPLICATA|CLIENT|CONSERVER|CARTE BANCAIRE|SANS CONTACT|VENDEUR|VOUS A SERVI|SERVI PAR|CAISSIER|CAISSIERE|HOTESSE|OPERATEUR|^DEBIT|^MONTANT|^CB\b|VISA|MASTERCARD|^X{4}/;
  const tete = lignes.slice(0, 8).filter((l, i) => /[A-Za-z]{3}/.test(l) && !ignorer.test(N[lignes.indexOf(l)]) && !estBanqueTerminal(l) && nomPlausible(l) && !/TOTAL|NET A PAYER|^DATE|^N° ?[A-Z0-9]|^DEVIS|^OBJET/.test(N[lignes.indexOf(l)]) && !montantsDe(l).length && l.length <= 40);
  const forme = lignes.find(l => /\b(SARL|SAS|SASU|EURL|SA|SNC|SCP|SELARL)\b/i.test(l));
  res.enseigne = tete[0] || "";
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
function commercantDansTexte(texte, fiches){
  const mots = new Set(motsNom(texte)); let meilleur = null, score = 0;
  for (const f of fiches){
    if (["Famille", "Transfert", "Revenus", "Patrimoine", "Épargne"].includes(f.categorie)) continue;
    for (const nom of [f.nom, ...(f.alias || [])]){
      const m = motsNom(nom);
      if (m.length >= 2 && m.every(w => mots.has(w)) && m.length > score){ meilleur = f; score = m.length; }
    }
  }
  return meilleur;
}
/* Commerçant connu pour un ticket : par alias (raison sociale, enseigne) ou SIRET, sinon par son nom dans le texte. */
function commercantPourTicket(t, liste){
  const fiches = liste || vivants("commercants");
  const cles = [t.raisonSociale, t.enseigne].filter(Boolean).map(cleLibelle).filter(Boolean);
  for (const f of fiches){
    if (t.siret && f.siret === t.siret) return f;
    for (const a of f.alias || []) for (const k of cles) if (a === k || (a.length >= 6 && (k.startsWith(a) || a.startsWith(k)))) return f;
  }
  return t.texte ? commercantDansTexte(t.texte, fiches) : null;
}
