/* ================= Écran d'ouverture : choix du stockage, création, déverrouillage ================= */

async function afficherVerrou(avis){
  $("appli").hidden = true; $("nav-basse").hidden = true; $("saisie").hidden = true;
  const v = vider($("verrou")); v.hidden = false;
  const boite = h("div", {class: "boite-verrou"}, h("div", {class: "titre"}, "Budget du foyer"));
  v.appendChild(boite);
  if (avis) boite.appendChild(h("div", {class: "bandeau calme"}, avis));
  const nomAd = await reglage("adaptateur", null);
  if (!nomAd) return ecranChoixStockage(vider(boite));
  SESSION.adaptateur = adaptateurNomme(nomAd);
  if (nomAd === "graph"){
    try { await adaptateurGraph.initialiser(await reglage("graph_client", "")); }
    catch (e){ boite.appendChild(h("div", {class: "bandeau alerte"}, "Connexion Microsoft : " + e.message)); }
  }
  const pret = await SESSION.adaptateur.pret(false).catch(() => false);
  const cache = await lireCache().catch(() => null);
  const memorisee = await cleMemorisee();
  boite.appendChild(h("p", {class: "note"}, "Stockage : " + SESSION.adaptateur.libelle + (SESSION.adaptateur.nom === "dossier" && SESSION.adaptateur.racine ? " (« " + SESSION.adaptateur.racine.name + " »)" : "") + "."));

  if (!pret && nomAd === "dossier"){
    boite.appendChild(h("p", null, "Ce navigateur doit reconfirmer l'accès au dossier OneDrive."));
    boite.appendChild(h("button", {class: "primaire", onclick: async () => { if (await SESSION.adaptateur.pret(true)) afficherVerrou(); }}, "Autoriser l'accès au dossier"));
    boite.appendChild(h("p", {class: "note"}, "Ou travaillez sur la copie locale ; elle sera synchronisée ensuite."));
  }
  if (!pret && nomAd === "graph"){
    boite.appendChild(h("button", {class: "primaire", onclick: () => adaptateurGraph.connecter().catch(e => message(e.message, true))}, "Se connecter à OneDrive"));
  }
  let existe = !!cache, echecLecture = false;
  if (pret){ try { existe = existe || !!(await SESSION.adaptateur.lire(FICHIER_LIVRE)); } catch (e){ echecLecture = true; boite.appendChild(h("div", {class: "bandeau alerte"}, "Lecture du livre impossible : " + e.message)); } }

  if (existe && memorisee){
    const btn = h("button", {class: "primaire", onclick: async () => {
      btn.disabled = true;
      try { await ouvrirLivre(null, false); entrerDansAppli(); } catch (e){ btn.disabled = false; message(e.message, true); }
    }}, "Ouvrir le livre");
    boite.append(h("p", null, "Cet appareil est reconnu : pas de mot de passe à saisir."), btn);
    setTimeout(() => btn.click(), 50);
  } else if (existe){
    const mdp = h("input", {type: "password", autocomplete: "current-password", placeholder: "Mot de passe du livre"});
    const souvenir = h("input", {type: "checkbox", id: "souvenir"});
    const ouvrir = async () => {
      btn.disabled = true; btn.textContent = "Ouverture…";
      try { await ouvrirLivre(mdp.value, souvenir.checked); mdp.value = ""; entrerDansAppli(); }
      catch (e){ message(e.message, true); btn.disabled = false; btn.textContent = "Ouvrir"; mdp.select(); }
    };
    const btn = h("button", {class: "primaire", onclick: ouvrir}, "Ouvrir");
    mdp.addEventListener("keydown", e => { if (e.key === "Enter") ouvrir(); });
    boite.append(champ("Mot de passe", mdp),
      h("div", {class: "case"}, souvenir, h("label", {for: "souvenir"}, "Se souvenir sur cet appareil (ordinateur personnel seulement)")),
      h("div", {class: "outils", style: {marginTop: ".8rem"}}, btn));
    setTimeout(() => mdp.focus(), 50);
  } else if (echecLecture){
    // Ne jamais proposer de créer un livre quand la lecture a échoué : il existe peut-être
    boite.append(h("p", null, "Le livre n'a pas pu être lu. Vérifiez la connexion, puis réessayez."), h("button", {class: "primaire", onclick: () => afficherVerrou()}, "Réessayer"));
  } else if (pret || nomAd === "local"){
    ecranCreation(boite);
  }
  boite.appendChild(h("div", {style: {marginTop: "1.2rem"}}, h("button", {class: "lien", onclick: () => ecranChoixStockage(vider(boite))}, "Changer de stockage"),
    " · ", h("button", {class: "lien", onclick: () => basculerSaisieMobile()}, "Mode saisie mobile"),
    " · ", h("a", {href: "?demo"}, "Démonstration (données fictives)")));
}

