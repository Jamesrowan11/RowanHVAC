"""Builds rowanvan/maintenance_layout.json: the preventive-maintenance
inspection report a technician fills in on maintenance-agreement visits.

Same format as the service ticket (build_ticket_layout.py): the van app draws
its live preview from this file and the website prints the PDF from it.
Edit here, then run:
    python3 van-app/tools/build_maintenance_layout.py

Portrait US-letter (612 x 792 points), origin top-left, y growing downward.
Field ids shared with the service ticket (cust_*, invoice_no, date, time_in,
time_out, technician, job_finished, work_description, eq*, printed_name) mean
the same thing on both, so prefill, saving and completing the job work alike.

New field kind "status": one choice per checklist item, drawn as a tick in
one of several boxes ({"boxes": {"ok": x, "adj": x, "rep": x}}).
"""

import json
import os

W, H = 612, 792
M = 18
IW = W - 2 * M
NAVY = "#1a2b4a"

els = []
sections = []
_section = None

ITEM_CHOICES = [["ok", "OK"], ["adj", "Adjusted / cleaned"], ["rep", "Needs repair"]]


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
    rect(x, y, w, h, fill=NAVY, lw=0)
    text(x + w / 2.0, y + 2, s, size=size, bold=True, align="center", color="#ffffff")


def section(title):
    global _section
    _section = {"title": title, "fields": []}
    sections.append(_section)


def field(fid, label, x, y, w, h, kind="text", size=7.5, align="left", hint=None, lh=None):
    e = {"t": "field", "id": fid, "x": x, "y": y, "w": w, "h": h, "kind": kind, "size": size, "align": align}
    if lh:
        e["lh"] = lh
    els.append(e)
    f = {"id": fid, "label": label, "kind": kind}
    if hint:
        f["hint"] = hint
    _section["fields"].append(f)


def check(fid, label, x, y, printed=None):
    rect(x, y + 1, 7, 7, lw=0.6)
    els.append({"t": "field", "id": fid, "x": x, "y": y + 1, "w": 7, "h": 7, "kind": "check"})
    text(x + 10, y + 1, printed or label, size=6.5)
    _section["fields"].append({"id": fid, "label": label, "kind": "check"})


def status(fid, label, y, boxes, choices, hint=None):
    """One choice drawn as a tick in one of the boxes (box x positions by choice key)."""
    for x in boxes.values():
        rect(x, y + 1, 7, 7, lw=0.6)
    xs = sorted(boxes.values())
    els.append({"t": "field", "id": fid, "x": xs[0], "y": y + 1, "w": xs[-1] + 7 - xs[0], "h": 7,
                "kind": "status", "boxes": boxes})
    f = {"id": fid, "label": label, "kind": "status", "choices": choices}
    if hint:
        f["hint"] = hint
    _section["fields"].append(f)


# ---------------------------------------------------------------- header
AX, AW = M, 200
BX, BW = M + 200, 206
CX, CW = M + 406, IW - 406
TOP, HH = M, 80
rect(AX, TOP, AW, HH)
text(AX + AW / 2.0, TOP + 4, "ROWAN", size=10, bold=True, align="center")
text(AX + AW / 2.0, TOP + 16, "HEATING & AIR CONDITIONING, INC", size=8.5, bold=True, align="center")
text(AX + AW / 2.0, TOP + 28, "P.O. BOX 109 · FULTON, MD 20759", size=7.5, bold=True, align="center")
text(AX + AW / 2.0, TOP + 39, "WWW.ROWANHVAC.COM", size=7.5, bold=True, align="center")
text(AX + AW / 2.0, TOP + 52, "410-531-0008 · 1-800-225-ROWAN", size=7.5, bold=True, align="center")
text(AX + AW / 2.0, TOP + 65, "HVACR #2569", size=7.5, bold=True, align="center")

section("Customer")
rect(BX, TOP, BW, HH)
for i, (fid, label, lab) in enumerate([
        ("cust_name", "Customer name", ""), ("cust_street", "Street address", ""),
        ("cust_city", "City, state, ZIP", ""), ("cust_email", "Email", "EMAIL:"),
        ("cust_phone", "Phone", "PHONE:")]):
    y = TOP + 5 + i * 15
    if lab:
        text(BX + 4, y + 1, lab, size=6.5, bold=True)
    field(fid, label, BX + (34 if lab else 4), y, BW - (38 if lab else 8), 11)

section("Report")
rect(CX, TOP, CW, HH)
text(CX + 4, TOP + 4, "REPORT #", size=7, bold=True)
field("invoice_no", "Report #", CX + 50, TOP + 3, CW - 54, 11, align="right",
      hint="Filled in for you: technician initials and date")
