/* ================= Interface : éléments communs ================= */

/* ---------- Messages ---------- */
function message(texte, alerte){
  const m = h("div", {class: "message" + (alerte ? " alerte" : "")}, texte);
  $("messages").appendChild(m);
  setTimeout(() => m.remove(), alerte ? 9000 : 5000);
}

/* ---------- Dialogue (fenêtre modale) ----------
   dialogue({titre, corps: Node|[Node], actions: [{libelle, classe, action: () => true|false|Promise}], large})
   Une action qui renvoie false garde la fenêtre ouverte. */
let fermerDialogueCourant = null;
function dialogue(o){
  return new Promise(resoudre => {
    const d = vider($("dialogue")); d.className = "dialogue" + (o.large ? " large" : "");
    d.appendChild(h("h2", null, o.titre));
    ajouterEnfants(d, [o.corps]);
    const actions = h("div", {class: "actions"});
    const fermer = v => { $("voile").hidden = true; fermerDialogueCourant = null; resoudre(v); };
    for (const a of o.actions || [{libelle: "Fermer"}]){
      actions.appendChild(h("button", {class: a.classe || "", onclick: async () => {
        try {
          const r = a.action ? await a.action() : a.valeur;
          if (r !== false) fermer(r === undefined ? a.valeur ?? true : r);
        } catch (e){ message(e.message, true); }
      }}, a.libelle));
    }
    d.appendChild(actions);
    $("voile").hidden = false;
    fermerDialogueCourant = () => fermer(null);
    const premier = d.querySelector("input, select, textarea, button.primaire"); if (premier) setTimeout(() => premier.focus(), 30);
  });
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && fermerDialogueCourant) fermerDialogueCourant(); });
async function confirmer(texte, libelleOui, danger){
  return !!(await dialogue({titre: "Confirmation", corps: h("p", null, texte),
    actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: libelleOui || "Confirmer", classe: danger ? "danger" : "primaire", valeur: true}]}));
}
async function demander(titre, libelle, valeur, type){
  const champ = h("input", {type: type || "text", value: valeur || ""});
  const r = await dialogue({titre, corps: h("div", {class: "champ"}, h("label", null, libelle), champ),
    actions: [{libelle: "Annuler", classe: "discret", valeur: null}, {libelle: "Valider", classe: "primaire", action: () => champ.value}]});
  return r;
}

