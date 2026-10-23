/* ================= Session : ouverture, enregistrement, synchronisation =================
   Le livre est relu et fusionné avant chaque écriture si un autre appareil l'a modifié
   (étiquette OneDrive « eTag » ou date de modification du fichier). Une copie datée
   par jour est gardée dans « sauvegardes/ ». Les copies de conflit créées par le
   client OneDrive (« budget-NOM-DU-PC.chiffre ») sont fusionnées puis rangées. */

const FICHIER_LIVRE = "budget.chiffre";
const SESSION = {adaptateur: null, cle: null, enveloppe: null, etiquette: null, etat: "ferme", derniereSynchro: null, erreur: "", enCours: false};

async function adaptateurChoisi(){ return adaptateurNomme(await reglage("adaptateur", "local")); }

async function lireCache(){ return idbLire("fichiers", "cache:" + FICHIER_LIVRE); }
async function ecrireCache(octets, synchro){ if (typeof DEMO !== "undefined" && DEMO) return; await idbEcrire("fichiers", "cache:" + FICHIER_LIVRE, {octets, etiquetteDistante: SESSION.etiquette, nonSynchro: !synchro, date: Date.now()}); }

/* ---------- Création d'un livre neuf ---------- */
async function creerLivre(motDePasse, nomFoyer, souvenir){
  const ad = SESSION.adaptateur;
  if (ad && await ad.pret(true)){
    const existant = await ad.lire(FICHIER_LIVRE);
    if (existant) throw new Error("Un livre existe déjà dans ce dossier : ouvrez-le avec son mot de passe.");
  }
  const cle = await nouvelleCleDonnees();
  SESSION.enveloppe = await creerEnveloppe(motDePasse, cle);
  SESSION.cle = cle;
  LIVRE = livreVide(nomFoyer);
  const paire = await nouvellePaireBoite();
  LIVRE.cles = {boitePublique: paire.publique, boitePrivee: paire.privee, extrait: versB64(crypto.getRandomValues(new Uint8Array(32)))};
  if (souvenir) await memoriserCle(motDePasse);
  SESSION.etiquette = null;
  await enregistrerMaintenant(true);
}

/* ---------- Ouverture ---------- */
async function ouvrirLivre(motDePasse, souvenir){
  const ad = SESSION.adaptateur;
  let distant = null;
  if (ad && await ad.pret(false).catch(() => false)) distant = await ad.lire(FICHIER_LIVRE).catch(e => { SESSION.erreur = e.message; return null; });
  const cache = await lireCache().catch(() => null);
  const source = distant ? distant.octets : cache?.octets;
  if (!source) throw new Error("Aucun livre trouvé ici. Choisissez le bon dossier ou créez un livre.");
  const tete = lireEnTete(source);
  SESSION.enveloppe = tete.enveloppe;
  SESSION.cle = motDePasse ? await ouvrirEnveloppe(motDePasse, tete.enveloppe, false) : await idbLire("cles", "cleDonnees");
  if (!SESSION.cle) throw new Error("Mot de passe requis.");
  let livre = await dechiffrerLivre(source, SESSION.cle);
  SESSION.etiquette = distant ? distant.etiquette : (cache?.etiquetteDistante || null);
  if (distant && cache && cache.nonSynchro){
    try { livre = fusionnerLivres(await dechiffrerLivre(cache.octets, SESSION.cle), livre).livre; LIVRE_MODIFIE = true; } catch (e) {}
  }
  LIVRE = completerLivre(livre);
  try { reparerCategories(); } catch (e) {}
  try { const nr = reparerFichesEment(); if (nr) setTimeout(() => message(nr + " fiche(s) fournisseur « Ement… » corrigée(s) (libellés « VIREMENT » mal coupés)."), 1500); } catch (e) {}
  if (motDePasse && souvenir) await memoriserCle(motDePasse);
  SESSION.etat = "ouvert";
  estimerDebitsCartes();   // livres repris avant la correction du 17/10/2026 : achats carte datés comme débités le jour même
  if (!distant) await ecrireCache(source, false).catch(() => {});
  if (LIVRE_MODIFIE) planifierSauvegarde();
  setTimeout(() => synchroniser().catch(() => {}), 500);
}
/* Mise à niveau douce d'un livre plus ancien : collections et paramètres manquants. */
function completerLivre(l){
  const v = livreVide(l.parametres?.nomFoyer);
  for (const c of COLLECTIONS) l[c] = l[c] || {};
  l.parametres = Object.assign({}, v.parametres, l.parametres || {});
  l.cles = l.cles || {};
  return l;
}
async function memoriserCle(motDePasse){
  const cle = await ouvrirEnveloppe(motDePasse, SESSION.enveloppe, false);
  await idbEcrire("cles", "cleDonnees", cle);
}
async function oublierCle(){ await idbSuppr("cles", "cleDonnees").catch(() => {}); }
async function cleMemorisee(){ return !!(await idbLire("cles", "cleDonnees").catch(() => null)); }

