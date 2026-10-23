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
/* Renomme une sous-catégorie partout : liste des catégories, opérations (et leurs ventilations), règles,
   lignes de budget, échéances (et leurs rattachements), fiches fournisseurs (défaut et statistiques), justificatifs.
   Si le nouveau nom existe déjà dans la catégorie, les deux sont réunies. Chaque enregistrement touché est
   daté : la synchronisation propage le renommage aux autres appareils. Renvoie le nombre d'enregistrements touchés. */
function renommerSousCategorie(cat, ancien, nouveau){
  nouveau = (nouveau || "").trim();
  const cats = LIVRE.parametres.categories;
  // Comparaison en texte : la liste déroulante rend « true » là où le livre a pu garder le booléen true.
  const meme = s => s != null && String(s) === String(ancien);
  if (!cat || !ancien || !nouveau || nouveau === String(ancien) || !(cats[cat] || []).some(meme)) return 0;
  const vise = x => x && x.categorie === cat && meme(x.sousCategorie);
  const changer = x => { if (vise(x)){ x.sousCategorie = nouveau; return true; } return false; };
  let n = 0;
  for (const coll of ["operations", "regles", "echeances", "commercants", "justificatifs"]){
    for (const x of vivants(coll)){
      let touche = changer(x);
      if (coll === "operations") for (const v of x.ventilation || []) if (vise(Object.assign({categorie: x.categorie}, v, v.categorie ? {} : {categorie: x.categorie}))){ v.sousCategorie = nouveau; touche = true; }
      if (coll === "echeances") for (const r of x.rattache || []) if (changer(r)) touche = true;
      if (coll === "commercants" && x.stats){
        const st = {};
        for (const [k, v] of Object.entries(x.stats)){ const p = k.split("|"); if (p[0] === cat && meme(p[1])){ p[1] = nouveau; touche = true; } const k2 = p.join("|"); st[k2] = (st[k2] || 0) + v; }
        x.stats = st;
      }
      if (touche){ enregistrer(coll, x); n++; }
    }
  }
  for (const b of vivants("budgets")){
    let touche = false; for (const l of b.lignes || []) if (changer(l)) touche = true;
    if (touche){ enregistrer("budgets", b); n++; }
  }
  cats[cat] = [...new Set(cats[cat].map(s => meme(s) ? nouveau : s))];
  modifierParametres({categories: cats});
  if (typeof invaliderIndex === "function") invaliderIndex();
  return n;
}
/* Réparation à l'ouverture : une sous-catégorie doit être un texte. Avant le correctif du 24/10/2026,
   « Annuler » dans une saisie rendait true, enregistré tel quel (« Informatique (licence) › true »).
   Un booléen true ou un nombre devient son texte (« true »), pour rester visible et pouvoir être renommé
   dans Réglages ; false et null, qui ne désignent rien, sont retirés des listes et vidés dans les
   enregistrements (sans sous-catégorie, comme un champ absent). Renvoie le nombre de corrections. */
function reparerSousCategories(){
  const texte = s => s === true || typeof s === "number" ? String(s) : s === false || s === null ? "" : s;
  const fautif = s => s != null && typeof s !== "string";
  let n = 0;
  const cats = LIVRE.parametres.categories || {};
  if (Object.values(cats).some(l => (l || []).some(s => typeof s !== "string"))){
    for (const [c, l] of Object.entries(cats)) cats[c] = [...new Set((l || []).map(texte).filter(s => typeof s === "string" && s))];
    modifierParametres({categories: cats}); n++;
  }
  const corriger = x => { if (x && fautif(x.sousCategorie)){ x.sousCategorie = texte(x.sousCategorie); return true; } return false; };
  for (const coll of ["operations", "regles", "echeances", "commercants", "justificatifs", "budgets"]){
    for (const x of vivants(coll)){
      let touche = corriger(x);
      for (const sous of [x.ventilation, x.rattache, x.lignes]) for (const y of sous || []) if (corriger(y)) touche = true;
      if (touche){ enregistrer(coll, x); n++; }
    }
  }
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
