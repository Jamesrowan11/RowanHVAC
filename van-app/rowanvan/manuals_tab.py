"""Manuals tab: brand tabs, then model tabs, then that model's manuals.
Manuals open in the laptop's PDF viewer and stay on the laptop for offline use."""

import queue
import threading

import tkinter as tk
from tkinter import ttk, messagebox

from . import api, manuals
from .store import Store
from .paths import db_path
from .ui_common import NAVY, NAVY_LIGHT, ORANGE, WHITE, GREEN, GREY, RED, FONT, FONT_BOLD, big_button


def fmt_size(n):
    n = n or 0
    if n >= 1024 * 1024:
        return "{0:.1f} MB".format(n / (1024.0 * 1024))
    return "{0} KB".format(max(1, int(round(n / 1024.0))))


class TabRow(tk.Frame):
    """A row of tab-like buttons that wraps onto more lines when it doesn't fit
    (there can be many brands or models)."""

    def __init__(self, parent, active_bg, inactive_bg=WHITE, active_fg=WHITE, inactive_fg=NAVY):
        tk.Frame.__init__(self, parent, bg=parent.cget("bg"), height=1)
        self.colors = (active_bg, inactive_bg, active_fg, inactive_fg)
        self.buttons = []
        self.bind("<Configure>", lambda e: self._layout())

    def set_items(self, items, active, on_click):
        """items: [(key, label)]."""
        for b in self.buttons:
            b.destroy()
        self.buttons = []
        abg, ibg, afg, ifg = self.colors
        for key, label in items:
            on = key == active
            b = tk.Button(self, text=label, font=FONT_BOLD, relief="flat", padx=14, pady=7,
                          bg=abg if on else ibg, fg=afg if on else ifg,
                          activebackground=abg, activeforeground=afg, cursor="hand2",
                          command=lambda k=key: on_click(k))
            self.buttons.append(b)
        self._layout()

    def _layout(self):
        width = max(self.winfo_width(), 200)
        x = y = row_h = 0
        for b in self.buttons:
            w, h = b.winfo_reqwidth(), b.winfo_reqheight()
            if x and x + w > width:
                x, y = 0, y + row_h + 4
                row_h = 0
            b.place(x=x, y=y)
            x += w + 4
            row_h = max(row_h, h)
        self.configure(height=max(1, y + row_h))


class Downloader(threading.Thread):
    """Downloads manuals one at a time in the background."""

    def __init__(self):
        threading.Thread.__init__(self, name="manuals")
        self.daemon = True
        self.jobs = queue.Queue()
        self.events = queue.Queue()  # ("progress", id, done, total) / ("done", id, path) / ("error", id, exc)

    def add(self, manual):
        self.jobs.put(manual)

    def run(self):
        store = Store(db_path())
        while True:
            m = self.jobs.get()
            if manuals.is_downloaded(m):
                self.events.put(("done", m["id"], manuals.local_path(m)))
                continue
            try:
                path = manuals.download(
                    store, m, lambda done, total, mid=m["id"]: self.events.put(("progress", mid, done, total)))
                self.events.put(("done", m["id"], path))
            except Exception as e:  # reported on the UI thread
                self.events.put(("error", m["id"], e))


