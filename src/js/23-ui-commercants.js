/* ================= Fournisseurs (fiches « commercants ») ================= */
/* Classement constaté sur les opérations d'une fiche (le plus fréquent), quand la fiche n'a pas encore
   de défaut : une fiche n'en reçoit un qu'à partir de deux achats concordants. */
function classementConstate(x){
  const n = new Map();
  for (const o of vivants("operations").filter(o => o.commercant === x.id && o.categorie && o.categorie !== "À préciser")){
    const k = [o.categorie, o.sousCategorie || "", o.nature || "", o.lieu || ""].join("|"); n.set(k, (n.get(k) || 0) + 1);
  }
  const [k, nb] = [...n].sort((a, b) => b[1] - a[1])[0] || [];
  if (!k) return null;
  const [categorie, sousCategorie, nature, lieu] = k.split("|");
  return {categorie, sousCategorie, nature, lieu, nb};
}
/* Doublons probables : une fiche par enseigne, sous le nom tapé spontanément. Deux fiches se ressemblent
   si les mots significatifs de l'une sont tous dans l'autre (« Enseigne » / « Enseigne rue X »,
   « Jean Martin » / « M Martin Jean »), si elles partagent un alias, ou si leur premier mot
   significatif est le même. Deux fiches d'une même enseigne à des lieux différents restent
   distinctes : c'est l'analytique. */
const MOTS_GENERIQUES_DOUBLONS = new Set(("le la les l au aux du de des d et en sur chez the m mme mr monsieur madame sarl sas sasu sa eurl sci snc ste societe ets etablissements cb carte " +
  "boulangerie patisserie restaurant brasserie bar cafe hotel pharmacie garage cave boucherie charcuterie librairie maison auberge relais station magasin superette epicerie traiteur " +
  "rue avenue bd boulevard place caisse grand grande petit petite marche centre saint sainte nouveau nouvelle").split(" "));
