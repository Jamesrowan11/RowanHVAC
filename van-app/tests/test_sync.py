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
        self.conversations = {}  # id -> {"subject", "messages": [...], "lastReadAt"}
        self.emails = []
        self.mail_down = False
        self.mail_rejects = False

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
            elif op["type"] == "msg.start":
                if op["recipientIds"] == ["gone"]:
                    results.append({"opId": op["opId"], "ok": False, "error": "Nobody to send to"})
                    continue
                self.conversations.setdefault(op["conversationId"], {
                    "subject": op.get("subject"), "lastReadAt": None,
                    "messages": [{"id": op["id"], "body": op["body"], "mine": True}]})
            elif op["type"] == "msg.send":
                msgs = self.conversations[op["conversationId"]]["messages"]
                if op["id"] not in [m["id"] for m in msgs]:
                    msgs.append({"id": op["id"], "body": op["body"], "mine": True})
            elif op["type"] == "msg.read":
                self.conversations[op["conversationId"]]["lastReadAt"] = "2026-10-25T23:59:59.000Z"
            elif op["type"] == "email.send":
                if self.mail_down:
                    results.append({"opId": op["opId"], "ok": False, "retry": True, "error": "Mail server down"})
                    continue
                if self.mail_rejects:
                    results.append({"opId": op["opId"], "ok": False, "error": "Password rejected"})
                    continue
                if op["id"] not in [e["id"] for e in self.emails]:
                    self.emails.append(op)
            else:
                if op["id"] not in [n["id"] for n in self.notes]:
                    self.notes.append({"id": op["id"], "body": op["body"], "authorName": "Tech One",
                                       "createdAt": op["createdAt"]})
            results.append({"opId": op["opId"], "ok": True})
        status = "CANCELLED" if self.cancelled else self.status
        snap = snapshot(status=status, notes=list(self.notes))
        snap["conversations"] = [{
            "id": cid, "subject": c["subject"], "updatedAt": "2026-10-25T12:00:00.000Z",
            "lastReadAt": c["lastReadAt"], "participants": ["Office"],
            "messages": [dict(m, senderName="Tech One" if m["mine"] else "Office",
                              createdAt="2026-10-25T12:00:00.000Z") for m in c["messages"]],
        } for cid, c in sorted(self.conversations.items())]
        snap["directory"] = [{"id": "admin1", "name": "Office", "role": "ADMIN"}]
        snap["mailbox"] = {"address": "jake@rowanheatingandair.com"}
        h = "h-" + status + "-" + str(len(self.notes)) + "-" + repr(sorted(
            (k, len(c["messages"]), c["lastReadAt"]) for k, c in self.conversations.items()))
        if snapshot_hash == h:
            return {"ok": True, "results": results, "snapshotHash": h, "unchanged": True}
        return {"ok": True, "results": results, "snapshotHash": h, "unchanged": False, "snapshot": snap}


class StoreTestCase(unittest.TestCase):
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



class SyncTests(StoreTestCase):
    def test_first_sync_downloads_jobs(self):
        self.assertEqual(sync.sync_once(self.store), ("synced", {"changed": True}))
        jobs = self.store.jobs("today", TODAY)
        self.assertEqual([j["customer_name"] for j in jobs], ["Pat Smith"])
        self.assertEqual(len(self.store.announcements()), 1)
        self.assertEqual(self.store.get("user_name"), "Tech One")

    def test_unchanged_sync_sends_hash_and_keeps_data(self):
        sync.sync_once(self.store)
        self.assertEqual(sync.sync_once(self.store), ("synced", {"changed": False}))
        self.assertEqual(self.server.calls[-1]["hash"], "h-SCHEDULED-0-[]")
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


class MessagingTests(StoreTestCase):
    def test_start_conversation_and_reply_offline(self):
        sync.sync_once(self.store)
        self.assertEqual(self.store.directory()[0]["name"], "Office")
        self.server.offline = True
        conv = self.store.start_conversation([("admin1", "Office")], "Parts", "Need a capacitor", "Tech One")
        self.store.send_message(conv, "Never mind, found one", "Tech One")
        sync.sync_once(self.store)
        msgs = self.store.messages(conv)
        self.assertEqual([m["pending"] for m in msgs], [1, 1])
        self.assertEqual(self.store.conversations()[0]["participants"], ["Office"])

        self.server.offline = False
        sync.sync_once(self.store)
        self.assertEqual(len(self.server.conversations[conv]["messages"]), 2)
        self.assertEqual([m["pending"] for m in self.store.messages(conv)], [0, 0])
        self.assertEqual(self.store.conversation(conv)["pending"], 0)
        self.assertEqual(self.store.pending_count(), 0)

    def test_incoming_message_is_unread_until_opened(self):
        self.server.conversations["c1"] = {"subject": None, "lastReadAt": None, "messages": [
            {"id": "m1", "body": "Can you take a call in Fulton?", "mine": False}]}
        sync.sync_once(self.store)
        self.assertEqual(self.store.unread_total(), 1)
        self.store.mark_read("c1")
        self.assertEqual(self.store.unread_total(), 0)
        sync.sync_once(self.store)  # server's read marker comes back
        self.assertEqual(self.store.unread_total(), 0)
        self.assertEqual(self.server.conversations["c1"]["lastReadAt"], "2026-10-25T23:59:59.000Z")

    def test_new_thread_is_read_without_queueing_a_marker(self):
        self.server.offline = True
        conv = self.store.start_conversation([("admin1", "Office")], "", "Hi", "Tech One")
        self.store.mark_read(conv)
        self.assertEqual(self.store.pending_count(), 1)

    def test_rejected_new_thread_is_removed_and_reported(self):
        sync.sync_once(self.store)
        conv = self.store.start_conversation([("gone", "Old Tech")], "", "Hello?", "Tech One")
        sync.sync_once(self.store)
        self.assertIsNone(self.store.conversation(conv))
        self.assertEqual(self.store.messages(conv), [])
        self.assertEqual([p["message"] for p in self.store.unseen_problems()], ["Nobody to send to"])


