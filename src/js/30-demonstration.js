/* ================= Démonstration (adresse ?demo) =================
   Livre fictif construit en mémoire à partir du dossier « donnees-fictives » :
   aucune donnée réelle, rien n'est écrit sur l'appareil ni dans OneDrive. */
let DEMO = false;

async function demarrerDemonstration(){
  DEMO = true;
  $("verrou").hidden = false;
  vider($("verrou")).appendChild(h("div", {class: "boite-verrou"}, h("div", {class: "titre"}, "Budget du foyer"), h("p", {id: "etat-demo"}, "Préparation de la démonstration (données fictives)…")));
  const etat = t => { const e = $("etat-demo"); if (e) e.textContent = t; };
  SESSION.adaptateur = adaptateurSimule(); SESSION.adaptateur.libelle = "Démonstration (rien n'est enregistré)";
  SESSION.cle = await nouvelleCleDonnees(); SESSION.enveloppe = await creerEnveloppe("demonstration", SESSION.cle);
  LIVRE = livreVide("Famille Exemple · démonstration");
  const paire = await nouvellePaireBoite();
  LIVRE.cles = {boitePublique: paire.publique, boitePrivee: paire.privee, extrait: versB64(crypto.getRandomValues(new Uint8Array(32)))};
  SESSION.etat = "ouvert";
  const charger = async n => new File([await (await fetch("donnees-fictives/" + encodeURIComponent(n))).blob()], n);
  const importer = async (noms, titulaires) => {
    for (const n of noms){
      etat("Lecture de « " + n + " »…");
      const f = {fichier: await charger(n), lu: {nom: n}, statut: "lecture"};
      await lireEtPreparer(f, n === "PROTEGE_EXEMPLE.pdf" ? "exemple" : undefined);
      if (f.statut === "compte"){
        const p = compteAProposer(f.lu);
        enregistrer("comptes", Object.assign(p, {actif: true, titulaire: (titulaires || {})[f.lu.carte] || p.titulaire || "", produit: f.lu.produit}));
        preparerFichier(f);
      }
      if (f.statut === "pret") await enregistrerFichier(f, true);
      if (f.statut !== "fait") window.__erreurs.push("démonstration : " + n + " → " + f.statut + " " + (f.erreur || f.lu.raison || ""));
    }
  };
  await importer(["regles-fictives.json", "Dépenses fictives - inventaire v7.xlsx"]);
  await importer(["T_cpte_09999_000099Z_du_01-09-2026_au_16-10-2026.csv", "T_cpte_09999_000099Z_carte_Carte_Platinum+_X111_du_29-09-2026_au_16-10-2026.csv",
    "T_cpte_09999_000099Z_carte_Carte_Premier_X222_du_29-09-2026_au_16-10-2026.csv", "CB_FACTURE_RETRAIT_DT_DIFFERE_30-09-2026.pdf", "activity.csv",
    "LIVRETA_09999099999_20260130.pdf", "RELEVETRIMESTRIELASSURANCEVIE_20260720.pdf", "RETRAITE_EXEMPLE_2025.pdf", "PROTEGE_EXEMPLE.pdf"], {X111: "Titulaire A", X222: "Titulaire B", AMEX: "Titulaire A"});
  // Budget de l'année suivante, copié, et échéances confirmées pour une projection lisible
  const b = budgetActif(2026);
  if (b && !budgetActif(2027)) enregistrer("budgets", {annee: 2027, nom: "Budget 2027 (copie de 2026)", fige: false, actif: true, lignes: JSON.parse(JSON.stringify(b.lignes))});
  for (const e of vivants("echeances").filter(e => /Voiture/.test(e.libelle))) enregistrer("echeances", Object.assign(e, {debut: "2027-02-15", aConfirmer: false}));
  // Un ticket lu sur le PC, et une saisie du téléphone dans la boîte (achat groupé au marché)
  try {
    etat("Lecture des tickets (OCR local)…");
    await importerJustificatifPc(await lireFichier(await charger("facturette-coiffeur.jpg")));
    const tickets = [];
    for (const [n, nature] of [["ticket-boucherie.jpg", "Gigot et saucisses, déjeuner de dimanche"], ["ticket-fromagerie.jpg", "Comté et chèvres"]]){
      const t = await lireTicket(await charger(n));
      tickets.push({montant: nombre(t.montant), date: t.date, heure: t.heure, commercant: n.includes("boucherie") ? "Boucherie du Marché" : "Fromagerie Perret", raisonSociale: t.raisonSociale,
        natureExacte: nature, type: t.type, texte: t.texte, photo: {mime: "image/jpeg", b64: versB64(t.photo.octets)}});
    }
    const saisie = {id: "s-demo", creeLe: Date.parse("2026-10-10T11:04:00"), auteur: "Téléphone (démonstration)", date: "2026-10-10", categorie: "Alimentation", sousCategorie: "Courses", lieu: "Ville", carte: "X222", tickets};
    await SESSION.adaptateur.ecrire("boite/2026-10-10-demo.chiffre", await chiffrerPourBoite(saisie, LIVRE.cles.boitePublique));
  } catch (e){ console.warn("démonstration : tickets", e); }
  LIVRE_MODIFIE = false;
  FICHIERS_EN_COURS = [];
  entrerDansAppli();
}
