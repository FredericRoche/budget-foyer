/* ================= Démarrage ================= */
async function initialiser(){
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !/[?&]autotest\b/.test(location.search))
    navigator.serviceWorker.register("sw.js", {updateViaCache: "none"}).catch(() => {});
  if (/[?&]autotest\b/.test(location.search)) return afficherAutotest();
  if (/[?&]demo\b/.test(location.search)) return demarrerDemonstration();
  if (await traiterAppairage()) return demarrerSaisieMobile();
  if ((await reglage("mode", "")) === "saisie" && await configMobile()) return demarrerSaisieMobile();
  if (ecranAccueilIos()) return ecranAppairageColle();
  addEventListener("hashchange", () => { const n = location.hash.slice(1); if (SESSION.etat === "ouvert" && ECRANS[n] && n !== ECRAN_COURANT) aller(n); });
  addEventListener("beforeunload", e => { if (LIVRE_MODIFIE){ enregistrerMaintenant().catch(() => {}); e.preventDefault(); } });
  await afficherVerrou();
}
initialiser().catch(e => { console.error(e); document.body.appendChild(h("div", {class: "bandeau alerte"}, "Démarrage impossible : " + e.message)); });
