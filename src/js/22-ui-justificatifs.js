/* ================= Justificatifs : rapprochement et boîte de saisies ================= */
declarerEcran("justificatifs", {titre: "Justificatifs", rendre(c, etat){
  const tous = vivants("justificatifs").sort((a, b) => a.date < b.date ? 1 : -1);
  const aRapprocher = tous.filter(j => j.statut === "a_rapprocher");
  const nbValider = aRapprocher.filter(j => j.aValider).length;
  // File de travail : saisies à valider, sinon justificatifs ayant au moins une opération candidate à trancher
  const attente = nbValider ? aRapprocher.filter(j => j.aValider) : aRapprocher.filter(j => !j.reporte && candidats([j]).length);
  // Fiche refermée : on ne la rouvre pas d'office ; les autres restent proposées
  let j = etat.choisi ? obtenir("justificatifs", etat.choisi) : attente.find(x => x.id !== etat.ferme);
  c.appendChild(entete("Justificatifs", (nbValider ? nbValider + " saisie(s) du téléphone à valider · " : "") + aRapprocher.length + " à rapprocher · " + tous.length + " au total",
    [h("button", {onclick: async () => { const f = await choisirFichier("image/*,application/pdf", true); if (f?.length){ for (const x of f) await importerJustificatifPc(await lireFichier(x)); rafraichirEcran(); } }}, "Ajouter des tickets ou factures…"),
     h("button", {onclick: async () => { const nj = await creerJustificatif({type: "facture", date: aujourdhui(), montant: 0, origine: "pc", sansPiece: true}); etat.choisi = nj.id; message("Saisie sans pièce : complétez-la, puis « Enregistrer la saisie ». La pièce se joindra à réception."); rafraichirEcran(); }}, "Saisie sans pièce"),
     h("button", {class: "discret", onclick: () => { const n = rapprocherTout(); message(n + " rapprochement(s) fait(s) d'office."); rafraichirEcran(); }}, "Relancer le rapprochement")]));
  if (!j){
    c.appendChild(h("p", {class: "vide"}, aRapprocher.length ? "Rien à valider ni à trancher : " + aRapprocher.length + " justificatif(s) attendent leur opération au relevé. Cliquez sur une ligne pour l'ouvrir." : "Aucun justificatif à rapprocher."));
  } else c.appendChild(ecranRapprochement(j, etat, attente));
  c.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Tous les justificatifs"));
  c.appendChild(tableau([{titre: "Date", cle: x => x.date}, {titre: "Type"}, {titre: "Fournisseur", cle: x => x.commercantNom || ""}, {titre: "Nature exacte"}, {titre: "Montant", num: true, cle: x => x.montant},
    {titre: "Origine"}, {titre: "Statut", cle: x => x.statut}], tous, {classe: "serre", limite: 200, ligne: x => h("tr", {class: "cliquable" + (x === j ? " choisie" : ""), onclick: () => { etat.choisi = x.id; rafraichirEcran(); }},
      h("td", null, dateCourte(x.date)), h("td", null, TYPES_JUSTIF[x.type] || ""), h("td", null, (x.commercant && obtenir("commercants", x.commercant)?.nom) || x.commercantNom || x.raisonSociale || "—"), h("td", null, x.natureExacte || ""), h("td", {class: "num"}, euros(x.montant)),
      h("td", null, x.origine === "mobile" ? "téléphone" : x.sansPiece ? "PC, sans pièce" : "PC"), h("td", null, x.statut === "rapproche" ? h("span", {class: "pos"}, x.auto ? "rapproché d'office" : "rapproché") : h("span", {class: "neg"}, x.aValider ? "à valider" : "à rapprocher")))}));
}});

