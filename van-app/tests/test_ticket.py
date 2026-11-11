"""Service ticket: totals, offline checks, layout and the outbox op.
Run with:  python -m unittest discover -s tests   (from the van-app folder)"""
import datetime
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rowanvan import ticket as T  # noqa: E402
from rowanvan.store import Store  # noqa: E402

JOB = {"id": "job1", "customer_name": "Ed Joholske", "client_name": "Ed Joholske",
       "address": "11394 Liberty Street, Fulton, MD 20759", "client_phone": "301-642-5733",
       "client_email": None, "service_needed": "check system heating and a/c top floor"}


def sample():
    """The paper ticket the office sent as the example (JB4-17-2015)."""
    d = T.new_ticket(JOB, "Juan Brenes", now=datetime.datetime(2015, 4, 17, 10, 0))
    d.update({
        "time_out": "2:15 PM", "job_finished": True, "pay_cod": True,
        "filter_size": "16x25x4", "superheat": "10", "superheat_ok": True, "subcool": "13", "subcool_ok": True,
        "evap_ent_lvg": "63/41", "evap_ent_lvg_ok": True, "comp_volts": "240", "comp_volts_ok": True,
        "co_ppm": "4", "refrigerant_type": "R-410A",
        "work_description": "Filter is clean, blower capacitor is good, indoor coil is clean, ignitor is good. "
                            "I recommend installing outdoor make up air damper to fix problem.",
        "eq1_location": "top floor", "eq1_make": "carrier", "eq1_model": "58sta045-12108",
        "eq1_serial": "2106a045-08", "eq1_type": "80% Furnace",
        "part1_qty": "2 LBS", "part1_desc": "R-410A REFRIGERANT $49.00/LB", "part1_amount": "98.00",
        "part2_qty": "1", "part2_desc": "7.5mf 370V Capacitor", "part2_amount": "35.00",
        "reg_labor": "479.00", "fuel_charge": "10.00",
    })
    d.update(T.compute(d))
    return d


class TicketModelTest(unittest.TestCase):
    def test_prefill_from_job(self):
        d = T.new_ticket(JOB, "Juan Brenes", now=datetime.datetime(2015, 4, 17, 10, 0))
        self.assertEqual(d["invoice_no"], "JB4-17-2015")
        self.assertEqual(d["date"], "April 17, 2015")
        self.assertEqual(d["time_in"], "10:00 AM")
        self.assertEqual((d["cust_street"], d["cust_city"]), ("11394 Liberty Street", "Fulton, MD 20759"))
        self.assertEqual(d["technician"], "Juan Brenes")

    def test_invoice_numbers_do_not_repeat(self):
        day = datetime.date(2015, 4, 17)
        self.assertEqual(T.invoice_number("Juan Brenes", day, {"JB4-17-2015"}), "JB4-17-2015-2")
        self.assertEqual(T.invoice_number("Madonna", day), "MA4-17-2015")

    def test_totals_match_the_paper_ticket(self):
        d = sample()
        self.assertEqual(d["total_parts"], "35.00")
        self.assertEqual(d["refrigerant_charge"], "98.00")
        self.assertEqual(d["subtotal"], "612.00")
        self.assertEqual(d["total_due"], "622.00")

    def test_coupon_and_previous_balance(self):
        d = sample()
        d.update({"coupon": "50", "previous": "$1,000.00"})
        self.assertEqual(T.compute(d)["total_due"], "1572.00")

    def test_clean_ticket_has_no_errors(self):
        errors = [i for i in T.check(sample()) if i["severity"] == "error"]
        self.assertEqual(errors, [])

    def test_catches_common_mistakes(self):
        d = sample()
        d.update({"time_out": "9:00 AM", "comp_volts": "24", "part3_amount": "abc", "job_finished": False,
                  "work_description": "done", "co_ppm": "60"})
        found = set((i["field"], i["severity"]) for i in T.check(d))
        self.assertIn(("time_out", "warning"), found)
        self.assertIn(("comp_volts", "warning"), found)
        self.assertIn(("part3_amount", "error"), found)
        self.assertIn(("part3_desc", "error"), found)
        self.assertIn(("job_finished", "error"), found)
        self.assertIn(("work_description", "error"), found)

    def test_high_co_needs_explaining(self):
        d = sample()
        d["co_ppm"] = "60"
        d["work_description"] = "Cleaned the burners and checked the flue piping, all good."
        self.assertTrue(any(i["field"] == "work_description" and "CO" in i["message"] for i in T.check(d)))

    def test_every_issue_points_at_a_field_on_the_sheet(self):
        d = sample()
        d.update({"time_in": "late", "superheat": "x", "eq2_make": "Trane", "coupon": "9999"})
        known = T.fields()
        for i in T.check(d) + T.check({}):
            self.assertIn(i["field"], known, i)

    def test_layout_fields_and_sections_agree(self):
        L = T.layout()
        drawn = set(e["id"] for e in L["elements"] if e["t"] == "field")
        listed = set(T.fields())
        self.assertEqual(drawn, listed)
        for fid in T.COMPUTED + T.MONEY_INPUTS + T.PAYMENT_FIELDS:
            self.assertIn(fid, listed)
        for e in L["elements"]:
            if e["t"] == "field":
                self.assertTrue(0 <= e["x"] and e["x"] + e["w"] <= L["page"]["w"], e["id"])
                self.assertTrue(0 <= e["y"] and e["y"] + e["h"] <= L["page"]["h"], e["id"])

    def test_time_parsing(self):
        self.assertEqual(T.parse_time("2:15 PM"), 14 * 60 + 15)
        self.assertEqual(T.parse_time("12:05 am"), 5)
        self.assertEqual(T.parse_time("12:30 p.m."), 12 * 60 + 30)
        self.assertIsNone(T.parse_time("14:00"))


class TicketStoreTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.dir, "van.db"))

    def tearDown(self):
        self.store.close()
        shutil.rmtree(self.dir)

    def test_only_latest_save_is_queued(self):
        d = sample()
        tid = self.store.save_ticket(None, "job1", d)
        d["coupon"] = "10"
        self.store.save_ticket(tid, "job1", d, "final", {"issues": [], "summary": "Looks good."})
        ops = [o for o in self.store.pending_ops() if o["type"] == "ticket.save"]
        self.assertEqual(len(ops), 1)
        self.assertEqual(ops[0]["status"], "final")
        self.assertEqual(ops[0]["data"]["coupon"], "10")
        self.assertEqual(ops[0]["invoiceNumber"], "JB4-17-2015")
        self.assertEqual(self.store.ticket_for_job("job1")["ai_check"]["summary"], "Looks good.")
        self.assertEqual(self.store.invoice_numbers(), {"JB4-17-2015"})

    def test_ack_and_snapshot(self):
        tid = self.store.save_ticket(None, "job1", sample())
        op = self.store.pending_ops()[0]
        self.store.ack([{"opId": op["opId"], "ok": True}])
        self.assertEqual(self.store.ticket(tid)["pending"], 0)
        self.store.replace_snapshot({"jobs": [], "tickets": [{
            "id": tid, "jobId": "job1", "invoiceNumber": "JB4-17-2015", "status": "final",
            "data": {"invoice_no": "JB4-17-2015", "coupon": "5"}, "aiCheck": None,
            "updatedAt": "2026-11-11T12:00:00.000Z"}]}, "h1")
        self.assertEqual(self.store.ticket(tid)["data"]["coupon"], "5")
        # Unsent edits on the laptop are not overwritten by the website's copy.
        d = sample()
        d["coupon"] = "7"
        self.store.save_ticket(tid, "job1", d)
        self.store.replace_snapshot({"jobs": [], "tickets": [{
            "id": tid, "jobId": "job1", "status": "final", "data": {"coupon": "5"}}]}, "h2")
        self.assertEqual(self.store.ticket(tid)["data"]["coupon"], "7")


if __name__ == "__main__":
    unittest.main()