function fermerLivre(){
  LIVRE = null; SESSION.cle = null; SESSION.etat = "ferme"; LIVRE_MODIFIE = false;
  clearTimeout(minuterieSauvegarde);
}

/* ---------- Enregistrement ---------- */
let minuterieSauvegarde = 0;
function planifierSauvegarde(){
  clearTimeout(minuterieSauvegarde);
  minuterieSauvegarde = setTimeout(() => enregistrerMaintenant().catch(e => signalerErreurSynchro(e)), 1200);
}
async function enregistrerMaintenant(creation){
  if (!LIVRE || !SESSION.cle) return;
  const octets = await chiffrerLivre(LIVRE, SESSION.cle, SESSION.enveloppe);
  await ecrireCache(octets, false);
  LIVRE_MODIFIE = false;
  majEtatSynchro();
  await synchroniser(creation ? octets : null);
}

/* Synchronisation : lit le distant, fusionne si besoin, écrit si le local a changé. */
async function synchroniser(octetsPrets){
  const ad = SESSION.adaptateur;
  if (!LIVRE || !ad || SESSION.enCours) return;
  if (!(await ad.pret(false).catch(() => false))){ SESSION.erreur = "Dossier partagé indisponible : les modifications restent sur cet appareil."; majEtatSynchro(); return; }
  SESSION.enCours = true; majEtatSynchro();
  try {
    for (let essai = 0; essai < 4; essai++){
      const cache = await lireCache();
      const distant = await ad.lire(FICHIER_LIVRE);
      let aEcrire = !!(cache && cache.nonSynchro) || !!octetsPrets;
      if (distant && distant.etiquette !== SESSION.etiquette){
        let livreDistant;
        try { livreDistant = await dechiffrerLivre(distant.octets, SESSION.cle); }
        catch (e){ throw new Error("Le livre partagé a changé de clé (mot de passe modifié ailleurs ?) : fermez puis rouvrez-le avec le mot de passe actuel."); }
        const {livre, changements} = fusionnerLivres(LIVRE, livreDistant);
        LIVRE = completerLivre(livre);
        SESSION.etiquette = distant.etiquette;
        try { const env = lireEnTete(distant.octets).enveloppe; if (env) SESSION.enveloppe = env; } catch (e) {}
        if (changements) rafraichirEcran();
        // Le local avait-il des enregistrements plus récents que le distant ?
        aEcrire = aEcrire && JSON.stringify(livre) !== JSON.stringify(livreDistant);
        if (!aEcrire){ await ecrireCache(distant.octets, true); break; }
      }
      if (!aEcrire && distant) break;
      const octets = await chiffrerLivre(LIVRE, SESSION.cle, SESSION.enveloppe);
      try {
        SESSION.etiquette = await ad.ecrire(FICHIER_LIVRE, octets, distant ? SESSION.etiquette : null);
        await ecrireCache(octets, true);
        octetsPrets = null;
        await sauvegardeDuJour(ad, octets);
        break;
      } catch (e){ if (!e.conflit) throw e; /* un autre appareil vient d'écrire : on relit et on fusionne */ }
    }
    if (ad.nom === "dossier") await fusionnerCopiesDeConflit(ad);
    publierExtraitSiBesoin();
    SESSION.erreur = ""; SESSION.derniereSynchro = new Date();
  } catch (e){ SESSION.erreur = e.message; throw e; }
  finally { SESSION.enCours = false; majEtatSynchro(); }
}
async function sauvegardeDuJour(ad, octets){
  if (DEMO) return;
  const nom = "sauvegardes/budget-" + aujourdhui() + ".chiffre";
  const deja = await reglage("sauvegarde_jour", "");
  if (deja === nom) return;
  if (!(await ad.lire(nom).catch(() => null))) await ad.ecrire(nom, octets).catch(() => {});
  await definirReglage("sauvegarde_jour", nom);
}
async function fusionnerCopiesDeConflit(ad){
  const fichiers = await ad.lister("");
  for (const f of fichiers){
    if (f.nom === FICHIER_LIVRE || !/^budget.*\.chiffre$/i.test(f.nom)) continue;
    try {
      const v = await ad.lire(f.chemin);
      const autre = await dechiffrerLivre(v.octets, SESSION.cle);
      const {livre, changements} = fusionnerLivres(LIVRE, autre);
      LIVRE = completerLivre(livre);
      await ad.deplacer(f.chemin, "sauvegardes");
      if (changements){ message("Copie de conflit OneDrive « " + f.nom + " » fusionnée et rangée dans « sauvegardes »."); marquerModifie(); }
    } catch (e) { /* fichier étranger ou d'une autre clé : laissé en place */ }
  }
}
function signalerErreurSynchro(e){ SESSION.erreur = e.message; majEtatSynchro(); }

