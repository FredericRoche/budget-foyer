/* ================= Réglages ================= */
const ONGLETS_REGLAGES = [["demarrage", "Démarrage"], ["comptes", "Comptes"], ["regles", "Règles"], ["categories", "Catégories et lieux"], ["telephones", "Téléphones"],
  ["stockage", "Stockage et appareil"], ["securite", "Sécurité"], ["parametres", "Paramètres"], ["sauvegarde", "Sauvegarde et export"], ["apropos", "À propos"]];

declarerEcran("reglages", {titre: "Réglages", rendre(c, etat){
  const onglet = etat.onglet || "demarrage";
  c.appendChild(entete("Réglages", LIVRE.parametres.nomFoyer, segments(ONGLETS_REGLAGES, onglet, v => { etat.onglet = v; rafraichirEcran(); })));
  ({demarrage: reglagesDemarrage, comptes: reglagesComptes, regles: reglagesRegles, categories: reglagesCategories, telephones: reglagesTelephones, stockage: reglagesStockage,
    securite: reglagesSecurite, parametres: reglagesParametres, sauvegarde: reglagesSauvegarde, apropos: reglagesAPropos}[onglet] || reglagesDemarrage)(c, etat);
}});

function reglagesDemarrage(c){
  const fait = x => h("span", {class: x ? "pos" : "discret"}, x ? "✓ fait" : "à faire");
  const etapes = [
    ["Choisir le stockage partagé (dossier OneDrive de ce PC ou OneDrive en ligne)", SESSION.adaptateur && SESSION.adaptateur.nom !== "local", "stockage"],
    ["Importer les règles initiales (fichier JSON préparé hors du dépôt)", vivants("regles").length > 0, "import"],
    ["Reprendre le classeur d'inventaire v7 (historique, budget, hypothèses)", vivants("budgets").length > 0, "import"],
    ["Importer les relevés du mois (compte, cartes, Amex, facture des cartes)", vivants("imports").some(i => i.genre !== "reprise_v7"), "import"],
    ["Vérifier les comptes, titulaires et le compte de trésorerie", !!LIVRE.parametres.compteTresorerie, "reglages"],
    ["Importer les relevés de placements (livrets, PEA, assurances-vie, retraite)", vivants("valorisations").length > 0, "import"],
    ["Confirmer les échéances proposées (pensions, loyer, travaux, voiture, cessions)", !vivants("echeances").some(e => e.aConfirmer) && vivants("echeances").length > 0, "tresorerie"],
    ["Appairer le téléphone en saisie seule (onglet « Téléphones »)", !!LIVRE.parametres.appairageFait, "reglages"]];
  c.appendChild(h("section", {class: "carte"}, h("h2", null, "Mise en route"), h("ul", {class: "liste-traiter"},
    etapes.map(([t, ok, ecran]) => h("li", null, h("span", null, t), h("span", null, fait(ok), " ", h("button", {class: "mini discret", onclick: () => ecran === "reglages" ? null : aller(ecran)}, "Aller")))))));
}

