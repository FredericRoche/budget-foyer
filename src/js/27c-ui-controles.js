/* ================= Écran « Contrôles » =================
   Contrôles par total (pièces qui font foi) en tête, puis contrôles de forme. Chaque alerte renvoie aux opérations
   en cause ; rien n'est corrigé d'ici, sinon l'écart d'une alerte reconnue sans objet. */
/* Dossier des documents (par exemple le dossier de classement de tout le foyer) : propre à chaque appareil, lu
   seulement. Une pièce de contrôle y est désignée par son chemin relatif : aucune copie n'est faite, et le même
   chemin vaut sur un autre poste dont le dossier de classement a la même arborescence. */
const DOSSIER_DOCUMENTS = {cle: "documents_racine", libelle: "Dossier des documents"};
async function choisirDossierDocuments(){
  const d = await window.showDirectoryPicker({id: "bf-documents", mode: "read", startIn: "documents"});
  await definirReglage(DOSSIER_DOCUMENTS.cle, d);
  return d;
}
async function dossierDocuments(interactif){
  let d = await reglage(DOSSIER_DOCUMENTS.cle, null);
  if (!d){ if (!interactif || !window.showDirectoryPicker) return null; d = await choisirDossierDocuments(); }
  let p = await d.queryPermission({mode: "read"});
  if (p !== "granted" && interactif) p = await d.requestPermission({mode: "read"});
  return p === "granted" ? d : null;
}
async function choisirPieceDocuments(){
  const racine = await dossierDocuments(true);
  if (!racine) throw new Error("Dossier des documents non accessible sur cet appareil.");
  const [f] = await window.showOpenFilePicker({id: "bf-piece-controle", startIn: racine, types: [{description: "Pièces", accept: {"application/pdf": [".pdf"], "image/*": [".jpg", ".jpeg", ".png"]}}]});
  const parts = await racine.resolve(f);
  if (!parts) throw new Error("Le fichier choisi n'est pas dans le dossier des documents (« " + racine.name + " »).");
  return parts.join("/");
}
async function ouvrirPieceDocuments(chemin){
  const racine = await dossierDocuments(true);
  if (!racine) throw new Error("Dossier des documents non accessible sur cet appareil (Réglages › Dossiers d'import).");
  const parts = chemin.split("/");
  let d = racine;
  try {
    for (const n of parts.slice(0, -1)) d = await d.getDirectoryHandle(n);
    const fichier = await (await d.getFileHandle(parts[parts.length - 1])).getFile();
    window.open(URL.createObjectURL(fichier), "_blank", "noopener");
  } catch (e){ throw new Error("Pièce introuvable : « " + chemin + " » dans « " + racine.name + " » (déplacée ou renommée ?)."); }
}

/* Recherche des pièces : l'arborescence du dossier des documents (PDF seulement, dossiers « zz… » écartés) est
   lue une fois par séance ; une pièce est d'autant plus probable que son chemin porte les mots du fournisseur
   (nom et alias), l'année de la période, et qu'elle est rangée là où la pièce précédente de ce fournisseur l'était. */
let INDEX_DOCUMENTS = null;
async function indexDocuments(racine){
  if (INDEX_DOCUMENTS && INDEX_DOCUMENTS.racine === racine) return INDEX_DOCUMENTS.fichiers;
  const fichiers = [];
  const parcourir = async (d, prefixe, niveau) => {
    for await (const [nom, e] of d.entries()){
      if (/^(zz|\.|~\$)/i.test(nom)) continue;
      const c = prefixe ? prefixe + "/" + nom : nom;
      if (e.kind === "directory"){ if (niveau < 8) await parcourir(e, c, niveau + 1); }
      else if (/\.pdf$/i.test(nom)) fichiers.push(c);
    }
  };
  await parcourir(racine, "", 1);
  INDEX_DOCUMENTS = {racine, fichiers};
  return fichiers;
}
function piecesProbables(fiche, annee, fichiers){
  // Poids d'un mot selon sa rareté dans le dossier ; au-delà d'un vingtième des chemins (« retraite » pour tout
  // un dossier, « assurance »), il ne distingue rien et compte pour zéro
  const seuil = Math.max(5, fichiers.length / 20);
  const chemins = fichiers.map(norm);
  const mots = [...new Set([fiche.nom, ...(fiche.alias || [])].flatMap(motsSignificatifs))].slice(0, 12)
    .map(m => ({m, k: chemins.reduce((k, c) => k + (c.includes(m) ? 1 : 0), 0)})).filter(x => x.k && x.k <= seuil)
    .map(x => ({m: x.m, poids: Math.log(fichiers.length / x.k)}));
  const dossier = fiche.dossierPieces || "";
  return fichiers.map((chemin, i) => {
    const n = chemins[i], nomF = norm(chemin.split("/").pop());
    let s = 0;
    for (const {m, poids} of mots) if (nomF.includes(m)) s += 1.5 * poids; else if (n.includes(m)) s += poids;
    const memeDossier = dossier && chemin.slice(0, chemin.lastIndexOf("/")) === dossier;
    if (!s && !memeDossier) return null;
    if (memeDossier) s += 3;
    if (/paiement|attestation|releve|bulletin|decompte|echeancier|recapitulatif|avis/.test(nomF)) s += 1.5;
    if (annee){
      if (nomF.includes(annee)) s += 2; else if (n.includes(annee)) s += 1;
      else if (/(19|20)\d\d/.test(nomF)) s -= 2;
    }
    return {chemin, score: s};
  }).filter(x => x && x.score > 0).sort((a, b) => b.score - a.score || a.chemin.localeCompare(b.chemin, "fr")).slice(0, 8);
}