/* ---------- Changement de mot de passe ---------- */
async function changerMotDePasse(ancien, nouveau){
  const cle = await ouvrirEnveloppe(ancien, SESSION.enveloppe, true);
  SESSION.enveloppe = await creerEnveloppe(nouveau, cle);
  marquerModifie();
  await enregistrerMaintenant();
}

/* ---------- Pièces jointes chiffrées (justificatifs) ---------- */
async function enregistrerPiece(id, octets, mime){
  const ad = SESSION.adaptateur;
  const paquet = await chiffrerObjet({mime, b64: versB64(octets)}, SESSION.cle);
  if (!DEMO) await idbEcrire("fichiers", "piece:" + id, paquet).catch(() => {});
  if (ad && await ad.pret(false).catch(() => false)) await ad.ecrire("justificatifs/" + id + ".chiffre", paquet);
  else await idbEcrire("file", "piece:" + id, true);   // à envoyer plus tard
}
async function lirePiece(id){
  let paquet = await idbLire("fichiers", "piece:" + id).catch(() => null);
  if (!paquet){
    const ad = SESSION.adaptateur;
    const v = ad ? await ad.lire("justificatifs/" + id + ".chiffre").catch(() => null) : null;
    if (!v) return null;
    paquet = v.octets; await idbEcrire("fichiers", "piece:" + id, paquet).catch(() => {});
  }
  const o = await dechiffrerObjet(paquet, SESSION.cle);
  return {mime: o.mime, octets: depuisB64(o.b64)};
}

/* ---------- Boîte de saisies (côté PC) ---------- */
async function lireBoite(){
  const ad = SESSION.adaptateur;
  if (!ad || !(await ad.pret(false).catch(() => false))) return [];
  const fichiers = (await ad.lister("boite")).filter(f => f.nom.endsWith(".chiffre"));
  const r = [];
  for (const f of fichiers){
    try {
      const v = await ad.lire(f.chemin);
      const saisie = await dechiffrerBoite(v.octets, LIVRE.cles.boitePrivee);
      r.push({chemin: f.chemin, nom: f.nom, saisie});
    } catch (e){ r.push({chemin: f.chemin, nom: f.nom, erreur: e.message}); }
  }
  return r;
}

