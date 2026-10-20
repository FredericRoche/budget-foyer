/* ================= Stockage =================
   1. Cache local chiffré (IndexedDB) : travail hors ligne, ouverture rapide.
   2. Dossier partagé, par l'une de trois voies (un « adaptateur ») :
      - « dossier » : le dossier OneDrive synchronisé du PC (API File System Access, Chrome et Edge) ;
      - « graph »   : OneDrive en ligne via Microsoft Graph (téléphones, ou PC sans client OneDrive) ;
      - « local »   : ce navigateur seulement (essai, ou appareil isolé).
   Contrat d'un adaptateur :
     lire(chemin) → {octets, etiquette} | null
     ecrire(chemin, octets, etiquetteAttendue?) → nouvelle étiquette ; lève ConflitEcriture si le fichier a changé
     lister(dossier) → [{nom, chemin, etiquette}]
     deplacer(chemin, dossierCible)
   Les chemins sont relatifs au dossier de l'application (« budget.chiffre », « boite/xxx.chiffre »). */

class ConflitEcriture extends Error { constructor(){ super("Le fichier a été modifié sur un autre appareil."); this.conflit = true; } }

/* ---------- IndexedDB minimal ---------- */
const BASE_IDB = "budget-foyer";
function ouvrirBase(){
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE_IDB, 1);
    r.onupgradeneeded = () => { const db = r.result; for (const s of ["cles", "fichiers", "reglages", "file"]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}
async function idb(magasin, mode, action){
  const db = await ouvrirBase();
  return new Promise((ok, ko) => {
    const t = db.transaction(magasin, mode); const m = t.objectStore(magasin);
    const req = action(m);
    t.oncomplete = () => { db.close(); ok(req ? req.result : undefined); };
    t.onerror = () => { db.close(); ko(t.error); };
  });
}
const idbLire = (m, k) => idb(m, "readonly", s => s.get(k));
const idbEcrire = (m, k, v) => idb(m, "readwrite", s => s.put(v, k));
const idbSuppr = (m, k) => idb(m, "readwrite", s => s.delete(k));
const idbCles = m => idb(m, "readonly", s => s.getAllKeys());

/* Réglages propres à l'appareil (jamais partagés) */
async function reglage(cle, defaut){ try { const v = await idbLire("reglages", cle); return v === undefined ? defaut : v; } catch (e) { return defaut; } }
async function definirReglage(cle, v){ try { await idbEcrire("reglages", cle, v); } catch (e) {} }

/* ---------- Adaptateur « local » (ce navigateur) ---------- */
const adaptateurLocal = {
  nom: "local", libelle: "Ce navigateur seulement",
  async lire(chemin){ const v = await idbLire("fichiers", chemin); return v ? {octets: v.octets, etiquette: v.etiquette} : null; },
  async ecrire(chemin, octets, attendue){
    const v = await idbLire("fichiers", chemin);
    if (attendue !== undefined && attendue !== null && v && v.etiquette !== attendue) throw new ConflitEcriture();
    const etiquette = "l" + horodatage();
    await idbEcrire("fichiers", chemin, {octets, etiquette});
    return etiquette;
  },
  async lister(dossier){
    const cles = await idbCles("fichiers");
    return cles.filter(k => k.startsWith(dossier + "/") && !k.slice(dossier.length + 1).includes("/")).map(k => ({nom: k.slice(dossier.length + 1), chemin: k}));
  },
  async deplacer(chemin, dossier){
    const v = await idbLire("fichiers", chemin); if (!v) return;
    await idbEcrire("fichiers", dossier + "/" + chemin.split("/").pop(), v); await idbSuppr("fichiers", chemin);
  },
  async pret(){ return true; }
};

/* ---------- Adaptateur « dossier » (dossier OneDrive synchronisé du PC) ---------- */
const adaptateurDossier = {
  nom: "dossier", libelle: "Dossier OneDrive de ce PC", racine: null,
  disponible: () => "showDirectoryPicker" in window,
  async choisir(){
    this.racine = await window.showDirectoryPicker({id: "budget-foyer", mode: "readwrite", startIn: "documents"});
    await definirReglage("dossier_racine", this.racine);
    return this.racine.name;
  },
  async pret(interactif){
    if (!this.racine) this.racine = await reglage("dossier_racine", null);
    if (!this.racine) return false;
    let p = await this.racine.queryPermission({mode: "readwrite"});
    if (p !== "granted" && interactif) p = await this.racine.requestPermission({mode: "readwrite"});
    return p === "granted";
  },
  async poignee(chemin, creer){
    const parts = chemin.split("/"); let d = this.racine;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, {create: !!creer});
    return d.getFileHandle(parts[parts.length - 1], {create: !!creer});
  },
  async lire(chemin){
    try {
      const f = await (await this.poignee(chemin, false)).getFile();
      return {octets: new Uint8Array(await f.arrayBuffer()), etiquette: f.lastModified + ":" + f.size};
    } catch (e){ if (e.name === "NotFoundError" || e.name === "TypeMismatchError") return null; throw e; }
  },
  async ecrire(chemin, octets, attendue){
    if (attendue){
      const actuel = await this.lire(chemin);
      if (actuel && actuel.etiquette !== attendue) throw new ConflitEcriture();
    }
    const fh = await this.poignee(chemin, true);
    const w = await fh.createWritable(); await w.write(octets); await w.close();
    const f = await fh.getFile();
    return f.lastModified + ":" + f.size;
  },
  async lister(dossier){
    const r = [];
    try {
      let d = this.racine; for (const p of dossier.split("/").filter(Boolean)) d = await d.getDirectoryHandle(p, {create: false});
      for await (const [nom, poignee] of d.entries()) if (poignee.kind === "file") r.push({nom, chemin: (dossier ? dossier + "/" : "") + nom});
    } catch (e){ if (e.name !== "NotFoundError") throw e; }
    return r;
  },
  async deplacer(chemin, dossierCible){
    const src = await this.lire(chemin); if (!src) return;
    const nom = chemin.split("/").pop();
    await this.ecrire(dossierCible + "/" + nom, src.octets);
    const parts = chemin.split("/"); let d = this.racine;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    await d.removeEntry(parts[parts.length - 1]);
  }
};

