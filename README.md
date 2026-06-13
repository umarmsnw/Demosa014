# DEMOSA Alumni Portal

Static frontend plus a dependency-free Python backend for member registration, admin approval, profile updates, photo uploads, login sessions, and SQLite database storage.

## Run Locally

Use Python 3:

```powershell
python server.py
```

Then open:

```text
http://localhost:8000
```

The app must be opened through the backend URL, not directly as `file:///...`, because registrations and logins now use API calls.

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
