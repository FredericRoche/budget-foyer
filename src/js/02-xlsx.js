/* ================= Classeurs Excel (.xlsx) sans bibliothèque =================
   Lecture : toutes les feuilles, valeurs mises en cache (les formules ne sont pas recalculées).
   Écriture : classeur simple, en-têtes à la charte, montants et dates typés.
   Repris et étendu de l'inventaire de la bibliothèque. */

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = (c >>> 8) ^ TABLE_CRC[(c ^ u8[i]) & 0xFF]; return (c ^ 0xFFFFFFFF) >>> 0; }

function zipSansCompression(entrees, type){
  const enc = new TextEncoder(); const morceaux = [], centraux = []; let decalage = 0;
  const m = new Date();
  const heureDos = (m.getHours() << 11) | (m.getMinutes() << 5) | (m.getSeconds() >> 1);
  const dateDos = ((m.getFullYear() - 1980) << 9) | ((m.getMonth() + 1) << 5) | m.getDate();
  for (const e of entrees){
    const nom = enc.encode(e.nom);
    const donnees = (e.contenu instanceof Uint8Array) ? e.contenu : enc.encode(e.contenu);
    const crc = crc32(donnees);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(10, heureDos, true); local.setUint16(12, dateDos, true);
    local.setUint32(14, crc, true); local.setUint32(18, donnees.length, true); local.setUint32(22, donnees.length, true);
    local.setUint16(26, nom.length, true);
    morceaux.push(new Uint8Array(local.buffer), nom, donnees);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true); central.setUint16(12, heureDos, true); central.setUint16(14, dateDos, true);
    central.setUint32(16, crc, true); central.setUint32(20, donnees.length, true); central.setUint32(24, donnees.length, true);
    central.setUint16(28, nom.length, true); central.setUint32(42, decalage, true);
    centraux.push(new Uint8Array(central.buffer), nom);
    decalage += 30 + nom.length + donnees.length;
  }
  let tailleCentral = 0; for (const c of centraux) tailleCentral += c.length;
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, entrees.length, true); fin.setUint16(10, entrees.length, true);
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
  return new Blob(morceaux.concat(centraux, [new Uint8Array(fin.buffer)]),
    {type: type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

function extraireZip(buffer){
  const donnees = new Uint8Array(buffer); const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : donnees.buffer);
  let eocd = -1;
  for (let i = donnees.length - 22; i >= Math.max(0, donnees.length - 65558); i--){ if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; } }
  if (eocd < 0) throw new Error("archive illisible (ni xlsx ni zip)");
  const nb = dv.getUint16(eocd + 10, true); let pos = dv.getUint32(eocd + 16, true);
  const entrees = {}; const dec = new TextDecoder("utf-8");
  for (let n = 0; n < nb; n++){
    if (dv.getUint32(pos, true) !== 0x02014b50) break;
    const methode = dv.getUint16(pos + 10, true), tailleComp = dv.getUint32(pos + 20, true);
    const tailleNom = dv.getUint16(pos + 28, true), tailleExtra = dv.getUint16(pos + 30, true), tailleComm = dv.getUint16(pos + 32, true);
    const decalage = dv.getUint32(pos + 42, true);
    entrees[dec.decode(donnees.subarray(pos + 46, pos + 46 + tailleNom))] = {methode, tailleComp, decalage};
    pos += 46 + tailleNom + tailleExtra + tailleComm;
  }
  return {donnees, dv, entrees};
}
async function lireDuZip(zip, nom){
  const e = zip.entrees[nom]; if (!e) return null;
  const tailleNom = zip.dv.getUint16(e.decalage + 26, true), tailleExtra = zip.dv.getUint16(e.decalage + 28, true);
  const debut = e.decalage + 30 + tailleNom + tailleExtra;
  const brut = zip.donnees.subarray(debut, debut + e.tailleComp);
  if (e.methode === 0) return new TextDecoder("utf-8").decode(brut);
  if (e.methode === 8){
    const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(flux).text();
  }
  throw new Error("compression " + e.methode + " non gérée");
}
function colonneVersIndex(lettres){ let n = 0; for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }
function indexVersColonne(i){ let s = ""; i++; while (i > 0){ const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - 1 - r) / 26; } return s; }
const enfantsNommes = (el, nom) => Array.from(el.getElementsByTagName("*")).filter(x => x.localName === nom);

