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
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, subject TEXT, updated_at TEXT, last_read_at TEXT,
    participants TEXT, pending INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT, body TEXT, sender_name TEXT,
    mine INTEGER, created_at TEXT, pending INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages (conversation_id);
CREATE TABLE IF NOT EXISTS directory (id TEXT PRIMARY KEY, name TEXT, role TEXT, position INTEGER);
CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY, to_addrs TEXT, subject TEXT, body TEXT, created_at TEXT,
    state TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS manuals (
    id TEXT PRIMARY KEY, brand TEXT, model TEXT, equipment_type TEXT, title TEXT,
    original_name TEXT, size INTEGER, sha256 TEXT, position INTEGER
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
    # Same shape as the server's timestamps so they sort together as text.
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


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
            for table in ("jobs", "notes", "announcements", "outbox", "problems",
                          "conversations", "messages", "directory", "emails", "manuals"):
                self.conn.execute("DELETE FROM " + table)
            for key in ("token", "user_id", "user_name", "user_email", "snapshot_hash", "last_sync",
                        "mailbox_address"):
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

    def send_message(self, conversation_id, body, my_name):
        with self.conn:
            msg_id = "van_" + new_id()
            now = utc_now_iso()
            self.conn.execute(
                "INSERT INTO messages (id, conversation_id, body, sender_name, mine, created_at, pending)"
                " VALUES (?, ?, ?, ?, 1, ?, 1)",
                (msg_id, conversation_id, body, my_name, now),
            )
            self.conn.execute(
                "UPDATE conversations SET updated_at = ?, last_read_at = ? WHERE id = ?",
                (now, now, conversation_id),
            )
            self._queue({"type": "msg.send", "id": msg_id, "conversationId": conversation_id, "body": body})
            return msg_id

    def start_conversation(self, recipients, subject, body, my_name):
        """recipients: list of (user_id, name). Returns the new conversation id."""
        with self.conn:
            conv_id = "van_" + new_id()
            msg_id = "van_" + new_id()
            now = utc_now_iso()
            self.conn.execute(
                "INSERT INTO conversations (id, subject, updated_at, last_read_at, participants, pending)"
                " VALUES (?, ?, ?, ?, ?, 1)",
                (conv_id, subject or None, now, now, json.dumps([n for _, n in recipients])),
            )
            self.conn.execute(
                "INSERT INTO messages (id, conversation_id, body, sender_name, mine, created_at, pending)"
                " VALUES (?, ?, ?, ?, 1, ?, 1)",
                (msg_id, conv_id, body, my_name, now),
            )
            op = {"type": "msg.start", "conversationId": conv_id, "id": msg_id,
                  "recipientIds": [i for i, _ in recipients], "body": body}
            if subject:
                op["subject"] = subject
            self._queue(op)
            return conv_id

    def mark_read(self, conversation_id):
        """Clears the unread badge now; tells the server on the next sync."""
        with self.conn:
            self.conn.execute(
                "UPDATE conversations SET last_read_at = ? WHERE id = ?",
                (utc_now_iso(), conversation_id),
            )
            # A thread still waiting to be created on the server is read by definition.
            if not self._is_pending_conversation(conversation_id):
                self._queue({"type": "msg.read", "conversationId": conversation_id})

    def _is_pending_conversation(self, conversation_id):
        row = self.conn.execute(
            "SELECT pending FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        return bool(row and row["pending"])

    def queue_email(self, to_addrs, subject, body):
        with self.conn:
            email_id = "van_" + new_id()
            self.conn.execute(
                "INSERT INTO emails (id, to_addrs, subject, body, created_at, state)"
                " VALUES (?, ?, ?, ?, ?, 'queued')",
                (email_id, ", ".join(to_addrs), subject, body, utc_now_iso()),
            )
            self._queue({"type": "email.send", "id": email_id, "to": list(to_addrs),
                         "subject": subject, "body": body})
            return email_id

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
                kind = op.get("type")
                if r.get("retry"):
                    # Temporary problem (e.g. mail server down): keep it queued.
                    if kind == "email.send":
                        self.conn.execute(
                            "UPDATE emails SET state = 'waiting', error = ? WHERE id = ?",
                            (r.get("error"), op["id"]),
                        )
                    continue
                self.conn.execute("DELETE FROM outbox WHERE op_id = ?", (op_id,))
                ok = bool(r.get("ok"))
                if kind == "note.add":
                    if ok:
                        self.conn.execute("UPDATE notes SET pending = 0 WHERE id = ?", (op["id"],))
                    else:
                        self.conn.execute("DELETE FROM notes WHERE id = ?", (op["id"],))
                elif kind in ("msg.send", "msg.start"):
                    if ok:
                        self.conn.execute("UPDATE messages SET pending = 0 WHERE id = ?", (op["id"],))
                    else:
                        self.conn.execute("DELETE FROM messages WHERE id = ?", (op["id"],))
                    if kind == "msg.start":
                        if ok:
                            self.conn.execute("UPDATE conversations SET pending = 0 WHERE id = ?",
                                              (op["conversationId"],))
                        else:
                            self.conn.execute("DELETE FROM conversations WHERE id = ?",
                                              (op["conversationId"],))
                elif kind == "email.send":
                    self.conn.execute(
                        "UPDATE emails SET state = ?, error = ? WHERE id = ?",
                        ("sent" if ok else "failed", None if ok else r.get("error"), op["id"]),
                    )
                if not ok:
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
            self.conn.execute("DELETE FROM conversations WHERE pending = 0")
            self.conn.execute("DELETE FROM messages WHERE pending = 0")
            for c in snapshot.get("conversations", []):
                self.conn.execute(
                    "INSERT OR REPLACE INTO conversations"
                    " (id, subject, updated_at, last_read_at, participants, pending)"
                    " VALUES (?, ?, ?, ?, ?, 0)",
                    (c["id"], c.get("subject"), c.get("updatedAt"), c.get("lastReadAt"),
                     json.dumps(c.get("participants") or [])),
                )
                for m in c.get("messages", []):
                    self.conn.execute(
                        "INSERT OR REPLACE INTO messages"
                        " (id, conversation_id, body, sender_name, mine, created_at, pending)"
                        " VALUES (?, ?, ?, ?, ?, ?, 0)",
                        (m["id"], c["id"], m.get("body"), m.get("senderName"),
                         1 if m.get("mine") else 0, m.get("createdAt")),
                    )
            self.conn.execute("DELETE FROM manuals")
            for pos, m in enumerate(snapshot.get("manuals", [])):
                self.conn.execute(
                    "INSERT INTO manuals (id, brand, model, equipment_type, title, original_name, size,"
                    " sha256, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (m["id"], m.get("brand"), m.get("model"), m.get("equipmentType"), m.get("title"),
                     m.get("originalName"), m.get("size"), m.get("sha256"), pos),
                )
            self.conn.execute("DELETE FROM directory")
            for pos, d in enumerate(snapshot.get("directory", [])):
                self.conn.execute(
                    "INSERT INTO directory (id, name, role, position) VALUES (?, ?, ?, ?)",
                    (d["id"], d.get("name"), d.get("role"), pos),
                )
            mailbox = snapshot.get("mailbox")
            if mailbox and mailbox.get("address"):
                self.conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('mailbox_address', ?)",
                                  (mailbox["address"],))
            else:
                self.conn.execute("DELETE FROM meta WHERE key = 'mailbox_address'")
            # Changes made while this sync was in flight are still in the
            # outbox: keep showing them.
            now = utc_now_iso()
            for row in self.conn.execute("SELECT payload FROM outbox ORDER BY seq").fetchall():
                op = json.loads(row["payload"])
                if op.get("type") == "job.status":
                    self._apply_status(op)
                elif op.get("type") in ("msg.read", "msg.send"):
                    self.conn.execute("UPDATE conversations SET last_read_at = ? WHERE id = ?",
                                      (now, op["conversationId"]))
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

    def conversations(self):
        rows = self.conn.execute(
            "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.mine = 0"
            "   AND (c.last_read_at IS NULL OR m.created_at > c.last_read_at)) AS unread,"
            " (SELECT body FROM messages m WHERE m.conversation_id = c.id"
            "   ORDER BY m.pending DESC, m.created_at DESC LIMIT 1) AS last_body"
            " FROM conversations c ORDER BY c.pending DESC, c.updated_at DESC"
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["participants"] = json.loads(d["participants"] or "[]")
            result.append(d)
        return result

    def conversation(self, conversation_id):
        for c in self.conversations():
            if c["id"] == conversation_id:
                return c
        return None

    def messages(self, conversation_id):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY pending, created_at, id",
            (conversation_id,),
        ).fetchall()]

    def unread_total(self):
        return sum(c["unread"] for c in self.conversations())

    def directory(self):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM directory ORDER BY position"
        ).fetchall()]

    def emails(self, limit=50):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM emails ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()]

    def manuals(self, query=""):
        """Every word of query must match brand, model, type, or title."""
        sql = "SELECT * FROM manuals"
        args = []
        words = (query or "").lower().split()[:6]
        if words:
            sql += " WHERE " + " AND ".join(
                "(lower(brand) LIKE ? OR lower(model) LIKE ? OR lower(equipment_type) LIKE ?"
                " OR lower(coalesce(title, '')) LIKE ?)" for _ in words)
            for w in words:
                args.extend(["%" + w + "%"] * 4)
        return [dict(r) for r in self.conn.execute(sql + " ORDER BY position", args).fetchall()]

    def manual_brands(self):
        """[(brand, count)] - one tab per brand. Grouped case-insensitively."""
        return [(r[0], r[1]) for r in self.conn.execute(
            "SELECT MIN(brand), COUNT(*) FROM manuals GROUP BY lower(brand) ORDER BY lower(brand)"
        ).fetchall()]

    def manual_models(self, brand):
        """[(model, count)] for one brand - the second row of tabs."""
        return [(r[0], r[1]) for r in self.conn.execute(
            "SELECT MIN(model), COUNT(*) FROM manuals WHERE lower(brand) = lower(?)"
            " GROUP BY lower(model) ORDER BY lower(model)", (brand,)
        ).fetchall()]

    def manuals_for(self, brand, model):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM manuals WHERE lower(brand) = lower(?) AND lower(model) = lower(?)"
            " ORDER BY position", (brand, model)
        ).fetchall()]

    def manual(self, manual_id):
        row = self.conn.execute("SELECT * FROM manuals WHERE id = ?", (manual_id,)).fetchone()
        return dict(row) if row else None

    def unseen_problems(self):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM problems WHERE seen = 0 ORDER BY seq"
        ).fetchall()]

    def dismiss_problems(self):
        with self.conn:
            self.conn.execute("UPDATE problems SET seen = 1")