line(CX, TOP + 17, CX + CW, TOP + 17)
text(CX + 4, TOP + 21, "DATE:", size=6.5, bold=True)
field("date", "Date", CX + 40, TOP + 20, CW - 44, 11, align="right")
line(CX, TOP + 34, CX + CW, TOP + 34)
line(CX + CW / 2.0, TOP + 34, CX + CW / 2.0, TOP + 62)
text(CX + 4, TOP + 37, "TIME IN:", size=6.5, bold=True)
field("time_in", "Time in", CX + 4, TOP + 47, CW / 2.0 - 8, 11, align="center", hint="e.g. 6:00 PM")
text(CX + CW / 2.0 + 4, TOP + 37, "TIME OUT:", size=6.5, bold=True)
field("time_out", "Time out", CX + CW / 2.0 + 4, TOP + 47, CW / 2.0 - 8, 11, align="center", hint="e.g. 7:30 PM")
line(CX, TOP + 62, CX + CW, TOP + 62)
text(CX + 4, TOP + 66, "VISIT COMPLETE", size=6.5, bold=True)
check("job_finished", "Visit complete", CX + CW - 34, TOP + 65, "YES")

# ---------------------------------------------------------------- title + visit
y = TOP + HH + 6
bar(M, y, IW, "PREVENTIVE MAINTENANCE INSPECTION REPORT", h=15, size=9.5)
y += 19
section("Visit")
rect(M, y, IW, 16)
text(M + 4, y + 4, "VISIT:", size=7, bold=True)
check("visit_spring", "Spring (cooling) visit", M + 40, y + 3, "SPRING / COOLING")
check("visit_fall", "Fall (heating) visit", M + 140, y + 3, "FALL / HEATING")
check("visit_other", "Other visit", M + 230, y + 3, "OTHER")
text(M + 300, y + 4, "AGREEMENT / PLAN:", size=7, bold=True)
field("agreement", "Agreement / plan", M + 380, y + 3, IW - 384, 11,
      hint="e.g. Comfort Club, 2 visits a year, renews 05/2027")

# ---------------------------------------------------------------- equipment
y += 22
section("Equipment")
bar(M, y, IW, "EQUIPMENT")
y += 11
cols = [("location", "LOCATION", 90), ("make", "MAKE", 80), ("model", "MODEL", 120),
        ("serial", "SERIAL", 120), ("type", "TYPE", 96), ("filter", "FILTER SIZE", IW - 506)]
rect(M, y, IW, 11 + 2 * 13)
x = M
for key, head, w in cols:
    text(x + 3, y + 2, head, size=6.5, bold=True)
    if x > M:
        line(x, y, x, y + 11 + 2 * 13)
    x += w
line(M, y + 11, M + IW, y + 11)
for row in (1, 2):
    ry = y + 11 + (row - 1) * 13
    if row > 1:
        line(M, ry, M + IW, ry)
    x = M
    for key, head, w in cols:
        field("eq%d_%s" % (row, key), "Unit %d %s" % (row, head.lower()), x + 3, ry + 1, w - 6, 11)
        x += w
y += 11 + 2 * 13 + 6

# ---------------------------------------------------------------- checklists
COLW = (IW - 8) / 2.0
COOLING = [
    ("c_thermostat", "Thermostat checked / calibrated", None),
    ("c_filter", "Air filter checked / replaced", None),
    ("c_cond_coil", "Condenser coil cleaned", None),
    ("c_evap_coil", "Evaporator coil inspected", None),
    ("c_drain", "Condensate drain flushed / treated", None),
    ("c_pump", "Condensate pump / float switch", None),
    ("c_refrigerant", "Refrigerant pressures", "suction / discharge psi"),
    ("c_superheat", "Superheat / subcool", "°F, e.g. 10 / 12"),
    ("c_split", "Supply / return temperature split", "°F, e.g. 63/43"),
    ("c_capacitor", "Run capacitor(s)", "µF rated / measured"),
    ("c_contactor", "Contactor", None),
    ("c_comp_amps", "Compressor amps", "amps"),
    ("c_fan_amps", "Condenser fan motor", "amps"),
    ("c_blower", "Indoor blower motor / wheel", "amps"),
    ("c_electrical", "Electrical connections tightened", None),
    ("c_disconnect", "Disconnect, whip, line set", None),
]
HEATING = [
    ("h_heat_exchanger", "Heat exchanger inspected", None),
    ("h_burners", "Burners cleaned / inspected", None),
    ("h_flame_sensor", "Flame sensor cleaned", "µA"),
    ("h_ignitor", "Ignitor / pilot", "ohms"),
    ("h_gas_pressure", "Gas pressure", "inlet / manifold in. w.c."),
    ("h_co", "Carbon monoxide test", "ppm, flue / ambient"),
    ("h_flue", "Flue / venting / draft", None),
    ("h_inducer", "Inducer motor", "amps"),
    ("h_limits", "Limit and safety switches", None),
    ("h_temp_rise", "Temperature rise", "°F"),
    ("h_blower", "Blower / belts (heat mode)", None),
    ("h_humidifier", "Humidifier / pad", None),
    ("h_defrost", "Heat pump defrost / reversing valve", None),
    ("h_aux_heat", "Auxiliary / strip heat", "amps"),
    ("h_detectors", "Smoke / CO detectors in home", None),
    ("h_ducts", "Ductwork / registers (visual)", None),
]
ROWH = 14.5


