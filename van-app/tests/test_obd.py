import os
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rowanvan import obd  # noqa: E402
from rowanvan.store import Store  # noqa: E402


class ParseTests(unittest.TestCase):
    def test_speed(self):
        self.assertEqual(obd.parse_speed_kmh(["41 0D 3C"]), 60)
        self.assertEqual(obd.parse_speed_kmh(["410D00"]), 0)
        self.assertIsNone(obd.parse_speed_kmh(["NO DATA"]))
        self.assertIsNone(obd.parse_speed_kmh(["UNABLE TO CONNECT"]))
        self.assertEqual(obd.kmh_to_mph(100), 62)

    def test_codes_older_protocols(self):
        # 3 codes per frame, zero padded
        self.assertEqual(obd.parse_dtcs(["43 01 33 00 00 00 00"], "43"), ["P0133"])
        self.assertEqual(obd.parse_dtcs(["43 03 01 01 71 41 23"], "43"), ["P0301", "P0171", "C0123"])

    def test_codes_can_single_and_multi_frame(self):
        self.assertEqual(obd.parse_dtcs(["43 02 03 01 04 20"], "43"), ["P0301", "P0420"])
        self.assertEqual(obd.parse_dtcs(["4300"], "43"), [])
        multi = ["00A", "0: 43 04 03 01 03 02", "1: 04 20 C1 23 00 00"]
        self.assertEqual(obd.parse_dtcs(multi, "43"), ["P0301", "P0302", "P0420", "U0123"])
        self.assertEqual(obd.parse_dtcs(["47 01 01 71"], "47"), ["P0171"])
        self.assertEqual(obd.parse_dtcs(["NO DATA"], "43"), [])

    def test_check_engine_light(self):
        self.assertEqual(obd.parse_mil(["41 01 83 07 65 04"]), (True, 3))
        self.assertEqual(obd.parse_mil(["41 01 00 07 65 04"]), (False, 0))
        self.assertIsNone(obd.parse_mil(["NO DATA"]))


@unittest.skipIf(sys.platform.startswith("win"), "uses a pseudo-terminal")
class FakeAdapterTests(unittest.TestCase):
    """Drives the real serial code against a simulated ELM327 on a pty."""

    def setUp(self):
        import pty
        self.master, slave = pty.openpty()
        self.port = os.ttyname(slave)
        self.speed = "41 0D 3C"
        self.running = True
        threading.Thread(target=self._adapter, daemon=True).start()

    def tearDown(self):
        self.running = False
        os.close(self.master)

    def _adapter(self):
        replies = {"ATZ": "ELM327 v1.5", "0101": "41 01 81 07 65 04", "03": "43 01 03 01",
                   "07": "47 00"}
        buf = b""
        while self.running:
            try:
                buf += os.read(self.master, 64)
            except OSError:
                return
            while b"\r" in buf:
                line, buf = buf.split(b"\r", 1)
                cmd = line.decode().strip().upper()
                reply = self.speed if cmd == "010D" else replies.get(cmd, "OK")
                os.write(self.master, (cmd + "\r" + reply + "\r\r>").encode())  # echo on, like ATZ

    def test_speed_and_codes(self):
        elm = obd.connect(self.port, 38400)
        try:
            self.assertEqual(elm.version, "ELM327 v1.5")
            self.assertEqual(elm.speed_kmh(), 60)
            self.assertEqual(elm.trouble_codes(), {"milOn": True, "stored": ["P0301"], "pending": []})
            self.speed = "NO DATA"
            self.assertIsNone(elm.speed_kmh())
        finally:
            elm.close()

    def test_missing_port(self):
        self.assertRaises(obd.ObdError, obd.connect, "/dev/does-not-exist", 38400)


class CodesReportTests(unittest.TestCase):
    def test_report_queued_only_when_codes_change(self):
        d = tempfile.mkdtemp()
        store = Store(os.path.join(d, "t.db"))
        codes = {"milOn": True, "stored": ["P0301"], "pending": []}
        self.assertTrue(store.record_codes(codes))
        self.assertFalse(store.record_codes(dict(codes)))
        self.assertTrue(store.record_codes({"milOn": False, "stored": [], "pending": []}))
        ops = store.pending_ops()
        self.assertEqual([o["type"] for o in ops], ["obd.codes", "obd.codes"])
        self.assertEqual(ops[0]["stored"], ["P0301"])
        self.assertEqual(store.current_codes()["stored"], [])
        store.close()


if __name__ == "__main__":
    unittest.main()
