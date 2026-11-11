"""Service ticket data: the fields (from ticket_layout.json), sensible defaults
from the job, the totals the app calculates, and the checks that run on the
laptop with no signal. The AI check runs on the website (see api.ticket_check).

Python 3.4: no f-strings, no type hints.
"""

import datetime
import json
import os
import re

_LAYOUT = None


def layout():
    """The shared sheet layout (also used by the website to print the PDF)."""
    global _LAYOUT
    if _LAYOUT is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ticket_layout.json")
        with open(path, "r") as f:
            _LAYOUT = json.load(f)
    return _LAYOUT


def fields():
    """{field id: {"label", "kind", "computed", "hint"}} for every field on the sheet."""
    out = {}
    for section in layout()["sections"]:
        for f in section["fields"]:
            out[f["id"]] = f
    return out


def field_label(fid):
    f = fields().get(fid)
    return f["label"] if f else fid


PAYMENT_FIELDS = ("pay_cod", "pay_billing", "pay_no_charge", "pay_call_office", "pay_warranty", "pay_pmp")
MONEY_INPUTS = ("reg_labor", "overtime_labor", "trip_charges", "previous", "coupon", "fuel_charge")
COMPUTED = ("total_parts", "refrigerant_charge", "subtotal", "total_due")
PART_ROWS = 8
EQUIPMENT_ROWS = 3

# A parts line whose description names a refrigerant is billed on the
# REFRIGERANT line, everything else on TOTAL PARTS (as on the paper ticket).
_REFRIGERANT_RE = re.compile(r"refrigerant|\br-?\s?\d{2,3}[a-z]?\b|\bfreon\b|\bpuron\b", re.I)


def is_refrigerant(description):
    return bool(_REFRIGERANT_RE.search(description or ""))


# ---------------------------------------------------------------- formatting helpers

def parse_money(value):
    """'$1,234.50' -> 1234.5; '' -> 0.0; garbage -> None."""
    s = (value or "").strip().replace("$", "").replace(",", "")
    if not s:
        return 0.0
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def fmt_money(amount):
    return "%.2f" % amount


def parse_time(value):
    """'10:00 AM' -> minutes after midnight, or None."""
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]?\.?\s*$", value or "")
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2))
    if not (1 <= hour <= 12 and 0 <= minute <= 59):
        return None
    if m.group(3).lower() == "p" and hour != 12:
        hour += 12
    if m.group(3).lower() == "a" and hour == 12:
        hour = 0
    return hour * 60 + minute


def fmt_time(dt):
    return dt.strftime("%I:%M %p").lstrip("0")


def fmt_date(d):
    return d.strftime("%B ") + str(d.day) + d.strftime(", %Y")


def initials(name):
    parts = [p for p in re.split(r"\s+", (name or "").strip()) if p]
    if not parts:
        return "RH"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def invoice_number(tech_name, day, existing_numbers=()):
    """Technician initials + date, like the paper tickets (JB4-17-2015); a
    second ticket the same day gets -2, -3..."""
    base = "%s%d-%d-%d" % (initials(tech_name), day.month, day.day, day.year)
    number, n = base, 2
    while number in existing_numbers:
        number = "%s-%d" % (base, n)
        n += 1
    return number


def _split_address(address):
    """'11394 Liberty Street, Fulton, MD 20759' -> (street, 'Fulton, MD 20759')."""
    parts = [p.strip() for p in (address or "").split(",") if p.strip()]
    if len(parts) >= 2:
        return parts[0], ", ".join(parts[1:])
    return (address or "").strip(), ""


# ---------------------------------------------------------------- new ticket + totals

def new_ticket(job, tech_name, existing_numbers=(), now=None):
    """A ticket pre-filled from the job so the technician only adds what they did."""
    now = now or datetime.datetime.now()
    street, city = _split_address(job.get("address"))
    data = {
        "invoice_no": invoice_number(tech_name, now.date(), existing_numbers),
        "date": fmt_date(now.date()),
        "time_in": fmt_time(now),
        "cust_name": job.get("client_name") or job.get("customer_name") or "",
        "cust_street": street,
        "cust_city": city,
        "cust_email": job.get("client_email") or "",
        "cust_phone": job.get("client_phone") or "",
        "service_requested": job.get("service_needed") or "",
        "technician": tech_name or "",
        "refrigerant_type": "",
    }
    data.update(compute(data))
    return data


