/* ================= Lot de corrections (fichier « budget-foyer-corrections ») =================
   Corrections préparées hors de l'application (par exemple après un contrôle de cohérence de l'export),
   appliquées en une fois APRÈS aperçu et clic : rien ne s'applique à la lecture du fichier. Les fiches sont
   désignées par leur nom exact ; une fiche introuvable rend l'action « ignorée », sans erreur.
   Actions :
   - renommerFiche {de, vers, categorie?, sousCategorie?}
   - creerFiche {nom, depuis, natureJustificatifs} : crée la fiche et y rattache les justificatifs de « depuis »
     dont la nature exacte contient le texte donné
   - fusionnerFiches {garder, absorber: [noms], nom?} : opérations, justificatifs et alias rejoignent « garder »
   - deplacerSousCategorie {de: [cat, sous], vers: [cat, sous]} : liste des réglages et tous les enregistrements
   - reclasser {fournisseur, de: [cat, sous], vers: [cat, sous], ficheParDefaut?} : opérations de ce fournisseur
   - categorieFiche {fiche, categorie, sousCategorie} : classement par défaut fixé, sans toucher au passé
   - natureCategorie {categorie, sousCategorie?, nature} : nature (Courante, Exceptionnelle, Hors budget…) de toutes
     les opérations, et parts ventilées, de cette catégorie */
const partsNatureAChanger = a => vivants("operations").flatMap(o => {
  const r = [];
  const vise = (cat, sous) => cat === a.categorie && (!a.sousCategorie || (sous || "") === a.sousCategorie);
  if (o.ventilation && o.ventilation.length) o.ventilation.forEach((v, i) => { if (vise(v.categorie || o.categorie, v.sousCategorie || o.sousCategorie) && (v.nature || o.nature) !== a.nature) r.push({o, i}); });
  else if (vise(o.categorie, o.sousCategorie) && o.nature !== a.nature) r.push({o, i: -1});
  return r;
});

