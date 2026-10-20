/* ================= Mode saisie mobile (écriture seule) =================
   Le téléphone ne détient que la clé publique du foyer et la clé de l'extrait des
   commerçants. Il photographie, lit le ticket sur place, fait valider, chiffre et
   dépose dans « boite/ » du OneDrive. Hors réseau, la saisie attend et part seule. */

const MOBILE = {config: null, extrait: null, saisie: null, envoiEnCours: false};

async function configMobile(){ if (!MOBILE.config) MOBILE.config = await reglage("mobile_config", null); return MOBILE.config; }
async function traiterAppairage(){
  const m = location.hash.match(/#appairage=([A-Za-z0-9_-]+)/);
  if (!m) return false;
  try {
    const charge = JSON.parse(dec.decode(depuisB64url(m[1])));
    if (!charge.pub || !charge.ext) throw new Error("lien incomplet");
    await definirReglage("mobile_config", charge); MOBILE.config = charge;
    if (charge.client) await definirReglage("graph_client", charge.client);
    await definirReglage("mode", "saisie");
    history.replaceState(null, "", location.pathname);
    return true;
  } catch (e){ alert("Lien d'appairage illisible : " + e.message); return false; }
}
async function basculerSaisieMobile(){
  if (!(await configMobile())){ message("Ce téléphone n'est pas appairé : ouvrez le lien (ou le QR code) affiché par le PC, Réglages › Téléphones.", true); return; }
  await definirReglage("mode", "saisie"); demarrerSaisieMobile();
}

async function demarrerSaisieMobile(){
  $("verrou").hidden = true; $("appli").hidden = true; $("nav-basse").hidden = true;
  const z = vider($("saisie")); z.hidden = false;
  const cfg = await configMobile();
  const clientId = cfg?.client || await reglage("graph_client", "");
  z.appendChild(h("div", {class: "barre-tel"}, h("span", null, "Budget du foyer"), h("span", null, cfg?.foyer || "Saisie")));
  const corps = h("div", {class: "corps-tel"}); z.appendChild(corps);
  if (!clientId){ corps.appendChild(h("p", {class: "neg"}, "Identifiant d'application Microsoft absent du lien d'appairage. Renseignez-le sur le PC (Réglages › Téléphones), puis réappairez.")); return; }
  try { await adaptateurGraph.initialiser(clientId); } catch (e){ corps.appendChild(h("p", {class: "neg"}, e.message)); return; }
  if (!adaptateurGraph.connecte()){
    corps.append(h("p", null, "Connectez ce téléphone au OneDrive du foyer (une fois ; ensuite un simple clic de temps en temps)."),
      h("button", {class: "primaire gros", onclick: () => adaptateurGraph.connecter()}, "Se connecter à OneDrive"),
      h("p", {class: "legende-tel"}, "L'application n'accède qu'à son propre dossier « Applications » du OneDrive."));
    return;
  }
  chargerExtrait().catch(() => {});
  envoyerFile().catch(() => {});
  accueilMobile(corps);
}
async function chargerExtrait(){
  const cle = await cleExtrait(MOBILE.config.ext);
  let octets = null;
  try { const v = await adaptateurGraph.lire("extrait-commercants.chiffre"); if (v){ octets = v.octets; await idbEcrire("fichiers", "extrait", octets); } }
  catch (e){ octets = await idbLire("fichiers", "extrait"); }
  if (!octets) octets = await idbLire("fichiers", "extrait");
  if (!octets) return;
  const o = JSON.parse(dec.decode(octets));
  MOBILE.extrait = JSON.parse(dec.decode(await decompresser(await aesDechiffrer(cle, o))));
}

async function historiqueMobile(){ if (DEMO) return MOBILE.historiqueDemo || []; return (await reglage("mobile_historique", [])) || []; }
/* Démonstration de l'écran du téléphone, sans compte Microsoft : dépôt dans la boîte simulée. */
async function demonstrationMobile(){
  MOBILE.config = {pub: LIVRE.cles.boitePublique, ext: LIVRE.cles.extrait, foyer: LIVRE.parametres.nomFoyer};
  MOBILE.extrait = construireExtrait();
  $("appli").hidden = true; $("nav-basse").hidden = true; $("verrou").hidden = true;
  const z = vider($("saisie")); z.hidden = false;
  z.appendChild(h("div", {class: "barre-tel"}, h("span", null, "Budget du foyer"), h("button", {class: "mini", onclick: () => { z.hidden = true; entrerDansAppli(); actualiserBoite(); }}, "Revenir au PC")));
  const corps = h("div", {class: "corps-tel"}); z.appendChild(corps);
  accueilMobile(corps);
}
async function accueilMobile(corps){
  vider(corps);
  const file = DEMO ? [] : (await idbCles("file")).filter(k => String(k).startsWith("envoi:"));
  corps.append(h("button", {class: "primaire gros", onclick: () => photographier(corps, null)}, "📷 Photographier un ticket"),
    h("button", {class: "gros", onclick: () => formulaireMobile(corps, nouvelleSaisieMobile(), null)}, "Saisir sans ticket"));
  if (file.length) corps.appendChild(h("div", {class: "bandeau info"}, file.length + " saisie(s) en attente de réseau. ", h("button", {class: "mini", onclick: () => envoyerFile().then(() => accueilMobile(corps))}, "Envoyer maintenant")));
  corps.appendChild(h("h2", {style: {marginTop: "1rem"}}, "Mes dernières saisies"));
  const ul = h("ul", {class: "recentes"});
  for (const x of (await historiqueMobile()).slice(0, 12)) ul.appendChild(h("li", null, h("span", null, dateCourte(x.date) + " · " + x.commercant), h("span", {class: "num"}, euros(x.montant) + (x.envoye ? " ✓" : " ⏳"))));
  if (!ul.children.length) ul.appendChild(h("li", null, h("span", {class: "discret"}, "Aucune pour l'instant.")));
  corps.append(ul, h("p", {class: "legende-tel", style: {marginTop: ".6rem"}}, "✓ déposée dans OneDrive · ⏳ en attente de réseau, partira seule. Ce téléphone ne peut pas relire les comptes."));
}
function nouvelleSaisieMobile(){ return {id: "s-" + idAleatoire(8), creeLe: Date.now(), auteur: nomAppareil() || "téléphone", tickets: [], categorie: "", sousCategorie: "", lieu: "", carte: ""}; }

function photographier(corps, saisie){
  const entree = h("input", {type: "file", accept: "image/*", capture: "environment", style: {display: "none"}});
  entree.addEventListener("change", async () => {
    const f = entree.files[0]; entree.remove(); if (!f) return;
    vider(corps);
    const barre = h("span"); const info = h("p", null, "Lecture du ticket sur le téléphone…");
    corps.append(h("img", {class: "apercu-photo", src: URL.createObjectURL(f), alt: "Ticket"}), info, h("div", {class: "progression"}, barre));
    let t;
    try { t = await lireTicket(f, p => { barre.style.width = Math.round(p * 100) + "%"; }); }
    catch (e){ info.textContent = "Lecture impossible (" + e.message + ") : saisissez les champs à la main."; t = {photo: {mime: "image/jpeg", octets: new Uint8Array(await f.arrayBuffer())}, confiance: {}}; }
    formulaireMobile(corps, saisie || nouvelleSaisieMobile(), t);
  });
  document.body.appendChild(entree); entree.click();
}

function commercantsExtrait(){ return (MOBILE.extrait?.commercants || []).map(c => Object.assign({}, c, {alias: c.alias || []})); }
async function formulaireMobile(corps, saisie, t){
  vider(corps);
  if (!MOBILE.extrait && !DEMO) await chargerExtrait().catch(() => {});
  const ex = MOBILE.extrait;
  const fiche = t ? commercantPourTicket(t, commercantsExtrait()) : null;
  const dernier = await reglage("mobile_dernier", {});
  const montant = h("input", {type: "text", inputmode: "decimal", class: "montant", value: t?.montant ? nombre(t.montant) : ""});
  const date = champDate({value: t?.date || aujourdhui()});
  const cartes = ex?.cartes || [];
  const carte = selection([...cartes.map(x => [x.carte, x.nom]), ["ESPECES", "Espèces"], ["", "Autre"]], saisie.carte || dernier.carte || cartes[0]?.carte || "");
  const nomPropose = fiche ? fiche.nom : t ? nomDepuisCle(cleLibelle(t.enseigne || t.raisonSociale || "")) : "";
  const cm = h("input", {type: "text", value: nomPropose, list: "liste-commercants", autocomplete: "off"});
  const liste = h("datalist", {id: "liste-commercants"}, commercantsExtrait().slice(0, 400).map(x => h("option", {value: x.nom})));
  const nat = h("input", {type: "text", placeholder: "ce qui a été acheté, pour quoi"});
  const sugg = h("div", {class: "suggestions"});
  const majSugg = () => {
    vider(sugg);
    const f = commercantsExtrait().find(x => norm(x.nom) === norm(cm.value));
    for (const n of (f?.natures || []).slice(0, 4)) sugg.appendChild(h("button", {onclick: () => { nat.value = n; }}, n));
    if (f?.categorie && !saisie.categorieChoisie){ saisie.categorie = f.categorie; saisie.sousCategorie = f.sousCategorie; if (f.lieu) saisie.lieu = f.lieu; rendrePuces(); }
  };
  cm.addEventListener("change", majSugg);
  const puces = h("div", {class: "puces"}); const pucesLieu = h("div", {class: "puces"});
  const frequentes = (await reglage("mobile_categories", null)) || [["Alimentation", "Courses"], ["Alimentation", "Restaurants et cafés"], ["Santé", "Soins et pharmacie"], ["Maison", "Équipement, électroménager"],
    ["Habillement", "Vêtements, chaussures, pressing"], ["Soins personnels", "Beauté, parfumerie, coiffeur"], ["Famille", "Cadeaux"]];
  const lieux = ex?.lieux || ["Autres"];
  if (!saisie.lieu) saisie.lieu = dernier.lieu || "";
  const rendrePuces = () => {
    vider(puces);
    const liste2 = frequentes.slice();
    if (saisie.categorie && !liste2.some(([c, s]) => c === saisie.categorie && s === saisie.sousCategorie)) liste2.unshift([saisie.categorie, saisie.sousCategorie]);
    for (const [c, s] of liste2.slice(0, 8)) puces.appendChild(h("button", {class: c === saisie.categorie && s === saisie.sousCategorie ? "choisi" : "", onclick: () => { saisie.categorie = c; saisie.sousCategorie = s; saisie.categorieChoisie = true; rendrePuces(); }}, s.length < 22 ? s : c));
    const autre = h("select", {style: {width: "auto", minHeight: "42px"}, onchange: e => { const [c, s] = e.target.value.split("|"); if (c){ saisie.categorie = c; saisie.sousCategorie = s; saisie.categorieChoisie = true; rendrePuces(); } }},
      h("option", {value: ""}, "Autre…"), Object.entries(ex?.categories || CATEGORIES_DEFAUT).flatMap(([c, ss]) => ss.map(s => h("option", {value: c + "|" + s}, c + " › " + s))));
    puces.appendChild(autre);
    vider(pucesLieu);
    for (const l of lieux) pucesLieu.appendChild(h("button", {class: l === saisie.lieu ? "choisi" : "", onclick: () => { saisie.lieu = l; rendrePuces(); }}, l));
  };
  rendrePuces(); majSugg();
  const lu = t && (t.raisonSociale || t.type) ? h("div", {class: "legende-tel", style: {margin: ".2rem 0 0"}}, "lu sur le ticket : " + (t.raisonSociale ? "« " + t.raisonSociale + " » · " : "") + (TYPES_JUSTIF[t.type] || "")) : null;
  const ticket = () => ({montant: montant.value, date: date.value, heure: t?.heure || "", commercant: cm.value.trim(), commercantCorrige: !!fiche && norm(cm.value) !== norm(fiche.nom) || (!fiche && !!cm.value),
    raisonSociale: t?.raisonSociale || "", natureExacte: nat.value.trim(), type: t?.type || "ticket", carte4: t?.carte4 || "", siret: t?.siret || "", texte: (t?.texte || "").slice(0, 4000),
    photo: t?.photo ? {mime: t.photo.mime, b64: versB64(t.photo.octets)} : null});
  const valider = () => {
    const m = lireMontant(montant.value);
    if (isNaN(m) || m <= 0){ message("Montant à vérifier.", true); return false; }
    if (!cm.value.trim()){ message("Indiquez le fournisseur.", true); return false; }
    return true;
  };
  corps.append(
    !ex ? h("div", {class: "bandeau info"}, "Liste des fournisseurs et des cartes pas encore reçue du PC : saisissez le nom à la main, il sera rapproché sur le PC.") : null,
    saisie.tickets.length ? h("div", {class: "bandeau calme"}, "Paiement groupé : ticket " + (saisie.tickets.length + 1) + " (déjà : " + saisie.tickets.map(x => euros(lireMontant(x.montant))).join(" + ") + ")") : null,
    t?.photo ? h("img", {class: "apercu-photo", src: URL.createObjectURL(new Blob([t.photo.octets], {type: t.photo.mime})), alt: "Ticket", style: {maxHeight: "18vh"}}) : null,
    h("div", {class: "bloc"}, h("label", null, "Montant", t?.montant ? h("span", {class: "propose"}, "proposé") : null), montant),
    h("div", {class: "bloc deux", style: {gap: ".6rem"}}, h("div", null, h("label", null, "Date", t?.date ? h("span", {class: "propose"}, "proposé") : null), date), h("div", null, h("label", null, "Payé avec"), carte)),
    h("div", {class: "bloc"}, h("label", null, "Fournisseur", fiche ? h("span", {class: "propose"}, "reconnu") : t ? h("span", {class: "propose"}, "proposé") : null), cm, liste, lu),
    h("div", {class: "bloc"}, h("label", null, "Nature exacte de la dépense"), nat, sugg),
    h("label", null, "Catégorie"), puces, h("label", null, "Lieu"), pucesLieu,
    h("button", {class: "primaire gros", onclick: async () => {
      if (!valider()) return;
      saisie.tickets.push(ticket()); saisie.carte = carte.value; saisie.date = saisie.tickets[0].date;
      await deposerSaisie(saisie);
      if (!DEMO) await definirReglage("mobile_dernier", {carte: carte.value, lieu: saisie.lieu});
      if (saisie.categorie && !DEMO){
        const f2 = frequentes.filter(([c, s]) => !(c === saisie.categorie && s === saisie.sousCategorie)); f2.unshift([saisie.categorie, saisie.sousCategorie]);
        await definirReglage("mobile_categories", f2.slice(0, 7));
      }
      message("Saisie enregistrée" + (navigator.onLine ? " et envoyée." : " ; elle partira au retour du réseau."));
      accueilMobile(corps);
    }}, "Envoyer"),
    h("button", {class: "gros", onclick: () => { if (!valider()) return; saisie.tickets.push(ticket()); saisie.carte = carte.value; photographier(corps, saisie); }}, "Ajouter un second ticket au même paiement"),
    h("button", {class: "gros discret", onclick: () => accueilMobile(corps)}, "Abandonner"));
}

async function deposerSaisie(saisie){
  const paquet = await chiffrerPourBoite(saisie, MOBILE.config.pub);
  if (DEMO){ await SESSION.adaptateur.ecrire("boite/" + Date.now() + "-demo.chiffre", paquet); MOBILE.historiqueDemo = [{date: saisie.date, commercant: saisie.tickets.map(x => x.commercant).join(" + "), montant: somme(saisie.tickets, x => lireMontant(x.montant) || 0), envoye: true}, ...(MOBILE.historiqueDemo || [])]; return; }
  await idbEcrire("file", "envoi:" + saisie.id, paquet);
  const hist = await historiqueMobile();
  hist.unshift({id: saisie.id, date: saisie.date, commercant: saisie.tickets.map(x => x.commercant).join(" + "), montant: somme(saisie.tickets, x => lireMontant(x.montant) || 0), envoye: false});
  await definirReglage("mobile_historique", hist.slice(0, 40));
  await envoyerFile();
}
async function envoyerFile(){
  if (MOBILE.envoiEnCours || !navigator.onLine || !adaptateurGraph.connecte()) return;
  MOBILE.envoiEnCours = true;
  try {
    const cles = (await idbCles("file")).filter(k => String(k).startsWith("envoi:"));
    const hist = await historiqueMobile();
    for (const k of cles){
      const paquet = await idbLire("file", k);
      const id = String(k).slice(6);
      const nom = "boite/" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + appareil() + "-" + id + ".chiffre";
      await adaptateurGraph.assurerDossier("boite");
      await adaptateurGraph.ecrireNouveau(nom, paquet);
      await idbSuppr("file", k);
      const x = hist.find(y => y.id === id); if (x) x.envoye = true;
    }
    await definirReglage("mobile_historique", hist);
  } catch (e){ console.warn(e); }
  finally { MOBILE.envoiEnCours = false; }
}
addEventListener("online", () => { if (!$("saisie").hidden) envoyerFile().catch(() => {}); });