function ecranRapprochement(j, etat, attente){
  const groupe = j.groupe ? vivants("justificatifs").filter(x => x.groupe === j.groupe) : [j];
  const idx = attente.indexOf(j);
  const bloc = h("div");
  bloc.appendChild(h("div", {class: "outils", style: {justifyContent: "space-between", marginBottom: ".6rem"}},
    h("div", null, h("strong", null, (groupe.length > 1 ? "Achat groupé · " : "") + (j.origine === "mobile" ? "Saisie du téléphone" : j.sansPiece ? "Saisie sans pièce" : "Pièce ajoutée sur le PC") + " du " + dateFr(j.date)),
      j.statut === "rapproche" ? h("span", {class: "pos"}, " · rapproché") : null, j.aValider ? h("span", {class: "neg"}, " · à valider : vérifiez et corrigez, puis « Valider la saisie »") : null),
    idx >= 0 ? h("div", {class: "outils"}, h("button", {class: "discret", disabled: idx <= 0, onclick: () => { etat.choisi = attente[idx - 1].id; rafraichirEcran(); }}, "‹ Précédent"),
      h("span", {class: "discret"}, (idx + 1) + " sur " + attente.length),
      h("button", {class: "discret", disabled: idx >= attente.length - 1, onclick: () => { etat.choisi = attente[idx + 1].id; rafraichirEcran(); }}, "Suivant ›")) : null,
    h("button", {class: "discret", title: "Refermer la fiche sans rien enregistrer", onclick: () => { etat.choisi = null; etat.ferme = j.id; rafraichirEcran(); }}, "Fermer ✕")));
  const grille = h("div", {class: "trois rappro"});
  // 1. Pièces
  const pieces = h("section", null, h("h2", null, groupe.length > 1 ? "Tickets" : "Pièce"));
  for (const x of groupe){
    const cadre = h("div", {class: "ticket", style: {marginBottom: ".6rem"}}, h("span", {class: "discret"}, "chargement…"));
    pieces.appendChild(cadre);
    lirePiece(x.id).then(p => { vider(cadre); if (!p) cadre.append(h("span", {class: "discret"}, x.sansPiece ? "pièce attendue" : "pièce absente sur cet appareil"), h("br"),
        h("button", {class: "mini", style: {marginTop: ".4rem"}, onclick: async () => {
          const f = await choisirFichier("image/*,application/pdf", false); if (!f) return;
          const lu = await lireFichier(f);
          await enregistrerPiece(x.id, lu.octets, lu.genre === "image" ? lu.mime : "application/pdf");
          const t = lu.texte ? extraireTicket(lu.texte) : null;
          Object.assign(x, {sansPiece: false}, t?.numero && !x.numero ? {numero: t.numero} : {}, t?.texte && !x.texteOCR ? {texteOCR: t.texte} : {});
          enregistrer("justificatifs", x); message("Pièce jointe" + (t?.numero ? " (facture n° " + t.numero + ")" : "") + "."); rafraichirEcran();
        }}, "Joindre la pièce…"));
      else if (p.mime === "application/pdf") cadre.appendChild(h("a", {href: URL.createObjectURL(new Blob([p.octets], {type: p.mime})), target: "_blank", rel: "noopener"}, "Ouvrir le PDF"));
      else cadre.appendChild(h("img", {src: URL.createObjectURL(new Blob([p.octets], {type: p.mime})), alt: "Ticket"})); }).catch(() => { vider(cadre).appendChild(h("span", {class: "discret"}, "pièce illisible")); });
  }
  grille.appendChild(pieces);
  // 2. Lecture et saisie
  const saisie = h("section", null, h("h2", null, "Lecture et saisie"));
  const champsParJ = [];
  groupe.forEach((x, k) => {
    if (groupe.length > 1) saisie.appendChild(h("h3", null, "Ticket " + (k + 1)));
    const type = selection(Object.entries(TYPES_JUSTIF), x.type);
    const montant = h("input", {type: "text", value: nombre(x.montant)});
    const date = champDate({value: x.date});
    // Fournisseur : liste déroulante des fournisseurs enregistrés (par catégorie), ou « Nouveau fournisseur… »
    const cm = h("input", {type: "text", value: x.commercantNom || "", autocomplete: "off", placeholder: "nom du nouveau fournisseur"});
    const fiches = vivants("commercants").filter(f => f.nom).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    const connu = (x.commercant && obtenir("commercants", x.commercant)) || fiches.find(f => norm(f.nom) === norm(x.commercantNom || ""));
    const selF = h("select", null, h("option", {value: ""}, "— choisir un fournisseur —"),
      [...new Set(fiches.map(f => f.categorie || "Sans catégorie"))].sort((a, b) => a.localeCompare(b, "fr")).map(g => h("optgroup", {label: g},
        fiches.filter(f => (f.categorie || "Sans catégorie") === g).map(f => h("option", {value: f.id, selected: connu?.id === f.id}, f.nom)))),
      h("option", {value: "__nouveau__", selected: !connu && !!x.commercantNom}, "Nouveau fournisseur…"));
    cm.hidden = !!connu || !x.commercantNom;
    const listeF = selF;
    const nat = h("input", {type: "text", value: x.natureExacte || "", placeholder: "ce qui a été acheté"});
    const num = h("input", {type: "text", value: x.numero || "", placeholder: "n° de facture", style: {width: "12rem"}});
    const fiche = x.commercant ? obtenir("commercants", x.commercant) : null;
    const sugg = h("div", {class: "suggestions", style: {margin: ".2rem 0 .3rem 8rem"}});
    for (const [n] of Object.entries(fiche?.natures || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)) sugg.appendChild(h("button", {onclick: () => { nat.value = n; }}, n));
    const cat = selectionCategorie(x.categorie || fiche?.categorie || "", x.sousCategorie || fiche?.sousCategorie || "");
    const lieu = selectionLieu(x.lieu || fiche?.lieu || "");
    selF.addEventListener("change", () => {
      if (selF.value === "__nouveau__"){ cm.hidden = false; cm.value = ""; cm.focus(); return; }
      const f = obtenir("commercants", selF.value); cm.hidden = true; cm.value = f ? f.nom : "";
      if (f?.categorie && cat.value.startsWith("À préciser")){ const v = f.categorie + "|" + (f.sousCategorie || ""); if ([...cat.options].some(o => o.value === v)) cat.value = v; }
      if (f?.lieu && !lieu.value) lieu.value = f.lieu;
    });
    const carte = selection([["", "—"], ...vivants("comptes").filter(c => c.type === "carte" && c.carte !== "LCL-NV").map(c => [c.carte, c.nom]),
      ...comptesDeType("courant").flatMap(c => [["CPT:" + c.id, "Virement ou prélèvement · " + c.nom], ["CHQ:" + c.id, "Chèque · " + c.nom]]), ["ESPECES", "Espèces"]], x.carte || "");
    const cheque = h("input", {type: "text", inputmode: "numeric", value: x.cheque || "", placeholder: "n° du chèque", style: {width: "9rem"}});
    const ligneCheque = h("div", {class: "champ-ocr", hidden: !String(x.carte || "").startsWith("CHQ:")}, h("label", null, "N° de chèque"), cheque, h("span", {class: "confiance"}, "pour le rapprochement"));
    carte.addEventListener("change", () => { ligneCheque.hidden = !carte.value.startsWith("CHQ:"); });
    const ligneOcr = (lib, ctl, conf) => h("div", {class: "champ-ocr"}, h("label", null, lib), ctl, h("span", {class: "confiance"}, conf || ""));
    saisie.append(ligneOcr("Type", type, "reconnu"), ligneOcr("Montant", montant, x.origine === "mobile" || x.sansPiece ? "saisi" : "lu"), ligneOcr("Date", date, x.heure ? "heure " + x.heure : ""), ligneOcr("N° de facture", num, x.numero ? "lu" : ""),
      ligneOcr("Raison sociale lue", h("input", {type: "text", value: x.raisonSociale || "", readonly: true}), "lu, conservé"),
      ligneOcr("Fournisseur", h("span", {class: "pile"}, listeF, cm), connu ? "fichier des fournisseurs" : x.commercantNom ? (x.origine === "mobile" ? "provisoire, saisi sur le téléphone : à confirmer" : "nouveau, lu sur la pièce") : ""), ligneOcr("Nature exacte", nat, ""), sugg,
      ligneOcr("Catégorie", cat, fiche?.categorie ? "par défaut du fournisseur" : ""), ligneOcr("Lieu", lieu, ""), ligneOcr("Payé avec", carte, x.carte4 ? "carte ****" + x.carte4 : ""), ligneCheque);
    champsParJ.push({x, type, montant, date, cm, nat, cat, lieu, carte, cheque, num});
  });
  const enregistrerSaisie = () => {
    for (const f of champsParJ){
      const ancienNom = f.x.commercantNom;
      if (!dateSaisieOk(f.date, "Date")) return false;
      Object.assign(f.x, {type: f.type.value, montant: Math.abs(lireMontant(f.montant.value) || 0), date: f.date.value, commercantNom: f.cm.value.trim(), natureExacte: f.nat.value.trim(),
        lieu: f.lieu.value, numero: cleNumero(f.num.value), fournisseurProvisoire: false, aValider: false, carte: f.carte.value, cheque: f.carte.value.startsWith("CHQ:") ? f.cheque.value.replace(/\D/g, "") : ""}, valeurCategorie(f.cat));
      if (f.x.categorie === "À préciser") f.x.categorie = "";
      // Le fournisseur est créé (ou rattaché) à la validation, y compris un nom resté provisoire
      if (f.x.commercantNom && (f.x.commercantNom !== ancienNom || !f.x.commercant)){
        let fiche = vivants("commercants").find(c => norm(c.nom) === norm(f.x.commercantNom)) || (f.x.commercant ? obtenir("commercants", f.x.commercant) : null);
        if (!fiche) fiche = enregistrer("commercants", {nom: f.x.commercantNom, alias: [], stats: {}, natures: {}});
        else if (norm(fiche.nom) !== norm(f.x.commercantNom) && f.x.commercant === fiche.id) { fiche.nom = f.x.commercantNom; enregistrer("commercants", fiche); }
        if (f.x.raisonSociale && nomPlausible(f.x.raisonSociale) && ajouterAlias(fiche, f.x.raisonSociale)) message("Mémorisé : « " + f.x.raisonSociale + " » = " + fiche.nom + ".");
        f.x.commercant = fiche.id; invaliderIndex();
      }
      enregistrer("justificatifs", f.x);
      if (apprendreChiffresCarte(f.x.carte4, f.x.carte)) message("Mémorisé : carte ****" + String(f.x.carte4).slice(-4) + " = " + libelleMoyen(f.x.carte) + ".");
      if (f.x.carte === "ESPECES" && !(f.x.operations || []).length) creerOperationEspeces(f.x);
    }
  };
  saisie.appendChild(h("div", {class: "outils", style: {marginTop: ".6rem"}}, h("button", {class: "mini" + (j.aValider ? " primaire" : ""), onclick: () => { const v = groupe.some(x => x.aValider); if (enregistrerSaisie() === false) return;
      if (v){ const n = rapprocherTout(); message("Saisie validée" + (n ? " ; " + n + " rapprochement(s) fait(s) d'office." : "."));
        // Saisie suivante à valider, sinon justificatif suivant
        const suivant = attente.find(x => x.aValider && !groupe.includes(x)) || attente[idx + 1]; etat.choisi = suivant ? suivant.id : null;
      } else { message("Saisie enregistrée."); etat.choisi = null; } rafraichirEcran(); }}, j.aValider ? "Valider la saisie" : "Enregistrer la saisie"),
    h("button", {class: "mini danger", onclick: async () => { if (await confirmer("Supprimer ce justificatif ?", "Supprimer", true)){ for (const x of groupe){ delier(x); supprimer("justificatifs", x.id); } etat.choisi = null; rafraichirEcran(); } }}, "Supprimer")));
  if (j.texteOCR) saisie.appendChild(h("details", {style: {marginTop: ".5rem"}}, h("summary", {class: "petit"}, "Texte lu sur la pièce"), h("div", {class: "texte-brut"}, j.texteOCR)));
  grille.appendChild(saisie);
  // 3. Candidats
  const cand = h("section", null, h("h2", null, "Opérations candidates"));
  if (j.statut === "rapproche"){
    const op = obtenir("operations", (j.operations || [])[0]);
    cand.append(h("p", null, "Rapproché de : ", op ? libelleCompte(op.compte) + " · " + dateFr(op.date) + " · " + op.libelle + " · " + euros(op.montant) : "—"),
      h("button", {class: "discret", onclick: () => { for (const x of groupe) delier(x); rafraichirEcran(); }}, "Défaire le rapprochement"));
  } else {
    const liste = candidats(groupe);
    const propositionsGroupe = (j.propositions || []).filter(p => p.groupe && p.groupe.length > 1 && !j.groupe);
    for (const p of propositionsGroupe){
      const op = obtenir("operations", p.op); if (!op) continue;
      const js2 = p.groupe.map(id => obtenir("justificatifs", id)).filter(Boolean);
      cand.appendChild(h("div", {class: "candidat meilleur"}, h("div", null, h("strong", null, "Achat groupé"), " · " + js2.map(x => nombre(x.montant)).join(" + ") + " = ", h("strong", null, euros(-op.montant)),
        h("br"), h("span", {class: "petit"}, libelleCompte(op.compte) + " · " + dateCourte(op.date) + " · " + op.libelle), h("br"), h("span", {class: "petit discret"}, "même jour · même carte · un seul paiement")),
        h("div", {style: {textAlign: "right"}}, h("div", {class: "score"}, p.score + " %"), h("button", {class: "mini primaire", onclick: () => { if (enregistrerSaisie() === false) return; lier(js2, op, false); rafraichirEcran(); }}, "Rapprocher"))));
    }
    liste.forEach((x, i) => {
      cand.appendChild(h("div", {class: "candidat" + (i === 0 && !propositionsGroupe.length ? " meilleur" : "")}, h("div", null, libelleCompte(x.op.compte) + " · " + dateCourte(x.op.date) + " · " + x.op.libelle, h("br"),
        h("span", {class: "petit"}, euros(x.op.montant) + " · écart de date " + (x.ecart > 0 ? "+" : "") + x.ecart + " j" + (x.sim > 0.4 ? " · nom proche" : ""))),
        h("div", {style: {textAlign: "right"}}, h("div", {class: "score"}, x.score + " %"), h("button", {class: "mini" + (i === 0 ? " primaire" : ""), onclick: () => { if (enregistrerSaisie() === false) return; lier(groupe, x.op, false); rafraichirEcran(); }}, "Rapprocher"))));
    });
    if (!liste.length && !propositionsGroupe.length) cand.appendChild(h("p", {class: "vide"}, "Aucune opération de " + euros(somme(groupe, x => x.montant)) + " dans la fenêtre de dates. Le relevé n'est peut-être pas encore importé."));
    const [av, ap] = fenetre(j);
    cand.appendChild(h("p", {class: "note"}, "Recherche : montant exact (seul ou en somme), carte cohérente, date −" + av + " / +" + ap + " jours (" + (j.type === "facture" ? "facture" : "ticket ou facturette") + "). Un seul candidat sûr : rapproché d'office."));
    cand.appendChild(h("div", {class: "outils", style: {marginTop: ".6rem"}},
      h("button", {class: "discret", onclick: () => { if (enregistrerSaisie() === false) return; for (const x of groupe) x.carte = "ESPECES"; groupe.forEach(x => { if (!(x.operations || []).length) creerOperationEspeces(x); }); rafraichirEcran(); }}, "Aucune : paiement en espèces"),
      h("button", {class: "discret", onclick: () => { if (enregistrerSaisie() === false) return; for (const x of groupe) enregistrer("justificatifs", Object.assign(x, {reporte: aujourdhui()})); const suivant = attente[idx + 1]; etat.choisi = suivant ? suivant.id : null; rafraichirEcran(); }}, "Reporter")));
  }
  grille.appendChild(cand);
  bloc.appendChild(grille);
  return bloc;
}

