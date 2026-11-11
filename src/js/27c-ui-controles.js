/* ================= Écran « Contrôles » =================
   Contrôles par total (pièces qui font foi) en tête, puis contrôles de forme. Chaque alerte renvoie aux opérations
   en cause ; rien n'est corrigé d'ici, sinon l'écart d'une alerte reconnue sans objet. */
async function dialogueControle(c){
  const x = c || {sens: "credit", debut: (Number(aujourdhui().slice(0, 4)) - 1) + "-01-01", fin: (Number(aujourdhui().slice(0, 4)) - 1) + "-12-31"};
  const libelle = h("input", {type: "text", value: x.libelle || "", placeholder: "ex. Relevé annuel des paiements de la caisse"});
  const fiches = vivants("commercants").sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map(f => [f.id, f.nom]);
  const fiche = selection([["", "— choisir —"], ...fiches], x.commercant || "");
  const du = champDate({value: x.debut}), au = champDate({value: x.fin});
  const montant = h("input", {type: "text", inputmode: "decimal", value: x.montant ? nombre(x.montant) : ""});
  const sens = selection([["credit", "Sommes reçues (pension, salaire, remboursement)"], ["debit", "Sommes payées (échéancier, abonnement)"]], x.sens);
  const fichier = h("input", {type: "file", accept: "application/pdf,image/*"});
  const ok = await dialogue({titre: c ? "Modifier le contrôle" : "Nouveau contrôle par total", large: true, corps: h("div", null,
      h("p", {class: "note"}, "Le total d'une pièce qui fait foi est comparé à la somme des opérations du fournisseur sur la période. Prenez le montant réellement versé ou payé (net versé, après prélèvement à la source), pas le net imposable."),
      champ("Pièce", libelle), champ("Fournisseur", fiche), h("div", {style: {display: "flex", gap: "1rem", flexWrap: "wrap"}}, champ("Du", du), champ("Au", au)),
      champ("Total de la pièce (€)", montant), champ("Sens", sens), champ("Joindre la pièce (facultatif)", fichier, c ? "Laisser vide pour garder la pièce déjà jointe." : null)),
    actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Enregistrer", classe: "primaire", action: () => {
      if (!fiche.value || !du.value || !au.value || !lireMontant(montant.value)){ message("Indiquez le fournisseur, la période et le total.", true); return false; }
      if (au.value < du.value){ message("La fin de la période précède son début.", true); return false; }
      return true;
    }}]});
  if (!ok) return;
  const f = obtenir("commercants", fiche.value);
  const r = enregistrer("controles", Object.assign(x, {libelle: libelle.value.trim() || "Pièce sans titre", commercant: f.id, commercantNom: f.nom,
    debut: du.value, fin: au.value, montant: Math.abs(lireMontant(montant.value)), sens: sens.value}));
  const fi = fichier.files && fichier.files[0];
  if (fi){
    try { await enregistrerPiece(r.id, new Uint8Array(await fi.arrayBuffer()), fi.type || "application/pdf"); r.piece = true; enregistrer("controles", r); }
    catch (e){ message("Pièce non enregistrée : " + e.message, true); }
  }
  rafraichirEcran();
}

