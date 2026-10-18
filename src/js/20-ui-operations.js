/* ================= Opérations ================= */
function filtrerOperations(etat){
  const q = norm(etat.recherche || "");
  const [cat, sous] = (etat.categorie || "").split("|");
  return vivants("operations").filter(o => {
    if (etat.compte && o.compte !== etat.compte) return false;
    if (etat.mois && !o.date.startsWith(etat.mois)) return false;
    if (etat.nonDebitees && (o.dateDebit || obtenir("comptes", o.compte)?.type !== "carte")) return false;
    if (etat.facture && o.facture !== etat.facture) return false;
    if (cat && !partsDe(o).some(p => p.categorie === cat && (!sous || p.sousCategorie === sous))) return false;
    if (q){
      const c = o.commercant ? obtenir("commercants", o.commercant) : null;
      const t = norm([o.libelle, o.natureExacte, c?.nom, o.categorie, o.sousCategorie, euros(o.montant), String(Math.abs(o.montant)).replace(".", ","), o.lieu].join(" "));
      if (!q.split(/\s+/).every(m => t.includes(m))) return false;
    }
    return true;
  }).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
}

declarerEcran("operations", {titre: "Opérations", rendre(c, etat){
  const ops = filtrerOperations(etat);
  const recherche = h("input", {type: "search", placeholder: "Rechercher (libellé, fournisseur, nature, montant…)", value: etat.recherche || "", style: {width: "17rem"}});
  let minuterie = 0;
  recherche.addEventListener("input", () => { clearTimeout(minuterie); minuterie = setTimeout(() => { etat.recherche = recherche.value; rafraichirEcran(); setTimeout(() => { const r = document.querySelector("#contenu input[type=search]"); if (r){ r.focus(); r.setSelectionRange(r.value.length, r.value.length); } }, 0); }, 250); });
  const comptes = selection([["", "Tous les comptes"], ...vivants("comptes").map(x => [x.id, x.nom])], etat.compte || "", {onchange: e => { etat.compte = e.target.value; rafraichirEcran(); }});
  const moisListe = [...new Set(vivants("operations").map(o => o.date.slice(0, 7)))].sort().reverse();
  const mois = selection([["", "Toutes les dates"], ...moisListe.map(m => [m, moisFr(m)])], etat.mois || "", {onchange: e => { etat.mois = e.target.value; rafraichirEcran(); }});
  const cats = selection([["", "Toutes catégories"], ...listeCategories().map(([a, b]) => [a + "|" + b, a + " › " + b])], etat.categorie || "", {onchange: e => { etat.categorie = e.target.value; rafraichirEcran(); }});
  c.appendChild(entete("Opérations", ops.length + " opération(s)" + (etat.facture ? " de la facture choisie" : "") + " · total " + euros(somme(ops, o => o.montant)),
    [recherche, comptes, mois, cats, segments([[false, "Toutes"], [true, "Non encore débitées"]], !!etat.nonDebitees, v => { etat.nonDebitees = v; rafraichirEcran(); }),
      etat.facture ? h("button", {class: "discret", onclick: () => { etat.facture = null; rafraichirEcran(); }}, "Toutes les factures") : null,
      h("button", {class: "discret", onclick: () => nouvelleOperation()}, "Ajouter…"),
      h("button", {class: "discret", onclick: () => exporterOperations(ops)}, "Exporter en Excel")]));
  const choisie = etat.choisie ? obtenir("operations", etat.choisie) : null;
  const grille = h("div", {class: choisie ? "avec-panneau" : ""});
  grille.appendChild(tableau([{titre: "Achat", cle: o => o.date}, {titre: "Débité le", cle: o => o.dateDebit || "9"}, {titre: "Compte", cle: o => libelleCompte(o.compte)},
    {titre: "Fournisseur", cle: o => o.commercant ? obtenir("commercants", o.commercant)?.nom : o.libelle}, {titre: "Nature exacte", cle: o => o.natureExacte || ""},
    {titre: "Montant", num: true, cle: o => o.montant}, {titre: "Catégorie", cle: o => categorieComplete(o)}, {titre: "Lieu", cle: o => o.lieu || ""}, {titre: "📎"}], ops, {
    classe: "serre", vide: "Aucune opération ne correspond.",
    ligne: o => {
      const cm = o.commercant ? obtenir("commercants", o.commercant) : null;
      const compte = obtenir("comptes", o.compte);
      return h("tr", {class: "cliquable" + (choisie === o ? " choisie" : ""), onclick: () => { etat.choisie = o.id; rafraichirEcran(); }},
        h("td", null, dateCourte(o.date)), h("td", {class: !o.dateDebit ? "discret" : ""}, o.dateDebit ? dateCourte(o.dateDebit) : (compte?.type === "carte" ? h("em", null, "à venir") : "")),
        h("td", null, compte ? (compte.carte && compte.carte !== "LCL-NV" ? compte.carte : compte.nom) : "—"),
        h("td", null, cm ? cm.nom : o.libelle, cm ? h("span", {class: "libbanque", title: o.libelle}, o.libelle) : null),
        h("td", {class: o.natureExacte ? "" : "discret"}, o.natureExacte || "—", o.ventilation ? h("span", {class: "libbanque"}, "ventilée en " + o.ventilation.length) : null),
        montantCellule(o.montant), h("td", null, categorieComplete(o), o.statut !== "classe" ? h("span", {class: "libbanque"}, o.statut === "propose" ? "proposé" : "à préciser") : null),
        h("td", null, etiquetteLieu(o.lieu)), h("td", null, (o.justificatifs || []).length ? "📎" + ((o.justificatifs || []).length > 1 ? " " + o.justificatifs.length : "") : ""));
    }}));
  if (choisie) grille.appendChild(panneauOperation(choisie, etat));
  c.appendChild(grille);
}});

