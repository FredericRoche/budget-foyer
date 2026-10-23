/* ================= Modèle du livre de comptes =================
   Le livre est un objet JSON unique, chiffré dans « budget.chiffre ». Chaque
   enregistrement porte « maj » (horodatage) et « app » (appareil) : la fusion
   entre appareils garde, enregistrement par enregistrement, le plus récent.
   Une suppression laisse une pierre tombale (supprime: true). */

const COLLECTIONS = ["comptes", "operations", "commercants", "regles", "budgets", "echeances",
  "valorisations", "justificatifs", "factures", "soldes", "imports", "documents"];

const TYPES_COMPTE = {
  courant: "Compte courant", carte: "Carte à débit différé", livret: "Livret d'épargne",
  assurance_vie: "Assurance-vie", retraite: "Épargne retraite", prevoyance: "Prévoyance (valeur de rachat)",
  pea: "PEA", titres: "Compte-titres", immobilier: "Bien immobilier", dette: "Dette", especes: "Espèces", autre: "Autre"
};
/* Ordre et regroupement au bilan */
const RUBRIQUES_BILAN = [
  ["Comptes bancaires", ["courant", "especes"]],
  ["Épargne réglementée", ["livret"]],
  ["Assurance-vie et retraite", ["assurance_vie", "retraite", "prevoyance"]],
  ["Titres", ["pea", "titres"]],
  ["Biens", ["immobilier", "autre"]],
  ["Dettes", ["carte", "dette"]]
];
const NATURES_DEFAUT = ["Courante", "Ponctuelle", "Exceptionnelle", "Hors budget", "Revenu"];
const NATURES_HORS_RESULTAT = ["Hors budget"];
const CATEGORIES_DEFAUT = {
  "Alimentation": ["Courses", "Restaurants et cafés", "Vins et spiritueux"],
  "Logement": ["Loyer", "Charges", "Électricité", "Gaz", "Eau", "Entretien", "Garde-meubles"],
  "Maison": ["Équipement, électroménager", "Bricolage et jardin", "Quincaillerie", "Fleurs"],
  "Télécom": ["Box et mobiles"],
  "Abonnements": ["Abonnements numériques", "Presse"],
  "Assurances": ["Habitation", "Assistance", "Prévoyance"],
  "Santé": ["Soins et pharmacie", "Optique", "Mutuelle", "Remboursements"],
  "Soins personnels": ["Beauté, parfumerie, coiffeur"],
  "Habillement": ["Vêtements, chaussures, pressing"],
  "Culture et loisirs": ["Livres, presse, sorties, jeux"],
  "Transports": ["Train et transports en commun", "Taxis", "Vélo"],
  "Voiture": ["Assurance", "Carburant et recharge", "Entretien", "Péages", "Stationnement"],
  "Voyages": ["Hôtels"],
  "Famille": ["Cadeaux"],
  "Dons": ["Dons et associations"],
  "Banque": ["Frais et cotisations"],
  "Impôts": ["Impôt sur le revenu", "Taxe foncière", "Taxe d'habitation"],
  "Espèces": ["Retraits"],
  "Divers": ["Divers"],
  "Revenus": ["Pensions", "Rémunération", "Produits financiers", "Remboursements"],
  "Épargne": ["Versements"],
  "Patrimoine": ["Cessions de titres"],
  "Transfert": ["Facture cartes", "Paiement Amex", "Virement entre comptes"],
  "À préciser": ["À préciser"]
};

function livreVide(nomFoyer){
  const l = {format: "budget-foyer", version: 1, cree: new Date().toISOString(), maj: Date.now(),
    parametres: {
      maj: Date.now(), nomFoyer: nomFoyer || "Budget du foyer",
      lieux: ["Autres"], natures: NATURES_DEFAUT.slice(), categories: JSON.parse(JSON.stringify(CATEGORIES_DEFAUT)),
      compteTresorerie: "", seuilBas: 0, seuilHaut: 150000,
      tolTicketAvant: 2, tolTicketApres: 5, tolFactureAvant: 30, tolFactureApres: 60, delaiSansOperation: 10,
      verrouMinutes: 15, amexJourPrelevement: 27
    },
    cles: {}};
  for (const c of COLLECTIONS) l[c] = {};
  return l;
}

