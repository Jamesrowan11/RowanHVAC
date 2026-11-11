"""Builds rowanvan/ticket_layout.json: where every box, label and field of the
service ticket goes. Modeled on Rowan's paper ticket.

The van app draws its live preview from this file and the website draws the
final PDF from the same file, so the two always match. Edit here, then run:
    python3 van-app/tools/build_ticket_layout.py

Units are PDF points on a landscape US-letter page (792 x 612), origin at the
top-left, y growing downward.
"""

import json
import os

W, H = 792, 612
M = 18                      # page margin
AX, BX, CX = M, 284, 522    # column starts
AW, BW, CW = BX - AX, CX - BX, W - M - CX
NAVY = "#1a2b4a"

els = []        # drawing elements, in drawing order
sections = []   # how the form groups the fields (titles, labels, order)
_section = None


def rect(x, y, w, h, fill=None, lw=0.8):
    els.append({"t": "rect", "x": x, "y": y, "w": w, "h": h, "fill": fill, "lw": lw})


def line(x1, y1, x2, y2, lw=0.5):
    els.append({"t": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2, "lw": lw})


def text(x, y, s, size=7, bold=False, align="left", w=None, color=None):
    e = {"t": "text", "x": x, "y": y, "s": s, "size": size, "bold": bold, "align": align}
    if w:
        e["w"] = w
    if color:
        e["color"] = color
    els.append(e)


def bar(x, y, w, s, h=11, size=7.5):
    """A section heading bar (navy, white bold text)."""
    rect(x, y, w, h, fill=NAVY, lw=0)
    text(x + w / 2.0, y + 2, s, size=size, bold=True, align="center", color="#ffffff")


def section(title):
    global _section
    _section = {"title": title, "fields": []}
    sections.append(_section)


def field(fid, label, x, y, w, h, kind="text", size=7.5, align="left", hint=None, computed=False, choices=None, lh=None):
    e = {"t": "field", "id": fid, "x": x, "y": y, "w": w, "h": h, "kind": kind, "size": size, "align": align}
    if lh:
        e["lh"] = lh  # line height for multi-line fields (matches the printed rules)
    if computed:
        e["computed"] = True
    els.append(e)
    f = {"id": fid, "label": label, "kind": kind}
    if hint:
        f["hint"] = hint
    if computed:
        f["computed"] = True
    if choices:
        f["choices"] = choices
    _section["fields"].append(f)


def check(fid, label, x, y, box_only_label=None):
    """A checkbox at (x, y) followed by its printed label."""
    rect(x, y + 1, 7, 7, lw=0.6)
    els.append({"t": "field", "id": fid, "x": x, "y": y + 1, "w": 7, "h": 7, "kind": "check"})
    text(x + 10, y + 1, box_only_label or label, size=6.5)
    _section["fields"].append({"id": fid, "label": label, "kind": "check"})


# ---------------------------------------------------------------- column A: header
rect(AX, M, AW, 74)
text(AX + AW / 2.0, M + 3, "ROWAN", size=10, bold=True, align="center")
text(AX + AW / 2.0, M + 15, "HEATING & AIR CONDITIONING, INC", size=10, bold=True, align="center")
text(AX + AW / 2.0, M + 27, "P.O. BOX 109", size=9, bold=True, align="center")
text(AX + AW / 2.0, M + 38, "FULTON, MD 20759", size=9, bold=True, align="center")
text(AX + AW / 2.0, M + 49, "WWW.ROWANHVAC.COM", size=9, bold=True, align="center")
text(AX + 4, M + 61, "410-531-0008", size=9, bold=True)
text(AX + AW - 4, M + 61, "1-800-225-ROWAN", size=9, bold=True, align="right")

# ---------------------------------------------------------------- column B: customer
section("Customer")
rect(BX, M, BW, 74)
for i, (fid, label, lab) in enumerate([
        ("cust_name", "Customer name", ""), ("cust_street", "Street address", ""),
        ("cust_city", "City, state, ZIP", ""), ("cust_email", "Email", "EMAIL:"),
        ("cust_phone", "Phone", "PHONE:")]):
    y = M + 4 + i * 14
    if lab:
        text(BX + 4, y + 1, lab, size=6.5, bold=True)
    field(fid, label, BX + (34 if lab else 4), y, BW - (38 if lab else 8), 11)