function reglagesComptes(c){
  const ops = new Map(); for (const o of vivants("operations")) ops.set(o.compte, (ops.get(o.compte) || 0) + 1);
  c.appendChild(h("div", {class: "outils", style: {marginBottom: ".6rem"}}, h("label", {style: {margin: 0}}, "Compte de trésorerie suivi :"),
    selection([["", "—"], ...comptesDeType("courant").map(x => [x.id, x.nom])], LIVRE.parametres.compteTresorerie, {onchange: e => { modifierParametres({compteTresorerie: e.target.value}); rafraichirEcran(); }}),
    h("button", {class: "discret", onclick: () => editerCompte(null)}, "Nouveau compte")));
  c.appendChild(tableau([{titre: "Nom", cle: x => x.nom}, {titre: "Type", cle: x => TYPES_COMPTE[x.type]}, {titre: "Établissement"}, {titre: "Titulaire"}, {titre: "Carte"}, {titre: "Débitée sur"}, {titre: "Opérations", num: true}, {titre: ""}],
    vivants("comptes"), {classe: "serre", ligne: x => h("tr", {class: x.actif === false ? "discret" : ""}, h("td", null, x.nom), h("td", null, TYPES_COMPTE[x.type] || x.type), h("td", null, x.banque || ""),
      h("td", null, x.titulaire || ""), h("td", null, x.carte || ""), h("td", null, x.compteDebit ? libelleCompte(x.compteDebit) : ""), h("td", {class: "num"}, String(ops.get(x.id) || 0)),
      h("td", null, h("button", {class: "mini discret", onclick: () => editerCompte(x)}, "Modifier")))}));
  c.appendChild(h("p", {class: "note"}, "Les comptes sont créés à l'import du premier relevé. Indiquez le titulaire de chaque carte : il sert au rapprochement des facturettes et au suivi par personne."));
}
async function editerCompte(x){
  const cpt = x || {nom: "", type: "courant", actif: true};
  const nom = h("input", {type: "text", value: cpt.nom}); const type = selection(Object.entries(TYPES_COMPTE), cpt.type);
  const banque = h("input", {type: "text", value: cpt.banque || ""}); const titulaire = h("input", {type: "text", value: cpt.titulaire || ""});
  const numero = h("input", {type: "text", value: cpt.numero || ""}); const carte = h("input", {type: "text", value: cpt.carte || "", placeholder: "ex. X123, AMEX"});
  const debit = selection([["", "—"], ...comptesDeType("courant").map(y => [y.id, y.nom])], cpt.compteDebit || "");
  const actif = h("input", {type: "checkbox", checked: cpt.actif !== false, id: "cpt-actif"});
  const ok = await dialogue({titre: x ? "Modifier le compte" : "Nouveau compte", large: true, corps: h("div", null, h("div", {class: "grille-champs"}, champ("Nom", nom), champ("Type", type), champ("Établissement", banque),
    champ("Titulaire", titulaire), champ("Numéro (fin)", numero), champ("Carte", carte), champ("Carte débitée sur", debit)), h("div", {class: "case"}, actif, h("label", {for: "cpt-actif"}, "Actif"))),
    actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Enregistrer", classe: "primaire", action: () => {
      if (!nom.value.trim()){ message("Nom requis.", true); return false; }
      enregistrer("comptes", Object.assign(cpt, {nom: nom.value.trim(), type: type.value, banque: banque.value.trim(), titulaire: titulaire.value.trim(), numero: numero.value.trim(),
        carte: carte.value.trim().toUpperCase(), compteDebit: debit.value, actif: actif.checked})); return true;
    }}]});
  if (ok) rafraichirEcran();
}