/* ---------- Appareil courant ---------- */
function appareil(){
  let a = null;
  try { a = localStorage.getItem("bf_appareil"); } catch (e) {}
  if (!a){ a = "app-" + idAleatoire(6); try { localStorage.setItem("bf_appareil", a); } catch (e) {} }
  return a;
}
function nomAppareil(){ try { return localStorage.getItem("bf_nom_appareil") || ""; } catch (e) { return ""; } }

/* ---------- Accès et écriture ---------- */
let LIVRE = null;            // livre déchiffré en mémoire
let LIVRE_MODIFIE = false;   // à enregistrer
const vivants = coll => Object.values(LIVRE[coll] || {}).filter(x => !x.supprime);
const obtenir = (coll, id) => { const x = LIVRE[coll]?.[id]; return x && !x.supprime ? x : null; };
let horlogeLocale = 0;
function horodatage(){ horlogeLocale = Math.max(Date.now(), horlogeLocale + 1); return horlogeLocale; }
function enregistrer(coll, objet){
  if (!objet.id) objet.id = coll.slice(0, 3) + "-" + idAleatoire(10);
  objet.maj = horodatage(); objet.app = appareil();
  LIVRE[coll][objet.id] = objet;
  marquerModifie();
  return objet;
}
function supprimer(coll, id){
  if (!LIVRE[coll][id]) return;
  LIVRE[coll][id] = {id, supprime: true, maj: horodatage(), app: appareil()};
  marquerModifie();
}
function modifierParametres(changements){
  Object.assign(LIVRE.parametres, changements, {maj: horodatage()});
  marquerModifie();
}
function marquerModifie(){ LIVRE_MODIFIE = true; LIVRE.maj = Date.now(); planifierSauvegarde(); }

/* ---------- Fusion de deux versions du livre ---------- */
function plusRecent(a, b){
  if (!a) return b; if (!b) return a;
  if ((a.maj || 0) !== (b.maj || 0)) return (a.maj || 0) > (b.maj || 0) ? a : b;
  return String(a.app || "") >= String(b.app || "") ? a : b;
}
function fusionnerLivres(local, distant){
  if (!local) return {livre: distant, changements: 0};
  if (!distant) return {livre: local, changements: 0};
  const r = JSON.parse(JSON.stringify(local));
  let changements = 0;
  for (const c of COLLECTIONS){
    r[c] = r[c] || {};
    for (const [id, x] of Object.entries(distant[c] || {})){
      const garde = plusRecent(r[c][id], x);
      if (garde !== r[c][id]){ r[c][id] = garde; changements++; }
    }
  }
  if ((distant.parametres?.maj || 0) > (r.parametres?.maj || 0)){ r.parametres = distant.parametres; changements++; }
  // Les clés du foyer sont créées une fois pour toutes ; on complète sans écraser.
  r.cles = Object.assign({}, distant.cles || {}, r.cles || {});
  r.maj = Math.max(local.maj || 0, distant.maj || 0);
  return {livre: r, changements};
}

/* ---------- Libellés et catégories ---------- */
function libelleCompte(id){ const c = obtenir("comptes", id); return c ? c.nom : "—"; }
function comptesDeType(...types){ return vivants("comptes").filter(c => types.includes(c.type) && c.actif !== false); }
function categorieComplete(op){ return op.categorie ? op.categorie + (op.sousCategorie ? " › " + op.sousCategorie : "") : "À préciser"; }
function listeCategories(){
  const r = [];
  for (const [cat, sous] of Object.entries(LIVRE.parametres.categories)) for (const s of sous) r.push([cat, s]);
  return r;
}
/* Endroits où un enregistrement porte une catégorie : l'enregistrement lui-même, les ventilations d'une opération
   (qui héritent de sa catégorie si elles n'en ont pas), les rattachements d'une échéance, les lignes d'un budget.
   f(porteur, categorieEffective) rend true si elle a modifié le porteur ; l'enregistrement est alors daté
   (la synchronisation propage le changement). Renvoie le nombre d'enregistrements touchés. */