# ---------------------------------------------------------------- column C: invoice block
section("Ticket")
rect(CX, M, CW, 74)
text(CX + 4, M + 3, "HVACR #2569", size=8, bold=True)
text(CX + CW / 2.0 - 4, M + 3, "INVOICE #", size=8, bold=True)
field("invoice_no", "Invoice #", CX + CW / 2.0 + 40, M + 2, CW / 2.0 - 44, 11, size=8, align="right",
      hint="Filled in for you: technician initials and date")
line(CX, M + 15, CX + CW, M + 15)
text(CX + 4, M + 19, "DATE:", size=6.5, bold=True)
field("date", "Date", CX + CW / 2.0, M + 18, CW / 2.0 - 4, 11, align="right")
line(CX, M + 32, CX + CW, M + 32)
line(CX + CW / 2.0, M + 32, CX + CW / 2.0, M + 60)
text(CX + 4, M + 35, "TIME IN:", size=6.5, bold=True)
field("time_in", "Time in", CX + 4, M + 45, CW / 2.0 - 8, 11, align="center", hint="e.g. 10:00 AM")
text(CX + CW / 2.0 + 4, M + 35, "TIME OUT:", size=6.5, bold=True)
field("time_out", "Time out", CX + CW / 2.0 + 4, M + 45, CW / 2.0 - 8, 11, align="center", hint="e.g. 2:15 PM")
line(CX, M + 60, CX + CW, M + 60)
text(CX + 4, M + 63, "JOB FINISHED", size=6.5, bold=True)
check("job_finished", "Job finished: yes", CX + CW - 92, M + 62, "YES")
check("job_not_finished", "Job finished: no", CX + CW - 46, M + 62, "NO")

# ---------------------------------------------------------------- column A: check list
TOP = M + 78
section("Check list")
BLOCK = 13 + 20 * 12.4 + 3   # heading + 20 rows
rect(AX, TOP, AW, BLOCK)
bar(AX, TOP, AW, "CHECK LIST")
y0 = TOP + 13
ROW = 12.4
a_label_x, a_val_x, a_val_w = AX + 3, AX + 72, 58          # col 1: label + value
b_x = AX + 134                                              # col 2: checkbox + label


def a_row(r, label, bold=False, val=None, val_label=None, ok=None, hint=None):
    y = y0 + r * ROW
    if ok:
        check(ok[0], ok[1], a_label_x, y, label)
    else:
        text(a_label_x, y + 1, label, size=6.5, bold=bold)
    if val:
        field(val, val_label or label.title(), a_val_x, y, a_val_w, 10, align="right", hint=hint)
    line(AX, y + ROW - 0.5, b_x - 4, y + ROW - 0.5, lw=0.3)


def b_row(r, label, bold=False, chk=None, val=None, val_label=None, hint=None, val_w=44):
    y = y0 + r * ROW
    if chk:
        check(chk, chk_label(label), b_x, y, label)
    else:
        text(b_x, y + 1, label, size=6.5, bold=bold)
    if val:
        field(val, val_label or label.title(), AX + AW - 3 - val_w, y, val_w, 10, align="right", hint=hint)
    line(b_x - 4, y + ROW - 0.5, AX + AW, y + ROW - 0.5, lw=0.3)


def chk_label(label):
    return label[0] + label[1:].lower()