/* Renvoie {noms: [...], feuilles: {nom: [[valeurs]]}} ; nombres en nombres, textes en textes. */
async function lireClasseur(buffer){
  const zip = extraireZip(buffer);
  const partage = [];
  const xmlPartage = await lireDuZip(zip, "xl/sharedStrings.xml");
  if (xmlPartage){
    const doc = new DOMParser().parseFromString(xmlPartage, "text/xml");
    for (const si of enfantsNommes(doc, "si")) partage.push(enfantsNommes(si, "t").map(t => t.textContent).join(""));
  }
  const docClasseur = new DOMParser().parseFromString(await lireDuZip(zip, "xl/workbook.xml") || "<a/>", "text/xml");
  const rels = new DOMParser().parseFromString(await lireDuZip(zip, "xl/_rels/workbook.xml.rels") || "<a/>", "text/xml");
  const cibles = {};
  for (const r of enfantsNommes(rels, "Relationship")) cibles[r.getAttribute("Id")] = r.getAttribute("Target");
  const noms = [], feuilles = {};
  for (const f of enfantsNommes(docClasseur, "sheet")){
    const nom = f.getAttribute("name");
    const rid = f.getAttribute("r:id") || f.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let cible = cibles[rid] || ""; cible = cible.replace(/^\/?xl\//, "");
    const xml = await lireDuZip(zip, "xl/" + cible);
    if (!xml) continue;
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const matrice = [];
    for (const row of enfantsNommes(doc, "row")){
      const iLigne = parseInt(row.getAttribute("r"), 10) - 1;
      const ligne = [];
      for (const c of Array.from(row.children).filter(x => x.localName === "c")){
        const ref = (c.getAttribute("r") || "").replace(/\d+/g, "");
        const type = c.getAttribute("t") || "";
        let valeur = null;
        if (type === "inlineStr") valeur = enfantsNommes(c, "t").map(t => t.textContent).join("");
        else {
          const v = Array.from(c.children).find(x => x.localName === "v");
          if (v){
            const brut = v.textContent;
            if (type === "s") valeur = partage[parseInt(brut, 10)] ?? "";
            else if (type === "str" || type === "e") valeur = brut;
            else if (type === "b") valeur = brut === "1";
            else valeur = brut === "" ? null : Number(brut);
          }
        }
        ligne[ref ? colonneVersIndex(ref) : ligne.length] = valeur;
      }
      matrice[isNaN(iLigne) ? matrice.length : iLigne] = ligne;
    }
    for (let i = 0; i < matrice.length; i++) if (!matrice[i]) matrice[i] = [];
    noms.push(nom); feuilles[nom] = matrice;
  }
  return {noms, feuilles};
}

/* Écriture. feuilles = [{nom, colonnes: [{titre, largeur, type: "texte"|"euros"|"date"|"nombre"|"pourcent"}], lignes: [[...]]}] */
function ecrireClasseur(feuilles){
  const x = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const STYLES = {texte: 0, entete: 1, euros: 2, date: 3, nombre: 4, pourcent: 5};
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;;[Red]\\-#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Garamond"/></font><font><b/><sz val="11"/><color rgb="FF1E4636"/><name val="Garamond"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F2E7"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="medium"><color rgb="FF1E4636"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="6"><xf/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="4" applyNumberFormat="1"/><xf numFmtId="10" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;
  const entrees = [];
  const feuillesXml = feuilles.map((f, i) => {
    const cols = f.colonnes.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.largeur || 14}" customWidth="1"/>`).join("");
    const ligneXml = (valeurs, r, entete) => `<row r="${r}">` + valeurs.map((v, j) => {
      const ref = indexVersColonne(j) + r;
      if (entete) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${x(v)}</t></is></c>`;
      if (v === null || v === undefined || v === "") return "";
      const t = f.colonnes[j]?.type || "texte";
      if (t === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)){
        const n = (Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) / 86400000) + 25569;
        return `<c r="${ref}" s="3"><v>${n}</v></c>`;
      }
      if (typeof v === "number" && isFinite(v)) return `<c r="${ref}" s="${STYLES[t] ?? 4}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join("") + `</row>`;
    const lignes = [ligneXml(f.colonnes.map(c => c.titre), 1, true)].concat(f.lignes.map((l, k) => ligneXml(l, k + 2, false))).join("");
    entrees.push({nom: `xl/worksheets/sheet${i + 1}.xml`, contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${lignes}</sheetData><autoFilter ref="A1:${indexVersColonne(Math.max(0, f.colonnes.length - 1))}${f.lignes.length + 1}"/></worksheet>`});
    return `<sheet name="${x(f.nom.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
  });
  entrees.unshift(
    {nom: "[Content_Types].xml", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((f, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`},
    {nom: "_rels/.rels", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {nom: "xl/workbook.xml", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${feuillesXml.join("")}</sheets></workbook>`},
    {nom: "xl/_rels/workbook.xml.rels", contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((f, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {nom: "xl/styles.xml", contenu: styles}
  );
  return zipSansCompression(entrees);
}