/* ---------- Champs ---------- */
function champ(libelle, controle, aide){ return h("div", {class: "champ"}, h("label", null, libelle), controle, aide ? h("div", {class: "note"}, aide) : null); }
function selection(options, valeur, attrs){
  const s = h("select", attrs || null);
  for (const o of options){
    const [v, t] = Array.isArray(o) ? o : [o, o];
    s.appendChild(h("option", {value: v, selected: v === valeur}, t));
  }
  if (valeur && !options.some(o => (Array.isArray(o) ? o[0] : o) === valeur)) s.appendChild(h("option", {value: valeur, selected: true}, valeur));
  return s;
}
/* Liste « Catégorie › sous-catégorie », valeur codée « cat|sous » */
function selectionCategorie(cat, sous, attrs){
  const s = h("select", attrs || null);
  s.appendChild(h("option", {value: "À préciser|À préciser"}, "À préciser"));
  for (const [c, liste] of Object.entries(LIVRE.parametres.categories)){
    if (c === "À préciser") continue;
    const g = h("optgroup", {label: c});
    for (const ss of liste) g.appendChild(h("option", {value: c + "|" + ss, selected: c === cat && ss === sous}, c + " › " + ss));
    s.appendChild(g);
  }
  if (cat && cat !== "À préciser" && !(LIVRE.parametres.categories[cat] || []).includes(sous)) s.appendChild(h("option", {value: cat + "|" + (sous || ""), selected: true}, cat + (sous ? " › " + sous : "")));
  s.appendChild(h("option", {value: "__nouvelle__"}, "Nouvelle catégorie…"));
  s.addEventListener("change", async () => {
    if (s.value !== "__nouvelle__") return;
    const c = await demander("Nouvelle catégorie", "Catégorie (existante ou nouvelle)", cat || ""); if (!c){ s.value = (cat || "À préciser") + "|" + (sous || "À préciser"); return; }
    const ss = await demander("Nouvelle catégorie", "Sous-catégorie de « " + c + " »", ""); if (!ss) return;
    ajouterCategorie(c, ss);
    const o = h("option", {value: c + "|" + ss, selected: true}, c + " › " + ss); s.insertBefore(o, s.lastChild); s.value = o.value;
    s.dispatchEvent(new Event("change"));
  });
  return s;
}
const valeurCategorie = sel => { const [c, s] = sel.value.split("|"); return {categorie: c, sousCategorie: s || ""}; };
function selectionLieu(valeur, attrs){ return selection([["", "—"], ...LIVRE.parametres.lieux.map(l => [l, l])], valeur || "", attrs); }
function selectionNature(valeur, attrs){ return selection(LIVRE.parametres.natures, valeur || "Courante", attrs); }
function segments(options, valeur, auChoix){
  const g = h("div", {class: "segments"});
  for (const o of options){
    const [v, t] = Array.isArray(o) ? o : [o, o];
    g.appendChild(h("button", {class: v === valeur ? "choisi" : "", onclick: () => { for (const b of g.children) b.classList.remove("choisi"); g.children[options.indexOf(o)].classList.add("choisi"); auChoix(v); }}, t));
  }
  return g;
}
function etiquetteLieu(lieu){ return lieu ? h("span", {class: classeLieu(lieu)}, lieu) : "—"; }
function marqueOrigine(op){
  const o = op.origine;
  if (o === "regle") return h("span", {class: "marque-src regle"}, "règle");
  if (o === "commercant") return h("span", {class: "marque-src regle"}, "fournisseur");
  if (o === "historique") return h("span", {class: "marque-src histo"}, "historique");
  if (o === "mcc" || o === "banque") return h("span", {class: "marque-src histo"}, o === "mcc" ? "code commerçant" : "banque");
  if (o === "reprise") return h("span", {class: "marque-src"}, "reprise");
  if (o === "facture" || o === "especes") return h("span", {class: "marque-src regle"}, o);
  return h("span", {class: "marque-src aprec"}, "inconnu");
}
function montantCellule(v, attrs, dec){ return h("td", Object.assign({class: "num" + (v < 0 ? " neg" : v > 0 ? " pos" : "")}, attrs || {}), v > 0 ? "+" + euros(v, dec) : euros(v, dec)); }