declarerEcran("controles", {titre: "Contrôles", rendre(c){
  const totaux = vivants("controles").map(x => Object.assign({controle: x}, resultatControle(x))).sort((a, b) => (a.ok - b.ok) || (a.controle.fin < b.controle.fin ? 1 : -1));
  const doublons = doublonsOperations(), classements = classementsIncoherents(), trous = periodesNonCloturees();
  const nbAlertes = totaux.filter(t => !t.ok).length + doublons.length + classements.length + trous.length;
  c.appendChild(entete("Contrôles", nbAlertes ? nbAlertes + " point(s) à examiner" : "Aucune alerte",
    [h("button", {class: "primaire", onclick: () => dialogueControle(null)}, "Nouveau contrôle par total…")]));
  const ignorer = k => h("button", {class: "mini discret", title: "Ce n'est pas une erreur : ne plus signaler", onclick: e => { e.stopPropagation(); ignorerControle(k); rafraichirEcran(); }}, "Pas une erreur");
  const voirOps = (recherche, compte) => aller("operations", {recherche, compte: compte || "", mois: "", categorie: ""});

  // 1. Contrôles par total
  c.appendChild(h("h2", null, "Contrôles par total (" + totaux.length + ")"));
  c.appendChild(h("p", {class: "note"}, "Une pièce qui fait foi (relevé annuel des paiements d'une caisse, bulletin de paie de décembre, échéancier, avis d'impôt…) donne un total pour un fournisseur et une période ; l'écart montre l'opération manquante, en double ou mal rattachée."));
  c.appendChild(tableau([{titre: "Pièce"}, {titre: "Fournisseur"}, {titre: "Période"}, {titre: "Pièce", num: true}, {titre: "Opérations", num: true}, {titre: "Écart", num: true}, {titre: ""}], totaux,
    {classe: "serre", vide: "Aucun contrôle par total : « Nouveau contrôle par total… » pour en créer un.", ligne: t => h("tr", null,
      h("td", null, t.controle.libelle), h("td", null, t.fiche ? t.fiche.nom : h("span", {class: "neg"}, (t.controle.commercantNom || "?") + " (fiche introuvable)")),
      h("td", null, dateFr(t.controle.debut) + " – " + dateFr(t.controle.fin)), h("td", {class: "num"}, euros(t.attendu)),
      h("td", {class: "num"}, euros(t.constate) + " (" + t.ops.length + ")"),
      h("td", {class: "num " + (t.ok ? "pos" : "neg")}, t.ok ? "✓" : eurosSigne(t.ecart)),
      h("td", null, h("button", {class: "mini discret", onclick: () => voirOps(t.fiche ? t.fiche.nom : "")}, "Opérations"),
        t.controle.piece ? h("button", {class: "mini discret", onclick: () => voirPiece({id: t.controle.id, type: "", date: t.controle.fin, montant: t.controle.montant, commercantNom: t.controle.libelle})}, "Pièce") : null,
        h("button", {class: "mini discret", onclick: () => dialogueControle(t.controle)}, "Modifier"),
        h("button", {class: "mini danger", onclick: async () => { if (await confirmer("Supprimer ce contrôle ? Les opérations ne changent pas.", "Supprimer", true)){ supprimer("controles", t.controle.id); rafraichirEcran(); } }}, "Supprimer")))}));

  // 2. Opérations en double
  c.appendChild(h("h2", null, "Opérations importées en double (" + doublons.length + ")"));
  c.appendChild(h("p", {class: "note"}, "Même compte, même date, même montant, libellés de même début : souvent une même opération venue de deux exports. Deux achats réellement identiques du même jour (deux abonnements, deux lignes de téléphone) : « Pas une erreur »."));
  c.appendChild(tableau([{titre: "Date"}, {titre: "Compte"}, {titre: "Libellé"}, {titre: "Montant", num: true}, {titre: "Nombre", num: true}, {titre: ""}], doublons,
    {classe: "serre", vide: "Aucun doublon.", ligne: d => { const o = d.ops[0]; return h("tr", null, h("td", null, dateFr(o.date)), h("td", null, obtenir("comptes", o.compte)?.nom || ""),
      h("td", null, o.libelle), h("td", {class: "num"}, euros(o.montant)), h("td", {class: "num"}, d.ops.length),
      h("td", null, h("button", {class: "mini discret", onclick: () => voirOps(o.libelle.slice(0, 24), o.compte)}, "Voir"), ignorer(d.cle))); }}));

  // 3. Classements contradictoires
  c.appendChild(h("h2", null, "Classements contradictoires (" + classements.length + ")"));
  c.appendChild(tableau([{titre: "Date"}, {titre: "Libellé"}, {titre: "Montant", num: true}, {titre: "Classement"}, {titre: "Motif"}, {titre: ""}], classements,
    {classe: "serre", vide: "Aucun.", ligne: x => h("tr", null, h("td", null, dateFr(x.op.date)), h("td", null, x.op.libelle), h("td", {class: "num"}, euros(x.op.montant)),
      h("td", null, x.op.categorie + (x.op.sousCategorie ? " › " + x.op.sousCategorie : "") + " · " + (x.op.nature || "")), h("td", {class: "neg"}, x.motif),
      h("td", null, h("button", {class: "mini discret", onclick: () => voirOps(x.op.libelle.slice(0, 24), x.op.compte)}, "Voir"), ignorer(x.cle)))}));

  // 4. Périodes non clôturées
  c.appendChild(h("h2", null, "Périodes non clôturées sur relevé PDF (" + trous.length + ")"));
  c.appendChild(h("p", {class: "note"}, "Comptes déjà clôturés au moins une fois : périodes sans relevé PDF rapproché, jusqu'à la fin de l'avant-dernier mois. Déposez le relevé dans Importer pour la clôturer."));
  c.appendChild(tableau([{titre: "Compte"}, {titre: "Période"}, {titre: ""}], trous,
    {classe: "serre", vide: "Aucune.", ligne: x => h("tr", null, h("td", null, x.compte.nom), h("td", null, dateFr(x.debut) + " – " + dateFr(x.fin)), h("td", null, ignorer(x.cle)))}));
}});
