"""The desktop window. Laid out for the CF-29's 10.4" 1024x768 touchscreen:
big touch targets, large type, high contrast for reading in daylight."""

import queue
import socket
import sys
import threading
import time

import tkinter as tk
from tkinter import ttk, messagebox

from . import VERSION, api
from .paths import db_path
from .store import Store
from .sync import SyncEngine
from .messages_tab import MessagesTab
from .email_tab import EmailTab
from .manuals_tab import ManualsTab
from .ui_common import (NAVY, NAVY_LIGHT, ORANGE, WHITE, GREEN, RED, GREY, STATUS_LABELS,
                        STATUS_COLORS, VIEWS, FONT, FONT_BOLD, FONT_BIG, FONT_SMALL,
                        today_str, fmt_day, fmt_utc, big_button)


class App(object):
    def __init__(self, root):
        self.root = root
        self.store = Store(db_path())
        self.events = queue.Queue()
        self.engine = SyncEngine(db_path(), self.events)
        self.engine.start()

        root.title("Rowan HVAC - Van Terminal")
        root.geometry("1024x740")
        root.minsize(800, 560)
        root.configure(bg=NAVY_LIGHT)
        if sys.platform.startswith("win"):
            try:
                root.state("zoomed")
            except tk.TclError:
                pass
        root.bind("<F11>", lambda e: self.toggle_fullscreen())
        root.protocol("WM_DELETE_WINDOW", self.quit)
        self._setup_style()

        self.frame = None
        if self.store.get("token"):
            self.show_main()
        else:
            self.show_login()
        self.root.after(300, self._poll)

    def _setup_style(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure(".", font=FONT)
        style.configure("Treeview", rowheight=40, font=FONT)
        style.configure("Treeview.Heading", font=FONT_BOLD)
        style.map("Treeview", background=[("selected", NAVY)], foreground=[("selected", WHITE)])
        style.configure("Vertical.TScrollbar", arrowsize=28)  # finger-sized
        style.configure("TNotebook.Tab", padding=(18, 8), font=FONT_BOLD)

    def toggle_fullscreen(self):
        self.root.attributes("-fullscreen", not self.root.attributes("-fullscreen"))

    def quit(self):
        self.engine.stop()
        self.root.destroy()

    def _swap(self, frame):
        if self.frame is not None:
            self.frame.destroy()
        self.frame = frame
        frame.pack(fill="both", expand=True)

    def show_login(self, message=None):
        self._swap(LoginScreen(self, message))

    def show_main(self):
        self._swap(MainScreen(self))
        self.engine.sync_now()

    def _poll(self):
        try:
            while True:
                kind, info = self.events.get_nowait()
                if kind == "signed_out":
                    self.show_login("This van was signed out: " + info)
                elif isinstance(self.frame, MainScreen):
                    self.frame.on_sync_event(kind, info)
        except queue.Empty:
            pass
        self.root.after(300, self._poll)



class LoginScreen(tk.Frame):
    def __init__(self, app, message=None):
        tk.Frame.__init__(self, app.root, bg=NAVY)
        self.app = app
        card = tk.Frame(self, bg=WHITE, padx=36, pady=28)
        card.place(relx=0.5, rely=0.5, anchor="center")

        tk.Label(card, text="ROWAN HVAC", font=("Tahoma", 24, "bold"), fg=NAVY, bg=WHITE).pack()
        tk.Label(card, text="Van Terminal - sign in with your portal account",
                 font=FONT, fg=GREY, bg=WHITE).pack(pady=(0, 16))

        store = app.store
        self.server = self._field(card, "Portal address", store.get("server", "https://"))
        self.email = self._field(card, "Email", store.get("last_email", ""))
        self.password = self._field(card, "Password", "", show="*")
        self.device = self._field(card, "Van name (e.g. Van 3)",
                                  store.get("device_name") or socket.gethostname())

        self.msg = tk.Label(card, text=message or "", fg=RED, bg=WHITE, font=FONT,
                            wraplength=420, justify="left")
        self.msg.pack(fill="x", pady=(8, 0))
        self.button = big_button(card, "Sign In", self.submit, bg=ORANGE)
        self.button.pack(fill="x", pady=(12, 0))
        tk.Label(card, text="v" + VERSION, font=FONT_SMALL, fg=GREY, bg=WHITE).pack(pady=(10, 0))

        for entry in (self.server, self.email, self.password, self.device):
            entry.bind("<Return>", lambda e: self.submit())
        (self.password if store.get("last_email") else self.email).focus_set()

    def _field(self, parent, label, value, show=None):
        tk.Label(parent, text=label, font=FONT_BOLD, fg=NAVY, bg=WHITE, anchor="w").pack(fill="x")
        entry = tk.Entry(parent, font=("Tahoma", 14), width=34, relief="solid", bd=1, show=show)
        entry.insert(0, value)
        entry.pack(fill="x", ipady=6, pady=(2, 10))
        return entry

    def submit(self):
        server = api.normalize_server(self.server.get())
        email = self.email.get().strip()
        password = self.password.get()
        device = self.device.get().strip()
        problem = api.check_server(server)
        if not problem and not (email and password and device):
            problem = "Fill in every field."
        if problem:
            self.msg.config(text=problem)
            return
        self.msg.config(text="Signing in...", fg=GREY)
        self.button.config(state="disabled")

        result = {}

        def work():
            try:
                result["data"] = api.login(server, email, password, device)
            except api.Offline:
                result["error"] = "Can't reach the portal. Check the address and the van's internet connection."
            except api.ApiError as e:
                result["error"] = str(e)

        def done():
            if thread.is_alive():
                self.after(200, done)
                return
            self.button.config(state="normal")
            if "error" in result:
                self.msg.config(text=result["error"], fg=RED)
                return
            data = result["data"]
            store = self.app.store
            if store.get("user_id") and store.get("user_id") != data["user"]["id"]:
                store.sign_out()  # a different tech: don't show the last one's jobs
            store.set("server", server)
            store.set("last_email", email)
            store.set("device_name", device)
            store.set("token", data["token"])
            store.set("user_id", data["user"]["id"])
            store.set("user_name", data["user"]["name"])
            store.set("user_email", data["user"]["email"])
            store.set("snapshot_hash", None)
            self.app.show_main()

        thread = threading.Thread(target=work)
        thread.daemon = True
        thread.start()
        self.after(200, done)


class MainScreen(tk.Frame):
    def __init__(self, app):
        tk.Frame.__init__(self, app.root, bg=NAVY_LIGHT)
        self.app = app
        self.store = app.store
        self.view = "today"
        self.selected = None
        self.online_state = "Connecting..."
        self.note_entry = None
        self.detail_job = None
        self.today = today_str()

        self._build_header()
        self.banner = tk.Frame(self, bg=ORANGE)
        self.banner_text = tk.Label(self.banner, bg=ORANGE, fg=WHITE, font=FONT_BOLD,
                                    justify="left", anchor="w", wraplength=820)
        self.banner_text.pack(side="left", fill="x", expand=True, padx=12, pady=6)
        big_button(self.banner, "OK", self.dismiss_problems, bg=NAVY).pack(side="right", padx=8, pady=4)

        self.tabs = ttk.Notebook(self)
        self.tabs.pack(fill="both", expand=True, padx=8, pady=8)
        self.jobs_tab = tk.Frame(self.tabs, bg=NAVY_LIGHT)
        self.messages_tab = MessagesTab(self.tabs, self)
        self.email_tab = EmailTab(self.tabs, self)
        self.manuals_tab = ManualsTab(self.tabs, self)
        self.news_tab = tk.Frame(self.tabs, bg=WHITE)
        self.tabs.add(self.jobs_tab, text="  Jobs  ")
        self.tabs.add(self.messages_tab, text="  Messages  ")
        self.tabs.add(self.email_tab, text="  Email  ")
        self.tabs.add(self.manuals_tab, text="  Manuals  ")
        self.tabs.add(self.news_tab, text="  Announcements  ")
        # Switching to Messages counts as reading the open conversation.
        self.tabs.bind("<<NotebookTabChanged>>", lambda e: self.tabs.select() == str(self.messages_tab)
                       and self.messages_tab.show_detail())
        self._build_jobs_tab()
        self._build_news_tab()

        self.refresh()
        self._tick()

    # ---- layout ----

    def _build_header(self):
        bar = tk.Frame(self, bg=NAVY)
        bar.pack(fill="x")
        tk.Label(bar, text="ROWAN HVAC", font=FONT_BIG, fg=WHITE, bg=NAVY).pack(side="left", padx=12, pady=6)
        tk.Label(bar, text=self.store.get("user_name", ""), font=FONT_BOLD, fg=ORANGE,
                 bg=NAVY).pack(side="left", padx=8)
        big_button(bar, "Menu", self.open_menu, bg="#2c4170").pack(side="right", padx=(4, 8), pady=6)
        self.sync_button = big_button(bar, "Sync Now", self.app.engine.sync_now, bg=ORANGE)
        self.sync_button.pack(side="right", padx=4, pady=6)
        self.status_label = tk.Label(bar, font=FONT, fg=WHITE, bg=NAVY, justify="right")
        self.status_label.pack(side="right", padx=12)

    def _build_jobs_tab(self):
        left = tk.Frame(self.jobs_tab, bg=NAVY_LIGHT, width=430)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        filters = tk.Frame(left, bg=NAVY_LIGHT)
        filters.pack(fill="x", pady=(0, 6))
        self.view_buttons = {}
        for i, (key, label) in enumerate(VIEWS):
            b = tk.Button(filters, text=label, font=FONT_BOLD, relief="flat", pady=8,
                          command=lambda k=key: self.set_view(k))
            b.grid(row=0, column=i, sticky="ew", padx=1)
            filters.grid_columnconfigure(i, weight=1)
            self.view_buttons[key] = b

        tree_box = tk.Frame(left)
        tree_box.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(tree_box, columns=("when", "customer", "status"),
                                 show="headings", selectmode="browse")
        self.tree.heading("when", text="When")
        self.tree.heading("customer", text="Customer")
        self.tree.heading("status", text="Status")
        self.tree.column("when", width=165, stretch=False)
        self.tree.column("customer", width=120)
        self.tree.column("status", width=110, stretch=False)
        for status, color in STATUS_COLORS.items():
            self.tree.tag_configure(status, foreground=color)
        scroll = ttk.Scrollbar(tree_box, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.bind("<<TreeviewSelect>>", self.on_select)

        self.detail = tk.Frame(self.jobs_tab, bg=WHITE, padx=16, pady=12)
        self.detail.pack(side="left", fill="both", expand=True, padx=(8, 0))

    def _build_news_tab(self):
        self.news = tk.Text(self.news_tab, wrap="word", font=FONT, relief="flat",
                            padx=16, pady=12, state="disabled", cursor="arrow")
        scroll = ttk.Scrollbar(self.news_tab, orient="vertical", command=self.news.yview)
        self.news.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.news.pack(fill="both", expand=True)
        self.news.tag_configure("title", font=("Tahoma", 14, "bold"), foreground=NAVY)
        self.news.tag_configure("meta", font=FONT_SMALL, foreground=GREY)

    # ---- data -> screen ----

    def refresh(self):
        today = today_str()
        for key, label in VIEWS:
            count = len(self.store.jobs(key, today))
            active = key == self.view
            self.view_buttons[key].config(
                text="{0} ({1})".format(label, count),
                bg=NAVY if active else WHITE, fg=WHITE if active else NAVY,
                activebackground=NAVY if active else NAVY_LIGHT,
            )

        jobs = self.store.jobs(self.view, today)
        self.tree.delete(*self.tree.get_children())
        for j in jobs:
            if self.view == "today":
                when = j["scheduled_time"] or ""
            else:
                when = fmt_day(j["scheduled_day"])
                if j["scheduled_time"]:
                    when += " " + j["scheduled_time"]
            self.tree.insert("", "end", iid=j["id"], tags=(j["status"],),
                             values=(when, j["customer_name"], STATUS_LABELS.get(j["status"], j["status"])))
        if self.selected and self.tree.exists(self.selected):
            self.tree.selection_set(self.selected)
            self.tree.see(self.selected)
        elif jobs and not self.selected:
            self.tree.selection_set(jobs[0]["id"])
        self.show_detail()
        self.refresh_news()
        self.messages_tab.refresh()
        self.email_tab.refresh()
        self.manuals_tab.refresh()
        self.refresh_badges()
        self.refresh_status()

    def refresh_news(self):
        self.news.config(state="normal")
        self.news.delete("1.0", "end")
        items = self.store.announcements()
        if not items:
            self.news.insert("end", "No announcements.")
        for a in items:
            self.news.insert("end", (a["title"] or "") + "\n", "title")
            self.news.insert("end", (a["author_name"] or "") + " - " + fmt_utc(a["created_at"]) + "\n", "meta")
            self.news.insert("end", (a["body"] or "") + "\n\n")
        self.news.config(state="disabled")

    def refresh_status(self):
        pending = self.store.pending_count()
        last = self.store.get("last_sync")
        line2 = "Last sync " + time.strftime("%I:%M %p", time.localtime(int(last))).lstrip("0") if last else "Not synced yet"
        if pending:
            line2 += "  |  {0} change{1} waiting to send".format(pending, "" if pending == 1 else "s")
        self.status_label.config(text=self.online_state + "\n" + line2)

        problems = self.store.unseen_problems()
        if problems:
            self.banner_text.config(text="\n".join(p["message"] for p in problems[-4:]))
            if not self.banner.winfo_ismapped():
                self.banner.pack(fill="x", after=self.winfo_children()[0])
        elif self.banner.winfo_ismapped():
            self.banner.pack_forget()

    def show_detail(self):
        # A background sync redraws this pane; keep a half-typed note.
        draft = ""
        entry = getattr(self, "note_entry", None)
        if entry is not None and entry.winfo_exists() and self.detail_job == self.selected:
            draft = entry.get("1.0", "end").strip()
        self.note_entry = None
        self.detail_job = self.selected
        for child in self.detail.winfo_children():
            child.destroy()
        job = self.store.job(self.selected) if self.selected else None
        if not job:
            tk.Label(self.detail, text="Select a job on the left.", font=FONT, fg=GREY,
                     bg=WHITE).pack(pady=40)
            return

        top = tk.Frame(self.detail, bg=WHITE)
        top.pack(fill="x")
        tk.Label(top, text=job["customer_name"], font=FONT_BIG, fg=NAVY, bg=WHITE,
                 anchor="w").pack(side="left")
        tk.Label(top, text=STATUS_LABELS.get(job["status"], job["status"]), font=FONT_BOLD,
                 fg=WHITE, bg=STATUS_COLORS.get(job["status"], GREY), padx=10, pady=3).pack(side="right")

        info = tk.Frame(self.detail, bg=WHITE)
        info.pack(fill="x", pady=(8, 4))
        rows = [
            ("When", fmt_day(job["scheduled_day"]) + "  " + (job["scheduled_time"] or "")),
            ("Service", job["service_needed"]),
            ("Address", job["address"]),
        ]
        if job["client_phone"]:
            rows.append(("Phone", job["client_phone"]))
        if job["client_email"]:
            rows.append(("Email", job["client_email"]))
        if job["status"] == "CANCELLED":
            rows.append(("Cancelled", job["cancel_reason"] or "Cancelled by the office"))
        if job["summary"]:
            rows.append(("Summary", job["summary"]))
        for r, (label, value) in enumerate(rows):
            tk.Label(info, text=label, font=FONT, fg=GREY, bg=WHITE, anchor="nw").grid(row=r, column=0, sticky="nw", padx=(0, 12))
            cell = tk.Frame(info, bg=WHITE)
            cell.grid(row=r, column=1, sticky="w")
            tk.Label(cell, text=value or "", font=FONT_BOLD, fg=NAVY, bg=WHITE, anchor="w",
                     justify="left", wraplength=470 if label != "Email" else 300).pack(side="left")
            if label == "Email":
                tk.Button(cell, text="Email Customer", command=lambda: self.email_customer(job),
                          bg=NAVY, fg=WHITE, activebackground=NAVY, activeforeground=WHITE,
                          font=FONT_BOLD, relief="flat", padx=10, pady=2,
                          cursor="hand2").pack(side="left", padx=(12, 0))

        actions = tk.Frame(self.detail, bg=WHITE)
        actions.pack(fill="x", pady=8)
        status = job["status"]
        if status == "SCHEDULED":
            big_button(actions, "Start Job", lambda: self.set_status(job, "IN_PROGRESS"), bg=ORANGE).pack(side="left", padx=(0, 8))
        if status in ("SCHEDULED", "IN_PROGRESS"):
            big_button(actions, "Complete Job...", lambda: self.complete(job), bg=GREEN).pack(side="left", padx=(0, 8))
        if status in ("IN_PROGRESS", "COMPLETED"):
            big_button(actions, "Back to Scheduled", lambda: self.set_status(job, "SCHEDULED"),
                       bg=NAVY_LIGHT, fg=NAVY).pack(side="left")

        tk.Label(self.detail, text="Job notes (office and techs only, never shown to the customer)",
                 font=FONT_SMALL, fg=GREY, bg=WHITE, anchor="w").pack(fill="x", pady=(6, 0))
        notes_box = tk.Frame(self.detail, bg=WHITE)
        notes_box.pack(fill="both", expand=True)
        notes = tk.Text(notes_box, wrap="word", font=FONT, height=6, width=20, relief="solid", bd=1,
                        padx=8, pady=6, cursor="arrow")
        scroll = ttk.Scrollbar(notes_box, orient="vertical", command=notes.yview)
        notes.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        notes.pack(side="left", fill="both", expand=True)
        notes.tag_configure("meta", font=FONT_SMALL, foreground=GREY)
        notes.tag_configure("pending", font=FONT_SMALL, foreground=ORANGE)
        rows = self.store.notes(job["id"])
        if not rows:
            notes.insert("end", "No notes yet.", "meta")
        for n in rows:
            notes.insert("end", (n["author_name"] or "") + " - " + fmt_utc(n["created_at"]), "meta")
            if n["pending"]:
                notes.insert("end", "  (not sent yet)", "pending")
            notes.insert("end", "\n" + (n["body"] or "") + "\n\n")
        notes.config(state="disabled")
        notes.see("end")

        add = tk.Frame(self.detail, bg=WHITE)
        add.pack(fill="x", pady=(8, 0))
        self.note_entry = tk.Text(add, height=3, width=20, font=FONT, wrap="word", relief="solid", bd=1, padx=6, pady=4)
        self.note_entry.pack(side="left", fill="x", expand=True)
        if draft:
            self.note_entry.insert("1.0", draft)
        big_button(add, "Add\nNote", lambda: self.add_note(job), bg=NAVY).pack(side="left", padx=(8, 0), fill="y")

    # ---- actions ----

    def set_view(self, view):
        self.view = view
        self.selected = None
        self.refresh()

    def on_select(self, _event=None):
        sel = self.tree.selection()
        new = sel[0] if sel else None
        if new != self.selected:
            self.selected = new
            self.show_detail()

    def set_status(self, job, status, summary=None):
        self.store.set_job_status(job["id"], status, summary)
        self.app.engine.sync_now()
        self.refresh()

    def complete(self, job):
        CompleteDialog(self, job)

    def add_note(self, job):
        body = self.note_entry.get("1.0", "end").strip()
        if not body:
            return
        self.store.add_note(job["id"], body, self.store.get("user_name", "Me"))
        self.note_entry.delete("1.0", "end")
        self.app.engine.sync_now()
        self.show_detail()
        self.refresh_status()

    def refresh_badges(self):
        unread = self.messages_tab.unread_total()
        self.tabs.tab(self.messages_tab, text="  Messages ({0})  ".format(unread) if unread else "  Messages  ")

    def email_customer(self, job):
        self.tabs.select(self.email_tab)
        self.email_tab.prefill(job["client_email"], "Your Rowan HVAC service - " + (job["service_needed"] or ""))

    def flash(self, message):
        messagebox.showwarning("Rowan Van", message)

    def dismiss_problems(self):
        self.store.dismiss_problems()
        self.refresh_status()

    def open_menu(self):
        menu = tk.Menu(self, tearoff=0, font=("Tahoma", 14))
        menu.add_command(label="Full screen (F11)", command=self.app.toggle_fullscreen)
        menu.add_command(label="Sign out of this van", command=self.sign_out)
        menu.add_separator()
        menu.add_command(label="Close the app", command=self.app.quit)
        menu.tk_popup(self.winfo_rootx() + self.winfo_width() - 260, self.winfo_rooty() + 60)

    def sign_out(self):
        pending = self.store.pending_count()
        warning = "Sign out of this van?"
        if pending:
            warning += ("\n\n{0} change(s) have not been sent to the office yet and will be LOST. "
                        "Tap Sync Now first if you have signal.").format(pending)
        if not messagebox.askyesno("Sign out", warning, icon="warning" if pending else "question"):
            return
        server, token = self.store.get("server"), self.store.get("token")
        t = threading.Thread(target=api.logout, args=(server, token))
        t.daemon = True
        t.start()
        self.store.sign_out()
        self.app.show_login()

    # ---- sync feedback ----

    def on_sync_event(self, kind, info):
        if kind == "syncing":
            self.online_state = "Syncing..."
            self.sync_button.config(state="disabled")
        else:
            self.sync_button.config(state="normal")
            if kind == "synced":
                self.online_state = "Online"
                if info and info.get("changed"):
                    self.refresh()
                    return
            elif kind == "offline":
                self.online_state = "OFFLINE - working locally"
            else:
                self.online_state = "Sync problem: " + (info or "")[:60]
        self.refresh_status()

    def _tick(self):
        # Roll "Today" over at midnight and keep "Last sync" fresh.
        self.after(60 * 1000, self._tick_again)

    def _tick_again(self):
        if not self.winfo_exists():
            return
        if self.today != today_str():
            self.today = today_str()
            self.refresh()
        else:
            self.refresh_status()
        self._tick()


class CompleteDialog(tk.Toplevel):
    def __init__(self, screen, job):
        tk.Toplevel.__init__(self, screen)
        self.screen = screen
        self.job = job
        self.title("Complete job")
        self.configure(bg=WHITE, padx=20, pady=16)
        self.transient(screen.winfo_toplevel())
        tk.Label(self, text="Complete: " + job["customer_name"], font=FONT_BIG, fg=NAVY,
                 bg=WHITE).pack(anchor="w")
        tk.Label(self, text="Work summary - the customer sees this in their service history:",
                 font=FONT, fg=GREY, bg=WHITE).pack(anchor="w", pady=(8, 4))
        self.text = tk.Text(self, height=5, width=56, font=FONT, wrap="word", relief="solid", bd=1)
        self.text.insert("1.0", job["summary"] or "")
        self.text.pack(fill="both", expand=True)
        buttons = tk.Frame(self, bg=WHITE)
        buttons.pack(fill="x", pady=(12, 0))
        big_button(buttons, "Mark Completed", self.ok, bg=GREEN).pack(side="right")
        big_button(buttons, "Cancel", self.destroy, bg=NAVY_LIGHT, fg=NAVY).pack(side="right", padx=8)
        self.text.focus_set()
        self.grab_set()

    def ok(self):
        summary = self.text.get("1.0", "end").strip()
        self.destroy()
        self.screen.set_status(self.job, "COMPLETED", summary or None)


def main():
    root = tk.Tk()
    App(root)
    root.mainloop()
