/* ================= Dossier de dépôt et rangement des fichiers importés =================
   Chaque appareil désigne deux dossiers de son disque (poignées gardées dans ce
   navigateur) : le dépôt, où l'on pose les téléchargements (par exemple sur le disque
   externe), et les archives, où chaque fichier enregistré est rangé dans le dossier
   de son compte, sous-dossier de l'année. Les règles de rangement (chemins relatifs
   aux archives) vivent dans le livre et valent pour tous les appareils.
   Rien n'est écrasé : un nom déjà pris reçoit un suffixe ; une copie identique déjà
   rangée libère simplement le dépôt. Un fichier non reconnu ou en erreur reste au dépôt. */

const DOSSIERS_IMPORT = {depot: {cle: "depot_racine", libelle: "Dossier de dépôt"}, archives: {cle: "archives_racine", libelle: "Dossier des archives"}};
const FICHIERS_IGNORES = /^(desktop\.ini|thumbs\.db|\.ds_store)$|^~\$|^\./i;

async function choisirDossierImport(quoi){
  const d = await window.showDirectoryPicker({id: "bf-" + quoi, mode: "readwrite", startIn: "documents"});
  await definirReglage(DOSSIERS_IMPORT[quoi].cle, d);
  return d;
}
/* Poignée du dossier, autorisation redemandée si besoin (une fois par séance dans Chrome). */
async function dossierImport(quoi, interactif){
  const d = await reglage(DOSSIERS_IMPORT[quoi].cle, null);
  if (!d) return null;
  let p = await d.queryPermission({mode: "readwrite"});
  if (p !== "granted" && interactif) p = await d.requestPermission({mode: "readwrite"});
  return p === "granted" ? d : null;
}

/* ---------- Règles de rangement ---------- */
function reglesRangement(){ return LIVRE.parametres.rangement || {}; }
/* Clé de la règle qui s'applique au fichier : un compte, ou une famille de pièces. */
function cleRangement(lu, compte){
  if (["compte", "carte", "valorisation"].includes(lu.genre)) return compte ? "compte:" + compte.id : null;
  if (lu.genre === "facture_cb") return "factures_cb";
  if (lu.genre === "document") return lu.sousGenre === "avis_impot" ? "avis_impot" : "avis_opere";
  if (lu.genre === "justificatif_pdf" || lu.genre === "image") return "justificatifs";
  if (["plan", "regles", "reprise_v7"].includes(lu.genre)) return "plans";
  return null;
}
const LIBELLES_RANGEMENT = {factures_cb: "Factures des cartes LCL", avis_opere: "Avis d'opéré", avis_impot: "Avis d'impôt", justificatifs: "Justificatifs", plans: "Plans, règles et classeurs"};
function libelleRangement(cle){ return cle.startsWith("compte:") ? libelleCompte(cle.slice(7)) : LIBELLES_RANGEMENT[cle] || cle; }

/* Année du fichier : fin de période, date de valeur, arrêté, sinon aujourd'hui. */
function anneeFichier(lu){ return String((lu.periode && lu.periode.fin) || lu.date || lu.arrete || lu.dateDebit || aujourdhui()).slice(0, 4); }

/* Proposition de dossier quand aucune règle n'existe encore : on cherche dans les archives
   le dossier dont le nom porte le numéro du compte (le plus profond l'emporte).
   « index » : chemins relatifs des dossiers des archives (« A/B/C »). */
