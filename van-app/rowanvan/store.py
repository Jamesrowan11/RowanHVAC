"""Local SQLite copy of the technician's jobs plus the outbox of unsent changes.

Every change the technician makes is applied to the local tables immediately
(so the app works with no signal) and recorded as an op in `outbox`. The sync
engine sends the outbox to the server and replaces the local tables with the
server's snapshot; any ops still waiting are re-applied on top so the screen
never "jumps back" to stale data.

Each thread must use its own Store (SQLite connections are per-thread).
"""

import json
import sqlite3
import time
import uuid

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    customer_name TEXT, address TEXT, service_needed TEXT,
    scheduled_day TEXT, scheduled_time TEXT, status TEXT,
    cancel_reason TEXT, summary TEXT,
    client_name TEXT, client_phone TEXT, client_email TEXT,
    position INTEGER
);
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, job_id TEXT, body TEXT, author_name TEXT,
    created_at TEXT, pending INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notes_job ON notes (job_id);
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY, title TEXT, body TEXT, author_name TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT UNIQUE, payload TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS problems (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, created_at TEXT,
    seen INTEGER DEFAULT 0
);
"""

JOB_FIELDS = [
    ("id", "id"),
    ("customer_name", "customerName"),
    ("address", "address"),
    ("service_needed", "serviceNeeded"),
    ("scheduled_day", "scheduledDay"),
    ("scheduled_time", "scheduledTime"),
    ("status", "status"),
    ("cancel_reason", "cancelReason"),
    ("summary", "summary"),
    ("client_name", "clientName"),
    ("client_phone", "clientPhone"),
    ("client_email", "clientEmail"),
]

OPEN_STATUSES = ("SCHEDULED", "IN_PROGRESS")


def utc_now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def new_id():
    return uuid.uuid4().hex


class Store(object):
    def __init__(self, path):
        self.conn = sqlite3.connect(path, timeout=15)
        self.conn.row_factory = sqlite3.Row
        with self.conn:
            self.conn.executescript(SCHEMA)

    def close(self):
        self.conn.close()

    # ---- settings ----

    def get(self, key, default=None):
        row = self.conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def set(self, key, value):
        with self.conn:
            if value is None:
                self.conn.execute("DELETE FROM meta WHERE key = ?", (key,))
            else:
                self.conn.execute(
                    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, str(value))
                )

    def sign_out(self):
        """Forget the account and all cached customer data (keeps the server URL
        and van name so the next sign-in is quick)."""
        with self.conn:
            for table in ("jobs", "notes", "announcements", "outbox", "problems"):
                self.conn.execute("DELETE FROM " + table)
            for key in ("token", "user_id", "user_name", "user_email", "snapshot_hash", "last_sync"):
                self.conn.execute("DELETE FROM meta WHERE key = ?", (key,))

    # ---- local changes (queued for the server) ----

    def _queue(self, payload):
        payload["opId"] = new_id()
        self.conn.execute(
            "INSERT INTO outbox (op_id, payload, created_at) VALUES (?, ?, ?)",
            (payload["opId"], json.dumps(payload), utc_now_iso()),
        )
        return payload["opId"]

    def set_job_status(self, job_id, status, summary=None):
        with self.conn:
            op = {"type": "job.status", "jobId": job_id, "status": status}
            if summary:
                op["summary"] = summary
            self._apply_status(op)
            return self._queue(op)

    def add_note(self, job_id, body, author_name):
        with self.conn:
            note_id = "van_" + new_id()
            created = utc_now_iso()
            self.conn.execute(
                "INSERT INTO notes (id, job_id, body, author_name, created_at, pending)"
                " VALUES (?, ?, ?, ?, ?, 1)",
                (note_id, job_id, body, author_name, created),
            )
            self._queue({
                "type": "note.add", "id": note_id, "jobId": job_id,
                "body": body, "createdAt": created,
            })
            return note_id

    def _apply_status(self, op):
        if op.get("status") == "COMPLETED" and op.get("summary"):
            self.conn.execute(
                "UPDATE jobs SET status = ?, summary = ? WHERE id = ? AND status != 'CANCELLED'",
                (op["status"], op["summary"], op["jobId"]),
            )
        else:
            self.conn.execute(
                "UPDATE jobs SET status = ? WHERE id = ? AND status != 'CANCELLED'",
                (op["status"], op["jobId"]),
            )

    # ---- sync plumbing ----

    def pending_ops(self, limit=200):
        rows = self.conn.execute(
            "SELECT payload FROM outbox ORDER BY seq LIMIT ?", (limit,)
        ).fetchall()
        return [json.loads(r["payload"]) for r in rows]

    def pending_count(self):
        return self.conn.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]

    def ack(self, results):
        """Removes ops the server answered. Rejected ops are dropped too (they
        can never succeed) and recorded as problems to show the technician."""
        with self.conn:
            for r in results:
                op_id = r.get("opId")
                row = self.conn.execute(
                    "SELECT payload FROM outbox WHERE op_id = ?", (op_id,)
                ).fetchone()
                if row is None:
                    continue
                op = json.loads(row["payload"])
                self.conn.execute("DELETE FROM outbox WHERE op_id = ?", (op_id,))
                if op.get("type") == "note.add":
                    if r.get("ok"):
                        self.conn.execute("UPDATE notes SET pending = 0 WHERE id = ?", (op["id"],))
                    else:
                        self.conn.execute("DELETE FROM notes WHERE id = ?", (op["id"],))
                if not r.get("ok"):
                    self.conn.execute(
                        "INSERT INTO problems (message, created_at) VALUES (?, ?)",
                        (r.get("error") or "A change could not be saved.", utc_now_iso()),
                    )

    def replace_snapshot(self, snapshot, snapshot_hash):
        with self.conn:
            self.conn.execute("DELETE FROM jobs")
            self.conn.execute("DELETE FROM notes WHERE pending = 0")
            self.conn.execute("DELETE FROM announcements")
            cols = ", ".join(c for c, _ in JOB_FIELDS) + ", position"
            marks = ", ".join("?" for _ in JOB_FIELDS) + ", ?"
            for pos, job in enumerate(snapshot.get("jobs", [])):
                values = [job.get(k) for _, k in JOB_FIELDS] + [pos]
                self.conn.execute("INSERT INTO jobs (" + cols + ") VALUES (" + marks + ")", values)
                for n in job.get("notes", []):
                    self.conn.execute(
                        "INSERT OR REPLACE INTO notes (id, job_id, body, author_name, created_at, pending)"
                        " VALUES (?, ?, ?, ?, ?, 0)",
                        (n["id"], job["id"], n.get("body"), n.get("authorName"), n.get("createdAt")),
                    )
            for a in snapshot.get("announcements", []):
                self.conn.execute(
                    "INSERT INTO announcements (id, title, body, author_name, created_at)"
                    " VALUES (?, ?, ?, ?, ?)",
                    (a["id"], a.get("title"), a.get("body"), a.get("authorName"), a.get("createdAt")),
                )
            # Changes made while this sync was in flight are still in the
            # outbox: keep showing them.
            for row in self.conn.execute("SELECT payload FROM outbox ORDER BY seq").fetchall():
                op = json.loads(row["payload"])
                if op.get("type") == "job.status":
                    self._apply_status(op)
            user = snapshot.get("user") or {}
            for key, field in (("user_id", "id"), ("user_name", "name"), ("user_email", "email")):
                if user.get(field):
                    self.conn.execute(
                        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, user[field])
                    )
            self.conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES ('snapshot_hash', ?)",
                (snapshot_hash,),
            )

    # ---- reading for the screens ----

    def jobs(self, view, today):
        """view: 'today' | 'upcoming' | 'open' | 'done'. today: 'YYYY-MM-DD'."""
        if view == "today":
            sql = "SELECT * FROM jobs WHERE scheduled_day = ? ORDER BY position"
            args = (today,)
        elif view == "upcoming":
            sql = ("SELECT * FROM jobs WHERE scheduled_day > ? AND status IN ('SCHEDULED', 'IN_PROGRESS')"
                   " ORDER BY position")
            args = (today,)
        elif view == "open":
            sql = "SELECT * FROM jobs WHERE status IN ('SCHEDULED', 'IN_PROGRESS') ORDER BY position"
            args = ()
        else:
            sql = ("SELECT * FROM jobs WHERE status IN ('COMPLETED', 'CANCELLED')"
                   " ORDER BY position DESC")
            args = ()
        return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    def job(self, job_id):
        row = self.conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def notes(self, job_id):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM notes WHERE job_id = ? ORDER BY created_at, id", (job_id,)
        ).fetchall()]

    def announcements(self):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM announcements ORDER BY created_at DESC"
        ).fetchall()]

    def unseen_problems(self):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM problems WHERE seen = 0 ORDER BY seq"
        ).fetchall()]

    def dismiss_problems(self):
        with self.conn:
            self.conn.execute("UPDATE problems SET seen = 1")