// Nom exact d'abord ; sinon sans tenir compte de la casse, des accents, des espaces ni de la ponctuation
const cleNomFiche = s => norm(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const ficheNommeeReelle = nom => vivants("commercants").find(c => c.nom === nom) || vivants("commercants").find(c => cleNomFiche(c.nom) === cleNomFiche(nom)) || null;
const ficheNommee = ficheNommeeReelle;
const opsDeFiche = f => f ? vivants("operations").filter(o => o.commercant === f.id) : [];
const justifsDeFiche = f => f ? vivants("justificatifs").filter(j => j.commercant === f.id) : [];

function lireCorrections(nom, o){
  const actions = (o.actions || []).filter(a => a && a.type);
  if (!actions.length) return {genre: "inconnu", nom, raison: "lot de corrections vide"};
  return {genre: "corrections", nom, actions, titre: o.titre || "", date: aujourdhui()};
}
/* Aperçu : une ligne par action, avec ce qu'elle toucherait aujourd'hui. */
function preparerCorrections(lu){
  // Les actions s'enchaînent : un renommage ou une création compte pour les actions suivantes de l'aperçu
  const renomme = new Map(), cree = new Set(), absorbees = new Map();
  const opsV = f => f ? opsDeFiche(f).concat(...(absorbees.get(f.id) || []).map(opsDeFiche)) : [];
  const ficheNommee = nom => {
    for (const [ancien, nouveau] of renomme) if (norm(nouveau) === norm(nom)) return ficheNommeeReelle(ancien);
    if ([...renomme.keys()].some(k => norm(k) === norm(nom))) return null;
    return ficheNommeeReelle(nom);
  };
  const lignes = lu.actions.map(a => {
    try {
      if (a.type === "renommerFiche"){
        const f = ficheNommee(a.de);
        if (f) renomme.set(a.de, a.vers);
        return f ? {ok: true, n: opsDeFiche(f).length, texte: "Fiche « " + a.de + " » renommée « " + a.vers + " » (" + opsDeFiche(f).length + " opération(s))" + (a.categorie ? ", classement par défaut " + a.categorie + " › " + (a.sousCategorie || "") : "")}
          : {ok: false, texte: "Fiche « " + a.de + " » introuvable : ignorée"};
      }
      if (a.type === "creerFiche"){
        const d = ficheNommee(a.depuis);
        const js = justifsDeFiche(d).filter(j => norm(j.natureExacte || "").includes(norm(a.natureJustificatifs || "")));
        const existe = !!ficheNommee(a.nom) || cree.has(norm(a.nom)); cree.add(norm(a.nom));
        return {ok: !existe || !!js.length, n: js.length, texte: "Fiche « " + a.nom + " » " + (existe ? "(existe déjà)" : "créée") + " ; " + js.length + " justificatif(s) de « " + a.depuis + " » (« " + a.natureJustificatifs + " ») y passent"};
      }
      if (a.type === "fusionnerFiches"){
        const g = ficheNommee(a.garder), abs = (a.absorber || []).map(ficheNommee).filter(f => f && f !== g);
        if (!g) return {ok: false, texte: "Fiche « " + a.garder + " » introuvable : fusion ignorée"};
        const n = somme(abs, f => opsDeFiche(f).length);
        absorbees.set(g.id, (absorbees.get(g.id) || []).concat(abs));
        if (a.nom && a.nom !== g.nom) renomme.set(g.nom, a.nom);
        return {ok: !!abs.length, n, texte: "Fusion dans « " + (a.nom || g.nom) + " » de " + (abs.length ? abs.map(f => "« " + f.nom + " »").join(", ") : "aucune fiche trouvée") + " (" + n + " opération(s) déplacée(s))"};
      }
      if (a.type === "deplacerSousCategorie"){
        const n = vivants("operations").filter(o => o.categorie === a.de[0] && (o.sousCategorie || "") === a.de[1]).length;
        return {ok: true, n, texte: a.de.join(" › ") + " → " + a.vers.join(" › ") + " (" + n + " opération(s), réglages et budgets compris)"};
      }
      if (a.type === "reclasser"){
        const f = ficheNommee(a.fournisseur);
        const ops = opsV(f).filter(o => o.categorie === a.de[0] && (o.sousCategorie || "") === a.de[1]);
        return f ? {ok: true, n: ops.length, texte: "« " + a.fournisseur + " » : " + ops.length + " opération(s) de " + a.de.join(" › ") + " vers " + a.vers.join(" › ") + (a.ficheParDefaut ? " (et classement par défaut de la fiche)" : "")}
          : {ok: false, texte: "Fiche « " + a.fournisseur + " » introuvable : ignorée"};
      }
      if (a.type === "categorieFiche"){
        const f = ficheNommee(a.fiche);
        return f ? {ok: true, n: 0, texte: "« " + a.fiche + " » : classement par défaut " + a.categorie + " › " + (a.sousCategorie || "") + " (opérations passées inchangées)"}
          : {ok: false, texte: "Fiche « " + a.fiche + " » introuvable : ignorée"};
      }
      if (a.type === "natureCategorie"){
        const n = partsNatureAChanger(a).length;
        return {ok: true, n, texte: [a.categorie, a.sousCategorie].filter(Boolean).join(" › ") + " : nature « " + a.nature + " » pour " + n + " opération(s) ou part(s)"};
      }
      return {ok: false, texte: "Action inconnue « " + a.type + " » : ignorée"};
    } catch (e){ return {ok: false, texte: "Action « " + a.type + " » illisible : " + e.message}; }
  });
  return {lignes, controles: lignes, nouvelles: [], nb: somme(lignes.filter(l => l.ok), l => l.n || 0)};
}
/* Application, dans l'ordre du fichier. Renvoie le nombre d'actions appliquées. */
function appliquerCorrections(lu){
  let faites = 0;
  for (const a of lu.actions){
    if (a.type === "renommerFiche"){
      const f = ficheNommee(a.de); if (!f) continue;
      f.nom = a.vers;
      if (a.categorie) Object.assign(f, {categorie: a.categorie, sousCategorie: a.sousCategorie || "", fixe: true});
      enregistrer("commercants", f);
      for (const j of justifsDeFiche(f)) enregistrer("justificatifs", Object.assign(j, {commercantNom: f.nom}));
      faites++;
    } else if (a.type === "creerFiche"){
      const d = ficheNommee(a.depuis);
      const f = ficheNommee(a.nom) || enregistrer("commercants", {nom: a.nom, alias: [], stats: {}, natures: {}});
      for (const j of justifsDeFiche(d).filter(j => norm(j.natureExacte || "").includes(norm(a.natureJustificatifs || ""))))
        enregistrer("justificatifs", Object.assign(j, {commercant: f.id, commercantNom: f.nom}));
      faites++;
    } else if (a.type === "fusionnerFiches"){
      const g = ficheNommee(a.garder); if (!g) continue;
      for (const f of (a.absorber || []).map(ficheNommee).filter(f => f && f !== g)) fusionnerCommercants(g, f);
      if (a.nom && a.nom !== g.nom){ g.nom = a.nom; enregistrer("commercants", g); for (const j of justifsDeFiche(g)) enregistrer("justificatifs", Object.assign(j, {commercantNom: g.nom})); }
      faites++;
    } else if (a.type === "deplacerSousCategorie"){
      ajouterCategorieSilencieuse(a.vers[0], a.vers[1]);
      deplacerSousCategorie(a.de[0], a.de[1], a.vers[0], a.vers[1]);
      faites++;
    } else if (a.type === "reclasser"){
      const f = ficheNommee(a.fournisseur); if (!f) continue;
      ajouterCategorieSilencieuse(a.vers[0], a.vers[1]);
      for (const o of opsDeFiche(f).filter(o => o.categorie === a.de[0] && (o.sousCategorie || "") === a.de[1]))
        enregistrer("operations", Object.assign(o, {categorie: a.vers[0], sousCategorie: a.vers[1], nature: natureParDefaut(a.vers[0]), statut: "classe", verrou: true}));
      if (a.ficheParDefaut){ Object.assign(f, {categorie: a.vers[0], sousCategorie: a.vers[1], fixe: true}); enregistrer("commercants", f); }
      faites++;
    } else if (a.type === "natureCategorie"){
      for (const {o, i} of partsNatureAChanger(a)){
        if (i >= 0) o.ventilation[i].nature = a.nature; else o.nature = a.nature;
        enregistrer("operations", o);
      }
      faites++;
    } else if (a.type === "categorieFiche"){
      const f = ficheNommee(a.fiche); if (!f) continue;
      ajouterCategorieSilencieuse(a.categorie, a.sousCategorie || "");
      Object.assign(f, {categorie: a.categorie, sousCategorie: a.sousCategorie || "", fixe: true}); enregistrer("commercants", f);
      faites++;
    }
  }
  invaliderIndex();
  return faites;
}