class EmailTests(StoreTestCase):
    def test_email_waits_while_mail_server_is_down_then_sends(self):
        sync.sync_once(self.store)
        self.assertEqual(self.store.get("mailbox_address"), "jake@rowanheatingandair.com")
        self.server.mail_down = True
        email_id = self.store.queue_email(["pat@example.com"], "Your visit", "All done")
        sync.sync_once(self.store)
        e = self.store.emails()[0]
        self.assertEqual((e["state"], e["error"]), ("waiting", "Mail server down"))
        self.assertEqual(self.store.pending_count(), 1)
        self.assertEqual(self.store.unseen_problems(), [])  # temporary: no banner

        self.server.mail_down = False
        sync.sync_once(self.store)
        self.assertEqual(self.store.emails()[0]["state"], "sent")
        self.assertEqual([x["id"] for x in self.server.emails], [email_id])
        self.assertEqual(self.store.pending_count(), 0)

    def test_rejected_email_is_marked_not_sent(self):
        sync.sync_once(self.store)
        self.server.mail_rejects = True
        self.store.queue_email(["pat@example.com"], "Hi", "Body")
        sync.sync_once(self.store)
        e = self.store.emails()[0]
        self.assertEqual((e["state"], e["error"]), ("failed", "Password rejected"))
        self.assertEqual(self.store.pending_count(), 0)
        self.assertEqual(len(self.store.unseen_problems()), 1)

    def test_split_addresses(self):
        from rowanvan.addresses import split_addresses
        self.assertEqual(split_addresses("a@x.com, b@y.org; a@x.com\nbad"),
                         (["a@x.com", "b@y.org"], ["bad"]))


class ManualTests(StoreTestCase):
    MANUALS = [
        {"id": "m1", "brand": "Carrier", "model": "24ACC6", "equipmentType": "Air Conditioner",
         "title": "Installation", "originalName": "24acc6-im.pdf", "size": 11, "sha256": None},
        {"id": "m2", "brand": "Carrier", "model": "24ACC6", "equipmentType": "Air Conditioner",
         "title": "Wiring diagram", "originalName": "wiring.PDF", "size": 5, "sha256": None},
        {"id": "m3", "brand": "carrier", "model": "59SC5", "equipmentType": "Furnace",
         "title": None, "originalName": "59sc5.pdf", "size": 3, "sha256": None},
        {"id": "m4", "brand": "Trane", "model": "XR14", "equipmentType": "Heat Pump",
         "title": "Service facts", "originalName": "xr14.pdf", "size": 4, "sha256": None},
    ]

    def setUp(self):
        StoreTestCase.setUp(self)
        os.environ["ROWANVAN_HOME"] = self.dir
        snap = snapshot()
        snap["manuals"] = self.MANUALS
        self.store.replace_snapshot(snap, "h")

    def tearDown(self):
        os.environ.pop("ROWANVAN_HOME", None)
        StoreTestCase.tearDown(self)

    def test_brand_and_model_tabs(self):
        # "carrier" and "Carrier" are one tab
        self.assertEqual(self.store.manual_brands(), [("Carrier", 3), ("Trane", 1)])
        self.assertEqual(self.store.manual_models("Carrier"), [("24ACC6", 2), ("59SC5", 1)])
        self.assertEqual([m["id"] for m in self.store.manuals_for("CARRIER", "24acc6")], ["m1", "m2"])

    def test_search_matches_every_word(self):
        self.assertEqual([m["id"] for m in self.store.manuals("carrier furnace")], ["m3"])
        self.assertEqual([m["id"] for m in self.store.manuals("xr14")], ["m4"])
        self.assertEqual(len(self.store.manuals("")), 4)

    def test_download_verifies_and_prunes(self):
        import hashlib
        from rowanvan import manuals
        body = b"%PDF-1.4 hi"
        m = self.store.manual("m1")
        m["sha256"] = hashlib.sha256(body).hexdigest()
        real = api.get_stream
        api.get_stream = lambda server, path, token: iter([(body[:4], 4), (body[4:], len(body))])
        try:
            path = manuals.download(self.store, m)
            self.assertEqual(open(path, "rb").read(), body)
            self.assertTrue(path.endswith(".pdf"))
            bad = dict(m, sha256="0" * 64)
            self.assertRaises(api.ApiError, manuals.download, self.store, bad)
        finally:
            api.get_stream = real
        # The manual is deleted in the portal -> its file goes on the next sync.
        snap = snapshot()
        snap["manuals"] = self.MANUALS[1:]
        self.store.replace_snapshot(snap, "h2")
        manuals.prune(self.store)
        self.assertFalse(os.path.exists(path))


class ServerUrlTests(unittest.TestCase):
    def test_requires_https_except_localhost(self):
        self.assertEqual(api.normalize_server("portal.example.com/"), "https://portal.example.com")
        self.assertIsNone(api.check_server("https://portal.example.com"))
        self.assertIsNone(api.check_server("http://localhost:3000"))
        self.assertIsNotNone(api.check_server("http://portal.example.com"))
        self.assertIsNotNone(api.check_server("https://"))


if __name__ == "__main__":
    unittest.main()
