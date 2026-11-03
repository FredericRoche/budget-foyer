"""Prépare une copie AUTONOME de l'application, à donner à quelqu'un qui tiendra son propre budget.

Usage : python outils/preparer_copie.py DOSSIER_DE_SORTIE

La copie part du dernier état VALIDÉ du dépôt (git archive HEAD) : rien de ce qui n'est pas validé,
aucun fichier ignoré, aucun historique (ni messages ni auteur). Elle ne garde aucun lien avec ce dépôt
ni avec l'inscription Microsoft de son auteur :
  - l'identifiant d'application Microsoft est vidé (src/js/05-stockage.js) ; le destinataire y mettra le sien ;
  - kit/MISE-EN-ROUTE.md devient MISE-EN-ROUTE.md, kit/GUIDE-POUR-CLAUDE.md devient CLAUDE.md
    (lu d'office par Claude Code dans ce dossier) ; le dossier kit/ n'est pas copié ;
  - index.html est reconstruit, puis le contrôle des données personnelles est passé sur la copie.
Rien n'est publié : le destinataire crée lui-même son dépôt, sa publication et son inscription.
"""
import io, pathlib, re, subprocess, sys, tarfile

RACINE = pathlib.Path(__file__).resolve().parent.parent

def main():
    if len(sys.argv) != 2: sys.exit(__doc__)
    sortie = pathlib.Path(sys.argv[1]).resolve()
    if sortie.exists() and any(sortie.iterdir()): sys.exit(f"Le dossier {sortie} n'est pas vide : choisissez un dossier neuf.")
    if RACINE in sortie.parents or sortie == RACINE: sys.exit("Le dossier de sortie doit être hors du dépôt.")
    if subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=RACINE, capture_output=True, text=True).stdout.strip():
        print("Attention : des modifications ne sont pas validées ; la copie part du dernier état validé (HEAD).")

    archive = subprocess.run(["git", "archive", "--format=tar", "HEAD"], cwd=RACINE, capture_output=True, check=True).stdout
    sortie.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as t:
        for m in t.getmembers():
            if m.name == "kit" or m.name.startswith("kit/"): continue
            t.extract(m, sortie, filter="data")
    for source, cible in [("kit/MISE-EN-ROUTE.md", "MISE-EN-ROUTE.md"), ("kit/GUIDE-POUR-CLAUDE.md", "CLAUDE.md")]:
        (sortie / cible).write_bytes(subprocess.run(["git", "show", "HEAD:" + source], cwd=RACINE, capture_output=True, check=True).stdout)

    # Identifiant Microsoft de l'auteur : vidé (le destinataire inscrit sa propre application)
    stockage = sortie / "src" / "js" / "05-stockage.js"
    texte = stockage.read_bytes().decode("utf-8")
    m = re.search(r'const CLIENT_GRAPH_DEFAUT = "([^"]*)";', texte)
    if not m: sys.exit("Identifiant Microsoft introuvable dans 05-stockage.js : copie interrompue.")
    ancien = m.group(1)
    texte = texte.replace(m.group(0), 'const CLIENT_GRAPH_DEFAUT = "";')
    stockage.write_bytes(texte.encode("utf-8"))

    # Présentation : renvoyer d'abord vers la mise en route
    readme = sortie / "README.md"
    tete, _, reste_readme = readme.read_bytes().partition(b"\n")
    fin = b"\r\n" if tete.endswith(b"\r") else b"\n"
    readme.write_bytes(tete + b"\n" + fin + "> Copie autonome : commencez par [MISE-EN-ROUTE.md](MISE-EN-ROUTE.md).".encode("utf-8") + fin + reste_readme)

    subprocess.run([sys.executable, "outils/construire.py"], cwd=sortie, check=True)
    controle = subprocess.run([sys.executable, "outils/verifier_donnees.py", "--tout"], cwd=sortie)
    if controle.returncode != 0: sys.exit("Le contrôle des données a trouvé un motif personnel dans la copie : ne la transmettez pas avant correction.")
    reste = [p for p in sortie.rglob("*") if p.is_file() and ancien and ancien in p.read_text(encoding="utf-8", errors="ignore")]
    if reste: sys.exit("Identifiant Microsoft encore présent dans : " + ", ".join(str(p) for p in reste))
    print(f"Copie prête dans {sortie} (sans historique, sans identifiant Microsoft). À transmettre telle quelle, par exemple en dossier compressé.")

if __name__ == "__main__":
    main()