def compute(data):
    """The calculated money lines, from the parts list and the charges."""
    parts = refrigerant = 0.0
    for row in range(1, PART_ROWS + 1):
        amount = parse_money(data.get("part%d_amount" % row))
        if not amount:
            continue
        if is_refrigerant(data.get("part%d_desc" % row)):
            refrigerant += amount
        else:
            parts += amount
    money = dict((k, parse_money(data.get(k)) or 0.0) for k in MONEY_INPUTS)
    subtotal = money["reg_labor"] + money["overtime_labor"] + parts + money["trip_charges"] + refrigerant
    total = subtotal + money["previous"] - money["coupon"] + money["fuel_charge"]
    return {
        "total_parts": fmt_money(parts),
        "refrigerant_charge": fmt_money(refrigerant),
        "subtotal": fmt_money(subtotal),
        "total_due": fmt_money(total),
    }


# ---------------------------------------------------------------- checks (offline)

def _issue(fid, severity, message):
    return {"field": fid, "severity": severity, "message": message, "source": "app"}


def _number(value):
    try:
        return float((value or "").strip().replace("*", "").replace("°", ""))
    except ValueError:
        return None


def _volts_ok(v):
    return 100 <= v <= 132 or 187 <= v <= 264 or 414 <= v <= 506


VALUE_CHECKBOX = {
    "superheat": "superheat_ok", "subcool": "subcool_ok", "comp_volts": "comp_volts_ok",
    "comp_amps": "comp_amps_ok", "evap_ent_lvg": "evap_ent_lvg_ok", "blower_volts": "blower_volts_ok",
    "blower_amps": "blower_amps_ok", "fuel_psi": "fuel_supply",
}


