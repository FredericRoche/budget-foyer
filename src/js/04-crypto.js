/* ================= Chiffrement =================
   Livre : une clé de données AES-256-GCM aléatoire chiffre le livre ; elle est
   enveloppée par une clé dérivée du mot de passe (PBKDF2-SHA-256, 600 000 itérations).
   Boîte de saisie : chiffrement hybride vers la clé publique ECDH P-256 du foyer
   (clé éphémère, ECDH, HKDF-SHA-256, AES-GCM). Le téléphone n'a que la clé publique :
   il peut déposer, jamais relire.
   Rien ne quitte l'appareil en clair ; le mot de passe n'est jamais stocké. */

const ITERATIONS_PBKDF2 = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();

async function deriverCleMotDePasse(motDePasse, sel, iterations){
  const matiere = await crypto.subtle.importKey("raw", enc.encode(motDePasse.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name: "PBKDF2", salt: sel, iterations: iterations || ITERATIONS_PBKDF2, hash: "SHA-256"},
    matiere, {name: "AES-GCM", length: 256}, false, ["wrapKey", "unwrapKey"]);
}
async function nouvelleCleDonnees(){
  return crypto.subtle.generateKey({name: "AES-GCM", length: 256}, true, ["encrypt", "decrypt"]);
}
async function aesChiffrer(cle, octets){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({name: "AES-GCM", iv}, cle, octets);
  return {iv: versB64(iv), donnees: versB64(c)};
}
async function aesDechiffrer(cle, paquet){
  return new Uint8Array(await crypto.subtle.decrypt({name: "AES-GCM", iv: depuisB64(paquet.iv)}, cle, depuisB64(paquet.donnees)));
}

/* En-tête du livre : sel, itérations et clé de données enveloppée. */
async function creerEnveloppe(motDePasse, cleDonnees){
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cleMdp = await deriverCleMotDePasse(motDePasse, sel, ITERATIONS_PBKDF2);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enveloppee = await crypto.subtle.wrapKey("raw", cleDonnees, cleMdp, {name: "AES-GCM", iv});
  return {kdf: "PBKDF2-SHA256", iterations: ITERATIONS_PBKDF2, sel: versB64(sel), iv: versB64(iv), cle: versB64(enveloppee)};
}
/* Ouvre l'enveloppe ; « extractible » faux par défaut (la clé ne peut plus être exportée). */
async function ouvrirEnveloppe(motDePasse, env, extractible){
  const cleMdp = await deriverCleMotDePasse(motDePasse, depuisB64(env.sel), env.iterations);
  try {
    return await crypto.subtle.unwrapKey("raw", depuisB64(env.cle), cleMdp, {name: "AES-GCM", iv: depuisB64(env.iv)},
      {name: "AES-GCM", length: 256}, !!extractible, ["encrypt", "decrypt"]);
  } catch (e){ throw new Error("Mot de passe incorrect."); }
}

/* Fichier « budget.chiffre » : JSON {format, v, enveloppe, iv, donnees} ; contenu = gzip(JSON du livre). */
async function chiffrerLivre(livre, cleDonnees, enveloppe){
  const clair = await compresser(enc.encode(JSON.stringify(livre)));
  const p = await aesChiffrer(cleDonnees, clair);
  return enc.encode(JSON.stringify({format: "budget-foyer", v: 1, enveloppe, iv: p.iv, donnees: p.donnees}));
}
function lireEnTete(octets){
  const o = JSON.parse(dec.decode(octets));
  if (o.format !== "budget-foyer") throw new Error("Ce fichier n'est pas un livre « Budget du foyer ».");
  return o;
}
async function dechiffrerLivre(octets, cleDonnees){
  const o = lireEnTete(octets);
  let clair;
  try { clair = await aesDechiffrer(cleDonnees, o); }
  catch (e){ throw new Error("Clé incorrecte pour ce livre (mot de passe changé sur un autre appareil ?)."); }
  return JSON.parse(dec.decode(await decompresser(clair)));
}

/* Objets génériques chiffrés avec la clé de données (justificatifs, sauvegardes). */
async function chiffrerObjet(objet, cle){
  const p = await aesChiffrer(cle, await compresser(enc.encode(JSON.stringify(objet))));
  return enc.encode(JSON.stringify({format: "budget-foyer-objet", v: 1, iv: p.iv, donnees: p.donnees}));
}
async function dechiffrerObjet(octets, cle){
  const o = JSON.parse(dec.decode(octets));
  return JSON.parse(dec.decode(await decompresser(await aesDechiffrer(cle, o))));
}

/* ---------- Boîte de saisie (écriture seule) ---------- */
async function nouvellePaireBoite(){
  const p = await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"]);
  return {publique: await crypto.subtle.exportKey("jwk", p.publicKey), privee: await crypto.subtle.exportKey("jwk", p.privateKey)};
}
async function cleHybride(privee, publique, sel, usage){
  const bits = await crypto.subtle.deriveBits({name: "ECDH", public: publique}, privee, 256);
  const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name: "HKDF", hash: "SHA-256", salt: sel, info: enc.encode("budget-foyer|boite|v1")},
    hk, {name: "AES-GCM", length: 256}, false, [usage]);
}
async function chiffrerPourBoite(objet, jwkPublique){
  const pub = await crypto.subtle.importKey("jwk", jwkPublique, {name: "ECDH", namedCurve: "P-256"}, false, []);
  const eph = await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"]);
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cle = await cleHybride(eph.privateKey, pub, sel, "encrypt");
  const p = await aesChiffrer(cle, await compresser(enc.encode(JSON.stringify(objet))));
  const epk = await crypto.subtle.exportKey("jwk", eph.publicKey);
  return enc.encode(JSON.stringify({format: "budget-foyer-saisie", v: 1, epk: {kty: epk.kty, crv: epk.crv, x: epk.x, y: epk.y}, sel: versB64(sel), iv: p.iv, donnees: p.donnees}));
}
async function dechiffrerBoite(octets, jwkPrivee){
  const o = JSON.parse(dec.decode(octets));
  if (o.format !== "budget-foyer-saisie") throw new Error("format de saisie inconnu");
  const priv = await crypto.subtle.importKey("jwk", jwkPrivee, {name: "ECDH", namedCurve: "P-256"}, false, ["deriveBits"]);
  const epk = await crypto.subtle.importKey("jwk", o.epk, {name: "ECDH", namedCurve: "P-256"}, false, []);
  const cle = await cleHybride(priv, epk, depuisB64(o.sel), "decrypt");
  return JSON.parse(dec.decode(await decompresser(await aesDechiffrer(cle, o))));
}

/* ---------- Extrait des commerçants pour le téléphone (clé symétrique dédiée) ---------- */
async function cleExtrait(b64){ return crypto.subtle.importKey("raw", depuisB64(b64), {name: "AES-GCM"}, false, ["encrypt", "decrypt"]); }

/* Robustesse d'un mot de passe : estimation simple, sans dictionnaire. */
function forceMotDePasse(m){
  if (!m) return {note: 0, texte: ""};
  let classes = 0; for (const re of [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]) if (re.test(m)) classes++;
  const bits = m.length * Math.log2([0, 26, 52, 62, 94][classes] || 26);
  if (m.length < 10) return {note: 1, texte: "trop court (10 caractères au moins)"};
  if (bits < 55) return {note: 2, texte: "moyen : une phrase de quatre ou cinq mots serait plus sûre"};
  return {note: 3, texte: "solide"};
}
