/* ================= À traiter ================= */
declarerEcran("traiter", {titre: "À traiter", rendre(c, etat){
  const aClasser = vivants("operations").filter(o => o.statut === "a_preciser" || o.statut === "propose").sort((a, b) => a.date < b.date ? 1 : -1);
  const surs = aClasser.filter(o => o.statut === "propose" && o.categorie !== "À préciser");
  etat.coches = etat.coches || new Set(surs.map(o => o.id));
  c.appendChild(entete("À traiter", "Ce qui attend une décision. Les cas sans ambiguïté ont été appliqués d'office et restent réversibles (en bas de page).",
    surs.length ? h("button", {class: "primaire", onclick: () => {
      let n = 0; for (const o of aClasser) if (etat.coches.has(o.id) && o.categorie !== "À préciser"){ validerClassement(o, false); n++; }
      etat.coches = null; message(n + " classement(s) validé(s)."); rafraichirEcran();
    }}, "Valider les propositions cochées") : null));

  /* 1. Opérations à classer */
  const sec = h("section", null, h("h2", null, "Opérations à classer (" + aClasser.length + ")"));
  sec.appendChild(tableau([{titre: ""}, {titre: "Date", cle: o => o.date}, {titre: "Compte", cle: o => libelleCompte(o.compte)}, {titre: "Libellé bancaire", cle: o => o.libelle},
    {titre: "Montant", num: true, cle: o => o.montant}, {titre: "Classement proposé"}, {titre: "Origine"}, {titre: "Lieu"}, {titre: ""}], aClasser, {
    classe: "serre", vide: "Aucune opération en attente de classement.",
    ligne: o => {
      const cb = h("input", {type: "checkbox", checked: etat.coches.has(o.id), onchange: () => cb.checked ? etat.coches.add(o.id) : etat.coches.delete(o.id)});
      const selCat = selectionCategorie(o.categorie, o.sousCategorie);
      const selLieu = selectionLieu(o.lieu);
      const c2 = o.commercant ? obtenir("commercants", o.commercant) : null;
      const sugg = c2 && c2.variable ? repartitionCommercant(c2) : [];
      return h("tr", {class: o.statut === "a_preciser" ? "choisie" : ""}, h("td", null, cb), h("td", null, dateCourte(o.date)), h("td", null, libelleCompte(o.compte)),
        h("td", null, o.libelle, c2 ? h("span", {class: "libbanque"}, c2.nom) : null), montantCellule(o.montant),
        h("td", null, selCat, sugg.length ? h("div", {class: "suggestions"}, sugg.map(s2 => h("button", {onclick: () => { selCat.value = s2.categorie + "|" + s2.sousCategorie; }}, s2.categorie + " › " + s2.sousCategorie + " (" + Math.round(s2.part * 100) + " %)"))) : null),
        h("td", null, marqueOrigine(o)), h("td", null, selLieu),
        h("td", null, h("button", {class: "mini", onclick: async () => {
          const v = valeurCategorie(selCat); if (v.categorie === "À préciser"){ message("Choisissez une catégorie.", true); return; }
          const corrige = v.categorie !== o.categorie || v.sousCategorie !== o.sousCategorie || selLieu.value !== (o.lieu || "");
          Object.assign(o, v, {lieu: selLieu.value, nature: o.nature && o.nature !== "Revenu" ? o.nature : natureParDefaut(v.categorie)});
          if (natureParDefaut(v.categorie) !== "Courante") o.nature = natureParDefaut(v.categorie);
          validerClassement(o, corrige);
          if (corrige && c2) message("Mémorisé pour « " + c2.nom + " » : " + v.categorie + " › " + v.sousCategorie + (selLieu.value ? ", " + selLieu.value : "") + ".");
          rafraichirEcran();
        }}, "Valider")));
    }}));
  sec.appendChild(h("p", {class: "note"}, "Une correction est retenue par la fiche du fournisseur et appliquée aux opérations suivantes. Pour une règle plus fine (montant, jour du mois…), voir Réglages › Règles."));
  c.appendChild(sec);

  /* 2. Doublons douteux : lignes identiques le même jour hors export LCL */
  const doublons = [];
  for (const g of regrouper(vivants("operations").filter(o => !o.doublonVu && o.origine !== "reprise" && obtenir("comptes", o.compte)?.carte !== "LCL-NV"), o => [o.compte, o.date, versCentimes(o.montant), cleEmpreinte(o.libelle)].join("|")).values())
    if (g.length > 1) doublons.push(g);
  const deux = h("div", {class: "deux"});
  const secD = h("section", {class: "carte"}, h("h2", null, "Doublons douteux (" + doublons.length + ")"));
  if (!doublons.length) secD.appendChild(h("p", {class: "vide"}, "Aucun."));
  for (const g of doublons.slice(0, 10)){
    secD.appendChild(h("div", {style: {marginBottom: ".6rem"}}, h("p", null, g.length + " lignes identiques le " + dateFr(g[0].date) + " sur " + libelleCompte(g[0].compte) + " : « " + g[0].libelle + " », " + euros(g[0].montant) + "."),
      h("div", {class: "outils"}, h("button", {class: "mini", onclick: () => { for (const o of g) enregistrer("operations", Object.assign(o, {doublonVu: true})); rafraichirEcran(); }}, "Garder toutes"),
        h("button", {class: "mini discret", onclick: async () => { if (await confirmer("Supprimer " + (g.length - 1) + " ligne(s) en double ?", "Supprimer", true)){ for (const o of g.slice(1)) supprimer("operations", o.id); enregistrer("operations", Object.assign(g[0], {doublonVu: true})); rafraichirEcran(); } }}, "N'en garder qu'une"))));
  }
  deux.appendChild(secD);
  const js = vivants("justificatifs").filter(j => j.statut === "a_rapprocher");
  const secJ = h("section", {class: "carte"}, h("h2", null, "Justificatifs à rapprocher (" + js.length + ")"));
  const ul = h("ul", {class: "liste-traiter"});
  for (const j of js.slice(0, 8)) ul.appendChild(h("li", null, h("span", null, dateCourte(j.date) + " · " + (j.commercantNom || j.raisonSociale || "?") + " · " + euros(j.montant) +
    (!(j.propositions || []).length ? " · " : ""), !(j.propositions || []).length ? h("em", null, "pas encore au relevé") : null),
    h("button", {class: "mini", onclick: () => aller("justificatifs", {choisi: j.id})}, "Rapprocher")));
  if (!js.length) ul.appendChild(h("li", null, h("span", {class: "discret"}, "Aucun.")));
  secJ.appendChild(ul); deux.appendChild(secJ);
  c.appendChild(deux);

  /* 3. Factures de cartes avec écart */
  const factures = vivants("factures").filter(f => Math.abs(f.ecart || 0) >= 0.01 && !f.ecartVu);
  if (factures.length){
    const s3 = h("section", {class: "carte", style: {marginTop: "1rem"}}, h("h2", null, "Factures de cartes : écarts"));
    s3.appendChild(tableau([{titre: "Arrêté"}, {titre: "Débit"}, {titre: "Facturé", num: true}, {titre: "Détail importé", num: true}, {titre: "Écart", num: true}, {titre: ""}], factures, {ligne: f => h("tr", null,
      h("td", null, dateFr(f.arrete)), h("td", null, dateFr(f.dateDebit)), h("td", {class: "num"}, euros(f.montant)), h("td", {class: "num"}, euros(f.montant - f.ecart)),
      montantCellule(-f.ecart), h("td", null, h("button", {class: "mini", onclick: () => aller("operations", {facture: f.id})}, "Lignes"), " ",
        h("button", {class: "mini discret", onclick: () => { enregistrer("factures", Object.assign(f, {ecartVu: true})); rafraichirEcran(); }}, "Vu")))}));
    s3.appendChild(h("p", {class: "note"}, "Un écart vient d'ordinaire d'un achat de fin de période pas encore présent dans l'export « encours » de la carte : il se résorbe au prochain export. Réimportez la facture après l'export pour recalculer."));
    c.appendChild(s3);
  }

  /* 3 bis. Échéances à confirmer (reprise du classeur, plans) : elles comptent déjà dans les projections */
  const aConfirmer = vivants("echeances").filter(e => e.aConfirmer).sort((a, b) => (a.debut || "") < (b.debut || "") ? -1 : 1);
  if (aConfirmer.length){
    const s5 = h("section", {style: {marginTop: "1rem"}});
    s5.appendChild(h("div", {class: "outils", style: {justifyContent: "space-between", marginBottom: ".4rem"}}, h("h2", {style: {margin: 0}}, "Échéances à confirmer (" + aConfirmer.length + ")"),
      h("button", {class: "discret mini", onclick: () => { for (const e of aConfirmer) enregistrer("echeances", Object.assign(e, {aConfirmer: false})); rafraichirEcran(); }}, "Tout confirmer")));
    s5.appendChild(tableau([{titre: "À partir du"}, {titre: "Échéance"}, {titre: "Vision"}, {titre: "Montant", num: true}, {titre: "Récurrence"}, {titre: ""}], aConfirmer, {classe: "serre", ligne: e =>
      h("tr", null, h("td", null, dateFr(e.debut)), h("td", null, e.libelle, e.note ? h("div", {class: "petit discret"}, e.note) : null),
        h("td", null, e.projet ? "projet " + e.projet : estCapital(e) ? "épargne" : "marche courante"), montantCellule(e.montant), h("td", null, e.recurrence || "unique"),
        h("td", null, h("button", {class: "mini primaire", onclick: () => { enregistrer("echeances", Object.assign(e, {aConfirmer: false})); rafraichirEcran(); }}, "Confirmer"), " ",
          h("button", {class: "mini discret", onclick: () => editerEcheance(e)}, "Modifier")))}));
    s5.appendChild(h("p", {class: "note"}, "Hypothèses reprises du classeur ou d'un plan : elles comptent déjà dans les projections. Confirmez-les une fois montant et date vérifiés, ou modifiez-les."));
    c.appendChild(s5);
  }

  /* 4. Rapprochés automatiquement, réversibles */
  const autos = vivants("justificatifs").filter(j => j.auto && j.statut === "rapproche" && !j.vu).sort((a, b) => (a.rapprocheLe || "") < (b.rapprocheLe || "") ? 1 : -1);
  const s4 = h("section", {style: {marginTop: "1rem"}});
  s4.appendChild(h("div", {class: "outils", style: {justifyContent: "space-between", marginBottom: ".4rem"}}, h("h2", {style: {margin: 0}}, "Rapprochés automatiquement depuis le dernier passage (" + autos.length + ")"),
    autos.length ? h("button", {class: "discret mini", onclick: () => { for (const j of autos) enregistrer("justificatifs", Object.assign(j, {vu: true})); rafraichirEcran(); }}, "Tout marquer comme vu") : null));
  s4.appendChild(tableau([{titre: "Quand"}, {titre: "Justificatif"}, {titre: "Opération"}, {titre: "Montant", num: true}, {titre: ""}], autos, {classe: "serre", vide: "Aucun.", ligne: j => {
    const op = obtenir("operations", (j.operations || [])[0]);
    return h("tr", null, h("td", null, j.rapprocheLe ? dateCourte(j.rapprocheLe.slice(0, 10)) : ""), h("td", null, TYPES_JUSTIF[j.type] || "", " · ", j.commercantNom || j.raisonSociale || ""),
      h("td", null, op ? libelleCompte(op.compte) + " · " + dateCourte(op.date) + " · " + op.libelle : "—"), h("td", {class: "num"}, euros(j.montant)),
      h("td", null, h("button", {class: "mini discret", onclick: () => { delier(j); message("Rapprochement défait : le justificatif revient dans « Justificatifs »."); rafraichirEcran(); }}, "Défaire")));
  }}));
  c.appendChild(s4);
}});