function reglagesRegles(c){
  c.appendChild(h("div", {class: "outils", style: {marginBottom: ".6rem"}}, h("button", {class: "discret", onclick: () => editerRegle(null)}, "Nouvelle règle"),
    h("button", {class: "discret", onclick: () => telecharger(new Blob([JSON.stringify({format: "budget-foyer-regles", v: 1, regles: vivants("regles").map(r => { const y = Object.assign({}, r); delete y.maj; delete y.app; delete y.id; return y; })}, null, 1)], {type: "application/json"}), "regles-" + aujourdhui() + ".json")}, "Exporter les règles (JSON)"),
    h("button", {class: "discret", onclick: () => { let n = 0; for (const op of vivants("operations").filter(o => !o.verrou)){ classerAutomatiquement(op); enregistrer("operations", op); n++; } message(n + " opération(s) non validée(s) reclassée(s)."); }}, "Réappliquer aux opérations non validées")));
  c.appendChild(tableau([{titre: "Priorité", num: true, cle: r => r.priorite || 0}, {titre: "Nom", cle: r => r.nom || ""}, {titre: "Le libellé contient"}, {titre: "Conditions"}, {titre: "Classement"}, {titre: "Lieu"}, {titre: ""}],
    vivants("regles"), {classe: "serre", tri: 0, sens: -1, vide: "Aucune règle : importez le fichier de règles initiales, ou créez-en depuis une opération corrigée.", ligne: r =>
      h("tr", {class: r.active === false ? "discret" : ""}, h("td", {class: "num"}, String(r.priorite || 0)), h("td", null, r.nom || ""), h("td", {class: "petit"}, r.contient || ""),
        h("td", {class: "petit"}, [r.sens === "debit" ? "débit" : r.sens === "credit" ? "crédit" : "", r.montantMin ? "≥ " + euros(+r.montantMin) : "", r.montantMax ? "≤ " + euros(+r.montantMax) : "",
          r.jourMin ? "jour ≥ " + r.jourMin : "", r.jourMax ? "jour ≤ " + r.jourMax : "", r.compte ? libelleCompte(r.compte) : ""].filter(Boolean).join(", ")),
        h("td", null, r.categorie + (r.sousCategorie ? " › " + r.sousCategorie : "")), h("td", null, etiquetteLieu(r.lieu)), h("td", null, h("button", {class: "mini discret", onclick: () => editerRegle(r)}, "Modifier")))}));
  c.appendChild(h("p", {class: "note"}, "Plusieurs mots possibles dans « contient », séparés par « | » (l'un ou l'autre). La règle de plus haute priorité qui convient l'emporte, avant les fiches fournisseurs."));
}
async function editerRegle(r){
  const x = r || {nom: "", contient: "", priorite: 50, active: true, sens: "debit"};
  const f = {nom: h("input", {type: "text", value: x.nom || ""}), contient: h("input", {type: "text", value: x.contient || ""}), priorite: h("input", {type: "number", value: x.priorite || 0}),
    sens: selection([["", "les deux"], ["debit", "débit"], ["credit", "crédit"]], x.sens || ""), min: h("input", {type: "text", value: x.montantMin ?? ""}), max: h("input", {type: "text", value: x.montantMax ?? ""}),
    jmin: h("input", {type: "number", value: x.jourMin || ""}), jmax: h("input", {type: "number", value: x.jourMax || ""}),
    compte: selection([["", "tous"], ...vivants("comptes").map(y => [y.id, y.nom])], x.compte || ""), cat: selectionCategorie(x.categorie || "", x.sousCategorie || ""),
    nat: selectionNature(x.nature || "Courante"), lieu: selectionLieu(x.lieu || ""), nx: h("input", {type: "text", value: x.natureExacte || ""})};
  const actif = h("input", {type: "checkbox", checked: x.active !== false, id: "reg-actif"});
  const ok = await dialogue({titre: r ? "Modifier la règle" : "Nouvelle règle", large: true, corps: h("div", null, h("div", {class: "grille-champs"},
    champ("Nom", f.nom), champ("Le libellé contient (mots séparés par |)", f.contient), champ("Priorité", f.priorite), champ("Sens", f.sens), champ("Montant minimum", f.min), champ("Montant maximum", f.max),
    champ("Jour du mois minimum", f.jmin), champ("Jour du mois maximum", f.jmax), champ("Compte", f.compte), champ("Catégorie", f.cat), champ("Nature", f.nat), champ("Lieu", f.lieu), champ("Nature exacte (facultatif)", f.nx)),
    h("div", {class: "case"}, actif, h("label", {for: "reg-actif"}, "Active"))),
    actions: [r ? {libelle: "Supprimer", classe: "danger", action: () => { supprimer("regles", r.id); return true; }} : null, {libelle: "Annuler", classe: "discret", valeur: false},
      {libelle: "Enregistrer", classe: "primaire", action: () => {
        const v = valeurCategorie(f.cat); if (v.categorie === "À préciser" || !f.contient.value.trim()){ message("Texte recherché et catégorie requis.", true); return false; }
        enregistrer("regles", Object.assign(x, v, {nom: f.nom.value.trim() || f.contient.value.trim(), contient: f.contient.value.trim(), priorite: +f.priorite.value || 0, sens: f.sens.value,
          montantMin: f.min.value === "" ? null : lireMontant(f.min.value), montantMax: f.max.value === "" ? null : lireMontant(f.max.value), jourMin: +f.jmin.value || null, jourMax: +f.jmax.value || null,
          compte: f.compte.value, nature: f.nat.value, lieu: f.lieu.value, natureExacte: f.nx.value.trim(), active: actif.checked})); return true;
      }}].filter(Boolean)});
  if (ok) rafraichirEcran();
}