rows_a = [
    ("AIR FILTER", True, None, None, None, None),
    ("SIZE:", False, "filter_size", "Air filter size", None, "e.g. 16x25x4"),
    ("EAC:", False, "eac", "EAC", None, None),
    ("COMPRESSOR", True, None, None, None, None),
    ("SUPERHEAT", False, "superheat", "Superheat (°F)", ("superheat_ok", "Superheat checked"), "°F"),
    ("SUBCOOL", False, "subcool", "Subcool (°F)", ("subcool_ok", "Subcool checked"), "°F"),
    ("ELECTRICAL", False, None, None, ("comp_electrical_ok", "Compressor electrical checked"), None),
    ("VOLTS", False, "comp_volts", "Compressor volts", ("comp_volts_ok", "Compressor volts checked"), None),
    ("AMPS", False, "comp_amps", "Compressor amps", ("comp_amps_ok", "Compressor amps checked"), None),
    ("EVAPORATOR", True, None, None, None, None),
    ("ENT/LVG", False, "evap_ent_lvg", "Evaporator entering / leaving (°F)", ("evap_ent_lvg_ok", "Evaporator ENT/LVG checked"), "e.g. 63/41"),
    ("CLEAN COIL", False, None, None, ("evap_clean_coil", "Evaporator coil cleaned"), None),
    ("BLOWER MOTOR", True, None, None, None, None),
    ("VOLTS", False, "blower_volts", "Blower volts", ("blower_volts_ok", "Blower volts checked"), None),
    ("AMPS", False, "blower_amps", "Blower amps", ("blower_amps_ok", "Blower amps checked"), None),
    ("THERMOSTAT", True, None, None, ("thermostat_ok", "Thermostat checked"), None),
    ("ELECTRICAL", True, None, None, None, None),
    ("RELAY", False, None, None, ("relay_ok", "Relay checked"), None),
    ("CONTACTS", False, None, None, ("contacts_ok", "Contacts checked"), None),
    ("OVERLOAD", False, None, None, ("overload_ok", "Overload checked"), None),
]
for r, (label, bold, val, val_label, ok, hint) in enumerate(rows_a):
    a_row(r, label, bold, val, val_label, ok, hint)

rows_b = [
    ("CONDENSATION", True, None, None, None, None),
    ("INSPECT DRAINS", False, "inspect_drains", None, None, None),
    ("CLEANED DRAINS", False, "cleaned_drains", None, None, None),
    ("CONDENSER", True, None, None, None, None),
    ("CLEAN COIL", False, "cond_clean_coil", None, None, None),
    ("VOLTS:", False, None, "cond_volts", "Condenser volts", None),
    ("AMPS:", False, None, "cond_amps", "Condenser amps", None),
    ("ENT DB:", False, None, "cond_ent_db", "Condenser entering dry bulb (°F)", None),
    ("HEATING ASSEMBLY", True, None, None, None, None),
    ("BURNER & H/E", False, "burner_he", None, None, None),
    ("FUEL SUPPLY/PSI", False, "fuel_supply", "fuel_psi", "Fuel supply pressure", None),
    ("PILOT ASSEMBLY", False, "pilot_assembly", None, None, None),
    ("FLAME ADJUSTMENT", False, "flame_adjustment", None, None, None),
    ("FLUE PIPING", False, "flue_piping", None, None, None),
    ("FAN/LIMIT SWITCH", False, "fan_limit_switch", None, None, None),
    ("R/V VALVE", False, "rv_valve", None, None, None),
    ("STRIP HEAT", False, "strip_heat", None, None, None),
    ("DEFROST CYCLE", False, "defrost_cycle", None, None, None),
    ("CO PPM:", False, None, "co_ppm", "CO (ppm)", None),
    ("REFRIGERANT", True, None, "refrigerant_type", "Refrigerant type", "e.g. R-410A"),
]
for r, (label, bold, chk, val, val_label, hint) in enumerate(rows_b):
    b_row(r, label, bold, chk, val, val_label, hint)
line(b_x - 4, TOP + 11, b_x - 4, y0 + len(rows_a) * ROW - 0.5, lw=0.6)