class ManualsTab(tk.Frame):
    def __init__(self, parent, screen):
        tk.Frame.__init__(self, parent, bg=NAVY_LIGHT)
        self.screen = screen
        self.store = screen.store
        self.brand = None
        self.model = None
        self.open_when_done = set()
        self.pending = set()
        self.downloader = Downloader()
        self.downloader.start()

        top = tk.Frame(self, bg=NAVY_LIGHT)
        top.pack(fill="x", pady=(0, 6))
        tk.Label(top, text="Search", font=FONT_BOLD, fg=NAVY, bg=NAVY_LIGHT).pack(side="left")
        self.search = tk.Entry(top, font=FONT, relief="solid", bd=1, width=24)
        self.search.pack(side="left", padx=8, ipady=5)
        self.search.bind("<KeyRelease>", lambda e: self.refresh())
        big_button(top, "Clear", self.clear_search, bg=WHITE, fg=NAVY).pack(side="left")
        self.all_button = big_button(top, "Download All", self.download_all, bg=NAVY)
        self.all_button.pack(side="right")

        self.brand_row = TabRow(self, active_bg=NAVY)
        self.brand_row.pack(fill="x")
        tk.Frame(self, bg=NAVY, height=3).pack(fill="x")
        self.model_row = TabRow(self, active_bg=ORANGE, inactive_bg=NAVY_LIGHT)
        self.model_row.pack(fill="x", pady=(6, 6))

        # Packed before the list so the list can't push it off screen.
        bottom = tk.Frame(self, bg=NAVY_LIGHT)
        bottom.pack(side="bottom", fill="x", pady=(6, 0))
        big_button(bottom, "Open Manual", self.open_selected, bg=ORANGE).pack(side="right")
        self.status = tk.Label(bottom, text="", font=FONT, fg=GREY, bg=NAVY_LIGHT, anchor="w",
                               wraplength=700, justify="left")
        self.status.pack(side="left", fill="x", expand=True)
        box = tk.Frame(self)
        box.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(box, columns=("title", "type", "size", "saved"), show="headings",
                                 selectmode="browse")
        for col, text, width, stretch in (("title", "Manual", 380, True), ("type", "Type", 190, False),
                                          ("size", "Size", 90, False), ("saved", "On laptop", 120, False)):
            self.tree.heading(col, text=text)
            self.tree.column(col, width=width, stretch=stretch)
        self.tree.tag_configure("saved", foreground=GREEN)
        scroll = ttk.Scrollbar(box, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.bind("<Double-1>", lambda e: self.open_selected())

        self.after(300, self._poll)

    # ---- data -> screen ----

    def refresh(self):
        query = self.search.get().strip()
        if query:
            self.brand_row.set_items([], None, None)
            self.model_row.set_items([], None, None)
            rows = self.store.manuals(query)
        else:
            brands = self.store.manual_brands()
            names = [b for b, _ in brands]
            if self.brand not in names:
                self.brand = names[0] if names else None
            self.brand_row.set_items([(b, "{0} ({1})".format(b, n)) for b, n in brands],
                                     self.brand, self.pick_brand)
            models = self.store.manual_models(self.brand) if self.brand else []
            mnames = [m for m, _ in models]
            if self.model not in mnames:
                self.model = mnames[0] if mnames else None
            self.model_row.set_items([(m, "{0} ({1})".format(m, n)) for m, n in models],
                                     self.model, self.pick_model)
            rows = self.store.manuals_for(self.brand, self.model) if self.model else []

        selected = self.tree.selection()
        self.tree.delete(*self.tree.get_children())
        for m in rows:
            title = m["title"] or m["original_name"] or "Manual"
            if query:
                title = "{0} {1} - {2}".format(m["brand"], m["model"], title)
            saved = manuals.is_downloaded(m)
            state = "Yes" if saved else ("Downloading..." if m["id"] in self.pending else "")
            self.tree.insert("", "end", iid=m["id"], tags=("saved",) if saved else (),
                             values=(title, m["equipment_type"] or "", fmt_size(m["size"]), state))
        if selected and self.tree.exists(selected[0]):
            self.tree.selection_set(selected[0])
        elif rows:
            self.tree.selection_set(rows[0]["id"])

        empty_msg = "No manuals yet. The office uploads them in the portal under Manuals."
        if not self.store.manuals():
            self.status.config(text=empty_msg, fg=GREY)
        elif self.status.cget("text") == empty_msg:
            self.status.config(text="")
        missing = [m for m in self.store.manuals() if not manuals.is_downloaded(m)]
        self.all_button.config(
            text="Download All ({0})".format(fmt_size(sum(m["size"] or 0 for m in missing))) if missing
            else "All on laptop", state="normal" if missing else "disabled")

    def pick_brand(self, brand):
        self.brand, self.model = brand, None
        self.refresh()

    def pick_model(self, model):
        self.model = model
        self.refresh()

    def clear_search(self):
        self.search.delete(0, "end")
        self.refresh()

    def show_manual(self, brand, model):
        """Jump to a brand/model tab (used by other screens)."""
        self.search.delete(0, "end")
        self.brand, self.model = brand, model
        self.refresh()

    # ---- actions ----

    def open_selected(self):
        sel = self.tree.selection()
        m = self.store.manual(sel[0]) if sel else None
        if not m:
            return
        if manuals.is_downloaded(m):
            self._open(manuals.local_path(m))
            return
        self.open_when_done.add(m["id"])
        self._queue(m)

    def download_all(self):
        missing = [m for m in self.store.manuals() if not manuals.is_downloaded(m)]
        total = sum(m["size"] or 0 for m in missing)
        if total > 20 * 1024 * 1024 and not messagebox.askyesno(
                "Download all manuals",
                "This downloads {0}. Best done on shop Wi-Fi rather than cellular. Continue?".format(fmt_size(total))):
            return
        for m in missing:
            self._queue(m)

    def _queue(self, m):
        if m["id"] in self.pending:
            return
        self.pending.add(m["id"])
        self.downloader.add(m)
        self.status.config(text="Downloading " + m["brand"] + " " + m["model"] + "...", fg=GREY)
        self.refresh()

    def _open(self, path):
        try:
            manuals.open_file(path)
        except OSError:
            messagebox.showerror(
                "Can't open manual",
                "No program on this laptop can open this file. Install a PDF reader "
                "(on Windows XP: Adobe Reader XI or Foxit Reader), then try again.")

    def _poll(self):
        changed = False
        try:
            while True:
                ev = self.downloader.events.get_nowait()
                kind, mid = ev[0], ev[1]
                m = self.store.manual(mid) or {"brand": "", "model": ""}
                name = (m["brand"] + " " + m["model"]).strip()
                if kind == "progress":
                    pct = int(100.0 * ev[2] / max(1, ev[3]))
                    self.status.config(text="Downloading {0}... {1}%  ({2} more queued)".format(
                        name, pct, max(0, len(self.pending) - 1)), fg=GREY)
                    continue
                self.pending.discard(mid)
                changed = True
                if kind == "done":
                    self.status.config(text="Saved on laptop: " + name, fg=GREEN)
                    if mid in self.open_when_done:
                        self.open_when_done.discard(mid)
                        self._open(ev[2])
                else:
                    self.open_when_done.discard(mid)
                    err = ev[2]
                    if isinstance(err, api.Offline):
                        msg = "No connection - couldn't download " + name + ". Try again with signal."
                    else:
                        msg = "Couldn't download " + name + ": " + str(err)
                    self.status.config(text=msg, fg=RED)
        except queue.Empty:
            pass
        if changed and self.winfo_exists():
            self.refresh()
        if self.winfo_exists():
            self.after(300, self._poll)