def check(data):
    """Mistakes the app can find by itself: missing info, sums, times and
    readings outside normal ranges. Returns a list of issues
    ({field, severity: error|warning|suggestion, message})."""
    issues = []
    d = dict((k, v) for k, v in data.items())
    text = lambda k: (d.get(k) or "").strip() if isinstance(d.get(k), str) else ""

    for fid, what in (("cust_name", "the customer's name"), ("cust_street", "the customer's address"),
                      ("date", "the date"), ("technician", "your name"),
                      ("service_requested", "the service requested")):
        if not text(fid):
            issues.append(_issue(fid, "error", "Fill in " + what + "."))
    if len(text("work_description")) < 20:
        issues.append(_issue("work_description", "error",
                             "Describe the work performed: what you found, what you did and how you left the system."))
    if not any(d.get(f) for f in PAYMENT_FIELDS):
        issues.append(_issue("pay_cod", "warning", "Pick a method of payment."))
    if bool(d.get("job_finished")) == bool(d.get("job_not_finished")):
        issues.append(_issue("job_finished", "error", "Tick exactly one: job finished YES or NO."))

    t_in, t_out = parse_time(text("time_in")), parse_time(text("time_out"))
    if text("time_in") and t_in is None:
        issues.append(_issue("time_in", "error", "Write the time like 10:00 AM."))
    if text("time_out") and t_out is None:
        issues.append(_issue("time_out", "error", "Write the time like 2:15 PM."))
    if not text("time_out"):
        issues.append(_issue("time_out", "warning", "Fill in the time out."))
    elif t_in is not None and t_out is not None and t_out <= t_in:
        issues.append(_issue("time_out", "warning", "Time out is not after time in. Check AM/PM."))

    for fid in MONEY_INPUTS:
        if parse_money(text(fid)) is None:
            issues.append(_issue(fid, "error", "Enter an amount like 125.00."))
    for row in range(1, PART_ROWS + 1):
        desc, qty, amount = text("part%d_desc" % row), text("part%d_qty" % row), text("part%d_amount" % row)
        if amount and parse_money(amount) is None:
            issues.append(_issue("part%d_amount" % row, "error", "Enter an amount like 35.00."))
        if (amount or qty) and not desc:
            issues.append(_issue("part%d_desc" % row, "error", "This parts line has no description."))
        if desc and not amount and not d.get("pay_no_charge") and not d.get("pay_warranty"):
            issues.append(_issue("part%d_amount" % row, "warning", "No amount for " + desc + "."))
        if desc and is_refrigerant(desc) and not text("refrigerant_type"):
            issues.append(_issue("refrigerant_type", "warning",
                                 "You charged refrigerant; fill in the refrigerant type on the check list."))
    computed = compute(d)
    if float(computed["total_due"]) < 0:
        issues.append(_issue("total_due", "error", "The total due is negative. Check the coupon and previous balance."))

    sh, sc = _number(text("superheat")), _number(text("subcool"))
    if text("superheat") and sh is None:
        issues.append(_issue("superheat", "warning", "Superheat should be a number of degrees."))
    elif sh is not None and not (2 <= sh <= 40):
        issues.append(_issue("superheat", "warning", "Superheat of %g°F is unusual. Double-check the reading." % sh))
    if text("subcool") and sc is None:
        issues.append(_issue("subcool", "warning", "Subcool should be a number of degrees."))
    elif sc is not None and not (2 <= sc <= 25):
        issues.append(_issue("subcool", "warning", "Subcool of %g°F is unusual. Double-check the reading." % sc))
    for fid in ("comp_volts", "blower_volts", "cond_volts"):
        v = _number(text(fid))
        if text(fid) and (v is None or not _volts_ok(v)):
            issues.append(_issue(fid, "warning", "That voltage looks wrong (expected about 120, 208-240 or 460)."))
    for fid in ("comp_amps", "blower_amps", "cond_amps"):
        a = _number(text(fid))
        if text(fid) and (a is None or not (0.1 <= a <= 80)):
            issues.append(_issue(fid, "warning", "That amp reading looks wrong."))
    co = _number(text("co_ppm"))
    if text("co_ppm") and co is None:
        issues.append(_issue("co_ppm", "warning", "CO should be a number of ppm."))
    elif co is not None and co >= 35 and "co" not in text("work_description").lower():
        issues.append(_issue("work_description", "warning",
                             "CO reads %g ppm. Explain it and what you told the customer in the description." % co))
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*[*°]?\s*/\s*(\d+(?:\.\d+)?)", text("evap_ent_lvg"))
    if text("evap_ent_lvg"):
        if not m:
            issues.append(_issue("evap_ent_lvg", "warning", "Write entering/leaving air like 63/41."))
        else:
            delta = float(m.group(1)) - float(m.group(2))
            if not (8 <= abs(delta) <= 28):
                issues.append(_issue("evap_ent_lvg", "warning",
                                     "A %g°F split across the coil is unusual. Double-check the readings." % abs(delta)))

    for value_field, box in VALUE_CHECKBOX.items():
        if text(value_field) and not d.get(box):
            issues.append(_issue(box, "suggestion", "You recorded a reading here; tick the box too."))
    for row in range(1, EQUIPMENT_ROWS + 1):
        cells = dict((k, text("eq%d_%s" % (row, k))) for k in ("location", "make", "model", "serial", "type"))
        if any(cells.values()) and not (cells["model"] and cells["serial"]):
            issues.append(_issue("eq%d_model" % row, "warning", "Add the model and serial number for this unit."))
    if not any(text("eq%d_model" % r) for r in range(1, EQUIPMENT_ROWS + 1)):
        issues.append(_issue("eq1_location", "suggestion", "Record the equipment you worked on (location, make, model, serial)."))
    return issues


SEVERITY_ORDER = {"error": 0, "warning": 1, "suggestion": 2}


def sort_issues(issues):
    order = dict((f, i) for i, f in enumerate(_field_order()))
    return sorted(issues, key=lambda i: (SEVERITY_ORDER.get(i.get("severity"), 3), order.get(i.get("field"), 999)))


def _field_order():
    return [f["id"] for s in layout()["sections"] for f in s["fields"]]