/* ---------- Boîte de saisies ---------- */
declarerEcran("boite", {titre: "Boîte de saisies", rendre(c){
  c.appendChild(entete("Boîte de saisies", "Dépôts chiffrés du téléphone, lus par ce PC. Reprises, elles arrivent dans Justificatifs « à valider », où tout se corrige ; le dépôt part dans « boite/traitees » : conservé, jamais effacé.",
    [h("button", {class: "discret", onclick: async () => { await actualiserBoite(); message(BOITE_CACHE.length + " saisie(s) en attente."); rafraichirEcran(); }}, "Relire la boîte"),
     BOITE_CACHE.length ? h("button", {class: "primaire", onclick: async (e) => {
       e.target.disabled = true;
       try { const r = await fusionnerBoite(BOITE_CACHE); BOITE_CACHE = []; message(r.justificatifs + " saisie(s) reprise(s), à valider dans Justificatifs."); await actualiserBoite(); aller("justificatifs"); return; }
       catch (err){ message(err.message, true); }
       await actualiserBoite(); rafraichirEcran();
     }}, "Reprendre pour validation") : null]));
  if (SESSION.adaptateur?.nom === "local") c.appendChild(h("div", {class: "bandeau info"}, "Le stockage « ce navigateur seulement » ne reçoit pas les saisies du téléphone : choisissez le dossier OneDrive dans les Réglages."));
  c.appendChild(tableau([{titre: "Déposée le"}, {titre: "Date"}, {titre: "Fournisseur"}, {titre: "Nature exacte"}, {titre: "Montant", num: true}, {titre: "Catégorie"}, {titre: "Payé avec"}, {titre: "Tickets", num: true}], BOITE_CACHE, {
    vide: "La boîte est vide.", ligne: e => {
      if (e.erreur) return h("tr", null, h("td", {colspan: 8, class: "neg"}, e.nom + " : illisible (" + e.erreur + ")"));
      const s2 = e.saisie; const t = s2.tickets || [];
      return h("tr", null, h("td", null, s2.creeLe ? new Date(s2.creeLe).toLocaleString("fr-FR", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) : ""),
        h("td", null, dateCourte(t[0]?.date || s2.date)), h("td", null, t.map(x => x.commercant || x.raisonSociale).join(" + ")), h("td", null, t.map(x => x.natureExacte).filter(Boolean).join(" ; ")),
        h("td", {class: "num"}, euros(somme(t, x => Math.abs(lireMontant(x.montant)) || 0))), h("td", null, s2.categorie ? s2.categorie + " › " + s2.sousCategorie : "—"),
        h("td", null, s2.carte === "ESPECES" ? "Espèces" : s2.carte || "—"), h("td", {class: "num"}, String(t.length)));
    }}));
  c.appendChild(h("p", {class: "note"}, "Une saisie sans opération au relevé après " + LIVRE.parametres.delaiSansOperation + " jours remonte dans « À traiter » (paiement en espèces, relevé manquant)."));
}});