const COLLECTIONS_CATEGORIE = ["operations", "regles", "echeances", "commercants", "justificatifs", "budgets"];
function parcourirCategories(f, sansEnregistrer){
  let n = 0;
  for (const coll of COLLECTIONS_CATEGORIE){
    for (const x of vivants(coll)){
      const catX = x.categorie;
      let touche = coll !== "budgets" && f(x, catX);
      for (const v of x.ventilation || []) if (f(v, v.categorie || catX)) touche = true;
      for (const y of [...(x.rattache || []), ...(x.lignes || [])]) if (f(y, y.categorie)) touche = true;
      if (touche){ if (!sansEnregistrer) enregistrer(coll, x); n++; }
    }
  }
  return n;
}
/* Nombre d'enregistrements rattachés à une catégorie (statistiques des fournisseurs non comprises). */
function usagesCategorie(cat){ return parcourirCategories((y, c) => c === cat, true); }
/* Déplace une sous-catégorie partout, vers la même catégorie (renommage) ou une autre : liste des catégories,
   opérations (et leurs ventilations), règles, lignes de budget, échéances (et leurs rattachements), fiches
   fournisseurs (défaut et statistiques), justificatifs. Si la cible existe déjà, les deux sont réunies.
   La catégorie d'origine reste dans la liste, même vide (Réglages › Supprimer une catégorie vide).
   Renvoie le nombre d'enregistrements touchés. */
function deplacerSousCategorie(cat, ancien, cible, nouveau){
  nouveau = (nouveau || "").trim(); cible = (cible || "").trim();
  const cats = LIVRE.parametres.categories;
  // Comparaison en texte : la liste déroulante rend « true » là où le livre a pu garder le booléen true.
  const meme = s => s != null && String(s) === String(ancien);
  if (!cat || !ancien || !cible || !nouveau || (cible === cat && nouveau === String(ancien)) || !(cats[cat] || []).some(meme)) return 0;
  const n = parcourirCategories((y, c) => {
    let touche = false;
    if (c === cat && meme(y.sousCategorie)){ y.categorie = cible; y.sousCategorie = nouveau; touche = true; }
    if (y.stats){
      const st = {};
      for (const [k, v] of Object.entries(y.stats)){ const p = k.split("|"); if (p[0] === cat && meme(p[1])){ p[0] = cible; p[1] = nouveau; touche = true; } const k2 = p.join("|"); st[k2] = (st[k2] || 0) + v; }
      y.stats = st;
    }
    return touche;
  });
  if (cible === cat) cats[cat] = [...new Set(cats[cat].map(s => meme(s) ? nouveau : s))];
  else {
    cats[cat] = cats[cat].filter(s => !meme(s));
    cats[cible] = [...new Set([...(cats[cible] || []), nouveau])];
  }
  modifierParametres({categories: cats});
  if (typeof invaliderIndex === "function") invaliderIndex();
  return n;
}
function renommerSousCategorie(cat, ancien, nouveau){ return deplacerSousCategorie(cat, ancien, cat, nouveau); }
/* Retire une catégorie à laquelle aucun enregistrement n'est rattaché (ses sous-catégories partent avec elle,
   et les statistiques des fournisseurs qui la citent). Renvoie {usages} sans rien faire si elle sert encore. */
