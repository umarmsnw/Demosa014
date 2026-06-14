from pathlib import Path
import base64
import hashlib
import secrets
import sqlite3

import streamlit as st


APP_NAME = "Demonstration Old Students Association (DEMOSA) ABU Kongo Annex 014"
DB_PATH = Path("data") / "demosa_streamlit.db"
ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "demosa014"


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
    DB_PATH.parent.mkdir(exist_ok=True)
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
    check = password_hash(password, salt).split("$", 1)[1]
    return secrets.compare_digest(check, digest)


def init_db():
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
                createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
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


def query_members(status="approved"):
    with db() as conn:
        if status == "all":
            rows = conn.execute("SELECT * FROM members ORDER BY createdAt DESC").fetchall()
        else:
            rows = conn.execute("SELECT * FROM members WHERE status = ? ORDER BY createdAt DESC", (status,)).fetchall()
    return [dict(row) for row in rows]


def get_member(member_id):
    with db() as conn:
        row = conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
    return dict(row) if row else None


def image_to_data_url(uploaded):
    if not uploaded:
        return ""
    mime = uploaded.type or "image/jpeg"
    data = base64.b64encode(uploaded.read()).decode()
    return f"data:{mime};base64,{data}"


def create_member(data, status):
    with db() as conn:
        conn.execute(
            """
            INSERT INTO members (
                fullName, email, phone, startedClass, leftClass, jsClass, ssClass,
                placement, maritalStatus, address, workplace, professionalExperience,
                photo, passwordHash, status, deceased
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                data["fullName"],
                data["email"].lower(),
                data["phone"],
                data["startedClass"],
                data["leftClass"],
                data.get("jsClass", ""),
                data.get("ssClass", ""),
                data["placement"],
                data.get("maritalStatus", ""),
                data.get("address", ""),
                data.get("workplace", ""),
                data.get("professionalExperience", ""),
                data.get("photo", ""),
                password_hash(data["password"]),
                status,
            ),
        )


def update_member(member_id, data):
    updates = {key: data.get(key, "") for key in FIELDS}
    if data.get("photo"):
        updates["photo"] = data["photo"]
    assignments = ", ".join([f"{key} = ?" for key in updates])
    with db() as conn:
        conn.execute(f"UPDATE members SET {assignments} WHERE id = ?", [*updates.values(), member_id])


def set_member_status(member_id, status):
    with db() as conn:
        conn.execute("UPDATE members SET status = ? WHERE id = ?", (status, member_id))


def set_deceased(member_id, deceased):
    with db() as conn:
        conn.execute("UPDATE members SET deceased = ? WHERE id = ?", (1 if deceased else 0, member_id))


def delete_member(member_id):
    with db() as conn:
        conn.execute("DELETE FROM members WHERE id = ?", (member_id,))


def login(identifier, password):
    identifier = identifier.strip().lower()
    with db() as conn:
        if identifier == ADMIN_USERNAME:
            stored = conn.execute("SELECT value FROM settings WHERE key = 'adminPasswordHash'").fetchone()["value"]
            if verify_password(password, stored):
                st.session_state.role = "admin"
                st.session_state.member_id = None
                return True
        row = conn.execute(
            "SELECT * FROM members WHERE lower(email) = ? AND status = 'approved' AND deceased = 0",
            (identifier,),
        ).fetchone()
        if row and verify_password(password, row["passwordHash"]):
            st.session_state.role = "member"
            st.session_state.member_id = row["id"]
            return True
    return False


def change_password(current, new, confirm):
    if len(new) < 6:
        st.error("Password must be at least 6 characters.")
        return
    if new != confirm:
        st.error("New passwords do not match.")
        return
    with db() as conn:
        if st.session_state.role == "admin":
            stored = conn.execute("SELECT value FROM settings WHERE key = 'adminPasswordHash'").fetchone()["value"]
            if not verify_password(current, stored):
                st.error("Current admin password is incorrect.")
                return
            conn.execute("UPDATE settings SET value = ? WHERE key = 'adminPasswordHash'", (password_hash(new),))
        else:
            row = conn.execute("SELECT passwordHash FROM members WHERE id = ?", (st.session_state.member_id,)).fetchone()
            if not row or not verify_password(current, row["passwordHash"]):
                st.error("Current password is incorrect.")
                return
            conn.execute("UPDATE members SET passwordHash = ? WHERE id = ?", (password_hash(new), st.session_state.member_id))
    st.success("Password updated.")


def member_form(prefix="", existing=None, include_password=True):
    existing = existing or {}
    col1, col2 = st.columns(2)
    with col1:
        full_name = st.text_input("Full name", existing.get("fullName", ""), key=f"{prefix}fullName")
        email = st.text_input("Email", existing.get("email", ""), key=f"{prefix}email")
        phone = st.text_input("Phone number", existing.get("phone", ""), key=f"{prefix}phone")
        started = st.selectbox("Started from class", ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"], key=f"{prefix}started")
        left = st.selectbox("Left with class", ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3", "Graduated"], key=f"{prefix}left")
    with col2:
        js_class = st.text_input("JS class set", existing.get("jsClass", ""), placeholder="Example: A class, B class", key=f"{prefix}js")
        ss_class = st.text_input("SS class set", existing.get("ssClass", ""), placeholder="Example: A class, B class", key=f"{prefix}ss")
        placement = st.selectbox("Placement", ["Science", "Art", "Commercial"], key=f"{prefix}placement")
        marital = st.selectbox("Marital status", ["", "Single", "Married", "Divorced", "Widowed"], key=f"{prefix}marital")
        workplace = st.text_input("Place of work", existing.get("workplace", ""), key=f"{prefix}work")
    experience = st.text_area("Professional experience", existing.get("professionalExperience", ""), key=f"{prefix}exp")
    address = st.text_area("Address", existing.get("address", ""), key=f"{prefix}address")
    uploaded = st.file_uploader("Picture upload", type=["jpg", "jpeg", "png", "webp"], key=f"{prefix}photo")
    password = ""
    if include_password:
        password = st.text_input("Password", type="password", key=f"{prefix}password")
    return {
        "fullName": full_name,
        "email": email,
        "phone": phone,
        "startedClass": started,
        "leftClass": left,
        "jsClass": js_class,
        "ssClass": ss_class,
        "placement": placement,
        "maritalStatus": marital,
        "address": address,
        "workplace": workplace,
        "professionalExperience": experience,
        "photo": image_to_data_url(uploaded),
        "password": password,
    }


def show_member_card(member, detail=False):
    cols = st.columns([1, 3])
    with cols[0]:
        if member.get("photo"):
            st.image(member["photo"], width=130)
        else:
            st.markdown(f"### {member['fullName'][:1].upper()}")
    with cols[1]:
        st.subheader(member["fullName"])
        st.caption(f"{member['placement']} | {member['startedClass']} to {member['leftClass']}")
        if member.get("deceased"):
            st.error("Deceased")
        st.write(f"Email: {member['email']}")
        st.write(f"Phone: {member['phone']}")
        st.write(f"Place of work: {member.get('workplace') or 'Not provided'}")
        if detail:
            st.write(f"JS class set: {member.get('jsClass') or 'Not provided'}")
            st.write(f"SS class set: {member.get('ssClass') or 'Not provided'}")
            st.write(f"Marital status: {member.get('maritalStatus') or 'Not provided'}")
            st.write(f"Address: {member.get('address') or 'Not provided'}")
            st.write(f"Professional experience: {member.get('professionalExperience') or 'Not provided'}")


def home_page():
    st.title(APP_NAME)
    st.image("assets/demosa-logo.jpeg", width=180)
    st.markdown(
        "> Unity is the strength that turns classmates into brothers, memories into legacy, "
        "and service into a future we build together."
    )
    st.info("Register, wait for admin approval, then login to update your profile and view members.")


def register_page():
    st.header("Alumni Registration")
    with st.form("register_form"):
        data = member_form("reg_", include_password=True)
        submitted = st.form_submit_button("Submit for Approval")
    if submitted:
        required = ["fullName", "email", "phone", "startedClass", "leftClass", "placement", "password"]
        if any(not data.get(field) for field in required):
            st.error("Please complete all required fields.")
            return
        try:
            create_member(data, "pending")
            st.success("Registration submitted. Admin approval is required before login.")
        except sqlite3.IntegrityError:
            st.error("That email already exists.")


def login_page():
    st.header("Portal Login")
    with st.form("login_form"):
        identifier = st.text_input("Email or admin username")
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Login")
    if submitted:
        if login(identifier, password):
            st.success("Login successful.")
            st.rerun()
        else:
            st.error("Invalid login details or account not approved.")


def dashboard_page():
    member = get_member(st.session_state.member_id)
    if not member:
        st.error("Member record not found.")
        return
    st.header("Member Dashboard")
    show_member_card(member, detail=True)
    st.divider()
    st.subheader("Update Profile")
    with st.form("profile_form"):
        data = member_form("profile_", existing=member, include_password=False)
        submitted = st.form_submit_button("Save Profile")
    if submitted:
        update_member(member["id"], data)
        st.success("Profile updated.")
        st.rerun()
    st.subheader("Manage Password")
    password_controls()


def members_page():
    st.header("Members")
    query = st.text_input("Search members")
    placement = st.selectbox("Placement", ["All", "Science", "Art", "Commercial"])
    members = query_members("approved")
    if query:
        q = query.lower()
        members = [m for m in members if q in " ".join(str(m.get(k, "")) for k in FIELDS).lower()]
    if placement != "All":
        members = [m for m in members if m["placement"] == placement]
    for member in members:
        with st.expander(member["fullName"]):
            show_member_card(member, detail=True)


def admin_page():
    st.header("Admin Dashboard")
    members = query_members("all")
    pending = [m for m in members if m["status"] == "pending"]
    approved = [m for m in members if m["status"] == "approved"]
    deceased = [m for m in approved if m["deceased"]]
    c1, c2, c3 = st.columns(3)
    c1.metric("Pending", len(pending))
    c2.metric("Approved", len(approved))
    c3.metric("Deceased", len(deceased))

    st.subheader("Pending Approval")
    if not pending:
        st.info("No pending registrations.")
    for member in pending:
        with st.expander(member["fullName"]):
            show_member_card(member, detail=True)
            col1, col2 = st.columns(2)
            if col1.button("Approve", key=f"approve_{member['id']}"):
                set_member_status(member["id"], "approved")
                st.rerun()
            if col2.button("Reject", key=f"reject_{member['id']}"):
                delete_member(member["id"])
                st.rerun()

    st.subheader("Manage Approved Members")
    for member in approved:
        with st.expander(member["fullName"]):
            show_member_card(member, detail=True)
            col1, col2 = st.columns(2)
            if col1.button("Toggle Deceased Flag", key=f"deceased_{member['id']}"):
                set_deceased(member["id"], not member["deceased"])
                st.rerun()
            if col2.button("Remove Member", key=f"remove_{member['id']}"):
                delete_member(member["id"])
                st.rerun()

    st.subheader("Add Member Directly")
    with st.form("admin_add"):
        data = member_form("admin_", include_password=True)
        submitted = st.form_submit_button("Add Approved Member")
    if submitted:
        try:
            create_member(data, "approved")
            st.success("Member added.")
            st.rerun()
        except sqlite3.IntegrityError:
            st.error("That email already exists.")

    st.subheader("Manage Admin Password")
    password_controls()


def password_controls():
    with st.form(f"password_{st.session_state.role}"):
        current = st.text_input("Current password", type="password")
        new = st.text_input("New password", type="password")
        confirm = st.text_input("Confirm new password", type="password")
        submitted = st.form_submit_button("Change Password")
    if submitted:
        change_password(current, new, confirm)


def logout():
    st.session_state.role = "guest"
    st.session_state.member_id = None
    st.rerun()


def main():
    st.set_page_config(page_title="DEMOSA 014", page_icon="🎓", layout="wide")
    init_db()
    st.session_state.setdefault("role", "guest")
    st.session_state.setdefault("member_id", None)

    role = st.session_state.role
    public_pages = ["Home", "Login", "Register"]
    member_pages = ["Home", "Dashboard", "Members", "Logout"]
    admin_pages = ["Home", "Admin", "Logout"]
    pages = admin_pages if role == "admin" else member_pages if role == "member" else public_pages
    choice = st.sidebar.radio("Navigation", pages)

    if choice == "Home":
        home_page()
    elif choice == "Register":
        register_page()
    elif choice == "Login":
        login_page()
    elif choice == "Dashboard":
        dashboard_page()
    elif choice == "Members":
        members_page()
    elif choice == "Admin":
        admin_page()
    elif choice == "Logout":
        logout()


if __name__ == "__main__":
    main()
