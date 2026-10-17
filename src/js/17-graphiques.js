/* ================= Graphiques SVG à la charte ================= */
const COULEURS = {vert: "#1E4636", or: "#9B7D34", garnet: "#6E2A2A", sauge: "#6F8678", filet: "#C9D2CB", encre: "#182A20"};

function grapheTresorerie(sim, ana, hauteur, compact, seuils){
  const L = 900, H = hauteur || 300, g = 72, dr = 14, ht = 14, bas = 46;
  const j = sim.jours; if (!j.length) return h("div", {class: "vide"}, "Pas de projection.");
  const p = seuils || LIVRE.parametres;
  const vals = j.map(x => x.solde);
  const mini = Math.min(p.seuilBas, ...vals), maxi = Math.max(...vals, p.seuilBas + 1);
  const etendue = maxi - mini; const pas = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000].find(x => etendue / x <= 6) || 1000000;
  const ymin = Math.floor(mini / pas) * pas, ymax = Math.ceil(maxi / pas) * pas || pas;
  const x = i => g + i / Math.max(1, j.length - 1) * (L - g - dr);
  const y = v => ht + (ymax - v) / (ymax - ymin) * (H - ht - bas);
  const svg = s("svg", {viewBox: `0 0 ${L} ${H}`, width: "100%", role: "img", "aria-label": "Solde projeté de " + (sim.compte?.nom || sim.titre || "")});
  for (let v = ymin; v <= ymax + 1; v += pas){
    svg.appendChild(s("line", {x1: g, x2: L - dr, y1: y(v), y2: y(v), stroke: COULEURS.filet, "stroke-width": 1}));
    svg.appendChild(s("text", {x: g - 6, y: y(v) + 5, "text-anchor": "end", "font-size": 15, fill: COULEURS.sauge}, nombre(v / 1000, 0) + " k€"));
  }
  j.forEach((d, i) => { if (d.date.endsWith("-01")){
    svg.appendChild(s("line", {x1: x(i), x2: x(i), y1: H - bas, y2: H - bas + 4, stroke: COULEURS.sauge}));
    svg.appendChild(s("text", {x: x(i) + 3, y: H - 24, "font-size": 15, fill: COULEURS.sauge}, MOIS_COURT[+d.date.slice(5, 7) - 1]));
    svg.appendChild(s("text", {x: x(i) + 3, y: H - 6, "font-size": 13, fill: COULEURS.sauge}, d.date.slice(2, 4)));
  }});
  svg.appendChild(s("line", {x1: g, x2: L - dr, y1: y(p.seuilBas), y2: y(p.seuilBas), stroke: COULEURS.garnet, "stroke-width": 1.5}));
  if (p.seuilHaut <= ymax) svg.appendChild(s("line", {x1: g, x2: L - dr, y1: y(p.seuilHaut), y2: y(p.seuilHaut), stroke: COULEURS.sauge, "stroke-width": 1.5, "stroke-dasharray": "6 4"}));
  svg.appendChild(s("polyline", {points: j.map((d, i) => x(i).toFixed(1) + "," + y(d.solde).toFixed(1)).join(" "), fill: "none", stroke: COULEURS.vert, "stroke-width": 2}));
  if (!compact) for (const e of sim.evenements){
    if (Math.abs(e.montant) < 10000) continue;
    const i = j.findIndex(d => d.date === e.date); if (i < 0) continue;
    const pt = s("circle", {cx: x(i), cy: y(j[i].solde), r: 4, fill: COULEURS.or});
    pt.appendChild(s("title", null, dateFr(e.date) + " · " + e.libelle + " · " + euros(e.montant, 0)));
    svg.appendChild(pt);
  }
  if (ana && ana.min.solde < p.seuilBas){
    const i = j.indexOf(ana.min);
    svg.appendChild(s("circle", {cx: x(i), cy: y(ana.min.solde), r: 5, fill: "none", stroke: COULEURS.garnet, "stroke-width": 2}));
    const aDroite = x(i) < L - 260;
    svg.appendChild(s("text", {x: x(i) + (aDroite ? 9 : -9), y: y(ana.min.solde) + 5, "text-anchor": aDroite ? "start" : "end", "font-size": 14, fill: COULEURS.garnet, "font-weight": 600},
      euros(ana.min.solde, 0) + " le " + dateFr(ana.min.date)));
  }
  return svg;
}

/* Barres doubles budget / réalisé par lieu */
function grapheLieux(donnees){
  const L = 460, H = 30 + donnees.length * 46, g = 80, larg = L - g - 130;
  const max = Math.max(1, ...donnees.map(d => Math.max(d.budget, d.realise)));
  const svg = s("svg", {viewBox: `0 0 ${L} ${H}`, width: "100%", role: "img", "aria-label": "Budget et réalisé par lieu"});
  donnees.forEach((d, i) => {
    const y0 = 10 + i * 46;
    svg.appendChild(s("text", {x: g - 8, y: y0 + 17, "text-anchor": "end", "font-size": 14, fill: COULEURS.encre}, d.lieu));
    svg.appendChild(s("rect", {x: g, y: y0, width: Math.max(0, d.budget / max * larg), height: 12, fill: COULEURS.filet}));
    svg.appendChild(s("rect", {x: g, y: y0 + 14, width: Math.max(0, d.realise / max * larg), height: 12, fill: d.realise > d.budget ? COULEURS.garnet : COULEURS.vert}));
    svg.appendChild(s("text", {x: g + Math.max(d.budget, d.realise) / max * larg + 6, y: y0 + 24, "font-size": 13, fill: COULEURS.encre}, euros(d.realise, 0) + " / " + euros(d.budget, 0)));
  });
  return svg;
}
function barreConsomme(budget, realise){
  if (budget <= 0) return "";
  const ratio = Math.min(realise / budget, 1.33);
  return h("span", {class: "barre-ecart"}, h("i", {class: realise > budget ? "depasse" : "", style: {width: (ratio * 75) + "%"}}), h("b"));
}