function reglagesCategories(c){
  const p = LIVRE.parametres;
  const lieux = h("input", {type: "text", value: p.lieux.join(", ")});
  const natures = h("input", {type: "text", value: p.natures.join(", ")});
  c.appendChild(h("section", {class: "carte"}, h("h2", null, "Lieux et natures"), champ("Lieux (analytique), séparés par des virgules", lieux), champ("Natures, séparées par des virgules", natures,
    "« Hors budget » et « Revenu » ont un sens particulier : ne pas les renommer."),
    h("button", {class: "primaire mini", onclick: () => { modifierParametres({lieux: lieux.value.split(",").map(x => x.trim()).filter(Boolean), natures: natures.value.split(",").map(x => x.trim()).filter(Boolean)}); message("Enregistré."); }}, "Enregistrer")));
  const liste = h("div");
  for (const [cat, sous] of Object.entries(p.categories)) liste.appendChild(h("p", null, h("strong", null, cat), " : " + sous.join(", ")));
  c.appendChild(h("section", {class: "carte", style: {marginTop: "1rem"}}, h("h2", null, "Catégories"), liste,
    h("button", {class: "mini discret", onclick: async () => { const cat = await demander("Ajouter", "Catégorie", ""); if (!cat) return; const s2 = await demander("Ajouter", "Sous-catégorie", ""); if (s2){ ajouterCategorie(cat, s2); rafraichirEcran(); } }}, "Ajouter une sous-catégorie")));
}

function lienAppairage(){
  const pub = LIVRE.cles.boitePublique;
  const charge = {v: 1, pub: {kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y}, ext: LIVRE.cles.extrait, foyer: LIVRE.parametres.nomFoyer, client: LIVRE.parametres.graphClient || ""};
  return location.origin + location.pathname + "#appairage=" + versB64url(enc.encode(JSON.stringify(charge)));
}
function reglagesTelephones(c){
  const lien = lienAppairage();
  const qr = h("div", {class: "ticket", style: {maxWidth: "320px"}}, "QR en préparation…");
  (async () => {
    try { if (!window.qrcode) await chargerScript("vendor/qrcode.js"); const q = qrcode(0, "M"); q.addData(lien); q.make(); vider(qr).appendChild(h("img", {src: q.createDataURL(5, 10), alt: "Code d'appairage", style: {width: "100%", imageRendering: "pixelated"}})); }
    catch (e){ vider(qr).appendChild(h("span", {class: "neg"}, "QR indisponible : " + e.message)); }
  })();
  const client = h("input", {type: "text", value: LIVRE.parametres.graphClient || "", placeholder: "identifiant d'application (client) Azure", spellcheck: "false"});
  c.appendChild(h("section", {class: "carte", style: {marginBottom: "1rem"}}, h("h2", null, "Identifiant de l'application Microsoft"),
    h("p", {class: "petit"}, "Le téléphone accède au OneDrive par Microsoft Graph : il lui faut l'identifiant obtenu lors de l'inscription sur le portail Azure (ce n'est pas un secret)."),
    h("div", {class: "outils"}, client, h("button", {class: "mini primaire", onclick: () => {
      const v = client.value.trim(); if (v && !/^[0-9a-f-]{36}$/i.test(v)){ message("Identifiant attendu : 36 caractères.", true); return; }
      modifierParametres({graphClient: v}); message("Enregistré."); rafraichirEcran();
    }}, "Enregistrer"))));
  if (!LIVRE.parametres.graphClient) c.appendChild(h("div", {class: "bandeau info"}, "Sans cet identifiant, le téléphone ne pourra pas déposer ses saisies. Voir la procédure d'inscription Azure."));
  c.appendChild(h("div", {class: "deux"},
    h("section", {class: "carte"}, h("h2", null, "Appairer un téléphone en saisie seule"),
      h("ol", {style: {paddingLeft: "1.2rem"}}, h("li", null, "Sur le téléphone, ouvrez l'appareil photo et visez ce code (ou ouvrez le lien ci-dessous, transmis de la main à la main)."),
        h("li", null, "Le téléphone ouvre l'application en mode « saisie » et demande la connexion au compte Microsoft (OneDrive en ligne)."),
        h("li", null, "Ajoutez l'application à l'écran d'accueil (menu du navigateur : « Ajouter à l'écran d'accueil »).")),
      qr, h("div", {class: "outils", style: {marginTop: ".6rem"}}, h("button", {class: "mini", onclick: () => navigator.clipboard.writeText(lien).then(() => message("Lien copié."))}, "Copier le lien"),
        h("button", {class: "mini discret", onclick: () => { modifierParametres({appairageFait: true}); publierExtraitCommercants().then(() => message("Appairage noté ; extrait des fournisseurs publié.")).catch(e => message(e.message, true)); }}, "Appairage fait"))),
    h("section", {class: "carte"}, h("h2", null, "Ce que contient le lien"),
      h("ul", {style: {paddingLeft: "1.2rem"}}, h("li", null, "la clé publique du foyer : le téléphone chiffre ses saisies pour ce livre, sans pouvoir les relire ni lire les comptes ;"),
        h("li", null, "la clé de l'extrait des fournisseurs : noms, alias, catégories et natures habituelles, sans aucun montant ni opération ;"),
        h("li", null, "aucun mot de passe, aucun identifiant Microsoft.")),
      h("p", {class: "note"}, "Perte du téléphone : seuls la liste des fournisseurs et les saisies non encore envoyées seraient exposées. Changez alors la clé de l'extrait (bouton ci-dessous) et réappairez."),
      h("button", {class: "mini danger", onclick: async () => { if (await confirmer("Changer la clé de l'extrait ? Les téléphones devront être réappairés.", "Changer", true)){ LIVRE.cles.extrait = versB64(crypto.getRandomValues(new Uint8Array(32))); marquerModifie(); await publierExtraitCommercants().catch(() => {}); rafraichirEcran(); } }}, "Changer la clé de l'extrait"))));
}