const ENSEIGNES_ABREGEES = {fp: "franprix", mp: "monoprix"};
function motsSignificatifs(nom){
  const mots = norm(nom).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (mots.length && ENSEIGNES_ABREGEES[mots[0]]) mots[0] = ENSEIGNES_ABREGEES[mots[0]];
  return mots.filter(m => m.length >= 3 && !MOTS_GENERIQUES_DOUBLONS.has(m) && !/^\d+$/.test(m));
}
function doublonsProbables(fiches, ignores){
  const ign = new Set(ignores || []);
  const infos = fiches.map(x => ({x, mots: motsSignificatifs(x.nom), alias: new Set((x.alias || []).filter(a => a && a.length >= 4))}));
  const parent = infos.map((_, i) => i);
  const racine = i => parent[i] === i ? i : (parent[i] = racine(parent[i]));
  for (let i = 0; i < infos.length; i++) for (let j = i + 1; j < infos.length; j++){
    const a = infos[i], b = infos[j];
    if (a.x.lieu && b.x.lieu && a.x.lieu !== b.x.lieu) continue;
    if (!a.mots.length || !b.mots.length) continue;
    const [p, g] = a.mots.length <= b.mots.length ? [a.mots, b.mots] : [b.mots, a.mots];
    const inclus = p.every(m => g.includes(m));
    const memeTete = a.mots[0] === b.mots[0] && a.mots[0].length >= 4;
    const aliasCommun = [...a.alias].some(x => b.alias.has(x));
    if (inclus || memeTete || aliasCommun) parent[racine(j)] = racine(i);
  }
  const groupes = new Map();
  infos.forEach((inf, i) => { const r = racine(i); if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(inf.x); });
  return [...groupes.values()].filter(g => g.length > 1).map(g => g.sort((a, b) => a.nom.localeCompare(b.nom, "fr")))
    .filter(g => !ign.has(g.map(x => x.id).sort().join("|")));
}
async function fusionnerGroupe(groupe, nbAchats){
  const parDefaut = [...groupe].sort((a, b) => (nbAchats.get(b.id) || 0) - (nbAchats.get(a.id) || 0) || a.nom.length - b.nom.length)[0];
  const garde = selection(groupe.map(x => [x.id, x.nom + " (" + (nbAchats.get(x.id) || 0) + " achat" + ((nbAchats.get(x.id) || 0) > 1 ? "s" : "") + ")"]), parDefaut.id);
  const cases = groupe.map(x => ({x, c: h("input", {type: "checkbox", checked: true, id: "fus-" + x.id})}));
  const ok = await dialogue({titre: "Fusionner des fiches", corps: h("div", null, champ("Fiche gardée (son nom reste)", garde),
    h("p", {class: "note"}, "Fiches absorbées (alias, historique et justificatifs passent dans la fiche gardée) :"),
    cases.map(({x, c}) => h("div", {class: "case"}, c, h("label", {for: "fus-" + x.id}, x.nom + (x.lieu ? " · " + x.lieu : ""))))),
    actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Fusionner", classe: "primaire", valeur: true}]});
  if (!ok) return;
  const g = obtenir("commercants", garde.value); let n = 0;
  for (const {x, c} of cases) if (c.checked && x.id !== g.id){ fusionnerCommercants(g, obtenir("commercants", x.id)); n++; }
  message(n ? n + " fiche(s) fusionnée(s) dans « " + g.nom + " »." : "Rien à fusionner."); rafraichirEcran();
}
async function nouveauFournisseur(etat){
  const nom = await demander("Nouveau fournisseur", "Nom d'usage (le nom de l'enseigne, tel qu'on le dit)", "");
  if (!nom || !nom.trim()) return;
  const existe = vivants("commercants").find(x => norm(x.nom) === norm(nom.trim()));
  if (existe){ message("« " + existe.nom + " » existe déjà."); etat.choisi = existe.id; rafraichirEcran(); return; }
  const x = enregistrer("commercants", {nom: nom.trim(), alias: [], stats: {}, natures: {}, titulaires: {}});
  invaliderIndex(); etat.choisi = x.id; rafraichirEcran();
}

declarerEcran("commercants", {titre: "Fournisseurs", rendre(c, etat){
  const q = norm(etat.recherche || "");
  const nbAchats = new Map(); for (const o of vivants("operations")) if (o.commercant) nbAchats.set(o.commercant, (nbAchats.get(o.commercant) || 0) + 1);
  const liste = vivants("commercants").filter(x => (!q || norm(x.nom + " " + (x.alias || []).join(" ")).includes(q)) && (!etat.aVerifier || !x.verifie) && (!etat.deuxPlus || (nbAchats.get(x.id) || 0) >= 2));
  const nbVerifies = vivants("commercants").filter(x => x.verifie).length;
  const recherche = h("input", {type: "search", placeholder: "Rechercher un fournisseur, un alias…", value: etat.recherche || "", style: {width: "16rem"}});
  let t = 0; recherche.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { etat.recherche = recherche.value; rafraichirEcran(); const r = document.querySelector("#contenu input[type=search]"); if (r){ r.focus(); r.setSelectionRange(r.value.length, r.value.length); } }, 250); });
  const filtre = h("label", {class: "case", style: {margin: 0}}, h("input", {type: "checkbox", checked: !!etat.aVerifier, onchange: e => { etat.aVerifier = e.target.checked; rafraichirEcran(); }}), " à vérifier seulement");
  const filtre2 = h("label", {class: "case", style: {margin: 0}}, h("input", {type: "checkbox", checked: !!etat.deuxPlus, onchange: e => { etat.deuxPlus = e.target.checked; rafraichirEcran(); }}), " 2 achats et plus");
  c.appendChild(entete("Fournisseurs", "Fichier appris de vos validations et corrections · " + vivants("commercants").length + " fournisseurs, dont " + nbVerifies + " vérifiés", [recherche, filtre, filtre2,
    h("button", {class: "discret", onclick: () => nouveauFournisseur(etat)}, "Nouveau fournisseur…"),
    h("button", {class: "discret", onclick: () => fusionDialogue()}, "Fusionner deux fiches…"),
    h("button", {class: "discret", onclick: () => publierExtraitCommercants().then(() => message("Extrait publié pour le téléphone.")).catch(e => message(e.message, true))}, "Publier l'extrait pour le téléphone")]));
  const doublons = doublonsProbables(vivants("commercants"), LIVRE.parametres.doublonsIgnores);
  if (doublons.length){
    const d = h("details", {class: "carte", style: {marginBottom: "1rem"}}, h("summary", {style: {cursor: "pointer"}}, h("strong", null, "Doublons probables (" + doublons.length + ")"),
      h("span", {class: "petit discret"}, " — fiches qui semblent désigner la même enseigne")),
      tableau([{titre: "Fiches"}, {titre: "Achats", num: true}, {titre: ""}], doublons, {classe: "serre", limite: 200, ligne: gr => h("tr", null,
        h("td", null, gr.map(x => x.nom + (x.lieu ? " (" + x.lieu + ")" : "")).join(" · ")),
        h("td", {class: "num"}, gr.map(x => String(nbAchats.get(x.id) || 0)).join(" · ")),
        h("td", null, h("button", {class: "mini primaire", onclick: () => fusionnerGroupe(gr, nbAchats)}, "Fusionner…"), " ",
          h("button", {class: "mini discret", title: "Ne plus proposer ce groupe", onclick: () => { modifierParametres({doublonsIgnores: [...(LIVRE.parametres.doublonsIgnores || []), gr.map(x => x.id).sort().join("|")]}); rafraichirEcran(); }}, "Distinctes")))}));
    try { d.open = localStorage.getItem("doublonsOuverts") === "1"; } catch (e) {}
    d.addEventListener("toggle", () => { try { localStorage.setItem("doublonsOuverts", d.open ? "1" : "0"); } catch (e) {} });
    c.appendChild(d);
  }
  const choisi = etat.choisi ? obtenir("commercants", etat.choisi) : null;
  const g = h("div", {class: choisi ? "avec-panneau" : ""});
  g.appendChild(tableau([{titre: "Fournisseur", cle: x => x.nom}, {titre: "Alias reconnus"}, {titre: "Classement par défaut", cle: x => x.categorie || ""}, {titre: "Lieu", cle: x => x.lieu || ""},
    {titre: "Achats", num: true, cle: x => nbAchats.get(x.id) || 0}], liste, {classe: "serre", tri: 4, sens: -1, limite: 400, ligne: x => {
      const rep = x.variable ? repartitionCommercant(x) : null;
      return h("tr", {class: "cliquable" + (x === choisi ? " choisie" : ""), onclick: () => { etat.choisi = x.id; rafraichirEcran(); }},
        h("td", null, x.verifie ? h("span", {class: "pos", title: "vérifié"}, "✓ ") : null, x.nom, x.fixe ? h("span", {class: "libbanque"}, "fixé à la main") : null), h("td", {class: "petit"}, (x.alias || []).slice(0, 3).join(" · ") + ((x.alias || []).length > 3 ? " …" : "")),
        h("td", null, x.categorie ? x.categorie + " › " + x.sousCategorie : rep ? h("em", null, "variable : " + rep.map(r => r.categorie + " " + Math.round(r.part * 100) + " %").join(", ")) : (k => k ? h("span", {class: "discret"}, "d'après " + k.nb + " opération" + (k.nb > 1 ? "s" : "") + " : " + k.categorie + " › " + k.sousCategorie) : h("span", {class: "discret"}, "—"))(classementConstate(x))),
        h("td", null, etiquetteLieu(x.lieu)), h("td", {class: "num"}, String(nbAchats.get(x.id) || 0)));
    }}));
  if (choisi) g.appendChild(panneauCommercant(choisi, etat, nbAchats.get(choisi.id) || 0));
  c.appendChild(g);
}});