function proposerRangement(lu, compte, index){
  const compact = s => String(s || "").replace(/[\s.-]/g, "").toUpperCase();
  const parNumero = numero => {
    const n = compact(numero); if (n.length < 6) return null;
    // Numéro exact d'abord ; sans ses zéros de tête ensuite (fautes de frappe des noms de dossier), s'il reste assez long
    const chercher = m => index.filter(c => compact(c.split("/").pop()).includes(m)).sort((a, b) => b.split("/").length - a.split("/").length)[0] || null;
    const court = n.replace(/^0+/, "");
    return chercher(n) || (court.length >= 7 && court !== n ? chercher(court) : null);
  };
  const parNom = re => index.filter(c => re.test(c.split("/").pop())).sort((a, b) => a.split("/").length - b.split("/").length)[0] || null;
  const enfant = (base, re) => base && index.find(c => c.startsWith(base + "/") && c.split("/").length === base.split("/").length + 1 && re.test(c.split("/").pop()));
  const courant = () => { const c = compteCourantLcl(); return c ? parNumero(c.numero) : null; };
  if (lu.genre === "compte"){ const b = parNumero(compte?.numero); return b ? b + "/Historiques CSV" : (compte ? compte.nom : null); }
  if (lu.genre === "carte"){
    if (lu.banque === "Amex"){ const b = parNom(/^amex$/i); return (b || "Amex") + "/Relevés"; }
    const debit = compte?.compteDebit ? vivants("comptes").find(c => c.id === compte.compteDebit) : null;
    const b = parNumero(compte?.numero) || parNumero(debit?.numero);
    return b ? b + "/Encours cartes" : (compte ? compte.nom : null);
  }
  if (lu.genre === "valorisation"){
    const b = parNumero(compte?.numero || lu.numero);
    if (!b) return compte ? compte.nom : null;
    return enfant(b, /relev[ée]s? et [ée]valuations?/i) || b;
  }
  if (lu.genre === "facture_cb"){ const b = courant(); const e = enfant(b, /avis d[ée]bit diff[ée]r[ée]/i); return e || (b ? b + "/Avis débit différé cartes" : "Factures des cartes LCL"); }
  if (lu.genre === "document" && lu.sousGenre === "avis_impot") return parNom(/^imp[ôo]ts?$/i) || "Impôts";
  if (lu.genre === "document") return parNom(/^avis d.op[ée]r[ée]$/i) || "Avis d'opéré";
  if (lu.genre === "justificatif_pdf" || lu.genre === "image") return parNom(/^justificatifs$/i) || "Justificatifs";
  if (["plan", "regles", "reprise_v7"].includes(lu.genre)) return "Budget/Plans importés";
  return null;
}

/* Dossier (sans l'année) où ira le fichier : la règle du livre, sinon la proposition. */
function dossierRangement(f){
  const cle = cleRangement(f.lu, f.compte); if (!cle) return null;
  const regle = reglesRangement()[cle];
  return {cle, dossier: regle || proposerRangement(f.lu, f.compte, INDEX_ARCHIVES || []), propose: !regle};
}
async function modifierRangement(cle, actuel){
  const v = await demander("Rangement · " + libelleRangement(cle), "Dossier, relatif aux archives (l'année est ajoutée d'office) ; vide = règle retirée", actuel || "");
  if (v === null) return;
  const r = Object.assign({}, reglesRangement());
  const propre = v.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (propre) r[cle] = propre; else delete r[cle];
  modifierParametres({rangement: r});
  rafraichirEcran();
}

/* ---------- Index des dossiers des archives (trois niveaux) ---------- */
let INDEX_ARCHIVES = null;
async function indexerArchives(racine){
  const res = [];
  const parcourir = async (d, prefixe, niveau) => {
    for await (const [nom, e] of d.entries()){
      if (e.kind !== "directory" || /^(zz|\.)/i.test(nom)) continue;
      const c = prefixe ? prefixe + "/" + nom : nom; res.push(c);
      if (niveau < 3) await parcourir(e, c, niveau + 1);
    }
  };
  await parcourir(racine, "", 1);
  return res;
}

