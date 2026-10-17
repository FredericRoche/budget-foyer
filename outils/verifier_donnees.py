"""Contrôle avant publication : refuse tout fichier contenant une donnée réelle.

Appelé par le crochet git « pre-commit » (voir PROCEDURE-AZURE-ET-PUBLICATION.md), ou à la main :
    python outils/verifier_donnees.py            # fichiers prêts à être validés (git)
    python outils/verifier_donnees.py --tout     # tout le dossier

Les motifs interdits propres au foyer (numéros de comptes, noms, adresse…) sont lus dans un
fichier PERSONNEL, hors du dépôt : %USERPROFILE%\\.budget-foyer-motifs.txt (un motif par ligne).
Ils ne sont donc jamais publiés eux-mêmes. S'y ajoutent des motifs génériques (IBAN).
"""
import os, pathlib, re, subprocess, sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
FICHIER_MOTIFS = pathlib.Path(os.path.expanduser("~")) / ".budget-foyer-motifs.txt"
GENERIQUES = [r"\bFR\d{2}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?[0-9A-Z]{3}\b"]   # IBAN français

def motifs():
    m = [re.compile(g) for g in GENERIQUES]
    if FICHIER_MOTIFS.exists():
        for ligne in FICHIER_MOTIFS.read_text(encoding="utf-8").splitlines():
            ligne = ligne.strip()
            if ligne and not ligne.startswith("#"): m.append(re.compile(re.escape(ligne), re.I))
    else:
        print("Attention : fichier de motifs personnels absent (" + str(FICHIER_MOTIFS) + ") : seuls les IBAN sont contrôlés.")
    return m

def fichiers(tout):
    if tout:
        return [p for p in RACINE.rglob("*") if p.is_file() and ".git" not in p.parts and "maquettes" not in p.parts and ".claude" not in p.parts]
    sortie = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"], cwd=RACINE, capture_output=True, text=True).stdout
    return [RACINE / l for l in sortie.splitlines() if l.strip()]

def main():
    ms = motifs(); fautes = []
    for f in fichiers("--tout" in sys.argv):
        try: contenu = f.read_bytes().decode("utf-8", "ignore")
        except Exception: continue
        if f.name == "verifier_donnees.py": continue
        for m in ms:
            r = m.search(contenu)
            if r: fautes.append(f"{f.relative_to(RACINE)} : motif interdit trouvé ({m.pattern[:12]}…)")
    if fautes:
        print("PUBLICATION REFUSÉE — données personnelles détectées :"); print("\n".join(fautes)); sys.exit(1)
    print("Contrôle des données : rien de personnel détecté.")

if __name__ == "__main__":
    main()
