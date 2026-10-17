"""Captures d'écran de la démonstration (données fictives) avec Edge sans interface.

Pilote minimal du protocole DevTools, sans dépendance externe.
Usage : python outils/captures.py URL_DE_BASE DOSSIER_SORTIE [largeur] [ecran1,ecran2,...]
Exemple : python outils/captures.py "http://localhost:8000/?demo" captures 1366
"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request, tempfile

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9339

class WS:
    def __init__(self, url):
        hote, chemin = url[len("ws://"):].split("/", 1)
        h, p = hote.split(":")
        self.s = socket.create_connection((h, int(p)))
        cle = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(f"GET /{chemin} HTTP/1.1\r\nHost: {hote}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {cle}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
        rep = b""
        while b"\r\n\r\n" not in rep: rep += self.s.recv(1)
        self.n = 0
    def envoyer(self, texte):
        d = texte.encode(); masque = os.urandom(4)
        tete = bytes([0x81]); l = len(d)
        tete += bytes([0x80 | l]) if l < 126 else (bytes([0x80 | 126]) + struct.pack(">H", l) if l < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", l))
        self.s.sendall(tete + masque + bytes(b ^ masque[i % 4] for i, b in enumerate(d)))
    def lire_exact(self, n):
        b = b""
        while len(b) < n:
            x = self.s.recv(n - len(b))
            if not x: raise IOError("connexion fermée")
            b += x
        return b
    def recevoir(self):
        msg = b""
        while True:
            b1, b2 = self.lire_exact(2)
            l = b2 & 0x7F
            if l == 126: l = struct.unpack(">H", self.lire_exact(2))[0]
            elif l == 127: l = struct.unpack(">Q", self.lire_exact(8))[0]
            msg += self.lire_exact(l)
            if b1 & 0x80: return msg.decode("utf-8", "replace")
    def appel(self, methode, params=None):
        self.n += 1; ident = self.n
        self.envoyer(json.dumps({"id": ident, "method": methode, "params": params or {}}))
        while True:
            r = json.loads(self.recevoir())
            if r.get("id") == ident:
                if "error" in r: raise RuntimeError(r["error"])
                return r.get("result", {})

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    base, sortie = sys.argv[1], sys.argv[2]
    largeur = int(sys.argv[3]) if len(sys.argv) > 3 else 1366
    ecrans = sys.argv[4].split(",") if len(sys.argv) > 4 else ["accueil", "traiter", "operations", "import", "justificatifs", "boite", "commercants", "budget", "patrimoine", "tresorerie", "reglages"]
    os.makedirs(sortie, exist_ok=True)
    profil = tempfile.mkdtemp(prefix="edge-captures-")
    proc = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--remote-debugging-port={PORT}", f"--user-data-dir={profil}", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                cibles = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")); break
            except Exception: time.sleep(0.2)
        page = next(c for c in cibles if c["type"] == "page")
        ws = WS(page["webSocketDebuggerUrl"])
        mobile = largeur < 700
        ws.appel("Emulation.setDeviceMetricsOverride", {"width": largeur, "height": 900, "deviceScaleFactor": 1, "mobile": mobile})
        ws.appel("Page.enable"); ws.appel("Runtime.enable")
        ws.appel("Page.navigate", {"url": base + "#accueil"})
        for i in range(160):
            time.sleep(0.5)
            r = ws.appel("Runtime.evaluate", {"expression": "typeof SESSION !== 'undefined' && SESSION.etat === 'ouvert' && !document.getElementById('appli').hidden", "returnByValue": True})
            if r.get("result", {}).get("value"): break
            if i in (20, 60):   # page restée vide (premier chargement) : on recharge
                charge = ws.appel("Runtime.evaluate", {"expression": "typeof SESSION !== 'undefined'", "returnByValue": True})
                if not charge.get("result", {}).get("value"): ws.appel("Page.navigate", {"url": base + "#accueil"})
        time.sleep(1.0)
        etat = ws.appel("Runtime.evaluate", {"expression": "JSON.stringify([typeof SESSION !== 'undefined' && SESSION.etat, document.getElementById('appli').hidden, document.getElementById('verrou').hidden, document.body.innerText.slice(0, 120), innerWidth, window.__erreurs])", "returnByValue": True})
        print("état :", etat.get("result", {}).get("value"))
        diag = ws.appel("Runtime.evaluate", {"expression": "JSON.stringify([document.documentElement.outerHTML.length, document.scripts.length, location.href, performance.getEntriesByType('navigation')[0]?.transferSize])", "returnByValue": True})
        print("diagnostic :", diag.get("result", {}).get("value"))
        SPECIAUX = {
            "telephone": "demonstrationMobile()",
            "telephone-saisie": "(async () => { await demonstrationMobile(); const t = await lireTicket(await (await fetch('donnees-fictives/ticket-boucherie.jpg')).blob()); formulaireMobile(document.querySelector('#saisie .corps-tel'), nouvelleSaisieMobile(), t); })()",
        }
        for e in ecrans:
            expr = SPECIAUX.get(e, f"aller('{e}'); actualiserBoite && actualiserBoite();")
            ws.appel("Runtime.evaluate", {"expression": expr, "awaitPromise": False})
            time.sleep(4.0 if e in SPECIAUX else 1.6)
            hauteur = ws.appel("Runtime.evaluate", {"expression": "Math.max(document.body.scrollHeight, 900)", "returnByValue": True})["result"]["value"]
            ws.appel("Emulation.setDeviceMetricsOverride", {"width": largeur, "height": min(int(hauteur), 4000), "deviceScaleFactor": 1, "mobile": mobile})
            time.sleep(0.4)
            img = ws.appel("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(sortie, f"{e}.png"), "wb") as f: f.write(base64.b64decode(img["data"]))
            ws.appel("Emulation.setDeviceMetricsOverride", {"width": largeur, "height": 900, "deviceScaleFactor": 1, "mobile": mobile})
            print("capture", e, hauteur)
        erreurs = ws.appel("Runtime.evaluate", {"expression": "JSON.stringify(window.__erreurs || [])", "returnByValue": True})
        print("erreurs JS :", erreurs.get("result", {}).get("value"))
    finally:
        proc.terminate()

if __name__ == "__main__":
    main()