/* ---------- Lecture du dépôt ---------- */
async function importerDossierDepot(){
  let depot = await dossierImport("depot", true);
  if (!depot){
    if (!(await confirmer("Aucun dossier de dépôt n'est désigné sur cet appareil. Le choisir maintenant (par exemple « Budget foyer\\À importer » sur le disque externe) ?", "Choisir…"))) return;
    try { depot = await choisirDossierImport("depot"); } catch (e){ if (e.name !== "AbortError") message(e.message, true); return; }
  }
  const archives = await dossierImport("archives", true);
  INDEX_ARCHIVES = archives ? await indexerArchives(archives) : [];
  const trouves = [];
  const parcourir = async (d, prefixe) => {
    for await (const [nom, e] of d.entries()){
      if (FICHIERS_IGNORES.test(nom)) continue;
      if (e.kind === "directory") await parcourir(e, prefixe + nom + "/");
      else trouves.push({dossier: d, nom, chemin: prefixe + nom, poignee: e});
    }
  };
  await parcourir(depot, "");
  const dejaListes = new Set(FICHIERS_EN_COURS.filter(f => f.source).map(f => f.source.chemin));
  const nouveaux = trouves.filter(t => !dejaListes.has(t.chemin)).sort((a, b) => a.chemin.localeCompare(b.chemin));
  if (!nouveaux.length){ message("Le dossier de dépôt est vide."); aller("import"); return; }
  aller("import");
  for (const t of nouveaux){
    const fichier = await t.poignee.getFile();
    const f = {fichier, source: t, lu: {nom: t.chemin, genre: "en cours"}, statut: "lecture"};
    FICHIERS_EN_COURS.push(f); rafraichirEcran();
    await lireEtPreparer(f);
    f.lu.nom = t.chemin;   // le chemin dans le dépôt situe le fichier mieux que son nom seul
  }
  if (!archives) message("Dossier des archives non désigné sur cet appareil : les fichiers enregistrés resteront au dépôt (Réglages › Stockage et appareil).", true);
  rafraichirEcran();
}

