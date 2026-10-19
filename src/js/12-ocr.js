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
/* Réduit la photo (1 600 px au plus), la passe en niveaux de gris : plus léger à stocker, plus net à lire. */
async function preparerImage(blob, cote){
  const img = await createImageBitmap(blob);
  const k = Math.min(1, (cote || 1600) / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, c.width, c.height);
  const couleur = await new Promise(r => c.toBlob(r, "image/jpeg", 0.8));
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
  const res = {texte, montant: null, date: null, heure: "", raisonSociale: "", enseigne: "", type: "ticket", carte4: "", siret: "", confiance: {}};

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

  /* Date et heure */
  const dates = [];
  for (const l of lignes){
    for (const m of l.matchAll(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g)){ const d = lireDate(m[0]); if (d) dates.push(d); }
    for (const m of norm(l).matchAll(/\b(\d{1,2}) (janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*\.? (\d{4})\b/g)){
      const mois = ["janv", "fevr", "mars", "avr", "mai", "juin", "juil", "aout", "sept", "oct", "nov", "dec"].indexOf(m[2]) + 1;
      dates.push(`${m[3]}-${pad2(mois)}-${pad2(m[1])}`);
    }
    const h = l.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)(?:[:]([0-5]\d))?\b/); if (h && !res.heure) res.heure = pad2(h[1]) + ":" + h[2];
  }
  const auj = aujourdhui();
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
  const ignorer = /BIENVENUE|MERCI|TICKET|CAISSE|\bTEL\b|WWW|HTTP|@|^\d|SIRET|TVA|FACTURE|DUPLICATA|CLIENT|CONSERVER|CARTE BANCAIRE|SANS CONTACT|^DEBIT|^MONTANT|^CB\b|VISA|MASTERCARD|^X{4}/;
  const tete = lignes.slice(0, 8).filter((l, i) => /[A-Za-z]{3}/.test(l) && !ignorer.test(N[lignes.indexOf(l)]) && !/TOTAL|NET A PAYER|^DATE|^N° ?[A-Z0-9]|^DEVIS|^OBJET/.test(N[lignes.indexOf(l)]) && !montantsDe(l).length && l.length <= 40);
  const forme = lignes.find(l => /\b(SARL|SAS|SASU|EURL|SA|SNC|SCP|SELARL)\b/i.test(l));
  res.enseigne = tete[0] || "";
  res.raisonSociale = forme ? forme.replace(/\s+(CAPITAL|AU CAPITAL|RCS).*$/i, "").trim() : res.enseigne;
  res.confiance.commercant = forme ? "lu" : "à vérifier";
  return res;
}
/* Commerçant connu pour un ticket : par alias (raison sociale, enseigne) ou SIRET. */
function commercantPourTicket(t, liste){
  const fiches = liste || vivants("commercants");
  const cles = [t.raisonSociale, t.enseigne].filter(Boolean).map(cleLibelle).filter(Boolean);
  for (const f of fiches){
    if (t.siret && f.siret === t.siret) return f;
    for (const a of f.alias || []) for (const k of cles) if (a === k || (a.length >= 6 && (k.startsWith(a) || a.startsWith(k)))) return f;
  }
  return null;
}