/* ---------- Adaptateur « graph » (OneDrive en ligne, Microsoft Graph) ----------
   Autorisation demandée : Files.ReadWrite.AppFolder, soit le seul dossier
   « Applications/<nom de l'application> » du OneDrive. Comptes personnels (consumers). */
const PORTEES_GRAPH = ["Files.ReadWrite.AppFolder"];
const GRAPH = "https://graph.microsoft.com/v1.0/me/drive/special/approot";
const adaptateurGraph = {
  nom: "graph", libelle: "OneDrive en ligne", msal: null, compte: null, clientId: "",
  async initialiser(clientId){
    if (!window.msal) await chargerScript("vendor/msal-browser.min.js");
    if (!window.msal) throw new Error("Module de connexion Microsoft non chargé.");
    if (this.msal && this.clientId === clientId) return;
    this.clientId = clientId;
    this.msal = new msal.PublicClientApplication({
      auth: {clientId, authority: "https://login.microsoftonline.com/consumers", redirectUri: location.origin + location.pathname.replace(/index\.html$/, ""), navigateToLoginRequestUrl: false},
      cache: {cacheLocation: "localStorage"}
    });
    await this.msal.initialize();
    const r = await this.msal.handleRedirectPromise();
    if (r && r.account) this.compte = r.account;
    if (!this.compte) this.compte = this.msal.getAllAccounts()[0] || null;
  },
  connecte(){ return !!this.compte; },
  async connecter(){ await this.msal.loginRedirect(this.compte ? {scopes: PORTEES_GRAPH, loginHint: this.compte.username} : {scopes: PORTEES_GRAPH, prompt: "select_account"}); },
  async deconnecter(){ if (this.compte) await this.msal.logoutRedirect({account: this.compte}); },
  async jeton(){
    if (!this.compte) throw new Error("Pas de connexion à OneDrive.");
    try { return (await this.msal.acquireTokenSilent({scopes: PORTEES_GRAPH, account: this.compte})).accessToken; }
    catch (e){ await this.msal.acquireTokenRedirect({scopes: PORTEES_GRAPH, account: this.compte}); throw new Error("Reconnexion à OneDrive…"); }
  },
  async requete(url, options){
    const jeton = await this.jeton();
    const o = Object.assign({}, options); o.headers = Object.assign({Authorization: "Bearer " + jeton}, o.headers || {});
    const r = await fetch(url, o);
    if (r.status === 401){ throw new Error("Session OneDrive expirée : reconnectez-vous."); }
    return r;
  },
  url: chemin => GRAPH + ":/" + chemin.split("/").map(encodeURIComponent).join("/") + ":",
  async pret(){ return this.connecte(); },
  async lire(chemin){
    const meta = await this.requete(this.url(chemin));
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error("OneDrive : lecture impossible (" + meta.status + ").");
    const m = await meta.json();
    const direct = m["@microsoft.graph.downloadUrl"];
    const r = direct ? await fetch(direct) : await this.requete(this.url(chemin) + "/content");
    if (!r.ok) throw new Error("OneDrive : téléchargement impossible (" + r.status + ").");
    return {octets: new Uint8Array(await r.arrayBuffer()), etiquette: m.eTag, id: m.id};
  },
  async ecrire(chemin, octets, attendue){
    const entetes = {"Content-Type": "application/octet-stream"};
    if (attendue) entetes["If-Match"] = attendue;
    const r = await this.requete(this.url(chemin) + "/content" + (attendue ? "" : ""), {method: "PUT", headers: entetes, body: octets});
    if (r.status === 412) throw new ConflitEcriture();
    if (!r.ok) throw new Error("OneDrive : écriture impossible (" + r.status + ").");
    return (await r.json()).eTag;
  },
  async ecrireNouveau(chemin, octets){
    const r = await this.requete(this.url(chemin) + "/content?@microsoft.graph.conflictBehavior=fail", {method: "PUT", headers: {"Content-Type": "application/octet-stream"}, body: octets});
    if (!r.ok) throw new Error("OneDrive : dépôt impossible (" + r.status + " " + (await r.text().catch(() => "")).slice(0, 160) + ").");
    return (await r.json()).eTag;
  },
  async lister(dossier){
    const r = await this.requete(this.url(dossier) + "/children?$select=name,eTag,id,file&$top=999");
    if (r.status === 404) return [];
    if (!r.ok) throw new Error("OneDrive : liste impossible (" + r.status + ").");
    return (await r.json()).value.filter(x => x.file).map(x => ({nom: x.name, chemin: dossier + "/" + x.name, etiquette: x.eTag, id: x.id}));
  },
  async assurerDossier(dossier){
    const r = await this.requete(this.url(dossier));
    if (r.ok) return (await r.json()).id;
    const parent = dossier.includes("/") ? this.url(dossier.split("/").slice(0, -1).join("/")) : GRAPH;
    const c = await this.requete(parent + "/children", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name: dossier.split("/").pop(), folder: {}, "@microsoft.graph.conflictBehavior": "replace"})});
    if (!c.ok) throw new Error("OneDrive : création du dossier impossible (" + c.status + " " + (await c.text().catch(() => "")).slice(0, 160) + ").");
    return (await c.json()).id;
  },
  async deplacer(chemin, dossierCible){
    const idCible = await this.assurerDossier(dossierCible);
    const r = await this.requete(this.url(chemin), {method: "PATCH", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({parentReference: {id: idCible}})});
    if (!r.ok) throw new Error("OneDrive : déplacement impossible (" + r.status + ").");
  }
};

/* ---------- Adaptateur simulé (suite de contrôle) ---------- */
function adaptateurSimule(){
  const fichiers = new Map(); let n = 0;
  return {
    nom: "simule", fichiers,
    async pret(){ return true; },
    async lire(c){ const v = fichiers.get(c); return v ? {octets: v.octets, etiquette: v.etiquette} : null; },
    async ecrire(c, octets, attendue){
      const v = fichiers.get(c);
      if (attendue && v && v.etiquette !== attendue) throw new ConflitEcriture();
      const etiquette = "s" + (++n); fichiers.set(c, {octets, etiquette}); return etiquette;
    },
    async ecrireNouveau(c, octets){ if (fichiers.has(c)) throw new Error("existe"); return this.ecrire(c, octets); },
    async lister(d){ return [...fichiers.keys()].filter(k => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map(k => ({nom: k.slice(d.length + 1), chemin: k})); },
    async deplacer(c, d){ const v = fichiers.get(c); if (!v) return; fichiers.set(d + "/" + c.split("/").pop(), v); fichiers.delete(c); }
  };
}

function adaptateurNomme(nom){ return {local: adaptateurLocal, dossier: adaptateurDossier, graph: adaptateurGraph}[nom] || adaptateurLocal; }