function reglagesStockage(c){
  const ad = SESSION.adaptateur;
  const nom = h("input", {type: "text", value: nomAppareil(), placeholder: "ex. PC du bureau"});
  c.appendChild(h("div", {class: "deux"},
    h("section", {class: "carte"}, h("h2", null, "Stockage"), h("p", null, "Actuel : ", h("strong", null, ad ? ad.libelle : "—"), ad?.nom === "dossier" && ad.racine ? " (« " + ad.racine.name + " »)" : ""),
      h("p", {class: "petit"}, SESSION.erreur ? h("span", {class: "neg"}, SESSION.erreur) : "Dernière synchronisation : " + (SESSION.derniereSynchro ? SESSION.derniereSynchro.toLocaleString("fr-FR") : "—")),
      h("div", {class: "outils"}, h("button", {onclick: () => synchroniser().then(() => message("Synchronisé.")).catch(e => message(e.message, true))}, "Synchroniser maintenant"),
        adaptateurDossier.disponible() ? h("button", {class: "discret", onclick: async () => { try { await adaptateurDossier.choisir(); await definirReglage("adaptateur", "dossier"); SESSION.adaptateur = adaptateurDossier; SESSION.etiquette = null; await enregistrerMaintenant(); message("Livre écrit dans le dossier choisi."); rafraichirEcran(); } catch (e){ if (e.name !== "AbortError") message(e.message, true); } }}, "Passer au dossier OneDrive de ce PC…") : null),
      h("p", {class: "note"}, "Changer de stockage écrit le livre courant dans le nouvel emplacement ; s'il y existe déjà un livre de même clé, les deux sont fusionnés.")),
    h("section", {class: "carte"}, h("h2", null, "Cet appareil"), champ("Nom de l'appareil (affiché dans la synchronisation)", nom),
      h("button", {class: "mini primaire", onclick: () => { try { localStorage.setItem("bf_nom_appareil", nom.value.trim()); } catch (e) {} message("Enregistré."); majEtatSynchro(); }}, "Enregistrer"),
      h("p", {class: "note"}, "Identifiant technique : " + appareil()))));
}

function reglagesSecurite(c){
  const a = h("input", {type: "password", autocomplete: "current-password"}), n1 = h("input", {type: "password", autocomplete: "new-password"}), n2 = h("input", {type: "password", autocomplete: "new-password"});
  const minutes = h("input", {type: "number", value: LIVRE.parametres.verrouMinutes, min: 2, max: 240, style: {width: "6rem"}});
  c.appendChild(h("div", {class: "deux"},
    h("section", {class: "carte"}, h("h2", null, "Changer le mot de passe"), champ("Mot de passe actuel", a), champ("Nouveau mot de passe", n1), champ("Confirmer", n2),
      h("button", {class: "primaire mini", onclick: async () => {
        if (n1.value !== n2.value){ message("Les deux mots de passe diffèrent.", true); return; }
        if (forceMotDePasse(n1.value).note < 2){ message("Nouveau mot de passe trop court.", true); return; }
        try { await changerMotDePasse(a.value, n1.value); a.value = n1.value = n2.value = ""; message("Mot de passe changé. Les autres appareils le demanderont à la prochaine ouverture."); } catch (e){ message(e.message, true); }
      }}, "Changer"), h("p", {class: "note"}, "Seule l'enveloppe de la clé change : le livre n'est pas rechiffré, et les appareils qui se souviennent restent ouverts.")),
    h("section", {class: "carte"}, h("h2", null, "Verrouillage"), champ("Verrouiller après (minutes d'inactivité)", minutes),
      h("button", {class: "mini primaire", onclick: () => { modifierParametres({verrouMinutes: Math.max(2, +minutes.value || 15)}); message("Enregistré."); }}, "Enregistrer"),
      h("p", {class: "note"}, "Sans effet sur un appareil qui « se souvient » (pas de mot de passe à l'ouverture)."),
      h("button", {class: "mini danger", onclick: async () => { await oublierCle(); message("Cet appareil ne se souvient plus : le mot de passe sera demandé."); }}, "Oublier la clé sur cet appareil"))));
}

