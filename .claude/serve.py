# Local preview server for the site.
#  - tells the browser not to cache, so edits show up on a normal reload
#  - POST /__save    writes assets/js/data.js (the previous version goes to data.js.bak)
#  - POST /__upload  stores an image in assets/img/uploads/
# It only listens on 127.0.0.1, and only accepts writes from pages it serves itself.
import http.server, json, os, re, shutil, sys
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "assets", "js", "data.js")
UPLOADS = os.path.join(ROOT, "assets", "img", "uploads")
PAGES = ["index.html", "business.html", "profile.html"]
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"}
MAX_BODY = 25 * 1024 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        # The custom header forces a CORS preflight that this server never approves,
        # so other websites open in the browser cannot post here.
        if self.headers.get("X-Site-Editor") != "1":
            return False
        origin = self.headers.get("Origin")
        return origin is None or urlparse(origin).netloc == self.headers.get("Host")

    def do_POST(self):
        if not self.allowed():
            return self.reply(403, {"error": "Forbidden"})
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY:
            return self.reply(413, {"error": "File too large"})
        body = self.rfile.read(length)
        url = urlparse(self.path)

        if url.path == "/__save":
            try:
                data = json.loads(body)
                assert isinstance(data, dict) and "gallery" in data
            except Exception:
                return self.reply(400, {"error": "Invalid data"})
            old = open(DATA, encoding="utf-8").read() if os.path.exists(DATA) else ""
            head = old[: old.find("window.SITE")] if "window.SITE" in old else ""
            if old:
                shutil.copyfile(DATA, DATA + ".bak")
            with open(DATA, "w", encoding="utf-8", newline="\n") as f:
                f.write(head + "window.SITE = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n")
            bump_version()
            return self.reply(200, {"ok": True})

        if url.path == "/__upload":
            name = parse_qs(url.query).get("name", ["image"])[0]
            base, ext = os.path.splitext(os.path.basename(name))
            ext = ext.lower()
            if ext not in IMAGE_EXT:
                return self.reply(400, {"error": "Only image files can be uploaded"})
            base = re.sub(r"[^a-zA-Z0-9_-]+", "-", base).strip("-").lower() or "image"
            os.makedirs(UPLOADS, exist_ok=True)
            fn, n = base + ext, 2
            while os.path.exists(os.path.join(UPLOADS, fn)):
                fn, n = f"{base}-{n}{ext}", n + 1
            with open(os.path.join(UPLOADS, fn), "wb") as f:
                f.write(body)
            return self.reply(200, {"path": "assets/img/uploads/" + fn})

        return self.reply(404, {"error": "Not found"})


def bump_version():
    """Raise the ?v= number on data.js in every page so visitors get the new content."""
    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            continue
        html = open(path, encoding="utf-8").read()
        new = re.sub(r"(assets/js/data\.js\?v=)(\d+)", lambda m: m.group(1) + str(int(m.group(2)) + 1), html)
        if new != html:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(new)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"Serving {ROOT} on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