/* ---------- Extrait des commerçants pour le téléphone ---------- */
function construireExtrait(){
  const cartes = vivants("comptes").filter(c => c.type === "carte" && c.carte && c.carte !== "LCL-NV" && c.actif !== false).map(c => ({carte: c.carte, nom: c.nom, titulaire: c.titulaire || "", chiffres: c.chiffres || []}));
  const commercants = vivants("commercants").map(c => ({nom: c.nom, alias: (c.alias || []).slice(0, 12), categorie: c.categorie || "", sousCategorie: c.sousCategorie || "",
    lieu: c.lieu || "", natures: Object.entries(c.natures || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0])}));
  return {maj: Date.now(), lieux: LIVRE.parametres.lieux, cartes, categories: LIVRE.parametres.categories, commercants};
}
/* Le téléphone lit fournisseurs, cartes, catégories et lieux dans cet extrait : le tenir à jour sans geste. */
let EXTRAIT_PUBLIE = 0;
function publierExtraitSiBesoin(){
  if (DEMO || !LIVRE?.cles?.extrait || Date.now() - EXTRAIT_PUBLIE < 30 * 60000) return;
  EXTRAIT_PUBLIE = Date.now();
  publierExtraitCommercants().catch(() => { EXTRAIT_PUBLIE = 0; });
}
async function publierExtraitCommercants(){
  const ad = SESSION.adaptateur;
  if (!ad || !LIVRE.cles.extrait || !(await ad.pret(false).catch(() => false))) return;
  const extrait = vivants("commercants").map(c => ({nom: c.nom, alias: (c.alias || []).slice(0, 12), categorie: c.categorie || "", sousCategorie: c.sousCategorie || "",
    lieu: c.lieu || "", natures: Object.entries(c.natures || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0])}));
  const cle = await cleExtrait(LIVRE.cles.extrait);
  const cartes = vivants("comptes").filter(c => c.type === "carte" && c.carte && c.carte !== "LCL-NV" && c.actif !== false).map(c => ({carte: c.carte, nom: c.nom, titulaire: c.titulaire || "", chiffres: c.chiffres || []}));
  const p = await aesChiffrer(cle, await compresser(enc.encode(JSON.stringify({maj: Date.now(), lieux: LIVRE.parametres.lieux, cartes,
    categories: LIVRE.parametres.categories, commercants: extrait}))));
  await ad.ecrire("extrait-commercants.chiffre", enc.encode(JSON.stringify({format: "budget-foyer-extrait", v: 1, iv: p.iv, donnees: p.donnees})));
}

/* ---------- Verrouillage automatique ---------- */
let derniereActivite = Date.now();
["pointerdown", "keydown", "scroll"].forEach(ev => addEventListener(ev, () => { derniereActivite = Date.now(); }, {passive: true}));
setInterval(async () => {
  if (SESSION.etat !== "ouvert" || !LIVRE) return;
  const minutes = LIVRE.parametres.verrouMinutes || 15;
  if (Date.now() - derniereActivite > minutes * 60000 && !(await cleMemorisee())){
    if (LIVRE_MODIFIE) await enregistrerMaintenant().catch(() => {});
    fermerLivre(); afficherVerrou("Verrouillé après " + minutes + " minutes d'inactivité.");
  }
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && SESSION.etat === "ouvert") synchroniser().catch(() => {});
  if (document.visibilityState === "hidden" && LIVRE_MODIFIE) enregistrerMaintenant().catch(() => {});
});
setInterval(() => { if (SESSION.etat === "ouvert" && document.visibilityState === "visible") synchroniser().catch(() => {}); }, 120000);