def checklist(x0, title, sec_title, items):
    section(sec_title)
    bar(x0, y, COLW, title)
    hy = y + 11
    rect(x0, hy, COLW, 10 + ROWH * len(items))
    bx = {"ok": x0 + 128, "adj": x0 + 148, "rep": x0 + 168}
    text(bx["ok"] + 3.5, hy + 2, "OK", size=6, bold=True, align="center")
    text(bx["adj"] + 3.5, hy + 2, "ADJ", size=6, bold=True, align="center")
    text(bx["rep"] + 3.5, hy + 2, "REP", size=6, bold=True, align="center")
    text(x0 + 186, hy + 2, "READING", size=6, bold=True)
    line(x0, hy + 10, x0 + COLW, hy + 10)
    for i, (fid, label, unit) in enumerate(items):
        ry = hy + 10 + i * ROWH
        if i:
            line(x0, ry, x0 + COLW, ry, lw=0.3)
        text(x0 + 4, ry + 4, label, size=6.5)
        status(fid, label, ry + 3, bx, ITEM_CHOICES,
               hint=("Reading: " + unit) if unit else None)
        if unit:
            field(fid + "_val", label + " reading", x0 + 184, ry + 2, COLW - 188, 11, size=7,
                  hint=unit)
    return hy + 10 + ROWH * len(items)


end1 = checklist(M, "COOLING · AIR CONDITIONER · HEAT PUMP", "Cooling checklist", COOLING)
end2 = checklist(M + COLW + 8, "HEATING · FURNACE · HEAT PUMP", "Heating checklist", HEATING)
text(M, max(end1, end2) + 2, "OK = checked, working properly · ADJ = adjusted / cleaned during this visit · "
     "REP = needs repair (see recommendations). Blank = not applicable.", size=5.8, color="#444444")
y = max(end1, end2) + 12

# ---------------------------------------------------------------- overall + findings
section("Findings")
rect(M, y, IW, 16)
text(M + 4, y + 4, "OVERALL SYSTEM CONDITION:", size=7, bold=True)
cond = {"good": M + 128, "fair": M + 178, "poor": M + 222}
text(cond["good"] + 10, y + 4, "GOOD", size=6.5)
text(cond["fair"] + 10, y + 4, "FAIR", size=6.5)
text(cond["poor"] + 10, y + 4, "NEEDS ATTENTION", size=6.5)
status("condition", "Overall system condition", y + 3, cond,
       [["good", "Good"], ["fair", "Fair"], ["poor", "Needs attention"]])
check("system_operating", "System left operating normally", M + 316, y + 3, "SYSTEM LEFT OPERATING NORMALLY")
text(M + IW - 118, y + 4, "NEXT VISIT DUE:", size=7, bold=True)
field("next_visit", "Next visit due", M + IW - 58, y + 3, 54, 11, align="center", hint="e.g. 04/2027")
y += 20
bar(M, y, IW, "FINDINGS & RECOMMENDATIONS")
y += 11
LINES, LH = 8, 12.4
rect(M, y, IW, LINES * LH + 3)
for i in range(1, LINES):
    line(M, y + i * LH + 1, M + IW, y + i * LH + 1, lw=0.3)
field("work_description", "Findings & recommendations", M + 3, y + 1, IW - 6, LINES * LH, kind="multi", lh=LH,
      hint="What you found, what you adjusted or cleaned, and any repairs you recommend (with why)")
y += LINES * LH + 3
section("Sign-off")
rect(M, y, IW, 16)
text(M + 4, y + 4, "TECHNICIAN:", size=7, bold=True)
field("technician", "Technician", M + 60, y + 3, 200, 11)
y += 22

# ---------------------------------------------------------------- terms + signature
text(M, y, "This inspection was performed under your Rowan Heating & Air Conditioning maintenance agreement. "
     "Items marked NEEDS REPAIR are not included in the agreement unless your agreement says so; we will "
     "give you a price before doing any repair. Thank you for being a Rowan maintenance customer.",
     size=6.5, w=IW)
y += 30
rect(M, y, IW, 40)
text(M + 4, y + 3, "CUSTOMER PRINTED NAME / SIGNATURE", size=6.5, bold=True)
field("printed_name", "Customer printed name", M + 4, y + 13, 220, 11)
text(M + 240, y + 26, "X", size=10, bold=True)
line(M + 252, y + 34, M + IW - 6, y + 34)
text(M + 252, y + 13, "I ACKNOWLEDGE THIS INSPECTION WAS COMPLETED AND I RECEIVED A COPY", size=6)
assert y + 40 <= H - M, "page overflow: %s" % (y + 40)

out = {"version": 1, "kind": "maintenance", "page": {"w": W, "h": H}, "elements": els, "sections": sections}
path = os.path.join(os.path.dirname(__file__), "..", "rowanvan", "maintenance_layout.json")
with open(path, "w") as f:
    json.dump(out, f, indent=1, sort_keys=True)
print("wrote", os.path.normpath(path), len(els), "elements,", sum(len(s["fields"]) for s in sections), "fields")