function reglagesParametres(c){
  const p = LIVRE.parametres;
  const f = {ta: h("input", {type: "number", value: p.tolTicketAvant}), tp: h("input", {type: "number", value: p.tolTicketApres}), fa: h("input", {type: "number", value: p.tolFactureAvant}),
    fp: h("input", {type: "number", value: p.tolFactureApres}), d: h("input", {type: "number", value: p.delaiSansOperation}), amex: h("input", {type: "number", value: p.amexJourPrelevement}), nom: h("input", {type: "text", value: p.nomFoyer})};
  c.appendChild(h("section", {class: "carte"}, h("h2", null, "Rapprochement et trésorerie"), h("div", {class: "grille-champs"},
    champ("Nom du foyer", f.nom), champ("Ticket ou facturette : jours avant", f.ta), champ("… jours après", f.tp), champ("Facture : jours avant", f.fa), champ("… jours après", f.fp),
    champ("Saisie sans opération : alerte après (jours)", f.d), champ("Jour habituel du prélèvement Amex", f.amex)),
    h("button", {class: "primaire mini", onclick: () => { modifierParametres({nomFoyer: f.nom.value.trim() || p.nomFoyer, tolTicketAvant: +f.ta.value, tolTicketApres: +f.tp.value, tolFactureAvant: +f.fa.value,
      tolFactureApres: +f.fp.value, delaiSansOperation: +f.d.value, amexJourPrelevement: +f.amex.value}); message("Enregistré."); rafraichirEcran(); }}, "Enregistrer")));
}

function reglagesSauvegarde(c){
  c.appendChild(h("div", {class: "deux"},
    h("section", {class: "carte"}, h("h2", null, "Sauvegarde"), h("p", null, "Le livre se sauvegarde seul : une copie datée par jour dans « sauvegardes/ » du dossier partagé, plus une copie chiffrée dans ce navigateur."),
      h("button", {onclick: async () => { const o = await chiffrerLivre(LIVRE, SESSION.cle, SESSION.enveloppe); telecharger(new Blob([o], {type: "application/octet-stream"}), "budget-" + aujourdhui() + ".chiffre"); }}, "Télécharger une copie chiffrée"),
      h("p", {class: "note"}, "La copie reste chiffrée par votre mot de passe.")),
    h("section", {class: "carte"}, h("h2", null, "Export en clair"), h("p", null, "Classeur Excel de toutes les opérations, du budget et du bilan. Attention : ce fichier n'est pas chiffré."),
      h("button", {class: "discret", onclick: () => exporterOperations(vivants("operations").sort((a, b) => a.date < b.date ? -1 : 1))}, "Exporter les opérations"))));
}
function reglagesAPropos(c){
  c.appendChild(h("section", {class: "carte"}, h("h2", null, "Budget du foyer"), h("p", null, "Version " + VERSION_APP + "."),
    h("p", null, "Page unique, sans serveur : les données ne quittent l'appareil que chiffrées (AES-256-GCM, clé enveloppée par PBKDF2-SHA-256 à 600 000 itérations) vers le dossier OneDrive choisi."),
    h("p", null, "Bibliothèques embarquées : MSAL.js (Microsoft, MIT), pdf.js (Mozilla, Apache-2.0), Tesseract.js et son modèle français (Apache-2.0), qrcode-generator (MIT)."),
    h("p", null, h("button", {class: "lien", onclick: () => { location.search = "?autotest"; }}, "Lancer la suite de contrôle"), " (aucune donnée réelle n'est touchée).")));
}