function panneauOperation(o, etat){
  const compte = obtenir("comptes", o.compte);
  const cm = o.commercant ? obtenir("commercants", o.commercant) : null;
  const nomCm = h("input", {type: "text", value: cm ? cm.nom : nomDepuisCle(cleLibelle(o.libelle))});
  const nature = h("input", {type: "text", value: o.natureExacte || "", placeholder: "ce qui a été acheté, pour quoi"});
  const sugg = h("div", {class: "suggestions"});
  for (const [n] of Object.entries(cm?.natures || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)) sugg.appendChild(h("button", {onclick: () => { nature.value = n; }}, n));
  const selCat = selectionCategorie(o.categorie, o.sousCategorie);
  const selNat = selectionNature(o.nature);
  const selLieu = selectionLieu(o.lieu);
  const selProjet = selection([["", "—"], ...nomsProjets().map(n => [n, n])], o.projet || "");
  const js = (o.justificatifs || []).map(id => obtenir("justificatifs", id)).filter(Boolean);
  const raisons = [...new Set(js.map(j => j.raisonSociale).filter(Boolean))];
  const p = h("aside", {class: "panneau"}, h("div", {class: "outils", style: {justifyContent: "space-between"}}, h("h2", {style: {margin: 0}}, "Détail de l'opération"),
    h("button", {class: "mini discret", onclick: () => { etat.choisie = null; rafraichirEcran(); }}, "✕")),
    h("dl", null, h("dt", null, "Achat"), h("dd", null, dateFr(o.date) + " · " + (compte?.nom || "—") + (compte?.titulaire ? " (" + compte.titulaire + ")" : "")),
      compte?.type === "carte" ? [h("dt", null, "Débit"), h("dd", null, o.dateDebit ? dateFr(o.dateDebit) + " sur " + libelleCompte(compte.compteDebit) : "à venir (débit différé)")] : null,
      h("dt", null, "Libellé bancaire"), h("dd", null, o.libelle), h("dt", null, "Montant"), h("dd", null, euros(o.montant)),
      o.lien ? [h("dt", null, "Transfert"), h("dd", null, "lié à " + libelleCompte(obtenir("operations", o.lien)?.compte))] : null),
    raisons.length ? [h("label", {style: {marginTop: ".6rem"}}, "Raison sociale lue (justificatifs)"), h("div", {class: "petit discret"}, raisons.join(" · "))] : null,
    h("label", {style: {marginTop: ".5rem"}}, "Fournisseur (nom d'usage)"), nomCm,
    h("label", {style: {marginTop: ".5rem"}}, "Nature exacte de la dépense"), nature, sugg,
    h("dl", {style: {marginTop: ".7rem"}}, h("dt", null, "Catégorie"), h("dd", null, selCat), h("dt", null, "Nature"), h("dd", null, selNat), h("dt", null, "Lieu"), h("dd", null, selLieu), nomsProjets().length ? [h("dt", null, "Projet"), h("dd", null, selProjet)] : null,
      o.ventilation ? [h("dt", null, "Ventilation"), h("dd", null, o.ventilation.map(v => euros(v.montant) + " " + v.sousCategorie + (v.natureExacte ? " (" + v.natureExacte + ")" : "")).join(" · "))] : null,
      h("dt", null, "Justificatifs"), h("dd", null, js.length ? js.map(j => h("button", {class: "lien", onclick: () => voirPiece(j)}, "📎 " + (TYPES_JUSTIF[j.type] || "pièce") + " ")) : h("span", {class: "discret"}, "aucun"),
        h("br"), h("button", {class: "mini discret", style: {marginTop: ".3rem"}, onclick: () => ajouterPieceAOperation(o)}, "Joindre une pièce…")),
      h("dt", null, "Origine"), h("dd", null, marqueOrigine(o), o.import ? " " + (obtenir("imports", o.import)?.fichier || "") : "")));
  p.appendChild(h("div", {class: "outils", style: {marginTop: ".8rem"}},
    h("button", {class: "primaire mini", onclick: () => {
      const v = valeurCategorie(selCat);
      const corrige = v.categorie !== o.categorie || v.sousCategorie !== o.sousCategorie || selLieu.value !== (o.lieu || "") || selNat.value !== o.nature;
      Object.assign(o, v, {nature: selNat.value, lieu: selLieu.value, natureExacte: nature.value.trim(), projet: selProjet.value || null});
      // Nom d'usage du commerçant : renomme la fiche (ou la crée) et la rattache
      let fiche = cm;
      const nom = nomCm.value.trim();
      if (nom && (!fiche || norm(fiche.nom) !== norm(nom))){
        const autre = vivants("commercants").find(x => norm(x.nom) === norm(nom));
        if (autre && fiche && autre.id !== fiche.id) fusionnerCommercants(autre, fiche), fiche = autre;
        else if (autre) fiche = autre;
        else if (fiche) fiche.nom = nom, enregistrer("commercants", fiche);
        else fiche = enregistrer("commercants", {nom, alias: [cleLibelle(o.libelle)], stats: {}, natures: {}});
        invaliderIndex();
        o.commercant = fiche.id;
      }
      if (o.categorie !== "À préciser") validerClassement(o, corrige); else enregistrer("operations", o);
      message("Opération enregistrée" + (corrige && fiche ? " ; classement retenu pour « " + fiche.nom + " »" : "") + ".");
      rafraichirEcran();
    }}, "Enregistrer"),
    h("button", {class: "mini discret", onclick: () => ventilerOperation(o)}, "Ventiler…"),
    cm ? h("button", {class: "mini discret", onclick: () => aller("commercants", {choisi: cm.id})}, "Fiche fournisseur") : null,
    !o.import && !o.empreinte?.startsWith("facture") ? h("button", {class: "mini danger", onclick: async () => { if (await confirmer("Supprimer cette opération saisie à la main ?", "Supprimer", true)){ supprimer("operations", o.id); etat.choisie = null; rafraichirEcran(); } }}, "Supprimer") : null));
  return p;
}

