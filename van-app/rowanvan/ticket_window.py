"""The service ticket screen: the form on the left, the paper ticket on the
right filling in as the technician types (the field they are in is
highlighted on the sheet). Mistakes are checked as they go by the app, and
on request by the website's AI before the ticket is sent.

Python 3.4: no f-strings.
"""

import datetime
import os
import re
import sys
import tempfile

import tkinter as tk
from tkinter import ttk, messagebox

from . import api
from . import ticket as T
from .ticket_sheet import TicketSheet, ISSUE_COLORS
from .ui_common import (NAVY, NAVY_LIGHT, ORANGE, WHITE, GREEN, RED, GREY, FONT, FONT_BOLD,
                        FONT_BIG, FONT_SMALL, big_button, in_background)

SEVERITY_WORD = {"error": "Must fix", "warning": "Check", "suggestion": "Tip"}
_GROUP_RE = re.compile(r"^(part|eq)(\d+)_")


class TicketWindow(tk.Toplevel):
    def __init__(self, screen, job):
        tk.Toplevel.__init__(self, screen)
        self.screen = screen
        self.store = screen.store
        self.job = job
        existing = self.store.ticket_for_job(job["id"])
        if existing:
            self.ticket_id = existing["id"]
            self.data = existing["data"]
            self.status = existing["status"] or "draft"
            self.ai_check = existing["ai_check"]
        else:
            self.ticket_id = None
            self.data = T.new_ticket(job, self.store.get("user_name", ""), self.store.invoice_numbers())
            self.status = "draft"
            self.ai_check = None
        self.fields = T.fields()
        self.widgets = {}      # field id -> entry/text/checkbutton
        self.vars = {}         # field id -> StringVar/IntVar
        self.local_issues = []
        self.ai_stale = self.ai_check is None
        self._check_job = None
        self._save_job = None
        self._dirty = False

        self.title("Service Ticket - " + (job["customer_name"] or ""))
        self.configure(bg=NAVY_LIGHT)
        self.geometry("1024x740+0+0")
        if sys.platform.startswith("win"):
            try:
                self.state("zoomed")
            except tk.TclError:
                pass
        self.protocol("WM_DELETE_WINDOW", self.close)

        self._build_header()
        body = tk.PanedWindow(self, orient="horizontal", bg=NAVY_LIGHT, sashwidth=8, bd=0)
        body.pack(fill="both", expand=True, padx=6, pady=(0, 6))
        left = tk.Frame(body, bg=WHITE)
        right = tk.Frame(body, bg=NAVY_LIGHT)
        body.add(left, width=430, minsize=330)
        body.add(right, minsize=300)

        self._build_issues(left)
        self._build_form(left)
        self._build_sheet(right)

        self.sheet.set_values(self.data)
        self._run_local_check()
        if self.ai_check:
            self._show_issues()
        first = self.widgets.get("work_description") if self.data.get("cust_name") else self.widgets.get("cust_name")
        if first is not None:
            self.after(200, first.focus_set)

    # ---------------------------------------------------------------- layout

    def _build_header(self):
        bar = tk.Frame(self, bg=NAVY)
        bar.pack(fill="x", pady=(0, 6))
        tk.Label(bar, text="Service Ticket", font=FONT_BIG, fg=WHITE, bg=NAVY).pack(side="left", padx=12, pady=6)
        self.title_label = tk.Label(bar, font=FONT_BOLD, fg=ORANGE, bg=NAVY)
        self.title_label.pack(side="left", padx=4)
        big_button(bar, "Close", self.close, bg="#2c4170").pack(side="right", padx=(4, 8), pady=6)
        self.finish_button = big_button(bar, "Finish & Send", self.finish, bg=GREEN)
        self.finish_button.pack(side="right", padx=4, pady=6)
        self.pdf_button = big_button(bar, "Open PDF", self.open_pdf, bg="#2c4170")
        self.pdf_button.pack(side="right", padx=4, pady=6)
        self.ai_button = big_button(bar, "Check with AI", self.ai_check_now, bg=ORANGE)
        self.ai_button.pack(side="right", padx=4, pady=6)
        self._update_title()

    def _update_title(self):
        state = {"draft": "Draft", "final": "Sent to office"}.get(self.status, self.status)
        self.title_label.config(text=(self.data.get("invoice_no") or "") + "   " + state)

    def _build_issues(self, parent):
        box = tk.Frame(parent, bg=WHITE)
        box.pack(side="bottom", fill="x")
        head = tk.Frame(box, bg=WHITE)
        head.pack(fill="x", padx=8, pady=(6, 0))
        self.issue_title = tk.Label(head, text="Checks", font=FONT_BOLD, fg=NAVY, bg=WHITE, anchor="w")
        self.issue_title.pack(side="left")
        self.ai_label = tk.Label(head, text="", font=FONT_SMALL, fg=GREY, bg=WHITE, anchor="e")
        self.ai_label.pack(side="right")
        lb_box = tk.Frame(box, bg=WHITE)
        lb_box.pack(fill="x", padx=8, pady=(2, 8))
        self.issue_list = tk.Listbox(lb_box, height=6, font=FONT_SMALL, activestyle="none",
                                     relief="solid", bd=1, selectbackground=NAVY_LIGHT,
                                     selectforeground=NAVY)
        scroll = ttk.Scrollbar(lb_box, orient="vertical", command=self.issue_list.yview)
        self.issue_list.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.issue_list.pack(side="left", fill="x", expand=True)
        self.issue_list.bind("<<ListboxSelect>>", self._on_issue_select)
        self.shown_issues = []

    def _build_form(self, parent):
        outer = tk.Frame(parent, bg=WHITE)
        outer.pack(fill="both", expand=True)
        self.form_canvas = tk.Canvas(outer, bg=WHITE, highlightthickness=0)
        scroll = ttk.Scrollbar(outer, orient="vertical", command=self.form_canvas.yview)
        self.form_canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.form_canvas.pack(side="left", fill="both", expand=True)
        form = tk.Frame(self.form_canvas, bg=WHITE, padx=10, pady=6)
        win = self.form_canvas.create_window(0, 0, window=form, anchor="nw")
        form.bind("<Configure>", lambda e: self.form_canvas.configure(scrollregion=self.form_canvas.bbox("all")))
        self.form_canvas.bind("<Configure>", lambda e: self.form_canvas.itemconfigure(win, width=e.width))
        self.form_canvas.bind_all("<MouseWheel>", self._on_wheel)
        self.form = form

        for section in T.layout()["sections"]:
            tk.Label(form, text=section["title"].upper(), font=FONT_BOLD, fg=WHITE, bg=NAVY,
                     anchor="w", padx=8, pady=3).pack(fill="x", pady=(10, 4))
            group, group_frame = None, None
            checks_row = None
            for f in section["fields"]:
                m = _GROUP_RE.match(f["id"])
                if m:
                    key = m.group(1) + m.group(2)
                    if key != group:
                        group = key
                        name = ("Part line " if m.group(1) == "part" else "Unit ") + m.group(2)
                        group_frame = tk.LabelFrame(form, text=name, font=FONT_SMALL, fg=GREY, bg=WHITE,
                                                    padx=6, pady=2)
                        group_frame.pack(fill="x", pady=2)
                    self._add_field(group_frame, f)
                    checks_row = None
                    continue
                if f["kind"] == "check":
                    # Checkboxes flow two per line to keep the form short.
                    if checks_row is None or checks_row.count >= 2:
                        checks_row = tk.Frame(form, bg=WHITE)
                        checks_row.count = 0
                        checks_row.pack(fill="x")
                    self._add_check(checks_row, f)
                    checks_row.count += 1
                    continue
                checks_row = None
                self._add_field(form, f)

    def _add_field(self, parent, f):
        fid = f["id"]
        row = tk.Frame(parent, bg=WHITE)
        row.pack(fill="x", pady=2)
        label = f["label"] + ("  (calculated)" if f.get("computed") else "")
        tk.Label(row, text=label, font=FONT_SMALL, fg=GREY, bg=WHITE, anchor="w").pack(fill="x")
        if f.get("computed"):
            var = tk.StringVar(value=self._display(fid))
            w = tk.Label(row, textvariable=var, font=FONT_BOLD, fg=NAVY, bg=NAVY_LIGHT, anchor="e", padx=6)
            w.pack(fill="x")
            self.vars[fid] = var
            self.widgets[fid] = w
            return
        if f["kind"] == "multi":
            w = tk.Text(row, height=6 if fid == "work_description" else 3, width=20, font=FONT, wrap="word",
                        relief="solid", bd=1, padx=4, pady=3)
            w.insert("1.0", self.data.get(fid) or "")
            w.bind("<KeyRelease>", lambda e, i=fid: self._changed(i))
            w.bind("<Tab>", self._next_focus)
            w.pack(fill="x")
        else:
            var = tk.StringVar(value=self.data.get(fid) or "")
            w = tk.Entry(row, textvariable=var, font=FONT, relief="solid", bd=1,
                         justify="right" if f["kind"] == "money" else "left")
            w.pack(fill="x", ipady=3)
            var.trace("w", lambda *a, i=fid: self._changed(i))
            self.vars[fid] = var
        if f.get("hint"):
            tk.Label(row, text=f["hint"], font=("Tahoma", 9), fg=GREY, bg=WHITE, anchor="w",
                     justify="left", wraplength=380).pack(fill="x")
        w.bind("<FocusIn>", lambda e, i=fid: self._focused(i))
        self.widgets[fid] = w

    def _add_check(self, parent, f):
        fid = f["id"]
        var = tk.IntVar(value=1 if self.data.get(fid) else 0)
        w = tk.Checkbutton(parent, text=f["label"], variable=var, font=FONT_SMALL, bg=WHITE,
                           anchor="w", activebackground=NAVY_LIGHT, padx=2, pady=3,
                           command=lambda i=fid: (self._focused(i), self._changed(i)))
        w.pack(side="left", fill="x", expand=True)
        w.bind("<FocusIn>", lambda e, i=fid: self._focused(i))
        self.vars[fid] = var
        self.widgets[fid] = w

    def _build_sheet(self, parent):
        tools = tk.Frame(parent, bg=NAVY_LIGHT)
        tools.pack(fill="x")
        tk.Label(tools, text="What the customer gets (tap a box to fill it in)", font=FONT_SMALL, fg=GREY,
                 bg=NAVY_LIGHT).pack(side="left", padx=4)
        for text, zoom in (("Big", 1.6), ("Bigger", 1.25), ("Whole page", 1.0)):
            tk.Button(tools, text=text, font=FONT_SMALL, relief="flat", bg=WHITE, fg=NAVY,
                      command=lambda z=zoom: self.sheet.set_zoom(z)).pack(side="right", padx=2, pady=2)
        self.sheet = TicketSheet(parent, on_field_click=self.jump_to, bg=NAVY_LIGHT)
        self.sheet.pack(fill="both", expand=True)
        self.sheet.zoom = 1.25

    # ---------------------------------------------------------------- editing

    def _display(self, fid):
        v = self.data.get(fid)
        if fid in T.COMPUTED:
            return "$" + "{:,.2f}".format(float(v or 0))
        return v or ""

    def _read(self, fid):
        w = self.widgets[fid]
        if isinstance(w, tk.Text):
            return w.get("1.0", "end").rstrip("\n")
        var = self.vars[fid]
        if isinstance(var, tk.IntVar):
            return bool(var.get())
        return var.get()

    def _changed(self, fid):
        value = self._read(fid)
        if self.data.get(fid) == value or (not value and not self.data.get(fid)):
            return
        self.data[fid] = value
        self.sheet.set_value(fid, value)
        computed = T.compute(self.data)
        for k, v in computed.items():
            if self.data.get(k) != v:
                self.data[k] = v
                self.vars[k].set(self._display(k))
                self.sheet.set_value(k, v)
        self._dirty = True
        self.ai_stale = True
        if self._check_job:
            self.after_cancel(self._check_job)
        self._check_job = self.after(600, self._run_local_check)
        if self._save_job:
            self.after_cancel(self._save_job)
        self._save_job = self.after(4000, self.save_draft)

    def _focused(self, fid):
        self.sheet.focus_field(fid)
        self._ensure_visible(self.widgets[fid])

    def _next_focus(self, event):
        event.widget.tk_focusNext().focus_set()
        return "break"

    def jump_to(self, fid):
        w = self.widgets.get(fid)
        if w is None:
            return
        if fid in T.COMPUTED:
            self.sheet.focus_field(fid)
            self._ensure_visible(w)
            return
        w.focus_set()
        self._focused(fid)

    def _ensure_visible(self, widget):
        c = self.form_canvas
        self.update_idletasks()
        y = widget.winfo_rooty() - self.form.winfo_rooty()
        h = widget.winfo_height()
        total = max(1, self.form.winfo_height())
        top = c.canvasy(0)
        view = c.winfo_height()
        if y - 30 < top or y + h + 30 > top + view:
            c.yview_moveto(max(0.0, (y - view / 3.0) / total))

    def _on_wheel(self, event):
        if str(event.widget).startswith(str(self.form_canvas)) or str(event.widget).startswith(str(self.form)):
            self.form_canvas.yview_scroll(int(-event.delta / 120), "units")

    # ---------------------------------------------------------------- checks

    def _run_local_check(self):
        self._check_job = None
        self.local_issues = T.check(self.data)
        self._show_issues()

    def _all_issues(self):
        issues = list(self.local_issues)
        if self.ai_check and not self.ai_stale:
            seen = set((i["field"], i["message"]) for i in issues)
            for i in self.ai_check.get("issues", []):
                if (i.get("field"), i.get("message")) not in seen:
                    j = dict(i)
                    j["source"] = "ai"
                    issues.append(j)
        return T.sort_issues(issues)

    def _show_issues(self):
        issues = self._all_issues()
        self.shown_issues = issues
        self.sheet.set_issues(issues)
        lb = self.issue_list
        lb.delete(0, "end")
        for n, i in enumerate(issues):
            who = "AI: " if i.get("source") == "ai" else ""
            lb.insert("end", "%s - %s%s: %s" % (SEVERITY_WORD.get(i["severity"], "Check"), who,
                                                T.field_label(i["field"]), i["message"]))
            lb.itemconfig(n, foreground=ISSUE_COLORS.get(i["severity"], NAVY))
        errors = sum(1 for i in issues if i["severity"] == "error")
        if not issues:
            self.issue_title.config(text="Checks: no problems found", fg=GREEN)
        else:
            self.issue_title.config(text="Checks: %d to fix, %d to look at" % (errors, len(issues) - errors),
                                    fg=RED if errors else ORANGE)
        if self.ai_check and not self.ai_stale:
            self.ai_label.config(text="AI checked this version", fg=GREEN)
        elif self.ai_check:
            self.ai_label.config(text="Changed since the AI check", fg=ORANGE)
        else:
            self.ai_label.config(text="Not checked by AI yet", fg=GREY)

    def _on_issue_select(self, _event=None):
        sel = self.issue_list.curselection()
        if sel and sel[0] < len(self.shown_issues):
            self.jump_to(self.shown_issues[sel[0]]["field"])

    def ai_check_now(self, then=None):
        """Sends the ticket to the website, where Claude reads it for mistakes."""
        self.save_draft()
        server, token = self.store.get("server"), self.store.get("token")
        data, ticket_id = dict(self.data), self.ticket_id
        local = [dict((k, i[k]) for k in ("field", "severity", "message")) for i in self.local_issues]
        self.ai_button.config(state="disabled", text="Checking...")
        self.ai_label.config(text="The AI is reading the ticket (up to a minute)...", fg=GREY)

        def done(result):
            if not self.winfo_exists():
                return
            self.ai_button.config(state="normal", text="Check with AI")
            if isinstance(result, api.Offline):
                self.ai_label.config(text="No signal: AI check not done", fg=ORANGE)
                if then:
                    then(False)
                else:
                    messagebox.showinfo("Rowan Van", "No connection to the office right now. The app's own checks "
                                        "still ran; try the AI check again when you have signal.", parent=self)
                return
            if isinstance(result, Exception):
                self.ai_label.config(text="AI check failed", fg=RED)
                messagebox.showwarning("Rowan Van", "The AI check did not work: " + str(result), parent=self)
                if then:
                    then(False)
                return
            if data != self.data:
                # They kept typing while the AI read the ticket; the answer is
                # for the older version.
                self.ai_check = {"issues": result.get("issues") or [], "summary": result.get("summary") or ""}
                self.ai_stale = True
            else:
                self.ai_check = {"issues": result.get("issues") or [], "summary": result.get("summary") or ""}
                self.ai_stale = False
            self._save(self.status)
            self._show_issues()
            if then:
                then(True)
            elif self.ai_check.get("summary"):
                messagebox.showinfo("AI check", self.ai_check["summary"], parent=self)

        in_background(self, lambda: api.ticket_check(server, token, ticket_id, self.job["id"], data, local), done)

    # ---------------------------------------------------------------- saving

    def _save(self, status):
        self.status = status
        ai = self.ai_check if (self.ai_check and not self.ai_stale) else None
        self.ticket_id = self.store.save_ticket(self.ticket_id, self.job["id"], self.data, status, ai)
        self._dirty = False
        self._update_title()

    def save_draft(self):
        if self._save_job:
            self.after_cancel(self._save_job)
            self._save_job = None
        if self._dirty or self.ticket_id is None:
            # A ticket already sent stays "final"; edits go to the office as a correction.
            self._save(self.status)

    def finish(self):
        self._run_local_check()
        errors = [i for i in self.local_issues if i["severity"] == "error"]
        if errors:
            self._show_issues()
            messagebox.showwarning("Rowan Van", "Fix the items marked \"Must fix\" first:\n\n" +
                                   "\n".join("- " + i["message"] for i in errors[:8]), parent=self)
            self.jump_to(errors[0]["field"])
            return
        if not self.data.get("time_out"):
            self.vars["time_out"].set(T.fmt_time(datetime.datetime.now()))
            self._changed("time_out")
        if self.ai_stale:
            self.ai_check_now(then=self._finish_after_ai)
        else:
            self._finish_after_ai(True)

    def _finish_after_ai(self, checked):
        ai_errors = [i for i in (self.ai_check or {}).get("issues", []) if i.get("severity") == "error"]
        if checked and ai_errors and not self.ai_stale:
            if not messagebox.askyesno(
                    "AI check", "The AI found %d possible mistake(s):\n\n%s\n\nSend the ticket anyway?" % (
                        len(ai_errors), "\n".join("- " + i["message"] for i in ai_errors[:6])), parent=self):
                self.jump_to(ai_errors[0].get("field"))
                return
        if not checked and not messagebox.askyesno(
                "Rowan Van", "The AI could not check this ticket (no signal). Send it anyway? "
                "It will go to the office the next time the van has signal, and the office will see it "
                "was not AI-checked.", parent=self):
            return
        warnings = [i for i in self._all_issues() if i["severity"] == "warning"]
        if warnings and not messagebox.askyesno(
                "Rowan Van", "%d item(s) to look at are still on the list. Send the ticket anyway?" % len(warnings),
                parent=self):
            return
        self._save("final")
        if self.job["status"] in ("SCHEDULED", "IN_PROGRESS") and self.data.get("job_finished"):
            summary = (self.data.get("work_description") or "").strip()
            self.screen.set_status(self.job, "COMPLETED", summary[:2000] or None)
        else:
            self.screen.app.engine.sync_now()
        messagebox.showinfo("Rowan Van", "Ticket " + (self.data.get("invoice_no") or "") +
                            " saved. It goes to the office with the next sync; then Open PDF shows the copy "
                            "for the customer.", parent=self)

    def open_pdf(self):
        self.save_draft()
        t = self.store.ticket(self.ticket_id) if self.ticket_id else None
        if t is None or t["pending"]:
            self.screen.app.engine.sync_now()
            messagebox.showinfo("Rowan Van", "The ticket has not reached the office yet. The PDF is made by "
                                "the website: try again after the next sync.", parent=self)
            return
        server, token = self.store.get("server"), self.store.get("token")
        path = os.path.join(tempfile.gettempdir(), "Rowan-" + re.sub(r"[^A-Za-z0-9-]", "", self.data.get("invoice_no") or "ticket") + ".pdf")
        self.pdf_button.config(state="disabled", text="Downloading...")

        def work():
            with open(path, "wb") as f:
                for chunk, _ in api.get_stream(server, "/api/van/v1/tickets/" + self.ticket_id + "/pdf", token,
                                                 not_found="The office has not received this ticket yet."):
                    f.write(chunk)
            return path

        def done(result):
            if not self.winfo_exists():
                return
            self.pdf_button.config(state="normal", text="Open PDF")
            if isinstance(result, Exception):
                messagebox.showwarning("Rowan Van", "Could not get the PDF: " + str(result), parent=self)
                return
            if hasattr(os, "startfile"):
                os.startfile(result)
            else:
                messagebox.showinfo("Rowan Van", "Saved to " + result, parent=self)

        in_background(self, work, done)

    def close(self):
        self.save_draft()
        if self._check_job:
            self.after_cancel(self._check_job)
        self.unbind_all("<MouseWheel>")
        self.screen.app.engine.sync_now()
        self.destroy()
