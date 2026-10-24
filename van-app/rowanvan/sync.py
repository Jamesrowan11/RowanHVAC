"""Background sync: pushes the outbox and pulls the latest jobs about once a
minute, and immediately whenever the technician changes something."""

import threading
import time

from . import api
from .store import Store

INTERVAL_SECONDS = 60
BATCH = 200


class SyncEngine(threading.Thread):
    def __init__(self, db_path, events):
        """events: a queue.Queue the UI polls; receives (kind, info) tuples:
        ("syncing", None) ("synced", {"changed": bool}) ("offline", msg)
        ("error", msg) ("signed_out", msg)"""
        threading.Thread.__init__(self, name="sync")
        self.daemon = True
        self.db_path = db_path
        self.events = events
        self._wake = threading.Event()
        self._halt = threading.Event()

    def sync_now(self):
        self._wake.set()

    def stop(self):
        self._halt.set()
        self._wake.set()

    def run(self):
        store = Store(self.db_path)
        try:
            while not self._halt.is_set():
                self._wake.clear()
                if store.get("token"):
                    self.events.put(("syncing", None))
                    self.events.put(sync_once(store))
                self._wake.wait(INTERVAL_SECONDS)
        finally:
            store.close()


def sync_once(store):
    """One full sync. Returns the (kind, info) event describing the outcome."""
    server, token = store.get("server"), store.get("token")
    changed = False
    try:
        while True:
            ops = store.pending_ops(BATCH)
            # With changes to push, always ask for the full snapshot: if the
            # server rejected one, our optimistic local copy must be corrected.
            known_hash = None if ops else store.get("snapshot_hash")
            resp = api.sync(server, token, ops, known_hash)
            store.ack(resp.get("results") or [])
            if ops:
                changed = True
            if not resp.get("unchanged"):
                store.replace_snapshot(resp.get("snapshot") or {}, resp.get("snapshotHash"))
                changed = True
            if len(ops) < BATCH:
                break
    except api.SignedOut as e:
        store.sign_out()
        return ("signed_out", str(e))
    except api.Offline as e:
        return ("offline", str(e))
    except api.ApiError as e:
        return ("error", str(e))
    store.set("last_sync", str(int(time.time())))
    return ("synced", {"changed": changed})
