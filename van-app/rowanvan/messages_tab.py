"""Messages tab: the same in-app conversations as the portal's Messages page."""

import tkinter as tk
from tkinter import ttk

from .ui_common import (NAVY, NAVY_LIGHT, ORANGE, WHITE, GREY, RED, FONT, FONT_BOLD, FONT_BIG,
                        FONT_SMALL, fmt_utc, big_button, scrolled_text)

ROLE_LABELS = {"ADMIN": "Office", "EMPLOYEE": "Tech", "CLIENT": "Customer"}


def conversation_title(c):
    who = ", ".join(c["participants"]) or "(no one)"
    return c["subject"] + " - " + who if c["subject"] else who


class MessagesTab(tk.Frame):
    def __init__(self, parent, screen):
        tk.Frame.__init__(self, parent, bg=NAVY_LIGHT)
        self.screen = screen
        self.store = screen.store
        self.selected = None
        self.reply = None

        left = tk.Frame(self, bg=NAVY_LIGHT, width=380)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)
        big_button(left, "+ New Message", self.new_message, bg=ORANGE).pack(fill="x", pady=(0, 6))

        tree_box = tk.Frame(left)
        tree_box.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(tree_box, columns=("who", "when"), show="headings", selectmode="browse")
        self.tree.heading("who", text="Conversation")
        self.tree.heading("when", text="Last")
        self.tree.column("who", width=205)
        self.tree.column("when", width=135, stretch=False)
        self.tree.tag_configure("unread", font=FONT_BOLD, foreground=ORANGE)
        scroll = ttk.Scrollbar(tree_box, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.bind("<<TreeviewSelect>>", self.on_select)

        self.detail = tk.Frame(self, bg=WHITE, padx=16, pady=12)
        self.detail.pack(side="left", fill="both", expand=True, padx=(8, 0))

    def unread_total(self):
        return self.store.unread_total()

    def refresh(self):
        convs = self.store.conversations()
        self.tree.delete(*self.tree.get_children())
        for c in convs:
            title = conversation_title(c)
            if c["unread"]:
                title = "({0}) {1}".format(c["unread"], title)
            self.tree.insert("", "end", iid=c["id"], tags=("unread",) if c["unread"] else (),
                             values=(title, fmt_utc(c["updated_at"])))
        if self.selected and self.tree.exists(self.selected):
            self.tree.selection_set(self.selected)
        else:
            self.selected = None
        self.show_detail()

    def on_select(self, _event=None):
        sel = self.tree.selection()
        new = sel[0] if sel else None
        if new != self.selected:
            self.selected = new
            self.show_detail()

    def open_conversation(self, conversation_id):
        self.selected = conversation_id
        self.refresh()

    def show_detail(self):
        draft = ""
        if self.reply is not None and self.reply.winfo_exists() and self.reply.conv == self.selected:
            draft = self.reply.get("1.0", "end").strip()
        self.reply = None
        for child in self.detail.winfo_children():
            child.destroy()
        conv = self.store.conversation(self.selected) if self.selected else None
        if not conv:
            tk.Label(self.detail, text="Pick a conversation, or tap + New Message.",
                     font=FONT, fg=GREY, bg=WHITE).pack(pady=40)
            return

        if conv["unread"] and self.screen.tabs.select() == str(self):
            # Opening a thread reads it, as in the portal.
            self.store.mark_read(conv["id"])
            self.screen.app.engine.sync_now()
            self.screen.after_idle(self.screen.refresh_badges)

        tk.Label(self.detail, text=conv["subject"] or "Conversation", font=FONT_BIG, fg=NAVY,
                 bg=WHITE, anchor="w", wraplength=520, justify="left").pack(fill="x")
        tk.Label(self.detail, text="With: " + ", ".join(conv["participants"]), font=FONT, fg=GREY,
                 bg=WHITE, anchor="w", wraplength=520, justify="left").pack(fill="x", pady=(0, 6))

        text = scrolled_text(self.detail, height=8, cursor="arrow")
        text.box.pack(fill="both", expand=True)
        text.tag_configure("meta", font=FONT_SMALL, foreground=GREY)
        text.tag_configure("meta_mine", font=FONT_SMALL, foreground=GREY, justify="right")
        text.tag_configure("mine", justify="right", foreground=NAVY, lmargin1=80, lmargin2=80)
        text.tag_configure("theirs", lmargin1=4, lmargin2=4, rmargin=80)
        text.tag_configure("pending", font=FONT_SMALL, foreground=ORANGE, justify="right")
        for m in self.store.messages(conv["id"]):
            if m["mine"]:
                text.insert("end", "You - " + fmt_utc(m["created_at"]), "meta_mine")
                if m["pending"]:
                    text.insert("end", "  (not sent yet)", "pending")
                text.insert("end", "\n" + (m["body"] or "") + "\n\n", "mine")
            else:
                text.insert("end", (m["sender_name"] or "") + " - " + fmt_utc(m["created_at"]) + "\n", "meta")
                text.insert("end", (m["body"] or "") + "\n\n", "theirs")
        text.config(state="disabled")
        text.see("end")

        row = tk.Frame(self.detail, bg=WHITE)
        row.pack(fill="x", pady=(8, 0))
        self.reply = tk.Text(row, height=3, width=20, font=FONT, wrap="word", relief="solid", bd=1,
                             padx=6, pady=4)
        self.reply.conv = conv["id"]
        self.reply.pack(side="left", fill="x", expand=True)
        if draft:
            self.reply.insert("1.0", draft)
        big_button(row, "Send", lambda: self.send(conv["id"]), bg=ORANGE).pack(side="left", padx=(8, 0), fill="y")

    def send(self, conversation_id):
        body = self.reply.get("1.0", "end").strip()
        if not body:
            return
        self.reply.delete("1.0", "end")
        self.store.send_message(conversation_id, body, self.store.get("user_name", "Me"))
        self.screen.app.engine.sync_now()
        self.refresh()
        self.screen.refresh_status()

    def new_message(self):
        NewMessageDialog(self)


class NewMessageDialog(tk.Toplevel):
    """Pick one or more people (office, techs, customers), then write."""

    def __init__(self, tab):
        tk.Toplevel.__init__(self, tab)
        self.tab = tab
        self.people = tab.store.directory()
        self.title("New message")
        self.configure(bg=WHITE, padx=20, pady=16)
        self.transient(tab.winfo_toplevel())

        tk.Label(self, text="New message", font=FONT_BIG, fg=NAVY, bg=WHITE).pack(anchor="w")
        tk.Label(self, text="To (tap one or more names; type to search):", font=FONT, fg=GREY,
                 bg=WHITE).pack(anchor="w", pady=(8, 2))
        self.search = tk.Entry(self, font=FONT, relief="solid", bd=1)
        self.search.pack(fill="x", ipady=4)
        self.search.bind("<KeyRelease>", lambda e: self.fill())

        box = tk.Frame(self, bg=WHITE)
        box.pack(fill="both", expand=True, pady=(4, 0))
        self.listbox = tk.Listbox(box, selectmode="multiple", font=FONT, height=7, width=44,
                                  activestyle="none", exportselection=False,
                                  selectbackground=NAVY, selectforeground=WHITE)
        scroll = ttk.Scrollbar(box, orient="vertical", command=self.listbox.yview)
        self.listbox.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.listbox.pack(side="left", fill="both", expand=True)
        self.listbox.bind("<<ListboxSelect>>", self.on_pick)
        self.chosen = []  # list of (id, name), kept across searches
        self.shown = []
        self.chosen_label = tk.Label(self, text="", font=FONT_BOLD, fg=NAVY, bg=WHITE, anchor="w",
                                     wraplength=520, justify="left")
        self.chosen_label.pack(fill="x", pady=(4, 0))

        tk.Label(self, text="Subject (optional):", font=FONT, fg=GREY, bg=WHITE).pack(anchor="w", pady=(8, 2))
        self.subject = tk.Entry(self, font=FONT, relief="solid", bd=1)
        self.subject.pack(fill="x", ipady=4)
        tk.Label(self, text="Message:", font=FONT, fg=GREY, bg=WHITE).pack(anchor="w", pady=(8, 2))
        self.body = tk.Text(self, height=4, width=44, font=FONT, wrap="word", relief="solid", bd=1)
        self.body.pack(fill="both", expand=True)
        self.error = tk.Label(self, text="", font=FONT, fg=RED, bg=WHITE)
        self.error.pack(anchor="w")

        buttons = tk.Frame(self, bg=WHITE)
        buttons.pack(fill="x", pady=(8, 0))
        big_button(buttons, "Send", self.send, bg=ORANGE).pack(side="right")
        big_button(buttons, "Cancel", self.destroy, bg=NAVY_LIGHT, fg=NAVY).pack(side="right", padx=8)
        self.fill()
        self.search.focus_set()
        self.grab_set()

    def fill(self):
        q = self.search.get().strip().lower()
        self.shown = [p for p in self.people if not q or q in (p["name"] or "").lower()]
        self.listbox.delete(0, "end")
        chosen_ids = [i for i, _ in self.chosen]
        for idx, p in enumerate(self.shown):
            self.listbox.insert("end", "{0}  ({1})".format(p["name"], ROLE_LABELS.get(p["role"], p["role"])))
            if p["id"] in chosen_ids:
                self.listbox.selection_set(idx)

    def on_pick(self, _event=None):
        selected = set(self.listbox.curselection())
        for idx, p in enumerate(self.shown):
            pair = (p["id"], p["name"])
            if idx in selected and pair not in self.chosen:
                self.chosen.append(pair)
            elif idx not in selected and pair in self.chosen:
                self.chosen.remove(pair)
        self.chosen_label.config(text="To: " + ", ".join(n for _, n in self.chosen) if self.chosen else "")

    def send(self):
        body = self.body.get("1.0", "end").strip()
        if not self.chosen:
            self.error.config(text="Choose at least one person.")
            return
        if not body:
            self.error.config(text="Write a message.")
            return
        store = self.tab.store
        conv_id = store.start_conversation(self.chosen[:20], self.subject.get().strip(), body,
                                           store.get("user_name", "Me"))
        self.destroy()
        self.tab.screen.app.engine.sync_now()
        self.tab.open_conversation(conv_id)
        self.tab.screen.refresh_status()