const CATEGORIES_PROTEGEES = ["À préciser", "Transfert"];
function supprimerCategorieVide(cat){
  const cats = LIVRE.parametres.categories;
  if (!(cat in cats) || CATEGORIES_PROTEGEES.includes(cat)) return {usages: 0, protegee: true};
  const usages = usagesCategorie(cat);
  if (usages) return {usages};
  parcourirCategories(y => {
    if (!y.stats || !Object.keys(y.stats).some(k => k.split("|")[0] === cat)) return false;
    y.stats = Object.fromEntries(Object.entries(y.stats).filter(([k]) => k.split("|")[0] !== cat));
    return true;
  });
  delete cats[cat];
  modifierParametres({categories: cats});
  if (typeof invaliderIndex === "function") invaliderIndex();
  return {usages: 0, supprimee: true};
}
/* Réparation à l'ouverture. Avant le correctif du 24/10/2026, « Annuler » dans une saisie rendait true,
   enregistré tel quel (« Informatique (licence) › true », voire une catégorie « true »).
   - Sous-catégorie : un booléen true ou un nombre devient son texte (« true »), pour rester visible et pouvoir
     être renommé ou déplacé dans Réglages ; false et null, qui ne désignent rien, sont retirés des listes et
     vidés dans les enregistrements (sans sous-catégorie, comme un champ absent).
   - Catégorie : un nom qui n'est pas un texte, ou qui vaut « true », « false », « null » ou « undefined »,
     ne désigne rien. Les enregistrements qui la portent passent en « À préciser › À préciser », la catégorie
     est retirée de la liste, et des statistiques des fournisseurs.
   Renvoie le nombre de corrections. */
const nomCategorieFautif = c => c != null && c !== "" && (typeof c !== "string" || ["true", "false", "null", "undefined"].includes(c.trim()));
function reparerCategories(){
  const texte = s => s === true || typeof s === "number" ? String(s) : s === false || s === null ? "" : s;
  const fautif = s => s != null && typeof s !== "string";
  let n = 0;
  const cats = LIVRE.parametres.categories || {};
  const clesFautives = Object.keys(cats).filter(nomCategorieFautif);
  if (clesFautives.length || Object.values(cats).some(l => (l || []).some(s => typeof s !== "string"))){
    for (const c of clesFautives) delete cats[c];
    for (const [c, l] of Object.entries(cats)) cats[c] = [...new Set((l || []).map(texte).filter(s => typeof s === "string" && s))];
    if (!(cats["À préciser"] || []).includes("À préciser")) cats["À préciser"] = [...(cats["À préciser"] || []), "À préciser"];
    modifierParametres({categories: cats}); n++;
  }
  n += parcourirCategories(y => {
    let touche = false;
    if (nomCategorieFautif(y.categorie)){ y.categorie = "À préciser"; y.sousCategorie = "À préciser"; touche = true; }
    if (fautif(y.sousCategorie)){ y.sousCategorie = texte(y.sousCategorie); touche = true; }
    if (y.stats && Object.keys(y.stats).some(k => nomCategorieFautif(k.split("|")[0]))){
      y.stats = Object.fromEntries(Object.entries(y.stats).filter(([k]) => !nomCategorieFautif(k.split("|")[0]))); touche = true;
    }
    return touche;
  });
  if (n && typeof invaliderIndex === "function") invaliderIndex();
  return n;
}
function ajouterCategorie(cat, sous){
  if (!cat || typeof cat !== "string") return;
  if (typeof sous !== "string") sous = "";
  const cats = LIVRE.parametres.categories;
  if (!cats[cat]) cats[cat] = [];
  if (sous && !cats[cat].includes(sous)) cats[cat].push(sous);
  modifierParametres({categories: cats});
}
function ajouterLieu(lieu){
  if (lieu && !LIVRE.parametres.lieux.includes(lieu)) modifierParametres({lieux: [...LIVRE.parametres.lieux, lieu]});
}
function classeLieu(lieu){ const i = LIVRE.parametres.lieux.indexOf(lieu); return "etiq l" + (i < 0 ? 2 : i % 4); }
/* Une opération compte-t-elle dans le budget et le résultat ? */
function horsResultat(op){ return !op.nature || NATURES_HORS_RESULTAT.includes(op.nature) || op.categorie === "Transfert"; }
/* Parts d'une opération : ses ventilations si elle en a, sinon elle-même. */
function partsDe(op){
  if (op.ventilation && op.ventilation.length) return op.ventilation.map(v => Object.assign({}, op, v, {montant: v.montant, partDe: op.id}));
  return [op];
}
