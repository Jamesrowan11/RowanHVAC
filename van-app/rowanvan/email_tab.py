"""Email tab: send email as yourself from your company mailbox (the same
account as Roundcube webmail). Sent emails also land in your webmail Sent
folder. Emails queue like everything else and go out once the van has signal."""

import tkinter as tk

from . import api
from .addresses import EMAIL_RE, MAX_RECIPIENTS, split_addresses
from .ui_common import (NAVY, NAVY_LIGHT, ORANGE, WHITE, GREEN, GREY, RED, FONT, FONT_BOLD,
                        FONT_BIG, FONT_SMALL, fmt_utc, big_button, scrolled_text, in_background)

STATE_TEXT = {
    "queued": ("Waiting to send", ORANGE),
    "waiting": ("Waiting to send", ORANGE),
    "sent": ("Sent", GREEN),
    "failed": ("NOT SENT", RED),
}


class EmailTab(tk.Frame):
    def __init__(self, parent, screen):
        tk.Frame.__init__(self, parent, bg=NAVY_LIGHT)
        self.screen = screen
        self.store = screen.store
        self.body = tk.Frame(self, bg=NAVY_LIGHT)
        self.body.pack(fill="both", expand=True)
        self.to = self.subject = self.text = None
        self.mode = None

    def refresh(self):
        connected = bool(self.store.get("mailbox_address"))
        mode = "compose" if connected else "connect"
        if mode != self.mode:
            self.mode = mode
            for child in self.body.winfo_children():
                child.destroy()
            if connected:
                self._build_compose()
            else:
                self._build_connect()
        if connected:
            self.sending_as.config(text="Sending as " + self.store.get("mailbox_address"))
            self._fill_history()

    # ---- connect your mailbox ----

    def _build_connect(self):
        card = tk.Frame(self.body, bg=WHITE, padx=28, pady=22)
        card.place(relx=0.5, rely=0.42, anchor="center")
        tk.Label(card, text="Connect your email", font=FONT_BIG, fg=NAVY, bg=WHITE).pack(anchor="w")
        tk.Label(card, text="Use the same email address and password you use for webmail\n"
                            "(webmail.rowanheatingandair.com). Emails you send here come from\n"
                            "you, and a copy is saved in your webmail Sent folder.",
                 font=FONT, fg=GREY, bg=WHITE, justify="left").pack(anchor="w", pady=(4, 12))
        tk.Label(card, text="Email address", font=FONT_BOLD, fg=NAVY, bg=WHITE).pack(anchor="w")
        self.addr = tk.Entry(card, font=("Tahoma", 14), width=36, relief="solid", bd=1)
        self.addr.insert(0, self.store.get("last_mailbox", ""))
        self.addr.pack(fill="x", ipady=6, pady=(2, 10))
        tk.Label(card, text="Email password", font=FONT_BOLD, fg=NAVY, bg=WHITE).pack(anchor="w")
        self.pw = tk.Entry(card, font=("Tahoma", 14), width=36, relief="solid", bd=1, show="*")
        self.pw.pack(fill="x", ipady=6, pady=(2, 6))
        self.pw.bind("<Return>", lambda e: self.connect())
        self.connect_msg = tk.Label(card, text="", font=FONT, fg=RED, bg=WHITE, wraplength=440,
                                    justify="left")
        self.connect_msg.pack(fill="x")
        self.connect_btn = big_button(card, "Connect", self.connect, bg=ORANGE)
        self.connect_btn.pack(fill="x", pady=(8, 0))
        tk.Label(card, text="Needs signal. Your password is stored encrypted on the company\n"
                            "server, never on this laptop.",
                 font=FONT_SMALL, fg=GREY, bg=WHITE, justify="left").pack(anchor="w", pady=(8, 0))

    def connect(self):
        address, password = self.addr.get().strip().lower(), self.pw.get()
        if not EMAIL_RE.match(address) or not password:
            self.connect_msg.config(text="Enter your email address and password.", fg=RED)
            return
        self.connect_msg.config(text="Checking with the mail server...", fg=GREY)
        self.connect_btn.config(state="disabled")
        server, token = self.store.get("server"), self.store.get("token")

        def done(result):
            self.connect_btn.config(state="normal")
            if isinstance(result, api.Offline):
                self.connect_msg.config(text="No connection right now. Try again when you have signal.", fg=RED)
            elif isinstance(result, api.SignedOut):
                self.screen.app.show_login("This van was signed out: " + str(result))
            elif isinstance(result, Exception):
                self.connect_msg.config(text=str(result), fg=RED)
            else:
                self.store.set("last_mailbox", address)
                self.store.set("mailbox_address", result.get("address"))
                self.screen.app.engine.sync_now()
                self.refresh()

        in_background(self, lambda: api.connect_mailbox(server, token, address, password), done)

    def disconnect(self):
        server, token = self.store.get("server"), self.store.get("token")

        def done(result):
            if isinstance(result, Exception):
                self.screen.flash("Couldn't disconnect: " + (
                    "no connection right now." if isinstance(result, api.Offline) else str(result)))
                return
            self.store.set("mailbox_address", None)
            self.refresh()

        in_background(self, lambda: api.disconnect_mailbox(server, token), done)

    # ---- compose ----

    def _build_compose(self):
        top = tk.Frame(self.body, bg=NAVY_LIGHT)
        top.pack(fill="x", pady=(0, 6))
        self.sending_as = tk.Label(top, font=FONT_BOLD, fg=NAVY, bg=NAVY_LIGHT)
        self.sending_as.pack(side="left")
        big_button(top, "Disconnect", self.disconnect, bg=NAVY_LIGHT, fg=NAVY).pack(side="right")

        cols = tk.Frame(self.body, bg=NAVY_LIGHT)
        cols.pack(fill="both", expand=True)
        form = tk.Frame(cols, bg=WHITE, padx=16, pady=12)
        form.pack(side="left", fill="both", expand=True)
        hist = tk.Frame(cols, bg=WHITE, padx=12, pady=12, width=340)
        hist.pack(side="left", fill="y", padx=(8, 0))
        hist.pack_propagate(False)

        tk.Label(form, text="To (separate several with commas)", font=FONT_BOLD, fg=NAVY,
                 bg=WHITE).pack(anchor="w")
        self.to = tk.Entry(form, font=FONT, relief="solid", bd=1)
        self.to.pack(fill="x", ipady=5, pady=(2, 8))
        tk.Label(form, text="Subject", font=FONT_BOLD, fg=NAVY, bg=WHITE).pack(anchor="w")
        self.subject = tk.Entry(form, font=FONT, relief="solid", bd=1)
        self.subject.pack(fill="x", ipady=5, pady=(2, 8))
        tk.Label(form, text="Message (your name and the company signature are added)",
                 font=FONT_BOLD, fg=NAVY, bg=WHITE).pack(anchor="w")
        self.text = scrolled_text(form, height=8)
        self.text.box.pack(fill="both", expand=True, pady=(2, 6))
        self.compose_msg = tk.Label(form, text="", font=FONT, fg=RED, bg=WHITE, anchor="w",
                                    wraplength=480, justify="left")
        self.compose_msg.pack(fill="x")
        row = tk.Frame(form, bg=WHITE)
        row.pack(fill="x")
        big_button(row, "Send Email", self.send, bg=ORANGE).pack(side="right")
        big_button(row, "Clear", self.clear, bg=NAVY_LIGHT, fg=NAVY).pack(side="right", padx=8)

        tk.Label(hist, text="Recently sent", font=FONT_BOLD, fg=NAVY, bg=WHITE).pack(anchor="w")
        self.history = scrolled_text(hist, height=10, cursor="arrow")
        self.history.configure(relief="flat", font=FONT_SMALL)
        self.history.box.pack(fill="both", expand=True)
        self.history.tag_configure("subject", font=FONT_BOLD, foreground=NAVY)
        self.history.tag_configure("meta", foreground=GREY)
        for state, (_, color) in STATE_TEXT.items():
            self.history.tag_configure(state, foreground=color, font=("Tahoma", 10, "bold"))

    def _fill_history(self):
        h = self.history
        h.config(state="normal")
        h.delete("1.0", "end")
        emails = self.store.emails()
        if not emails:
            h.insert("end", "Nothing sent yet.", "meta")
        for e in emails:
            label, _ = STATE_TEXT.get(e["state"], (e["state"], GREY))
            h.insert("end", (e["subject"] or "") + "\n", "subject")
            h.insert("end", "To " + (e["to_addrs"] or "") + "\n" + fmt_utc(e["created_at"]) + "  ", "meta")
            h.insert("end", label + "\n", e["state"])
            if e["error"] and e["state"] != "sent":
                h.insert("end", e["error"] + "\n", "meta")
            h.insert("end", "\n")
        h.config(state="disabled")

    def prefill(self, to, subject):
        """Used by the job screen's Email Customer button."""
        self.refresh()
        if self.mode != "compose":
            return
        self.clear()
        self.to.insert(0, to or "")
        self.subject.insert(0, subject or "")
        self.text.focus_set()

    def clear(self):
        self.to.delete(0, "end")
        self.subject.delete(0, "end")
        self.text.delete("1.0", "end")
        self.compose_msg.config(text="")

    def send(self):
        valid, invalid = split_addresses(self.to.get())
        subject = self.subject.get().strip()
        body = self.text.get("1.0", "end").strip()
        problem = None
        if invalid:
            problem = "These addresses look wrong: " + ", ".join(invalid)
        elif not valid:
            problem = "Add who it's to."
        elif len(valid) > MAX_RECIPIENTS:
            problem = "At most {0} recipients.".format(MAX_RECIPIENTS)
        elif not subject or not body:
            problem = "Add a subject and a message."
        if problem:
            self.compose_msg.config(text=problem, fg=RED)
            return
        self.store.queue_email(valid, subject[:255], body)
        self.screen.app.engine.sync_now()
        self.clear()
        self.compose_msg.config(text="Queued - it sends as soon as the van has signal.", fg=GREEN)
        self._fill_history()
        self.screen.refresh_status()