/* ---------- Tableau triable ---------- */
function tableau(colonnes, lignes, options){
  const o = options || {};
  let tri = o.tri || null, sens = o.sens || 1;
  const t = h("table", {class: o.classe || ""}); const thead = h("thead"); const tbody = h("tbody");
  const rendre = () => {
    vider(thead); vider(tbody);
    const tr = h("tr");
    colonnes.forEach((c, i) => {
      const th = h("th", {class: (c.num ? "num " : "") + (c.cle ? "triable" : "") + (tri === i ? (sens > 0 ? " asc" : " desc") : "")}, c.titre);
      if (c.cle) th.addEventListener("click", () => { if (tri === i) sens = -sens; else { tri = i; sens = 1; } rendre(); });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    let ls = lignes.slice();
    if (tri !== null && colonnes[tri].cle){
      const k = colonnes[tri].cle;
      ls.sort((a, b) => { const x = k(a), y = k(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr", {numeric: true})) * sens; });
    }
    const limite = o.limite || 600;
    for (const l of ls.slice(0, limite)) tbody.appendChild(o.ligne(l));
    if (ls.length > limite) tbody.appendChild(h("tr", null, h("td", {colspan: colonnes.length, class: "discret"}, (ls.length - limite) + " ligne(s) de plus : affinez la recherche.")));
    if (!ls.length) tbody.appendChild(h("tr", null, h("td", {colspan: colonnes.length, class: "vide"}, o.vide || "Rien à afficher.")));
  };
  rendre();
  t.append(thead, tbody);
  return h("div", {class: "tableau"}, t);
}

/* ---------- Navigation ---------- */
const ECRANS = {};          // nom → {titre, rendre(conteneur), rubrique, mobile}
let ECRAN_COURANT = "accueil";
let ETAT_ECRAN = {};        // état persistant par écran (filtres, sélection)
function declarerEcran(nom, def){ ECRANS[nom] = def; }
function aller(nom, etat){
  if (!ECRANS[nom]) nom = "accueil";
  $("saisie").hidden = true; $("appli").hidden = false;
  ECRAN_COURANT = nom;
  if (etat) ETAT_ECRAN[nom] = Object.assign(ETAT_ECRAN[nom] || {}, etat);
  if (location.hash !== "#" + nom) history.replaceState(null, "", "#" + nom);
  rafraichirEcran(); window.scrollTo(0, 0);
}
function rafraichirEcran(){
  if (SESSION.etat !== "ouvert" || !LIVRE) return;
  construireNavigation();
  afficherBandeaux();
  const c = vider($("contenu"));
  try { ECRANS[ECRAN_COURANT].rendre(c, ETAT_ECRAN[ECRAN_COURANT] || (ETAT_ECRAN[ECRAN_COURANT] = {})); }
  catch (e){ console.error(e); c.appendChild(h("div", {class: "bandeau alerte"}, "Erreur d'affichage : " + e.message)); }
}
function entete(titre, contexte, outils){
  return h("div", {class: "entete"}, h("div", null, h("h1", null, titre), contexte ? h("div", {class: "contexte"}, contexte) : null),
    outils ? h("div", {class: "outils"}, outils) : null);
}
function compteATraiter(){
  const ops = vivants("operations").filter(o => o.statut === "a_preciser" || o.statut === "propose").length;
  const js = vivants("justificatifs").filter(j => j.statut === "a_rapprocher").length;
  const factures = vivants("factures").filter(f => Math.abs(f.ecart || 0) >= 0.01 && !f.ecartVu).length;
  const echeances = vivants("echeances").filter(e => e.aConfirmer).length;
  return {ops, js, factures, echeances, total: ops + js + factures + echeances};
}
function construireNavigation(){
  const n = vider($("nav-laterale"));
  n.appendChild(h("div", {class: "marque"}, h("div", {class: "titre"}, "Budget du foyer"), h("div", {class: "sous"}, LIVRE.parametres.nomFoyer)));
  const a = compteATraiter();
  const ana = ETAT_TRESO_CACHE;
  const lien = (nom, texte, pastille, alerte) => h("a", {class: ECRAN_COURANT === nom ? "actif" : "", onclick: () => aller(nom)}, texte,
    pastille ? h("span", {class: "pastille" + (alerte ? " alerte" : "")}, pastille) : null);
  n.append(lien("accueil", "Tableau de bord"), lien("traiter", "À traiter", a.total || null),
    h("div", {class: "rubrique"}, "Comptes"), lien("operations", "Opérations"), lien("import", "Importer"),
    lien("justificatifs", "Justificatifs", vivants("justificatifs").filter(j => j.statut === "a_rapprocher").length || null),
    lien("boite", "Boîte de saisies", BOITE_CACHE.length || null), lien("commercants", "Fournisseurs"),
    h("div", {class: "rubrique"}, "Restitution"), lien("budget", "Budget et réalisé"), lien("patrimoine", "Bilan et résultat"),
    lien("tresorerie", "Trésorerie", ana?.premierBas ? "!" : null, true),
    lien("epargne", "Épargne"), lien("projets", "Projets"),
    h("div", {class: "rubrique"}, "Appareil"), lien("reglages", "Réglages"),
    h("div", {class: "pied-nav", id: "etat-synchro"}));
  majEtatSynchro();
  const b = vider($("nav-basse")); b.hidden = false;
  const lb = (nom, icone, texte) => h("a", {class: ECRAN_COURANT === nom ? "actif" : "", onclick: () => aller(nom)}, h("b", null, icone), texte);
  b.append(lb("accueil", "⌂", "Accueil"), lb("traiter", String(a.total || "✓"), "À traiter"), lb("operations", "≡", "Opérations"), lb("budget", "▤", "Budget"), lb("tresorerie", "≈", "Trésorerie"));
}
function majEtatSynchro(){
  const e = $("etat-synchro"); if (!e) return;
  vider(e);
  const ad = SESSION.adaptateur;
  const classe = SESSION.erreur ? "erreur" : (SESSION.enCours || LIVRE_MODIFIE) ? "attente" : "";
  e.append(h("span", {class: "point " + classe}),
    SESSION.erreur ? SESSION.erreur : SESSION.enCours ? "Synchronisation…" : LIVRE_MODIFIE ? "Modifications en attente" :
      (ad ? ad.libelle : "") + (SESSION.derniereSynchro ? " · " + SESSION.derniereSynchro.toLocaleTimeString("fr-FR", {hour: "2-digit", minute: "2-digit"}) : ""),
    h("br"), nomAppareil() || "", h("br"),
    h("button", {class: "mini discret", style: {marginTop: ".45rem"}, onclick: verrouiller}, "Verrouiller"));
}
async function verrouiller(){
  if (LIVRE_MODIFIE) await enregistrerMaintenant().catch(() => {});
  fermerLivre(); afficherVerrou("Livre verrouillé.");
}

/* ---------- Bandeaux d'alerte ---------- */
let ETAT_TRESO_CACHE = null;
let BOITE_CACHE = [];
function afficherBandeaux(){
  const b = vider($("bandeaux"));
  if (DEMO) b.appendChild(h("div", {class: "bandeau calme"}, h("span", null, h("strong", null, "Démonstration"), " : foyer, comptes et montants fictifs ; rien n'est enregistré."), h("span", null, h("button", {class: "mini", onclick: () => demonstrationMobile()}, "Voir l'écran du téléphone"), " ", h("a", {href: location.pathname}, "Quitter la démonstration"))));
  const sim = simulerTresorerie(); const ana = analyseTresorerie(sim); ETAT_TRESO_CACHE = ana;
  if (ana?.premierBas){
    b.appendChild(h("div", {class: "bandeau alerte"},
      h("span", null, h("strong", null, "Découvert prévu le " + dateFr(ana.premierBas.date)), " sur " + sim.compte.nom + " (solde projeté au plus bas : " + euros(ana.min.solde, 0) + " le " + dateFr(ana.min.date) + "). Virement à prévoir : ",
        h("strong", null, euros(ana.virement, 0)), " avant le " + dateFr(ana.avant) + "."),
      h("button", {class: "mini", onclick: () => aller("tresorerie")}, "Voir la trésorerie")));
  } else if (ana?.excedent && ana.excedent.montant > 0){
    b.appendChild(h("div", {class: "bandeau info"}, h("span", null, "Excédent de trésorerie durable à partir du " + dateFr(ana.excedent.depuis) + " : environ ",
      h("strong", null, euros(ana.excedent.montant, 0)), " au-dessus du seuil haut, à placer."), h("button", {class: "mini", onclick: () => aller("tresorerie")}, "Voir")));
  }
  if (sim && !sim.soldeConnu) b.appendChild(h("div", {class: "bandeau info"}, "Trésorerie : aucun solde connu pour " + sim.compte.nom + ". Importez un relevé CSV du compte."));
}
