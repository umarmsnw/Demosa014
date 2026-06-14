# DEMOSA Alumni Portal

Static frontend plus a dependency-free Python backend for member registration, admin approval, profile updates, photo uploads, login sessions, and SQLite database storage.

## Deploy on Streamlit Community Cloud

Use these settings at `https://share.streamlit.io/deploy`:

```text
Repository: umarmsnw/Demosa014
Branch: main
Main file path: streamlit_app.py
```

Streamlit Cloud uses `requirements.txt`, so it will install Streamlit automatically.

Note: Streamlit Community Cloud filesystem storage can reset when the app is rebuilt or restarted. For permanent production data, connect the app to a hosted database such as Supabase, Neon, or another managed SQL database.

## Run Locally

Use Python 3:

```powershell
python server.py
```

On this Windows workspace you can also double-click:

```text
start-server.bat
```

Then open:

```text
http://localhost:8000
```

The app must be opened through the backend URL, not directly as `file:///...`, because registrations and logins now use API calls.
If you do open `index.html` directly, keep the backend running at `http://localhost:8000` so API calls can still reach the database.

## Default Login

Admin:

```text
username: admin
password: demosa014
```

Seed members:

```text
aisha@example.com / 2348001234567
daniel@example.com / 2348032227788
```

## Data Storage

- SQLite database: `data/demosa.db`
- Uploaded photos: `uploads/`

These folders are ignored by Git so live data is not committed.
