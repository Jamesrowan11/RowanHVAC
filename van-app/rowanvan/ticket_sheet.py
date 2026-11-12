"""The paper service ticket drawn on a Tk Canvas, filled in live as the
technician types. The field being edited is highlighted and scrolled into
view, and fields the checks flagged get a red (error) or orange (warning)
outline. Drawn from ticket_layout.json, the same layout the website uses to
print the PDF, so what they see here is what the customer gets.

Python 3.4: no f-strings.
"""

import tkinter as tk
import tkinter.font as tkfont
from tkinter import ttk

from . import ticket as T

INK = "#0b3d91"          # the "pen" colour for what the technician wrote
HIGHLIGHT = "#fff3a8"
HIGHLIGHT_EDGE = "#f57c1f"
ISSUE_COLORS = {"error": "#b3261e", "warning": "#e08a00", "suggestion": "#1d4ed8"}


class TicketSheet(tk.Frame):
    def __init__(self, parent, on_field_click=None, kind="service", **kw):
        tk.Frame.__init__(self, parent, **kw)
        self.layout = T.layout(kind)
        self.page_w = self.layout["page"]["w"]
        self.page_h = self.layout["page"]["h"]
        self.fields = dict((e["id"], e) for e in self.layout["elements"] if e["t"] == "field")
        self.values = {}
        self.issues = {}
        self.focused = None
        self.zoom = 1.0          # 1.0 = page fits the width of the panel
        self.scale = 1.0
        self._fonts = {}
        self.on_field_click = on_field_click

        self.canvas = tk.Canvas(self, bg="#8a94a6", highlightthickness=0)
        ys = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        xs = ttk.Scrollbar(self, orient="horizontal", command=self.canvas.xview)
        self.canvas.configure(yscrollcommand=ys.set, xscrollcommand=xs.set)
        ys.pack(side="right", fill="y")
        xs.pack(side="bottom", fill="x")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.canvas.bind("<Configure>", self._on_resize)
        self.canvas.bind("<Button-1>", self._on_click)
        self._last_width = 0

    # ---------------------------------------------------------------- public

    def set_values(self, values):
        self.values = dict(values)
        self.redraw()

    def set_value(self, fid, value):
        self.values[fid] = value
        self._draw_value(fid)
        if fid == self.focused:
            self._draw_focus()

    def set_issues(self, issues):
        """issues: list of {field, severity}; the worst severity per field wins."""
        self.issues = {}
        for i in issues:
            fid = i.get("field")
            if fid not in self.fields:
                continue
            old = self.issues.get(fid)
            if old is None or T.SEVERITY_ORDER.get(i.get("severity"), 3) < T.SEVERITY_ORDER.get(old, 3):
                self.issues[fid] = i.get("severity")
        self._draw_issues()

    def focus_field(self, fid):
        self.focused = fid if fid in self.fields else None
        self._draw_focus()
        if self.focused:
            self._scroll_to(self.fields[self.focused])

    def set_zoom(self, zoom):
        self.zoom = zoom
        self.redraw()
        if self.focused:
            self._scroll_to(self.fields[self.focused])

    # ---------------------------------------------------------------- drawing

    def _on_resize(self, event):
        if abs(event.width - self._last_width) > 4:
            self._last_width = event.width
            self.redraw()

    def _font(self, size, bold=False, smallest=6):
        # Printed text keeps its proportions even when tiny (whole-page view);
        # the technician's writing never drops below a readable size.
        return self._font_px(max(smallest, int(round(size * self.scale))), bold)

    def _font_px(self, px, bold=False):
        key = (px, bold)
        if key not in self._fonts:
            self._fonts[key] = tkfont.Font(family="Arial", size=-px, weight="bold" if bold else "normal")
        return self._fonts[key]

    def _xy(self, x, y):
        return self.margin + x * self.scale, self.margin + y * self.scale

    def redraw(self):
        c = self.canvas
        width = max(c.winfo_width(), 200)
        self.margin = 8
        self.scale = (width - 2 * self.margin) / float(self.page_w) * self.zoom
        c.delete("all")
        x0, y0 = self._xy(0, 0)
        x1, y1 = self._xy(self.page_w, self.page_h)
        c.create_rectangle(x0 + 3, y0 + 3, x1 + 3, y1 + 3, fill="#5b6478", outline="")  # shadow
        c.create_rectangle(x0, y0, x1, y1, fill="white", outline="#333")
        c.create_rectangle(0, 0, 0, 0, tags="hl", outline="")
        for e in self.layout["elements"]:
            t = e["t"]
            if t == "rect":
                a, b = self._xy(e["x"], e["y"])
                cx, d = self._xy(e["x"] + e["w"], e["y"] + e["h"])
                c.create_rectangle(a, b, cx, d, fill=e.get("fill") or "",
                                   outline="black" if e.get("lw") else "",
                                   width=max(1, e.get("lw") or 0) if e.get("lw") else 0)
            elif t == "line":
                a, b = self._xy(e["x1"], e["y1"])
                cx, d = self._xy(e["x2"], e["y2"])
                c.create_line(a, b, cx, d, fill="black")
            elif t == "text":
                self._draw_text(e)
        for fid in self.fields:
            self._draw_value(fid)
        self._draw_issues()
        self._draw_focus()
        c.configure(scrollregion=(0, 0, x1 + self.margin + 3, y1 + self.margin + 3))

    def _draw_text(self, e):
        font = self._font(e["size"], e.get("bold"), smallest=3)
        x, y = self._xy(e["x"], e["y"])
        color = e.get("color") or "black"
        if e.get("w"):
            self.canvas.create_text(x, y, text=e["s"], font=font, fill=color, anchor="nw",
                                    width=e["w"] * self.scale)
        else:
            anchor = {"left": "nw", "center": "n", "right": "ne"}[e.get("align", "left")]
            self.canvas.create_text(x, y, text=e["s"], font=font, fill=color, anchor=anchor)

    def _draw_value(self, fid):
        c = self.canvas
        tag = "v_" + fid
        c.delete(tag)
        e = self.fields[fid]
        value = self.values.get(fid)
        x, y = self._xy(e["x"], e["y"])
        w, h = e["w"] * self.scale, e["h"] * self.scale
        if e["kind"] == "check":
            if value:
                c.create_line(x + 0.12 * w, y + 0.5 * h, x + 0.4 * w, y + 0.85 * h, x + 0.95 * w, y - 0.1 * h,
                              fill=INK, width=max(2, int(self.scale * 1.4)), tags=tag)
            return
        if e["kind"] == "status":
            # A tick in the box for the chosen answer (OK / ADJ / REP ...).
            bx = (e.get("boxes") or {}).get(value)
            if bx is not None:
                bx, _ = self._xy(bx, e["y"])
                s7 = 7 * self.scale
                c.create_line(bx + 0.12 * s7, y + 0.5 * h, bx + 0.4 * s7, y + 0.85 * h, bx + 0.95 * s7, y - 0.1 * h,
                              fill=INK, width=max(2, int(self.scale * 1.4)), tags=tag)
            return
        if not value:
            return
        value = str(value)
        if e["kind"] == "money" and T.parse_money(value):
            value = "$" + "{:,.2f}".format(T.parse_money(value))
        font = self._font(e.get("size", 7.5))
        if e["kind"] == "multi":
            lh = (e.get("lh") or e.get("size", 7.5) * 1.3) * self.scale
            lines = self._wrap(value, font, w - 2)
            max_lines = max(1, int((h + 2) / lh))
            if len(lines) > max_lines:
                lines = lines[:max_lines]
                lines[-1] = lines[-1].rstrip() + " ..."
                c.create_text(x + w, y + h, text="(continues in PDF)", anchor="se", fill="#b3261e",
                              font=self._font(5.5), tags=tag)
            for i, line in enumerate(lines):
                c.create_text(x + 1, y + 1 + i * lh, text=line, anchor="nw", fill=INK, font=font, tags=tag)
            return
        # One line: shrink the text to fit the box rather than run over the next field.
        px = -int(font.cget("size"))
        while font.measure(value) > w - 2 and px > 6:
            px -= 1
            font = self._font_px(px)
        align = e.get("align", "left")
        if e["kind"] == "money":
            align = "right"
        if align == "right":
            c.create_text(x + w - 1, y + h / 2.0, text=value, anchor="e", fill=INK, font=font, tags=tag)
        elif align == "center":
            c.create_text(x + w / 2.0, y + h / 2.0, text=value, anchor="center", fill=INK, font=font, tags=tag)
        else:
            c.create_text(x + 1, y + h / 2.0, text=value, anchor="w", fill=INK, font=font, tags=tag)

    @staticmethod
    def _wrap(text, font, width):
        lines = []
        for para in text.split("\n"):
            line = ""
            for word in para.split(" "):
                trial = word if not line else line + " " + word
                if font.measure(trial) <= width or not line:
                    line = trial
                else:
                    lines.append(line)
                    line = word
            lines.append(line)
        return lines

    def _box(self, e, pad=1.5):
        x, y = self._xy(e["x"], e["y"])
        return (x - pad, y - pad, x + e["w"] * self.scale + pad, y + e["h"] * self.scale + pad)

    def _draw_issues(self):
        c = self.canvas
        c.delete("issue")
        for fid, severity in self.issues.items():
            c.create_rectangle(*self._box(self.fields[fid], 2), outline=ISSUE_COLORS.get(severity, "red"),
                               width=2, dash=(4, 2) if severity == "suggestion" else None, tags="issue")

    def _draw_focus(self):
        c = self.canvas
        if not self.focused:
            c.coords("hl", 0, 0, 0, 0)
            c.itemconfigure("hl", fill="", outline="")
            return
        c.coords("hl", *self._box(self.fields[self.focused], 2.5))
        # Created right after the white page in redraw(), so it stays under
        # the printed lines and the writing.
        c.itemconfigure("hl", fill=HIGHLIGHT, outline=HIGHLIGHT_EDGE, width=2)

    def _scroll_to(self, e):
        c = self.canvas
        region = c.cget("scrollregion").split()
        if len(region) != 4:
            return
        total_w, total_h = float(region[2]), float(region[3])
        view_w, view_h = c.winfo_width(), c.winfo_height()
        x0, y0, x1, y1 = self._box(e, 0)
        if total_h > view_h:
            top = c.canvasy(0)
            if y0 < top + 20 or y1 > top + view_h - 20:
                c.yview_moveto(max(0.0, ((y0 + y1) / 2.0 - view_h / 2.0) / total_h))
        if total_w > view_w:
            left = c.canvasx(0)
            if x0 < left + 20 or x1 > left + view_w - 20:
                c.xview_moveto(max(0.0, ((x0 + x1) / 2.0 - view_w / 2.0) / total_w))

    def _on_click(self, event):
        if not self.on_field_click:
            return
        px = (self.canvas.canvasx(event.x) - self.margin) / self.scale
        py = (self.canvas.canvasy(event.y) - self.margin) / self.scale
        best = None
        for fid, e in self.fields.items():
            if e["x"] - 2 <= px <= e["x"] + e["w"] + 2 and e["y"] - 2 <= py <= e["y"] + e["h"] + 2:
                area = e["w"] * e["h"]
                if best is None or area < best[0]:
                    best = (area, fid)
        if best:
            self.on_field_click(best[1])