function ecranChoixStockage(boite){
  boite.append(h("div", {class: "titre"}, "Budget du foyer"),
    h("p", null, "Où ce livre de comptes doit-il être rangé ? Il y est toujours chiffré par votre mot de passe."));
  const liste = h("div", {class: "choix-stockage"});
  if (adaptateurDossier.disponible()){
    liste.appendChild(h("button", {onclick: async () => {
      try { const nom = await adaptateurDossier.choisir(); await definirReglage("adaptateur", "dossier"); message("Dossier « " + nom + " » choisi."); afficherVerrou(); }
      catch (e){ if (e.name !== "AbortError") message(e.message, true); }
    }}, "Dossier OneDrive de ce PC", h("small", null, "Choisissez un dossier de votre OneDrive, par exemple « OneDrive › Budget foyer ». Aucune inscription Azure nécessaire.")));
  }
  liste.appendChild(h("button", {onclick: () => ecranGraph(vider(boite))}, "OneDrive en ligne (Microsoft)", h("small", null, "Pour les téléphones, ou un PC sans OneDrive installé. Demande l'identifiant de l'application inscrite sur Azure.")));
  liste.appendChild(h("button", {onclick: async () => { await definirReglage("adaptateur", "local"); afficherVerrou(); }}, "Ce navigateur seulement", h("small", null, "Pour un essai : rien n'est partagé avec les autres appareils.")));
  boite.appendChild(liste);
  boite.appendChild(h("p", {class: "note"}, "Téléphone en saisie seule : utilisez plutôt le lien d'appairage affiché par le PC (Réglages › Téléphones)."));
}

function ecranGraph(boite){
  const id = h("input", {type: "text", placeholder: "ex. 1a2b3c4d-…", autocomplete: "off", spellcheck: "false"});
  reglage("graph_client", "").then(v => { id.value = v; });
  boite.append(h("div", {class: "titre"}, "OneDrive en ligne"),
    h("p", null, "Saisissez l'identifiant d'application (client) obtenu lors de l'inscription sur le portail Azure (voir la procédure fournie). Ce n'est pas un secret."),
    champ("Identifiant d'application (client)", id),
    h("div", {class: "outils"}, h("button", {class: "discret", onclick: () => afficherVerrou()}, "Retour"),
      h("button", {class: "primaire", onclick: async () => {
        const v = id.value.trim();
        if (!/^[0-9a-f-]{36}$/i.test(v)){ message("Identifiant attendu : 36 caractères (chiffres, lettres a à f, tirets).", true); return; }
        await definirReglage("graph_client", v); await definirReglage("adaptateur", "graph");
        try { await adaptateurGraph.initialiser(v); await adaptateurGraph.connecter(); } catch (e){ message(e.message, true); }
      }}, "Se connecter")));
}

function ecranCreation(boite){
  const nom = h("input", {type: "text", value: "Foyer", placeholder: "Nom affiché"});
  const m1 = h("input", {type: "password", autocomplete: "new-password"});
  const m2 = h("input", {type: "password", autocomplete: "new-password"});
  const force = h("div", {class: "note"});
  m1.addEventListener("input", () => { const f = forceMotDePasse(m1.value); force.textContent = f.texte; force.className = "note" + (f.note < 2 ? " neg" : ""); });
  const souvenir = h("input", {type: "checkbox", id: "souvenir-c"});
  const btn = h("button", {class: "primaire", onclick: async () => {
    if (m1.value !== m2.value){ message("Les deux mots de passe diffèrent.", true); return; }
    if (forceMotDePasse(m1.value).note < 2){ message("Mot de passe trop court : 10 caractères au moins.", true); return; }
    btn.disabled = true; btn.textContent = "Création…";
    try { await creerLivre(m1.value, nom.value.trim() || "Foyer", souvenir.checked); SESSION.etat = "ouvert"; m1.value = m2.value = ""; entrerDansAppli(); aller("reglages", {onglet: "demarrage"}); }
    catch (e){ message(e.message, true); btn.disabled = false; btn.textContent = "Créer le livre"; }
  }}, "Créer le livre");
  boite.append(h("p", null, "Aucun livre ici. Créez-le : il sera chiffré par ce mot de passe, que personne ne peut retrouver à votre place."),
    champ("Nom du foyer (affiché en haut de l'application)", nom),
    champ("Mot de passe", m1), force, champ("Confirmer le mot de passe", m2),
    h("div", {class: "case"}, souvenir, h("label", {for: "souvenir-c"}, "Se souvenir sur cet appareil")),
    h("div", {class: "question"}, h("strong", null, "Important"), " — Notez ce mot de passe en lieu sûr. Sans lui, le livre est illisible, y compris pour vous."),
    h("div", {class: "outils"}, btn));
}

function entrerDansAppli(){
  $("verrou").hidden = true; $("saisie").hidden = true; $("appli").hidden = false;
  derniereActivite = Date.now();
  const nom = (location.hash || "").slice(1);
  ECRAN_COURANT = ECRANS[nom] ? nom : "accueil";
  rafraichirEcran();
  actualiserBoite().catch(() => {});
}
async function actualiserBoite(){
  try { BOITE_CACHE = await lireBoite(); construireNavigation(); if (ECRAN_COURANT === "boite") rafraichirEcran(); } catch (e) {}
}
