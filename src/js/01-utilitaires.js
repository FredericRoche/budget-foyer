"use strict";
/* ================= Utilitaires communs =================
   Règle d'or : aucune donnée importée (libellé bancaire, ticket, fichier) n'est
   insérée comme HTML. Tout passe par h(), qui crée des nœuds texte. */

const VERSION_APP = "__VERSION__";
/* Journal des erreurs non rattrapées (consulté par la suite de contrôle et les captures) */
window.__erreurs = [];
addEventListener("error", e => window.__erreurs.push(String(e.message)));
addEventListener("unhandledrejection", e => window.__erreurs.push(String(e.reason && e.reason.stack || e.reason)));
const $ = id => document.getElementById(id);
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const nfc = s => String(s ?? "").normalize("NFC");

/* Réparation du mojibake UTF-8 relu en Windows-1252 (repris de l'inventaire de la bibliothèque) */
const OCTETS_CP1252 = {0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
function reparerMojibake(chaine){
  let s = String(chaine ?? "");
  for (let tour = 0; tour < 2; tour++){
    if (!/[ÃÂÅ]|â€/.test(s)) break;
    const octets = new Uint8Array(s.length);
    let convertible = true;
    for (let i = 0; i < s.length; i++){
      const c = s.charCodeAt(i);
      if (c <= 0xFF) octets[i] = c;
      else if (OCTETS_CP1252[c] !== undefined) octets[i] = OCTETS_CP1252[c];
      else { convertible = false; break; }
    }
    if (!convertible) break;
    try {
      const repare = new TextDecoder("utf-8", {fatal: true}).decode(octets);
      if (repare === s) break;
      s = repare;
    } catch (e) { break; }
  }
  return s;
}
const propre = s => nfc(reparerMojibake(s)).replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

/* ---------- Construction du DOM sans HTML ----------
   h("td", {class: "num", onclick: f}, "texte", autreNoeud, [liste]) */
function h(balise, attrs, ...enfants){
  const el = document.createElement(balise);
  if (attrs) for (const [k, v] of Object.entries(attrs)){
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  ajouterEnfants(el, enfants);
  return el;
}
function ajouterEnfants(el, enfants){
  for (const e of enfants){
    if (e === null || e === undefined || e === false) continue;
    if (Array.isArray(e)) ajouterEnfants(el, e);
    else if (e instanceof Node) el.appendChild(e);
    else el.appendChild(document.createTextNode(String(e)));
  }
}
const vider = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
/* append() natif écrirait « null » pour un élément facultatif absent : on écarte null, undefined et false. */
for (const P of [Element.prototype, DocumentFragment.prototype]){
  const natif = P.append;
  P.append = function(...n){ return natif.apply(this, n.filter(x => x !== null && x !== undefined && x !== false)); };
}

/* ---------- SVG (graphiques) ---------- */
const NS_SVG = "http://www.w3.org/2000/svg";
function s(balise, attrs, ...enfants){
  const el = document.createElementNS(NS_SVG, balise);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const e of enfants){
    if (e === null || e === undefined) continue;
    el.appendChild(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}

/* ---------- Nombres et montants ---------- */
const FMT0 = new Intl.NumberFormat("fr-FR", {minimumFractionDigits: 0, maximumFractionDigits: 0});
const FMT2 = new Intl.NumberFormat("fr-FR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
/* Montants manipulés en centimes entiers pour éviter les erreurs d'arrondi. */
const versCentimes = v => Math.round(Number(v) * 100);
function euros(v, dec){
  if (v === null || v === undefined || isNaN(v)) return "—";
  const f = (dec === 0 ? FMT0 : FMT2).format(Math.abs(v)).replace(/[  ]/g, " ");
  return (v < 0 ? "−" : "") + f + " €";
}
function eurosSigne(v, dec){
  if (dec === undefined) dec = Number.isInteger(v) ? 0 : 2;
  if (!v) return euros(0, dec);
  return (v > 0 ? "+" : "") + euros(v, dec);
}
const nombre = (v, dec) => (dec === 0 ? FMT0 : FMT2).format(v);
/* Lecture d'un montant écrit à la française ou à l'anglaise : « 1 234,56 », « -1234.5 », « 356.973,29 ». */
function lireMontant(texte){
  if (typeof texte === "number") return texte;
  let t = String(texte ?? "").replace(/[  \s€]/g, "").replace(/EUR$/i, "").replace(/^\+/, "");
  if (!t) return NaN;
  const neg = /^[-−–]/.test(t) || /[-−–]$/.test(t);
  t = t.replace(/[-−–]/g, "");
  const dernierePos = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (dernierePos >= 0 && t.length - dernierePos - 1 <= 2 && /[,.]/.test(t[dernierePos])){
    t = t.slice(0, dernierePos).replace(/[.,']/g, "") + "." + t.slice(dernierePos + 1);
  } else t = t.replace(/[.,']/g, "");
  const v = parseFloat(t);
  return isNaN(v) ? NaN : (neg ? -v : v);
}

/* ---------- Dates : toujours des chaînes ISO « AAAA-MM-JJ » ---------- */
const pad2 = n => String(n).padStart(2, "0");
function isoDe(d){ return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function dateDe(iso){ const [a, m, j] = iso.split("-").map(Number); return new Date(a, m - 1, j); }
const aujourdhui = () => isoDe(new Date());
function ajouterJours(iso, n){ const d = dateDe(iso); d.setDate(d.getDate() + n); return isoDe(d); }
function ecartJours(a, b){ return Math.round((dateDe(b) - dateDe(a)) / 86400000); }
function finDeMois(iso){ const d = dateDe(iso); return isoDe(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function debutDeMois(iso){ return iso.slice(0, 8) + "01"; }
function ajouterMois(iso, n){
  const d = dateDe(iso); const j = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dernier = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(j, dernier));
  return isoDe(r);
}
/* Dernier jour ouvré du mois (samedi, dimanche et jours fériés fixes écartés). */
function dernierJourOuvre(iso){
  let d = dateDe(finDeMois(iso));
  while (d.getDay() === 0 || d.getDay() === 6 || ferie(isoDe(d))) d.setDate(d.getDate() - 1);
  return isoDe(d);
}
function reculerJoursOuvres(iso, n){
  let d = dateDe(iso);
  while (n > 0){ d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6 && !ferie(isoDe(d))) n--; }
  return isoDe(d);
}
/* Facture des cartes LCL « au » jj/mm : elle porte sur les achats arrêtés deux jours ouvrés plus tôt
   (constaté sur les factures du 31/08/2026 et du 30/09/2026 : achats du 28/08 au 28/09). */
function finPeriodeCarte(arrete){ return reculerJoursOuvres(arrete, 2); }
function ferie(iso){ return ["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"].includes(iso.slice(5)); }
/* « 31/03/2027 », « 31/03/27 », « 31.03.2027 », « 2027-03-31 » → ISO ; mm/jj si ordre = "mj" (Amex). */
function lireDate(texte, ordre){
  const t = String(texte ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (!m) return null;
  let a = +m[1], b = +m[2], an = +m[3];
  if (an < 100) an += 2000;
  const [jour, mois] = ordre === "mj" ? [b, a] : [a, b];
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  return `${an}-${pad2(mois)}-${pad2(jour)}`;
}
/* Nombre de série Excel → ISO */
function dateExcel(n){ const d = new Date(Math.round((Number(n) - 25569) * 86400000)); return isoDe(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
const MOIS_LONG = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const MOIS_COURT = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const dateFr = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "—";
const dateCourte = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—";
const moisFr = cle => MOIS_LONG[+cle.slice(5, 7) - 1] + " " + cle.slice(0, 4);

/* ---------- Identifiants ---------- */
function idAleatoire(n){
  const o = new Uint8Array(n || 12); crypto.getRandomValues(o);
  return Array.from(o, x => x.toString(36).padStart(2, "0")).join("").slice(0, (n || 12) * 1.5 | 0);
}
const versB64 = tampon => { const u = new Uint8Array(tampon); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const depuisB64 = chaine => Uint8Array.from(atob(chaine), c => c.charCodeAt(0));
const versB64url = t => versB64(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const depuisB64url = c => depuisB64(c.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((c.length + 3) % 4));
async function sha256Hex(texte){
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, "0")).join("");
}

/* ---------- Fichiers ---------- */
function telecharger(blob, nom){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function decoderTexte(buffer){
  const u = new Uint8Array(buffer);
  if (u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF) return new TextDecoder("utf-8").decode(u.subarray(3));
  try { return new TextDecoder("utf-8", {fatal: true}).decode(u); }
  catch (e) { return new TextDecoder("windows-1252").decode(u); }
}
/* CSV : séparateur deviné (; , ou tabulation), guillemets gérés. */
function analyserCSV(texte, separateur){
  const sep = separateur || (() => {
    const l = texte.split(/\r?\n/, 1)[0] || "";
    const c = {";": (l.match(/;/g) || []).length, ",": (l.match(/,/g) || []).length, "\t": (l.match(/\t/g) || []).length};
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  })();
  const lignes = []; let ligne = [], champ = "", guillemets = false;
  for (let i = 0; i < texte.length; i++){
    const c = texte[i];
    if (guillemets){
      if (c === '"'){ if (texte[i + 1] === '"'){ champ += '"'; i++; } else guillemets = false; }
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep){ ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r"){
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); champ = "";
      if (ligne.some(x => x !== "")) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some(x => x !== "")) lignes.push(ligne);
  return lignes;
}

/* ---------- Compression (gzip natif du navigateur) ---------- */
async function compresser(octets){
  const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}
async function decompresser(octets){
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/* ---------- Divers ---------- */
function regrouper(liste, cle){
  const m = new Map();
  for (const x of liste){ const k = cle(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
const somme = (liste, f) => liste.reduce((a, x) => a + (f ? f(x) : x), 0);
const attendre = ms => new Promise(r => setTimeout(r, ms));
function similarite(a, b){
  /* Similarité grossière de deux libellés (mots communs pondérés), entre 0 et 1. */
  const mots = t => new Set(norm(t).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(m => m.length > 2 && !MOTS_VIDES.has(m)));
  const A = mots(a), B = mots(b);
  if (!A.size || !B.size) return 0;
  let commun = 0; for (const m of A) if (B.has(m)) commun++;
  return commun / Math.min(A.size, B.size);
}
const MOTS_VIDES = new Set(["les","des","sur","par","pour","paris","france","sarl","sas","eurl","sa","snc","cb","carte","prlv","sepa","vir","virement","paiement","facture","ticket"]);
