/* ================= Commerçants et classement automatique =================
   Ordre de décision : règle explicite, puis fiche du commerçant (apprise des
   validations et des corrections), puis code de catégorie de commerçant (MCC)
   ou catégorie proposée par la banque, sinon « À préciser ».
   Une correction manuelle l'emporte toujours ensuite. */

/* Clé d'un libellé : majuscules sans accents, préfixes bancaires, numéros et dates retirés. */
const PREFIXES = /^(CB|CARTE|PRLV SEPA|PRLV|VIR SEPA|VIR INST|VIR|VIREMENT( SEPA)?( EMIS| RECU)?|PAIEMENT( PAR CARTE)?|ACHAT CB|SUMUP ?\*|SQ ?\*|PAYPAL ?\*|ZTL ?\*|IZ ?\*|BCK ?\*|SP ?\*|LYF ?\*)\s*/;
function cleLibelle(libelle){
  let t = norm(libelle).toUpperCase().replace(/[^A-Z0-9*&' ]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) t = t.replace(PREFIXES, "");
  t = t.replace(/\b\d{2}[ /.]\d{2}([ /.]\d{2,4})?\b/g, " ")      // dates
       .replace(/\b[A-Z]{0,3}\d{4,}[A-Z0-9/]*\b/g, " ")          // références, numéros
       .replace(/\bCB [A-Z]\b/g, " ").replace(/\*/g, " ")
       .replace(/\s+/g, " ").trim();
  return t.split(" ").slice(0, 4).join(" ");
}
/* Nom d'usage proposé à partir d'une clé : « BOUCHERIE DU PONT VILLE » → « Boucherie du Pont Ville » */
function nomDepuisCle(cle){
  const petits = new Set(["de", "du", "des", "la", "le", "les", "et", "d", "l", "au", "aux", "en"]);
  return cle.toLowerCase().split(" ").map((m, i) => (i && petits.has(m)) ? m : m.charAt(0).toUpperCase() + m.slice(1)).join(" ");
}

/* ---------- Index des alias ---------- */
let INDEX_ALIAS = null;
function indexAlias(){
  if (INDEX_ALIAS) return INDEX_ALIAS;
  INDEX_ALIAS = new Map();
  for (const c of vivants("commercants")) for (const a of c.alias || []) INDEX_ALIAS.set(a, c.id);
  return INDEX_ALIAS;
}
function invaliderIndex(){ INDEX_ALIAS = null; }
function trouverCommercant(libelleOuCle, estCle){
  const cle = estCle ? libelleOuCle : cleLibelle(libelleOuCle);
  if (!cle) return null;
  const idx = indexAlias();
  if (idx.has(cle)) return obtenir("commercants", idx.get(cle));
  // Préfixe commun suffisamment long (« BOUCHERIE DU PONT » ⊂ « BOUCHERIE DU PONT VILLE »)
  let meilleur = null, long = 0;
  for (const [a, id] of idx){
    if (a.length < 6) continue;
    if ((cle.startsWith(a + " ") || a.startsWith(cle + " ")) && a.length > long){ meilleur = id; long = a.length; }
  }
  return meilleur ? obtenir("commercants", meilleur) : null;
}
function assurerCommercant(libelle, nomPropose){
  const cle = cleLibelle(libelle);
  if (!cle) return null;
  let c = trouverCommercant(cle, true);
  if (!c){
    c = enregistrer("commercants", {nom: nomPropose || nomDepuisCle(cle), alias: [cle], stats: {}, natures: {}, titulaires: {}});
    invaliderIndex();
  }
  return c;
}
function ajouterAlias(commercant, texte){
  const cle = cleLibelle(texte);
  if (!cle || (commercant.alias || []).includes(cle)) return false;
  // L'alias est retiré d'une autre fiche qui le portait.
  for (const autre of vivants("commercants")) if (autre.id !== commercant.id && (autre.alias || []).includes(cle))
    enregistrer("commercants", Object.assign(autre, {alias: autre.alias.filter(a => a !== cle)}));
  commercant.alias = [...(commercant.alias || []), cle];
  enregistrer("commercants", commercant); invaliderIndex();
  return true;
}
function fusionnerCommercants(garde, absorbe){
  garde.alias = [...new Set([...(garde.alias || []), ...(absorbe.alias || [])])];
  for (const champ of ["stats", "natures", "titulaires"]){
    garde[champ] = garde[champ] || {};
    for (const [k, v] of Object.entries(absorbe[champ] || {})) garde[champ][k] = (garde[champ][k] || 0) + v;
  }
  enregistrer("commercants", garde);
  for (const op of vivants("operations")) if (op.commercant === absorbe.id) enregistrer("operations", Object.assign(op, {commercant: garde.id}));
  supprimer("commercants", absorbe.id); invaliderIndex();
}

/* ---------- Apprentissage ---------- */
function apprendre(op){
  const c = op.commercant ? obtenir("commercants", op.commercant) : null;
  if (!c || !op.categorie || op.categorie === "À préciser" || op.categorie === "Transfert") return;
  const cle = [op.categorie, op.sousCategorie || "", op.nature || "", op.lieu || ""].join("|");
  c.stats = c.stats || {}; c.stats[cle] = (c.stats[cle] || 0) + 1;
  if (op.natureExacte){ c.natures = c.natures || {}; c.natures[op.natureExacte] = (c.natures[op.natureExacte] || 0) + 1; }
  const titulaire = obtenir("comptes", op.compte)?.titulaire;
  if (titulaire){ c.titulaires = c.titulaires || {}; c.titulaires[titulaire] = (c.titulaires[titulaire] || 0) + 1; }
  recalculerDefaut(c);
  enregistrer("commercants", c);
}
/* Correction manuelle : la fiche adopte ce classement et ne le perd plus par la majorité. */
function apprendreCorrection(op){
  const c = op.commercant ? obtenir("commercants", op.commercant) : null;
  if (!c) return;
  Object.assign(c, {categorie: op.categorie, sousCategorie: op.sousCategorie || "", nature: op.nature || "", lieu: op.lieu || "", fixe: true});
  apprendre(op);
}
function recalculerDefaut(c){
  if (c.fixe) return;
  const entrees = Object.entries(c.stats || {}); const total = somme(entrees, e => e[1]);
  if (!total) return;
  entrees.sort((a, b) => b[1] - a[1]);
  const [cle, n] = entrees[0];
  if (n / total >= 0.7 && n >= 2){
    const [categorie, sousCategorie, nature, lieu] = cle.split("|");
    Object.assign(c, {categorie, sousCategorie, nature, lieu, variable: false});
  } else Object.assign(c, {categorie: "", sousCategorie: "", nature: "", lieu: "", variable: total >= 3});
}
function repartitionCommercant(c){
  const entrees = Object.entries(c.stats || {}); const total = somme(entrees, e => e[1]);
  return entrees.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => {
    const [categorie, sousCategorie, nature, lieu] = k.split("|");
    return {categorie, sousCategorie, nature, lieu, part: n / total, n};
  });
}

/* ---------- Règles explicites ---------- */
function regleConvient(r, op){
  const texte = norm((op.libelle || "") + " " + (op.detail || "")).toUpperCase();
  if (r.contient && !norm(r.contient).toUpperCase().split("|").some(m => m && texte.includes(m.trim()))) return false;
  if (r.compte && op.compte !== r.compte) return false;
  if (r.sens === "debit" && op.montant >= 0) return false;
  if (r.sens === "credit" && op.montant <= 0) return false;
  const m = Math.abs(op.montant);
  if (r.montantMin != null && r.montantMin !== "" && m < Number(r.montantMin) - 0.005) return false;
  if (r.montantMax != null && r.montantMax !== "" && m > Number(r.montantMax) + 0.005) return false;
  const jour = +op.date.slice(8, 10);
  if (r.jourMin && jour < r.jourMin) return false;
  if (r.jourMax && jour > r.jourMax) return false;
  return true;
}
function reglesTriees(){ return vivants("regles").filter(r => r.active !== false).sort((a, b) => (b.priorite || 0) - (a.priorite || 0)); }

/* ---------- Tables de secours : code MCC et catégorie LCL ---------- */
const MCC = [
  [[5411, 5412, 5422, 5441, 5451, 5462, 5499, 5311, 5331], "Alimentation", "Courses"],
  [[5812, 5813, 5814], "Alimentation", "Restaurants et cafés"], [[5921], "Alimentation", "Vins et spiritueux"],
  [[5912, 8011, 8021, 8031, 8042, 8043, 8049, 8062, 8071, 8099], "Santé", "Soins et pharmacie"],
  [[5541, 5542, 5552], "Voiture", "Carburant et recharge"], [[4784], "Voiture", "Péages"], [[7523], "Voiture", "Stationnement"],
  [[7531, 7538, 5533], "Voiture", "Entretien"], [[4121], "Transports", "Taxis"], [[4111, 4112, 4131], "Transports", "Train et transports en commun"],
  [[7011, 3501], "Voyages", "Hôtels"], [[5611, 5621, 5631, 5651, 5655, 5661, 5691, 5699, 7210, 7216], "Habillement", "Vêtements, chaussures, pressing"],
  [[5192, 5942, 5994, 7832, 7922, 7991, 7996], "Culture et loisirs", "Livres, presse, sorties, jeux"],
  [[7230, 7298, 5977], "Soins personnels", "Beauté, parfumerie, coiffeur"],
  [[5200, 5211, 5231, 5251, 5261], "Maison", "Bricolage et jardin"], [[5992], "Maison", "Fleurs"],
  [[5722, 5732, 5712, 5719], "Maison", "Équipement, électroménager"], [[6011], "Espèces", "Retraits"]
];
const CATEGORIES_LCL = [
  [/restaurant/i, "Alimentation", "Restaurants et cafés"], [/epicerie|alimentation/i, "Alimentation", "Courses"],
  [/pharmacie|medecin|dentiste|sante/i, "Santé", "Soins et pharmacie"], [/journaux|loisirs|culture/i, "Culture et loisirs", "Livres, presse, sorties, jeux"],
  [/habillement/i, "Habillement", "Vêtements, chaussures, pressing"], [/automobile|carburant/i, "Voiture", "Carburant et recharge"],
  [/liquide/i, "Espèces", "Retraits"]
];
function classementSecours(op){
  if (op.mcc){ const n = +op.mcc; for (const [codes, c, s] of MCC) if (codes.includes(n)) return {categorie: c, sousCategorie: s, origine: "mcc"}; }
  if (op.categorieBanque){ for (const [re, c, s] of CATEGORIES_LCL) if (re.test(norm(op.categorieBanque))) return {categorie: c, sousCategorie: s, origine: "banque"}; }
  return null;
}

/* ---------- Décision ---------- */
/* Renvoie {categorie, sousCategorie, nature, lieu, origine, sur, suggestions} sans modifier l'opération. */
function proposerClassement(op){
  for (const r of reglesTriees()){
    if (regleConvient(r, op)) return {categorie: r.categorie, sousCategorie: r.sousCategorie || "", nature: r.nature || natureParDefaut(r.categorie),
      lieu: r.lieu || "", natureExacte: r.natureExacte || "", origine: "regle", regle: r.id, sur: true};
  }
  const c = op.commercant ? obtenir("commercants", op.commercant) : trouverCommercant(op.libelle);
  if (c && c.categorie){
    const rep = repartitionCommercant(c); const n = somme(rep, x => x.n);
    const sur = !!c.fixe || (rep[0] && rep[0].part >= 0.9 && n >= 3);
    return {categorie: c.categorie, sousCategorie: c.sousCategorie, nature: c.nature || natureParDefaut(c.categorie), lieu: c.lieu || "",
      origine: c.fixe ? "commercant" : "historique", sur, part: rep[0]?.part, n};
  }
  const sec = classementSecours(op);
  const suggestions = c ? repartitionCommercant(c) : [];
  if (sec) return Object.assign(sec, {nature: natureParDefaut(sec.categorie), lieu: c?.lieu || "", sur: false, suggestions});
  return {categorie: "À préciser", sousCategorie: "À préciser", nature: op.montant > 0 ? "Revenu" : "Courante", lieu: "", origine: "inconnu", sur: false, suggestions};
}
function natureParDefaut(categorie){
  if (categorie === "Revenus") return "Revenu";
  if (["Transfert", "Épargne", "Patrimoine"].includes(categorie)) return "Hors budget";
  return "Courante";
}
/* Applique la proposition ; statut « classe » si elle est sûre, « propose » sinon. */
function classerAutomatiquement(op){
  if (op.verrou) return op;
  if (!op.commercant){ const c = assurerCommercant(op.libelle); if (c) op.commercant = c.id; }
  const p = proposerClassement(op);
  Object.assign(op, {categorie: p.categorie, sousCategorie: p.sousCategorie, nature: p.nature, origine: p.origine,
    statut: p.categorie === "À préciser" ? "a_preciser" : (p.sur ? "classe" : "propose")});
  if (p.lieu && !op.lieu) op.lieu = p.lieu;
  if (p.natureExacte && !op.natureExacte) op.natureExacte = p.natureExacte;
  if (p.categorie && p.categorie !== "À préciser") ajouterCategorieSilencieuse(p.categorie, p.sousCategorie);
  return op;
}
function ajouterCategorieSilencieuse(cat, sous){
  const cats = LIVRE.parametres.categories;
  if (cats[cat] && (!sous || cats[cat].includes(sous))) return;
  ajouterCategorie(cat, sous);
}
/* Validation (par l'utilisateur) d'un classement : verrouille l'opération et nourrit la fiche. */
function validerClassement(op, corrige){
  op.statut = "classe"; op.verrou = true;
  if (corrige) apprendreCorrection(op); else apprendre(op);
  enregistrer("operations", op);
}
