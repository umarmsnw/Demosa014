from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
import base64
import hashlib
import json
import mimetypes
import os
import secrets
import sqlite3
import time


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = ROOT / "uploads"
DB_PATH = DATA_DIR / "demosa.db"
ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "demosa014"
SESSION_TTL = 60 * 60 * 24 * 7


FIELDS = [
    "fullName",
    "email",
    "phone",
    "startedClass",
    "leftClass",
    "jsClass",
    "ssClass",
    "placement",
    "maritalStatus",
    "address",
    "workplace",
    "professionalExperience",
]


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120000)
    return f"{salt}${digest.hex()}"


def verify_password(password, stored):
    if not stored or "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    return secrets.compare_digest(password_hash(password, salt).split("$", 1)[1], digest)


def init_db():
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fullName TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                phone TEXT NOT NULL,
                startedClass TEXT NOT NULL,
                leftClass TEXT NOT NULL,
                jsClass TEXT DEFAULT '',
                ssClass TEXT DEFAULT '',
                placement TEXT NOT NULL,
                maritalStatus TEXT DEFAULT '',
                address TEXT DEFAULT '',
                workplace TEXT DEFAULT '',
                professionalExperience TEXT DEFAULT '',
                photo TEXT DEFAULT '',
                passwordHash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                deceased INTEGER NOT NULL DEFAULT 0,
                createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                memberId INTEGER,
                expiresAt INTEGER NOT NULL
            );
            """
        )
        existing = conn.execute("SELECT value FROM settings WHERE key = 'adminPasswordHash'").fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)",
                ("adminPasswordHash", password_hash(DEFAULT_ADMIN_PASSWORD)),
            )
        count = conn.execute("SELECT COUNT(*) AS total FROM members").fetchone()["total"]
        if count == 0:
            seed_members(conn)


def seed_members(conn):
    seed = [
        {
            "fullName": "Aisha Mohammed",
            "email": "aisha@example.com",
            "phone": "+234 800 123 4567",
            "startedClass": "JSS 1",
            "leftClass": "Graduated",
            "jsClass": "2008",
            "ssClass": "2011",
            "placement": "Science",
            "maritalStatus": "Married",
            "address": "Kano, Nigeria",
            "workplace": "Federal Medical Centre",
            "professionalExperience": "Healthcare professional with experience in clinical service and community health outreach.",
            "password": "2348001234567",
        },
        {
            "fullName": "Daniel Okafor",
            "email": "daniel@example.com",
            "phone": "+234 803 222 7788",
            "startedClass": "JSS 2",
            "leftClass": "SS 3",
            "jsClass": "",
            "ssClass": "2010",
            "placement": "Commercial",
            "maritalStatus": "Single",
            "address": "Abuja, Nigeria",
            "workplace": "Zenith Bank",
            "professionalExperience": "Banking and finance professional with experience in customer relationship management.",
            "password": "2348032227788",
        },
    ]
    for item in seed:
        conn.execute(
            """
            INSERT INTO members (
                fullName, email, phone, startedClass, leftClass, jsClass, ssClass,
                placement, maritalStatus, address, workplace, professionalExperience,
                photo, passwordHash, status, deceased
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'approved', 0)
            """,
            (
                item["fullName"],
                item["email"],
                item["phone"],
                item["startedClass"],
                item["leftClass"],
                item["jsClass"],
                item["ssClass"],
                item["placement"],
                item["maritalStatus"],
                item["address"],
                item["workplace"],
                item["professionalExperience"],
                password_hash(item["password"]),
            ),
        )


def row_to_member(row):
    item = dict(row)
    item["id"] = str(item["id"])
    item["deceased"] = bool(item["deceased"])
    item.pop("passwordHash", None)
    return item


def parse_multipart(content_type, body):
    marker = "boundary="
    if marker not in content_type:
        return {}, {}
    boundary = content_type.split(marker, 1)[1].strip().strip('"')
    delimiter = ("--" + boundary).encode()
    fields = {}
    files = {}
    for part in body.split(delimiter):
        part = part.strip(b"\r\n")
        if not part or part == b"--":
            continue
        header_blob, _, content = part.partition(b"\r\n\r\n")
        headers = header_blob.decode("utf-8", "replace").split("\r\n")
        disposition = next((h for h in headers if h.lower().startswith("content-disposition:")), "")
        if "name=" not in disposition:
            continue
        name = disposition.split("name=", 1)[1].split(";", 1)[0].strip().strip('"')
        filename = ""
        if "filename=" in disposition:
            filename = disposition.split("filename=", 1)[1].split(";", 1)[0].strip().strip('"')
        content = content.rstrip(b"\r\n")
        if filename:
            content_type_header = next((h for h in headers if h.lower().startswith("content-type:")), "")
            mime = content_type_header.split(":", 1)[1].strip() if ":" in content_type_header else "application/octet-stream"
            files[name] = {"filename": filename, "content": content, "mime": mime}
        else:
            fields[name] = content.decode("utf-8", "replace").strip()
    return fields, files


def save_photo(file_info):
    if not file_info or not file_info["content"]:
        return ""
    ext = Path(file_info["filename"]).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        ext = ".jpg"
    name = f"{int(time.time())}-{secrets.token_hex(8)}{ext}"
    path = UPLOAD_DIR / name
    path.write_bytes(file_info["content"])
    return f"/uploads/{name}"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
        else:
            self.serve_static(parsed.path)

    def do_POST(self):
        self.handle_api_write("POST")

    def do_PUT(self):
        self.handle_api_write("PUT")

    def do_DELETE(self):
        self.handle_api_write("DELETE")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(length) if length else b""

    def json_body(self):
        body = self.read_body()
        return json.loads(body.decode("utf-8") or "{}") if body else {}

    def auth(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        token = header.split(" ", 1)[1].strip()
        now = int(time.time())
        with db() as conn:
            session = conn.execute("SELECT * FROM sessions WHERE token = ? AND expiresAt > ?", (token, now)).fetchone()
            if not session:
                return None
            return dict(session)

    def require_auth(self, role=None):
        session = self.auth()
        if not session:
            self.send_json({"error": "Authentication required"}, 401)
            return None
        if role and session["role"] != role:
            self.send_json({"error": "Permission denied"}, 403)
            return None
        return session

    def handle_api_get(self, parsed):
        if parsed.path == "/api/me":
            session = self.require_auth()
            if not session:
                return
            if session["role"] == "admin":
                self.send_json({"role": "admin", "username": ADMIN_USERNAME})
                return
            with db() as conn:
                member = conn.execute("SELECT * FROM members WHERE id = ?", (session["memberId"],)).fetchone()
            self.send_json({"role": "member", "member": row_to_member(member)} if member else {"role": "guest"})
            return

        if parsed.path == "/api/members":
            session = self.require_auth()
            if not session:
                return
            params = parse_qs(parsed.query)
            status = params.get("status", ["approved"])[0]
            with db() as conn:
                if status == "all" and session["role"] == "admin":
                    rows = conn.execute("SELECT * FROM members ORDER BY createdAt DESC").fetchall()
                else:
                    rows = conn.execute("SELECT * FROM members WHERE status = 'approved' ORDER BY createdAt DESC").fetchall()
            self.send_json({"members": [row_to_member(row) for row in rows]})
            return

        if parsed.path.startswith("/api/members/"):
            session = self.require_auth()
            if not session:
                return
            member_id = parsed.path.rsplit("/", 1)[-1]
            with db() as conn:
                row = conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
            if not row:
                self.send_json({"error": "Member not found"}, 404)
                return
            self.send_json({"member": row_to_member(row)})
            return

        self.send_json({"error": "Not found"}, 404)

    def handle_api_write(self, method):
        parsed = urlparse(self.path)
        if parsed.path == "/api/register" and method == "POST":
            fields, files = parse_multipart(self.headers.get("Content-Type", ""), self.read_body())
            self.create_member(fields, files, "pending")
            return

        if parsed.path == "/api/login" and method == "POST":
            self.login()
            return

        if parsed.path == "/api/logout" and method == "POST":
            session = self.auth()
            if session:
                with db() as conn:
                    conn.execute("DELETE FROM sessions WHERE token = ?", (session["token"],))
            self.send_json({"ok": True})
            return

        if parsed.path == "/api/admin/members" and method == "POST":
            if not self.require_auth("admin"):
                return
            fields, files = parse_multipart(self.headers.get("Content-Type", ""), self.read_body())
            self.create_member(fields, files, "approved")
            return

        if parsed.path == "/api/password" and method == "POST":
            self.change_password()
            return

        if parsed.path.startswith("/api/members/"):
            parts = parsed.path.strip("/").split("/")
            member_id = parts[2] if len(parts) >= 3 else ""
            action = parts[3] if len(parts) >= 4 else ""
            if action == "approve" and method == "POST":
                self.admin_update_member(member_id, {"status": "approved"})
                return
            if action == "deceased" and method == "POST":
                payload = self.json_body()
                self.admin_update_member(member_id, {"deceased": 1 if payload.get("deceased") else 0})
                return
            if method == "DELETE":
                self.delete_member(member_id)
                return
            if method == "PUT":
                self.update_member(member_id)
                return

        self.send_json({"error": "Not found"}, 404)

    def login(self):
        payload = self.json_body()
        identifier = (payload.get("identifier") or "").strip().lower()
        password = payload.get("password") or ""
        with db() as conn:
            if identifier == ADMIN_USERNAME:
                stored = conn.execute("SELECT value FROM settings WHERE key = 'adminPasswordHash'").fetchone()["value"]
                if verify_password(password, stored):
                    token = self.create_session(conn, "admin", None)
                    self.send_json({"token": token, "role": "admin"})
                    return
            row = conn.execute("SELECT * FROM members WHERE lower(email) = ? AND status = 'approved' AND deceased = 0", (identifier,)).fetchone()
            if row and verify_password(password, row["passwordHash"]):
                token = self.create_session(conn, "member", row["id"])
                self.send_json({"token": token, "role": "member", "member": row_to_member(row)})
                return
        self.send_json({"error": "Invalid login details or account not approved"}, 401)

    def create_session(self, conn, role, member_id):
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, role, memberId, expiresAt) VALUES (?, ?, ?, ?)",
            (token, role, member_id, int(time.time()) + SESSION_TTL),
        )
        return token

    def create_member(self, fields, files, status):
        missing = [field for field in ["fullName", "email", "phone", "startedClass", "leftClass", "placement", "password"] if not fields.get(field)]
        if missing:
            self.send_json({"error": "Missing required fields", "fields": missing}, 400)
            return
        photo = save_photo(files.get("photo"))
        values = {field: fields.get(field, "") for field in FIELDS}
        with db() as conn:
            try:
                cursor = conn.execute(
                    """
                    INSERT INTO members (
                        fullName, email, phone, startedClass, leftClass, jsClass, ssClass,
                        placement, maritalStatus, address, workplace, professionalExperience,
                        photo, passwordHash, status, deceased
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        values["fullName"],
                        values["email"].lower(),
                        values["phone"],
                        values["startedClass"],
                        values["leftClass"],
                        values["jsClass"],
                        values["ssClass"],
                        values["placement"],
                        values["maritalStatus"],
                        values["address"],
                        values["workplace"],
                        values["professionalExperience"],
                        photo,
                        password_hash(fields["password"]),
                        status,
                    ),
                )
            except sqlite3.IntegrityError:
                self.send_json({"error": "Email already exists"}, 409)
                return
            row = conn.execute("SELECT * FROM members WHERE id = ?", (cursor.lastrowid,)).fetchone()
        self.send_json({"member": row_to_member(row)}, 201)

    def update_member(self, member_id):
        session = self.require_auth()
        if not session:
            return
        if session["role"] != "admin" and str(session["memberId"]) != str(member_id):
            self.send_json({"error": "Permission denied"}, 403)
            return
        content_type = self.headers.get("Content-Type", "")
        fields, files = parse_multipart(content_type, self.read_body())
        updates = {field: fields.get(field, "") for field in FIELDS if field in fields}
        photo = save_photo(files.get("photo"))
        if photo:
            updates["photo"] = photo
        if not updates:
            self.send_json({"error": "No updates supplied"}, 400)
            return
        assignments = ", ".join([f"{key} = ?" for key in updates]) + ", updatedAt = CURRENT_TIMESTAMP"
        with db() as conn:
            conn.execute(f"UPDATE members SET {assignments} WHERE id = ?", [*updates.values(), member_id])
            row = conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
        self.send_json({"member": row_to_member(row)})

    def admin_update_member(self, member_id, updates):
        if not self.require_auth("admin"):
            return
        assignments = ", ".join([f"{key} = ?" for key in updates]) + ", updatedAt = CURRENT_TIMESTAMP"
        with db() as conn:
            conn.execute(f"UPDATE members SET {assignments} WHERE id = ?", [*updates.values(), member_id])
            row = conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
        if not row:
            self.send_json({"error": "Member not found"}, 404)
            return
        self.send_json({"member": row_to_member(row)})

    def delete_member(self, member_id):
        if not self.require_auth("admin"):
            return
        with db() as conn:
            conn.execute("DELETE FROM members WHERE id = ?", (member_id,))
        self.send_json({"ok": True})

    def change_password(self):
        session = self.require_auth()
        if not session:
            return
        payload = self.json_body()
        current = payload.get("currentPassword") or ""
        new = payload.get("newPassword") or ""
        confirm = payload.get("confirmPassword") or ""
        if len(new) < 6:
            self.send_json({"error": "Password must be at least 6 characters"}, 400)
            return
        if new != confirm:
            self.send_json({"error": "New passwords do not match"}, 400)
            return
        with db() as conn:
            if session["role"] == "admin":
                stored = conn.execute("SELECT value FROM settings WHERE key = 'adminPasswordHash'").fetchone()["value"]
                if not verify_password(current, stored):
                    self.send_json({"error": "Current admin password is incorrect"}, 400)
                    return
                conn.execute("UPDATE settings SET value = ? WHERE key = 'adminPasswordHash'", (password_hash(new),))
            else:
                row = conn.execute("SELECT passwordHash FROM members WHERE id = ?", (session["memberId"],)).fetchone()
                if not row or not verify_password(current, row["passwordHash"]):
                    self.send_json({"error": "Current password is incorrect"}, 400)
                    return
                conn.execute("UPDATE members SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", (password_hash(new), session["memberId"]))
        self.send_json({"ok": True})

    def serve_static(self, request_path):
        request_path = unquote(request_path.split("?", 1)[0])
        if request_path == "/":
            request_path = "/index.html"
        path = (ROOT / request_path.lstrip("/")).resolve()
        if not str(path).startswith(str(ROOT)) or not path.exists() or path.is_dir():
            self.send_response(404)
            self.end_headers()
            return
        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(path.stat().st_size))
        self.end_headers()
        self.wfile.write(path.read_bytes())

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"DEMOSA backend running at http://localhost:{port}")
    server.serve_forever()