/* ---------- Rangement d'un fichier enregistré ---------- */
function nomLibre(nom, pris){
  if (!pris.has(nom)) return nom;
  const i = nom.lastIndexOf("."); const base = i > 0 ? nom.slice(0, i) : nom, ext = i > 0 ? nom.slice(i) : "";
  for (let n = 2; ; n++){ const c = base + " (" + n + ")" + ext; if (!pris.has(c)) return c; }
}
function memesOctets(a, b){ if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

async function rangerFichier(f){
  const archives = await dossierImport("archives", true);
  if (!archives){ f.rangement = {reste: "archives non désignées"}; return; }
  const r = dossierRangement(f);
  if (!r || !r.dossier){ f.rangement = {reste: "aucune règle"}; return; }
  try {
    let d = archives;
    const chemin = r.dossier.split("/").filter(Boolean).concat(anneeFichier(f.lu));
    for (const p of chemin) d = await d.getDirectoryHandle(p, {create: true});
    const octets = new Uint8Array(await (await f.source.poignee.getFile()).arrayBuffer());
    const pris = new Set(); let identique = null;
    for await (const [nom, e] of d.entries()) if (e.kind === "file"){
      pris.add(nom);
      if (nom === f.source.nom || (await e.getFile()).size === octets.length){
        if (memesOctets(new Uint8Array(await (await e.getFile()).arrayBuffer()), octets)) identique = nom;
      }
    }
    let final = identique;
    if (!final){
      final = nomLibre(f.source.nom, pris);
      const fh = await d.getFileHandle(final, {create: true});
      const w = await fh.createWritable(); await w.write(octets); await w.close();
      const relu = new Uint8Array(await (await fh.getFile()).arrayBuffer());
      if (!memesOctets(relu, octets)) throw new Error("copie non conforme, le fichier reste au dépôt");
    }
    await f.source.dossier.removeEntry(f.source.nom);
    // La proposition retenue devient la règle : le rangement suivant ira au même endroit
    if (r.propose) modifierParametres({rangement: Object.assign({}, reglesRangement(), {[r.cle]: r.dossier})});
    f.rangement = {chemin: chemin.join("/") + "/" + final, identique: !!identique};
  } catch (e){ f.rangement = {erreur: e.message}; console.error(e); }
}

/* Après un lot : sous-dossiers du dépôt devenus vides retirés (la racine reste). */
async function nettoyerDepot(){
  const depot = await dossierImport("depot", false); if (!depot) return;
  const vider = async d => {
    let vide = true;
    for await (const [nom, e] of d.entries()){
      if (e.kind === "directory"){ if (await vider(e)) await d.removeEntry(nom); else vide = false; }
      else if (FICHIERS_IGNORES.test(nom)) continue;
      else vide = false;
    }
    return vide;
  };
  try {
    for await (const [nom, e] of depot.entries()) if (e.kind === "directory" && await vider(e)) await depot.removeEntry(nom, {recursive: true});
  } catch (e){ console.error(e); }
}

/* Cellule « Rangement » de l'écran d'import. */
function celluleRangement(f){
  if (!f.source) return h("span", {class: "discret"}, "—");
  if (f.rangement?.chemin) return h("span", {class: "pos"}, "✓ " + (f.rangement.identique ? "déjà rangé : " : "") + f.rangement.chemin);
  if (f.rangement?.erreur) return h("span", {class: "neg"}, "reste au dépôt : " + f.rangement.erreur);
  if (f.rangement?.reste) return h("span", {class: "discret"}, "reste au dépôt (" + f.rangement.reste + ")");
  if (f.statut === "erreur" || f.lu.genre === "inconnu") return h("span", {class: "discret"}, "reste au dépôt");
  const r = dossierRangement(f);
  if (!r) return h("span", {class: "discret"}, "reste au dépôt");
  if (!r.dossier) return h("button", {class: "mini discret", onclick: () => modifierRangement(r.cle, "")}, "Définir le rangement…");
  return h("span", null, "→ " + r.dossier + "/" + anneeFichier(f.lu) + (r.propose ? " (proposé)" : "") + " ",
    h("button", {class: "mini discret", onclick: () => modifierRangement(r.cle, r.dossier)}, "Modifier"));
}

/* Réglages › Stockage et appareil : les deux dossiers de cet appareil et les règles du livre. */
function sectionDossiersImport(){
  const corps = h("div");
  const ligne = (quoi) => {
    const zone = h("span", {class: "discret"}, "…");
    reglage(DOSSIERS_IMPORT[quoi].cle, null).then(d => { zone.textContent = d ? "« " + d.name + " »" : "non désigné"; zone.className = d ? "" : "discret"; });
    return h("li", null, h("span", null, DOSSIERS_IMPORT[quoi].libelle + " : ", zone),
      h("button", {class: "mini discret", onclick: async () => { try { await choisirDossierImport(quoi); rafraichirEcran(); } catch (e){ if (e.name !== "AbortError") message(e.message, true); } }}, "Choisir…"));
  };
  corps.appendChild(h("ul", {class: "liste-traiter"}, ligne("depot"), ligne("archives")));
  const regles = Object.entries(reglesRangement()).sort((a, b) => libelleRangement(a[0]).localeCompare(libelleRangement(b[0])));
  if (regles.length) corps.appendChild(tableau([{titre: "Pièces"}, {titre: "Rangées dans (+ année)"}, {titre: ""}], regles, {classe: "serre", ligne: ([cle, d]) =>
    h("tr", null, h("td", null, libelleRangement(cle)), h("td", {class: "petit"}, d), h("td", null, h("button", {class: "mini discret", onclick: () => modifierRangement(cle, d)}, "Modifier")))}));
  corps.appendChild(h("p", {class: "note"}, "Dépôt et archives sont propres à cet appareil (par exemple le dépôt sur le disque externe, les archives sur le disque interne). Les règles de rangement sont communes : elles se créent au premier rangement de chaque compte, à partir du dossier des archives qui porte son numéro."));
  return h("section", {class: "carte", style: {marginTop: "1rem"}}, h("h2", null, "Dossiers d'import"), corps);
}