function panneauCommercant(x, etat, n){
  const nom = h("input", {type: "text", value: x.nom});
  const vu = !x.categorie && !x.variable ? classementConstate(x) : null;   // fiche sans défaut : on propose le classement de ses opérations
  const cat = selectionCategorie(x.categorie || vu?.categorie || "", x.sousCategorie || vu?.sousCategorie || "");
  const nature = selectionNature(x.nature || vu?.nature || "Courante");
  const lieu = selectionLieu(x.lieu || vu?.lieu || "");
  const aliasListe = h("div");
  const rendreAlias = () => { vider(aliasListe); for (const a of x.alias || []) aliasListe.appendChild(h("div", {class: "petit"}, a, " ", h("button", {class: "mini discret", onclick: () => { x.alias = x.alias.filter(b => b !== a); enregistrer("commercants", x); invaliderIndex(); rendreAlias(); }}, "✕"))); };
  rendreAlias();
  const natures = Object.entries(x.natures || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const titulaires = Object.entries(x.titulaires || {}).sort((a, b) => b[1] - a[1]);
  return h("aside", {class: "panneau"}, h("div", {class: "outils", style: {justifyContent: "space-between"}}, h("h2", {style: {margin: 0}}, x.nom), h("button", {class: "mini discret", onclick: () => { etat.choisi = null; rafraichirEcran(); }}, "✕")),
    champ("Nom d'usage", nom),
    h("label", null, "Alias (raisons sociales, libellés)"), aliasListe, h("button", {class: "mini discret", style: {margin: ".3rem 0 .6rem"}, onclick: async () => { const a = await demander("Ajouter un alias", "Libellé bancaire ou raison sociale", ""); if (a){ ajouterAlias(x, a); rendreAlias(); } }}, "Ajouter un alias"),
    champ("Catégorie par défaut", cat), champ("Nature", nature), champ("Lieu", lieu),
    h("dl", null, h("dt", null, "Achats"), h("dd", null, String(n)),
      titulaires.length ? [h("dt", null, "Titulaire usuel"), h("dd", null, titulaires.map(([t, k]) => t + " (" + k + ")").join(" · "))] : null,
      natures.length ? [h("dt", null, "Natures employées"), h("dd", null, natures.map(([t, k]) => t + " (" + k + ")").join(" · "))] : null,
      x.siret ? [h("dt", null, "SIRET"), h("dd", null, x.siret)] : null),
    h("div", {class: "outils", style: {marginTop: ".8rem"}},
      h("button", {class: "primaire mini", onclick: async () => {
        const v = valeurCategorie(cat);
        Object.assign(x, {nom: nom.value.trim() || x.nom, nature: nature.value, lieu: lieu.value, verifie: true}, v.categorie === "À préciser" ? {categorie: "", sousCategorie: "", fixe: false} : Object.assign(v, {fixe: true}));
        enregistrer("commercants", x);
        if (x.fixe){
          let k = 0;
          for (const op of vivants("operations").filter(o => o.commercant === x.id && !o.verrou)){ classerAutomatiquement(op); enregistrer("operations", op); k++; }
          // Opérations déjà validées (reprise du classeur, corrections) classées autrement : sur demande seulement
          const autres = vivants("operations").filter(o => o.commercant === x.id && o.verrou && !o.ventilation && (o.categorie !== x.categorie || o.sousCategorie !== x.sousCategorie || (x.lieu && o.lieu !== x.lieu)));
          if (autres.length && await dialogue({titre: "Opérations déjà validées", corps: h("p", null, autres.length + " opération(s) validée(s) de « " + x.nom + " » sont classées autrement (par exemple " + autres[0].categorie + " › " + autres[0].sousCategorie + "). Les reclasser en " + x.categorie + " › " + x.sousCategorie + (x.lieu ? ", " + x.lieu : "") + " ?"),
              actions: [{libelle: "Laisser telles quelles", classe: "discret", valeur: false}, {libelle: "Reclasser", classe: "primaire", valeur: true}]})){
            for (const op of autres) enregistrer("operations", Object.assign(op, {categorie: x.categorie, sousCategorie: x.sousCategorie, nature: x.nature || op.nature}, x.lieu ? {lieu: x.lieu} : {}));
            k += autres.length;
          }
          if (k) message(k + " opération(s) reclassée(s).");
        }
        rafraichirEcran();
      }}, "Enregistrer (vérifié)"),
      h("button", {class: "mini discret", onclick: () => aller("operations", {recherche: x.nom, compte: "", mois: ""})}, "Historique des achats")),
    h("p", {class: "note"}, "Le nom, les alias, la catégorie et les natures partent aussi, chiffrés, vers le téléphone en saisie seule ; aucun montant."));
}
async function fusionDialogue(){
  const options = vivants("commercants").sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map(x => [x.id, x.nom]);
  const a = selection(options, ""), b = selection(options, "");
  const ok = await dialogue({titre: "Fusionner deux fiches", corps: h("div", null, champ("Fiche gardée", a), champ("Fiche absorbée (ses alias et son historique passent dans la première)", b)),
    actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Fusionner", classe: "primaire", valeur: true}]});
  if (!ok || a.value === b.value) return;
  fusionnerCommercants(obtenir("commercants", a.value), obtenir("commercants", b.value)); message("Fiches fusionnées."); rafraichirEcran();
}