async function voirPiece(j){
  const piece = await lirePiece(j.id).catch(e => { message(e.message, true); return null; });
  const corps = h("div");
  if (piece){
    const url = URL.createObjectURL(new Blob([piece.octets], {type: piece.mime}));
    corps.appendChild(piece.mime === "application/pdf" ? h("p", null, h("a", {href: url, target: "_blank", rel: "noopener"}, "Ouvrir le PDF")) : h("div", {class: "ticket"}, h("img", {src: url, alt: "Justificatif"})));
  } else corps.appendChild(h("p", {class: "vide"}, "Pièce introuvable sur cet appareil."));
  corps.appendChild(h("p", {class: "note"}, (TYPES_JUSTIF[j.type] || "") + " · " + dateFr(j.date) + " · " + euros(j.montant) + (j.raisonSociale ? " · lu : « " + j.raisonSociale + " »" : "")));
  if (j.texteOCR) corps.appendChild(h("details", null, h("summary", null, "Texte lu"), h("div", {class: "texte-brut"}, j.texteOCR)));
  await dialogue({titre: j.commercantNom || "Justificatif", corps, large: true});
}
async function ajouterPieceAOperation(o){
  const f = await choisirFichier("image/*,application/pdf"); if (!f) return;
  const octets = new Uint8Array(await f.arrayBuffer());
  const mime = f.type || (f.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  const j = await creerJustificatif({type: mime === "application/pdf" ? "facture" : "ticket", date: o.date, montant: Math.abs(o.montant), commercantNom: obtenir("commercants", o.commercant)?.nom || "", origine: "pc"}, {octets, mime});
  lier([j], o, false); message("Pièce jointe."); rafraichirEcran();
}
function choisirFichier(accept, multiple){
  return new Promise(ok => { const i = h("input", {type: "file", accept, multiple: !!multiple, style: {display: "none"}}); i.addEventListener("change", () => { ok(multiple ? [...i.files] : i.files[0] || null); i.remove(); }); document.body.appendChild(i); i.click(); });
}
async function ventilerOperation(o){
  const parts = (o.ventilation || [{montant: o.montant, categorie: o.categorie, sousCategorie: o.sousCategorie, lieu: o.lieu, natureExacte: o.natureExacte}]).map(x => Object.assign({}, x));
  const corps = h("div"); const liste = h("div"); const reste = h("p", {class: "note"});
  const rendre = () => {
    vider(liste);
    parts.forEach((p, i) => {
      const m = h("input", {type: "text", value: nombre(Math.abs(p.montant)), style: {width: "7rem"}, oninput: e => { p.montant = -Math.abs(lireMontant(e.target.value) || 0); maj(); }});
      const sc = selectionCategorie(p.categorie, p.sousCategorie, {onchange: e => Object.assign(p, valeurCategorie(e.target))});
      const nx = h("input", {type: "text", value: p.natureExacte || "", placeholder: "nature exacte", oninput: e => { p.natureExacte = e.target.value; }});
      const lx = selectionLieu(p.lieu, {onchange: e => { p.lieu = e.target.value; }});
      liste.appendChild(h("div", {class: "outils", style: {marginBottom: ".4rem"}}, m, sc, lx, nx, h("button", {class: "mini danger", onclick: () => { parts.splice(i, 1); rendre(); }}, "✕")));
    });
    maj();
  };
  const maj = () => { const r = o.montant - somme(parts, p => p.montant); reste.textContent = Math.abs(r) < 0.005 ? "Ventilation complète." : "Reste à ventiler : " + euros(r); reste.className = "note" + (Math.abs(r) < 0.005 ? "" : " neg"); };
  corps.append(h("p", null, "Opération de " + euros(o.montant) + " : répartissez-la entre plusieurs postes."), liste,
    h("button", {class: "mini", onclick: () => { parts.push({montant: 0, categorie: o.categorie, sousCategorie: o.sousCategorie, lieu: o.lieu}); rendre(); }}, "Ajouter une part"), reste);
  rendre();
  const ok = await dialogue({titre: "Ventiler l'opération", corps, large: true, actions: [{libelle: "Annuler", classe: "discret", valeur: false},
    {libelle: "Retirer la ventilation", classe: "discret", action: () => { delete o.ventilation; enregistrer("operations", o); return true; }},
    {libelle: "Enregistrer", classe: "primaire", action: () => {
      if (Math.abs(o.montant - somme(parts, p => p.montant)) >= 0.005){ message("La somme des parts doit égaler le montant.", true); return false; }
      o.ventilation = parts.length > 1 ? parts : undefined; if (!o.ventilation) delete o.ventilation; enregistrer("operations", o); return true;
    }}]});
  if (ok) rafraichirEcran();
}
async function nouvelleOperation(){
  const comptes = vivants("comptes").filter(c => ["courant", "carte", "especes"].includes(c.type));
  if (!comptes.length) compteEspeces();
  const compte = selection(vivants("comptes").filter(c => ["courant", "carte", "especes"].includes(c.type)).map(c => [c.id, c.nom]), compteEspeces().id);
  const date = champDate({value: aujourdhui()});
  const montant = h("input", {type: "text", placeholder: "-12,50 pour une dépense"});
  const libelle = h("input", {type: "text"}); const nat = h("input", {type: "text"});
  const cat = selectionCategorie("", ""); const lieu = selectionLieu("");
  const ok = await dialogue({titre: "Nouvelle opération", corps: h("div", {class: "grille-champs"}, champ("Compte", compte), champ("Date", date), champ("Montant (négatif = dépense)", montant),
    champ("Fournisseur ou libellé", libelle), champ("Nature exacte", nat), champ("Catégorie", cat), champ("Lieu", lieu)),
    actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Enregistrer", classe: "primaire", action: () => {
      const m = lireMontant(montant.value); if (isNaN(m) || !m){ message("Montant illisible.", true); return false; }
      if (!dateSaisieOk(date, "Date")) return false;
      const op = Object.assign({compte: compte.value, date: date.value, dateDebit: date.value, montant: m, libelle: libelle.value.trim() || "Saisie manuelle", natureExacte: nat.value.trim(),
        lieu: lieu.value, origine: "manuel", justificatifs: []}, valeurCategorie(cat));
      op.nature = natureParDefaut(op.categorie); if (m > 0 && op.categorie === "À préciser") op.nature = "Revenu";
      const c = assurerCommercant(op.libelle); if (c) op.commercant = c.id;
      op.statut = op.categorie === "À préciser" ? "a_preciser" : "classe";
      const e = enregistrer("operations", op); if (op.statut === "classe") apprendre(e); return true;
    }}]});
  if (ok) rafraichirEcran();
}
function exporterOperations(ops){
  telecharger(ecrireClasseur([{nom: "Opérations", colonnes: [{titre: "Date d'achat", type: "date", largeur: 12}, {titre: "Débité le", type: "date", largeur: 12}, {titre: "Compte", largeur: 22},
    {titre: "Libellé bancaire", largeur: 40}, {titre: "Fournisseur", largeur: 24}, {titre: "Nature exacte", largeur: 30}, {titre: "Montant", type: "euros", largeur: 13},
    {titre: "Catégorie", largeur: 20}, {titre: "Sous-catégorie", largeur: 26}, {titre: "Nature", largeur: 14}, {titre: "Lieu", largeur: 10}, {titre: "Justificatifs", type: "nombre", largeur: 8}],
    lignes: ops.flatMap(o => partsDe(o).map(p => [o.date, o.dateDebit || "", libelleCompte(o.compte), o.libelle, obtenir("commercants", o.commercant)?.nom || "",
      p.natureExacte || o.natureExacte || "", p.montant, p.categorie || "", p.sousCategorie || "", p.nature || "", p.lieu || "", (o.justificatifs || []).length]))}]),
    "operations-" + aujourdhui() + ".xlsx");
}