async function dialogueControle(c){
  const x = c || {sens: "credit", debut: (Number(aujourdhui().slice(0, 4)) - 1) + "-01-01", fin: (Number(aujourdhui().slice(0, 4)) - 1) + "-12-31"};
  const libelle = h("input", {type: "text", value: x.libelle || "", placeholder: "ex. Relevé annuel des paiements de la caisse"});
  const fiches = vivants("commercants").sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map(f => [f.id, f.nom]);
  const fiche = selection([["", "— choisir —"], ...fiches], x.commercant || "");
  const du = champDate({value: x.debut}), au = champDate({value: x.fin});
  const montant = h("input", {type: "text", inputmode: "decimal", value: x.montant ? nombre(x.montant) : ""});
  const sens = selection([["credit", "Sommes reçues (pension, salaire, remboursement)"], ["debit", "Sommes payées (échéancier, abonnement)"]], x.sens);
  const fichier = h("input", {type: "file", accept: "application/pdf,image/*"});
  let chemin = x.chemin || "";
  const zoneChemin = h("span", {class: chemin ? "" : "discret"}, chemin || "aucune");
  const lier = h("button", {class: "mini", type: "button", onclick: async () => {
    try { chemin = await choisirPieceDocuments(); zoneChemin.textContent = chemin; zoneChemin.className = ""; }
    catch (e){ if (e.name !== "AbortError") message(e.message, true); }
  }}, "Choisir dans le dossier des documents…");
  const propositions = h("div", {class: "petit"});
  const chercher = async interactif => {
    vider(propositions);
    const f = obtenir("commercants", fiche.value); if (!f) return;
    let racine = null;
    try { racine = await dossierDocuments(interactif); } catch (e){ if (e.name !== "AbortError") message(e.message, true); return; }
    if (!racine){ if (interactif) message("Dossier des documents non accessible.", true); return; }
    propositions.appendChild(h("span", {class: "discret"}, "Recherche dans « " + racine.name + " »…"));
    const liste = piecesProbables(f, (au.value || du.value || "").slice(0, 4), await indexDocuments(racine));
    vider(propositions);
    if (!liste.length){ propositions.appendChild(h("span", {class: "discret"}, "Aucune pièce trouvée à ce nom : « Choisir dans le dossier des documents… »")); return; }
    propositions.appendChild(h("div", {class: "discret"}, "Pièces probables (cliquer pour retenir) :"));
    for (const p of liste) propositions.appendChild(h("div", null, h("a", {href: "#", onclick: e => {
      e.preventDefault(); chemin = p.chemin; zoneChemin.textContent = chemin; zoneChemin.className = "";
      if (!libelle.value.trim()) libelle.value = p.chemin.split("/").pop().replace(/\.pdf$/i, "");
    }}, p.chemin)));
  };
  fiche.addEventListener("change", () => chercher(false));
  const boutonChercher = h("button", {class: "mini discret", type: "button", onclick: () => chercher(true)}, "Chercher dans mes documents");
  const ok = await dialogue({titre: c ? "Modifier le contrôle" : "Nouveau contrôle par total", large: true, corps: h("div", null,
      h("p", {class: "note"}, "Le total d'une pièce qui fait foi est comparé à la somme des opérations du fournisseur sur la période. Prenez le montant réellement versé ou payé (net versé, après prélèvement à la source), pas le net imposable."),
      champ("Pièce", libelle), champ("Fournisseur", fiche), h("div", {style: {display: "flex", gap: "1rem", flexWrap: "wrap"}}, champ("Du", du), champ("Au", au)),
      champ("Total de la pièce (€)", montant), champ("Sens", sens),
      champ("Pièce dans vos documents (conseillé)", h("div", null, boutonChercher, " ", lier, h("div", null, "Retenue : ", zoneChemin), propositions), "Le fichier reste où il est classé : l'application garde seulement son chemin, sans copie. Les pièces probables se proposent dès le choix du fournisseur."),
      champ("Ou joindre une copie (si le fichier n'est pas classé)", fichier, c ? "Laisser vide pour garder la copie déjà jointe." : null)),
    actions: [{libelle: "Annuler", classe: "discret", valeur: false}, {libelle: "Enregistrer", classe: "primaire", action: () => {
      if (!fiche.value || !du.value || !au.value || !lireMontant(montant.value)){ message("Indiquez le fournisseur, la période et le total.", true); return false; }
      if (au.value < du.value){ message("La fin de la période précède son début.", true); return false; }
      return true;
    }}]});
  if (!ok) return;
  const f = obtenir("commercants", fiche.value);
  const r = enregistrer("controles", Object.assign(x, {libelle: libelle.value.trim() || "Pièce sans titre", commercant: f.id, commercantNom: f.nom,
    debut: du.value, fin: au.value, montant: Math.abs(lireMontant(montant.value)), sens: sens.value, chemin}));
  // Le dossier de la pièce est retenu sur la fiche : la pièce de l'année suivante y sera cherchée en premier
  if (chemin && chemin.includes("/")){ f.dossierPieces = chemin.slice(0, chemin.lastIndexOf("/")); enregistrer("commercants", f); }
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
        t.controle.chemin ? h("button", {class: "mini discret", title: t.controle.chemin, onclick: () => ouvrirPieceDocuments(t.controle.chemin).catch(e => message(e.message, true))}, "Pièce")
          : t.controle.piece ? h("button", {class: "mini discret", onclick: () => voirPiece({id: t.controle.id, type: "", date: t.controle.fin, montant: t.controle.montant, commercantNom: t.controle.libelle})}, "Pièce") : null,
        h("button", {class: "mini discret", onclick: () => dialogueControle(t.controle)}, "Modifier"),
        h("button", {class: "mini danger", onclick: async () => { if (await confirmer("Supprimer ce contrôle ? Les opérations ne changent pas.", "Supprimer", true)){ supprimer("controles", t.controle.id); rafraichirEcran(); } }}, "Supprimer")))}));

  // 2. Opérations en double
  c.appendChild(h("h2", null, "Opérations importées en double (" + doublons.length + ")"));
  c.appendChild(h("p", {class: "note"}, "Même compte, même date, même montant, libellés de même début : souvent une même opération venue de deux exports. Deux achats réellement identiques du même jour (deux abonnements, deux lignes de téléphone) : « Pas une erreur ». Les périodes déjà clôturées sur relevé PDF ne sont pas examinées : le relevé y a vérifié chaque ligne."));
  // Chaque exemplaire est montré avec son classement et le fichier d'où il vient ; celui qui est en trop se supprime ici
  const origine = o => { const i = o.import ? obtenir("imports", o.import) : null; return i ? (i.fichier || "") + (i.date ? " (importé le " + dateFr(String(i.date).slice(0, 10)) + ")" : "") : "saisie"; };
  const exemplaire = o => h("div", {class: "petit", style: {margin: ".2rem 0"}}, o.libelle, " · ", h("span", {class: "discret"}, (o.categorie || "—") + (o.sousCategorie ? " › " + o.sousCategorie : "") + " · " + origine(o)),
    (o.justificatifs || []).length ? h("span", {class: "pos"}, " · pièce jointe") : h("button", {class: "mini danger", style: {marginLeft: ".4rem"}, onclick: async e => {
      e.stopPropagation();
      if (await confirmer("Supprimer cet exemplaire (" + o.libelle + ", " + euros(o.montant) + ") ? L'autre est gardé.", "Supprimer", true)){ supprimer("operations", o.id); rafraichirEcran(); }
    }}, "Supprimer celui-ci"));
  c.appendChild(tableau([{titre: "Date"}, {titre: "Compte"}, {titre: "Exemplaires"}, {titre: "Montant", num: true}, {titre: "Nombre", num: true}, {titre: ""}], doublons,
    {classe: "serre", vide: "Aucun doublon.", ligne: d => { const o = d.ops[0]; return h("tr", null, h("td", null, dateFr(o.date)), h("td", null, obtenir("comptes", o.compte)?.nom || ""),
      h("td", null, d.ops.map(exemplaire)), h("td", {class: "num"}, euros(o.montant)), h("td", {class: "num"}, d.ops.length),
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
