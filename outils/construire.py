"""Assemble index.html à partir de src/page.html, src/style.css et src/js/*.js (ordre alphabétique).

Usage : python outils/construire.py
Aucune dépendance. Le fichier produit est la page unique publiée.
"""
import pathlib, re, sys, datetime, hashlib, base64

RACINE = pathlib.Path(__file__).resolve().parent.parent
SRC = RACINE / "src"

def main():
    page = (SRC / "page.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    morceaux = []
    for f in sorted((SRC / "js").glob("*.js")):
        morceaux.append(f"/* ===== {f.name} ===== */\n" + f.read_text(encoding="utf-8"))
    js = "\n".join(morceaux)
    version = datetime.datetime.now().strftime("%Y-%m-%d.%H%M")
    js = js.replace("__VERSION__", version)
    if "</script" in js.lower():
        sys.exit("Erreur : « </script » présent dans le code JavaScript.")
    # Le script en ligne est autorisé par son empreinte dans la politique de sécurité (CSP) :
    # aucun autre script en ligne ne peut s'exécuter.
    contenu_script = "\n" + js + "\n"
    empreinte = base64.b64encode(hashlib.sha256(contenu_script.encode("utf-8")).digest()).decode()
    sortie = page.replace("/*__CSS__*/", css).replace("\n/*__JS__*/\n", contenu_script)
    sortie = sortie.replace("__HASH_SCRIPT__", f"'sha256-{empreinte}'")
    (RACINE / "index.html").write_text(sortie, encoding="utf-8")
    sw = (RACINE / "sw.js").read_text(encoding="utf-8")
    sw = re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "{version}";', sw)
    (RACINE / "sw.js").write_text(sw, encoding="utf-8")
    print(f"index.html construit ({len(sortie)//1024} Ko), version {version}")

if __name__ == "__main__":
    main()
