"""Run with:  python -m unittest discover -s tests   (from the van-app folder)"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rowanvan import api, sync  # noqa: E402
from rowanvan.store import Store  # noqa: E402

TODAY = "2026-10-24"


def snapshot(status="SCHEDULED", notes=None, jobs=None):
    if jobs is None:
        jobs = [{
            "id": "job1", "customerName": "Pat Smith", "address": "1 Main St",
            "serviceNeeded": "AC tune-up", "scheduledDay": TODAY, "scheduledTime": "9:00 AM",
            "status": status, "cancelReason": None, "summary": None,
            "clientName": "Pat Smith", "clientPhone": "410-555-0100", "clientEmail": None,
            "notes": notes or [],
        }]
    return {
        "user": {"id": "u1", "name": "Tech One", "email": "tech@rowanhvac.com", "role": "EMPLOYEE"},
        "jobs": jobs,
        "announcements": [{"id": "a1", "title": "Hi", "body": "Safety first",
                           "authorName": "Admin", "createdAt": "2026-10-24T12:00:00.000Z"}],
    }


class FakeServer(object):
    """Stands in for api.sync: applies ops to its own state like the portal."""

    def __init__(self):
        self.status = "SCHEDULED"
        self.notes = []
        self.cancelled = False
        self.calls = []
        self.offline = False

    def __call__(self, server, token, ops, snapshot_hash):
        self.calls.append({"ops": ops, "hash": snapshot_hash})
        if self.offline:
            raise api.Offline("no signal")
        results = []
        for op in ops:
            if op["type"] == "job.status":
                if self.cancelled:
                    results.append({"opId": op["opId"], "ok": False, "error": "Job cancelled"})
                    continue
                self.status = op["status"]
            else:
                if op["id"] not in [n["id"] for n in self.notes]:
                    self.notes.append({"id": op["id"], "body": op["body"], "authorName": "Tech One",
                                       "createdAt": op["createdAt"]})
            results.append({"opId": op["opId"], "ok": True})
        status = "CANCELLED" if self.cancelled else self.status
        snap = snapshot(status=status, notes=list(self.notes))
        h = "h-" + status + "-" + str(len(self.notes))
        if snapshot_hash == h:
            return {"ok": True, "results": results, "snapshotHash": h, "unchanged": True}
        return {"ok": True, "results": results, "snapshotHash": h, "unchanged": False, "snapshot": snap}


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.dir, "t.db"))
        self.store.set("server", "https://portal.example.com")
        self.store.set("token", "t" * 64)
        self.server = FakeServer()
        self._real = api.sync
        api.sync = self.server

    def tearDown(self):
        api.sync = self._real
        self.store.close()
        shutil.rmtree(self.dir)

    def test_first_sync_downloads_jobs(self):
        self.assertEqual(sync.sync_once(self.store), ("synced", {"changed": True}))
        jobs = self.store.jobs("today", TODAY)
        self.assertEqual([j["customer_name"] for j in jobs], ["Pat Smith"])
        self.assertEqual(len(self.store.announcements()), 1)
        self.assertEqual(self.store.get("user_name"), "Tech One")

    def test_unchanged_sync_sends_hash_and_keeps_data(self):
        sync.sync_once(self.store)
        self.assertEqual(sync.sync_once(self.store), ("synced", {"changed": False}))
        self.assertEqual(self.server.calls[-1]["hash"], "h-SCHEDULED-0")
        self.assertEqual(len(self.store.jobs("today", TODAY)), 1)

    def test_offline_changes_show_locally_then_upload(self):
        sync.sync_once(self.store)
        self.server.offline = True
        self.store.set_job_status("job1", "IN_PROGRESS")
        self.store.add_note("job1", "Capacitor weak", "Tech One")
        self.store.set_job_status("job1", "COMPLETED", "Replaced capacitor")
        self.assertEqual(sync.sync_once(self.store)[0], "offline")

        job = self.store.job("job1")
        self.assertEqual(job["status"], "COMPLETED")
        self.assertEqual(job["summary"], "Replaced capacitor")
        self.assertEqual(self.store.pending_count(), 3)
        self.assertEqual(self.store.notes("job1")[0]["pending"], 1)

        self.server.offline = False
        sync.sync_once(self.store)
        self.assertEqual(self.server.status, "COMPLETED")
        self.assertEqual(len(self.server.notes), 1)
        self.assertEqual(self.store.pending_count(), 0)
        notes = self.store.notes("job1")
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]["pending"], 0)
        # Pushing ops always asks for a full snapshot.
        self.assertIsNone(self.server.calls[-1]["hash"])

    def test_resent_note_is_not_duplicated(self):
        sync.sync_once(self.store)
        self.store.add_note("job1", "Hello", "Tech One")
        op = self.store.pending_ops()[0]
        self.server([], None, [op], None)  # server got it, but the reply was lost
        sync.sync_once(self.store)
        self.assertEqual(len(self.server.notes), 1)
        self.assertEqual(len(self.store.notes("job1")), 1)

    def test_rejected_change_is_reported_and_corrected(self):
        sync.sync_once(self.store)
        self.server.cancelled = True
        self.store.set_job_status("job1", "IN_PROGRESS")
        sync.sync_once(self.store)
        self.assertEqual(self.store.job("job1")["status"], "CANCELLED")
        self.assertEqual(self.store.pending_count(), 0)
        self.assertEqual([p["message"] for p in self.store.unseen_problems()], ["Job cancelled"])
        self.store.dismiss_problems()
        self.assertEqual(self.store.unseen_problems(), [])

    def test_change_made_during_sync_survives_snapshot(self):
        sync.sync_once(self.store)
        self.store.set_job_status("job1", "IN_PROGRESS")
        # Snapshot arrives that predates the queued change.
        self.store.replace_snapshot(snapshot(status="SCHEDULED"), "old")
        self.assertEqual(self.store.job("job1")["status"], "IN_PROGRESS")

    def test_reassigned_job_disappears(self):
        sync.sync_once(self.store)
        self.store.replace_snapshot(snapshot(jobs=[]), "empty")
        self.assertEqual(self.store.jobs("open", TODAY), [])

    def test_signed_out_wipes_local_data(self):
        sync.sync_once(self.store)

        def revoked(*a):
            raise api.SignedOut("Revoked", 401)
        api.sync = revoked
        self.assertEqual(sync.sync_once(self.store)[0], "signed_out")
        self.assertIsNone(self.store.get("token"))
        self.assertEqual(self.store.jobs("open", TODAY), [])
        self.assertEqual(self.store.get("server"), "https://portal.example.com")


class ServerUrlTests(unittest.TestCase):
    def test_requires_https_except_localhost(self):
        self.assertEqual(api.normalize_server("portal.example.com/"), "https://portal.example.com")
        self.assertIsNone(api.check_server("https://portal.example.com"))
        self.assertIsNone(api.check_server("http://localhost:3000"))
        self.assertIsNotNone(api.check_server("http://portal.example.com"))
        self.assertIsNotNone(api.check_server("https://"))


if __name__ == "__main__":
    unittest.main()