# ---------------------------------------------------------------- column B: payment, service, warranty
section("Payment and service")
rect(BX, TOP, BW, BLOCK)
bar(BX, TOP, BW, "METHOD OF PAYMENT")
py = TOP + 15
for i, (fid, label) in enumerate([("pay_cod", "COD"), ("pay_billing", "BILLING"), ("pay_no_charge", "NO CHARGE"),
                                  ("pay_call_office", "CALL OFFICE"), ("pay_warranty", "WARRANTY"), ("pay_pmp", "PMP")]):
    check(fid, "Payment: " + label.title(), BX + 6 + (i % 3) * 76, py + (i // 3) * 13, label)
bar(BX, TOP + 44, BW, "SERVICE REQUESTED")
field("service_requested", "Service requested", BX + 4, TOP + 58, BW - 8, 24, kind="multi", align="center", lh=10)
line(BX, TOP + 84, BX + BW, TOP + 84)
WARRANTY = [
    ("PARTS WARRANTY", "ALL PARTS AS RECORDED ARE WARRANTED AS PER MANUFACTURER SPECIFICATIONS."),
    ("LABOR GUARANTEE", "THE LABOR CHARGE AS RECORDED HERE RELATIVE TO THE EQUIPMENT SERVICED AS NOTED IS "
                        "GUARANTEED FOR A PERIOD OF 30 DAYS. WE DO NOT, OF COURSE, GUARANTEE OTHER PARTS THAN "
                        "THOSE WE PROVIDE. IF REPAIRS LATER BECOME NECESSARY DUE TO OTHER DEFECTIVE PARTS, "
                        "THEY WILL BE CHARGED SEPARATELY."),
]
wy = TOP + 90
for head, body in WARRANTY:
    text(BX + 4, wy, head, size=7, bold=True)
    text(BX + 4, wy + 10, body, size=6.5, w=BW - 8)
    wy += 10 + (24 if head.startswith("PARTS") else 64)

# ---------------------------------------------------------------- column C: description of work
section("Work performed")
rect(CX, TOP, CW, 222)
bar(CX, TOP, CW, "DESCRIPTION OF WORK PERFORMED")
for i in range(16):
    line(CX, TOP + 25 + i * 12.4, CX + CW, TOP + 25 + i * 12.4, lw=0.3)
field("work_description", "Description of work performed", CX + 3, TOP + 14, CW - 6, 205, kind="multi", lh=12.4,
      hint="What you found, what you did, readings, and the system's condition when you left")
rect(CX, TOP + 222, CW, 13)
text(CX + 4, TOP + 225, "TECHNICIAN:", size=6.5, bold=True)
field("technician", "Technician", CX + 60, TOP + 224, CW - 64, 10, size=8, align="right")

# ---------------------------------------------------------------- column C: terms + pricing
section("Charges")
TY = TOP + 235
rect(CX, TY, CW, 150)
TW = 134
bar(CX, TY, TW, "TERMS DUE UPON COMPLETION", size=6)
text(CX + 3, TY + 13, "I HAVE THE AUTHORITY TO ORDER THE ABOVE WORK AND DO SO ORDER AS OUTLINED ABOVE. "
     "IT IS AGREED THAT THE SELLER WILL RETAIN TITLE TO ANY EQUIPMENT OR MATERIAL FURNISHED UNTIL FINAL & "
     "COMPLETE PAYMENT IS MADE, AND IF SETTLEMENT IS NOT MADE AS AGREED, THE SELLER SHALL HAVE RIGHT TO REMOVE "
     "SAME AND THE SELLER WILL BE HELD HARMLESS FOR ANY DAMAGES RESULTING FROM THE REMOVAL THEREOF. A 2% FINANCE "
     "CHARGE WILL BE ADDED MONTHLY TO ALL UNPAID BALANCES. PURCHASER AGREES TO PAY $35.00 FEE RETURNED CHECKS, "
     "ANY ATTORNEY FEES AND/OR COLLECTION FEES THAT ROWAN MAY INCUR.", size=4.6, w=TW - 6)
line(CX + TW, TY, CX + TW, TY + 150)
money = [
    ("reg_labor", "REG LABOR", "Regular labor ($)", False),
    ("overtime_labor", "OVERTIME LABOR", "Overtime labor ($)", False),
    ("total_parts", "TOTAL PARTS", "Total parts ($)", True),
    ("trip_charges", "TRIP CHARGES", "Trip charge ($)", False),
    ("refrigerant_charge", "REFRIGERANT", "Refrigerant ($)", True),
    ("subtotal", "SUBTOTAL", "Subtotal ($)", True),
    ("previous", "PREVIOUS", "Previous balance ($)", False),
    ("coupon", "COUPON", "Coupon ($, subtracted)", False),
    ("fuel_charge", "FUEL CHARGE", "Fuel charge ($)", False),
    ("total_due", "TOTAL DUE", "Total due ($)", True),
]
for i, (fid, lab, label, comp) in enumerate(money):
    y = TY + 2 + i * 14.8
    text(CX + TW + 3, y + 3, lab, size=5.6, bold=(fid == "total_due"))
    field(fid, label, CX + TW + 62, y + 1, CW - TW - 65, 11, kind="money", align="right", computed=comp,
          hint="Calculated from the parts list" if fid in ("total_parts", "refrigerant_charge")
          else ("Calculated" if comp else None))
    line(CX + TW, y + 14.3, CX + CW, y + 14.3, lw=0.3)

# signature block
SY = TY + 150
rect(CX, SY, CW, H - M - SY)
section("Customer signature")
text(CX + 4, SY + 3, "PRINTED NAME / AUTHORIZED SIGNATURE", size=6, bold=True)
field("printed_name", "Customer printed name", CX + 4, SY + 12, CW - 8, 11)
line(CX, SY + 25, CX + CW, SY + 25)
text(CX + 4, SY + 28, "ABOVE WORK HAS BEEN COMPLETED AND I ACKNOWLEDGE RECEIPT OF MY COPY", size=5.4)
text(CX + 4, SY + 40, "X", size=11, bold=True)
line(CX + 16, SY + 52, CX + CW - 6, SY + 52, lw=0.6)

# ---------------------------------------------------------------- columns A+B: equipment
section("Equipment")
EY = TOP + BLOCK + 4
EW = CX - AX
rect(AX, EY, EW, 62)
cols = [("location", "LOCATION", 0.20), ("make", "MAKE", 0.17), ("model", "MODEL", 0.24),
        ("serial", "SERIAL", 0.21), ("type", "TYPE", 0.18)]
x = AX
xs = []
for key, head, frac in cols:
    w = EW * frac
    xs.append((key, head, x, w))
    text(x + 3, EY + 2, head, size=7, bold=True)
    x += w
line(AX, EY + 12, AX + EW, EY + 12)
for row in range(3):
    y = EY + 13 + row * 16
    for key, head, x, w in xs:
        field("eq%d_%s" % (row + 1, key), "Unit %d %s" % (row + 1, head.lower()), x + 3, y + 2, w - 6, 11)
    line(AX, y + 16, AX + EW, y + 16, lw=0.3)
for key, head, x, w in xs[1:]:
    line(x, EY, x, EY + 62, lw=0.4)

# equipment type checks + parts
section("Equipment type")
PY = EY + 62
rect(AX, PY, 120, H - M - PY)
text(AX + 3, PY + 3, "EQUIPMENT", size=7, bold=True)
for i, (fid, label) in enumerate([("eqt_gas_heat", "GAS HEAT"), ("eqt_oil_heat", "OIL HEAT"),
                                  ("eqt_electric_heat", "ELECTRIC HEAT"), ("eqt_ac", "AIR CONDITIONER"),
                                  ("eqt_heat_pump", "HEAT PUMP"), ("eqt_geothermal", "GEOTHERMAL")]):
    check(fid, label.title(), AX + 4, PY + 15 + i * 12.5, label)

section("Parts")
PX = AX + 120
PW = EW - 120
rect(PX, PY, PW, H - M - PY)
pc = [("qty", "QTY", 50), ("desc", "PARTS DESCRIPTION", PW - 50 - 70), ("amount", "AMOUNT", 70)]
x = PX
for key, head, w in pc:
    text(x + w / 2.0, PY + 3, head, size=7, bold=True, align="center")
    if x > PX:
        line(x, PY, x, H - M, lw=0.4)
    x += w
line(PX, PY + 12, PX + PW, PY + 12)
PART_ROWS = 8
for row in range(PART_ROWS):
    y = PY + 13 + row * 12.5
    x = PX
    for key, head, w in pc:
        label = {"qty": "Part %d quantity", "desc": "Part %d description", "amount": "Part %d amount ($)"}[key] % (row + 1)
        field("part%d_%s" % (row + 1, key), label, x + 3, y + 1, w - 6, 10,
              kind="money" if key == "amount" else "text", align="right" if key == "amount" else "left")
        x += w
    line(PX, y + 12.5, PX + PW, y + 12.5, lw=0.3)

layout = {
    "version": 1,
    "page": {"w": W, "h": H},
    "elements": els,
    "sections": sections,
}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rowanvan", "ticket_layout.json")
with open(out, "w") as f:
    json.dump(layout, f, indent=1, sort_keys=True)
ids = [e["id"] for e in els if e["t"] == "field"]
assert len(ids) == len(set(ids)), "duplicate field ids"
print("wrote %s: %d elements, %d fields" % (os.path.normpath(out), len(els), len(ids)))
