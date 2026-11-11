"""Look and feel shared by every screen, plus small helpers."""

import calendar
import datetime
import threading
import time

import tkinter as tk
from tkinter import ttk

NAVY = "#1a2b4a"
NAVY_LIGHT = "#e8ecf3"
ORANGE = "#f57c1f"
WHITE = "#ffffff"
GREEN = "#1e7b34"
RED = "#b3261e"
GREY = "#5b6b85"

STATUS_LABELS = {
    "SCHEDULED": "Scheduled",
    "IN_PROGRESS": "In Progress",
    "COMPLETED": "Completed",
    "CANCELLED": "Cancelled",
}
STATUS_COLORS = {
    "SCHEDULED": "#1d4ed8",
    "IN_PROGRESS": "#b45309",
    "COMPLETED": GREEN,
    "CANCELLED": GREY,
}
VIEWS = [("today", "Today"), ("open", "All Open"), ("upcoming", "Upcoming"), ("done", "Done")]

FONT = ("Tahoma", 12)  # Tahoma ships with XP and is crisp at small sizes
FONT_BOLD = ("Tahoma", 12, "bold")
FONT_BIG = ("Tahoma", 18, "bold")
FONT_SMALL = ("Tahoma", 10)


def today_str():
    return datetime.date.today().isoformat()


def fmt_day(day):
    try:
        d = datetime.datetime.strptime(day, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return day or ""
    if d == datetime.date.today():
        return "Today"
    if d == datetime.date.today() + datetime.timedelta(days=1):
        return "Tomorrow"
    return d.strftime("%a %b ") + str(d.day)


def fmt_utc(iso):
    """'2026-10-24T14:05:00.000Z' -> local '10/24 10:05 AM'."""
    try:
        t = calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))
    except (TypeError, ValueError):
        return iso or ""
    lt = time.localtime(t)
    return time.strftime("%m/%d ", lt) + time.strftime("%I:%M %p", lt).lstrip("0")


def big_button(parent, text, command, bg=NAVY, fg=WHITE, **kw):
    return tk.Button(
        parent, text=text, command=command, bg=bg, fg=fg, activebackground=bg,
        activeforeground=fg, font=FONT_BOLD, relief="flat", padx=16, pady=10,
        cursor="hand2", disabledforeground="#c9d1de", **kw
    )



def scrolled_text(parent, **kw):
    """A read-only-capable Text with a finger-sized scrollbar; returns the Text."""
    box = tk.Frame(parent, bg=parent.cget("bg"))
    text = tk.Text(box, wrap="word", font=FONT, relief="solid", bd=1, padx=8, pady=6,
                   width=20, **kw)
    scroll = ttk.Scrollbar(box, orient="vertical", command=text.yview)
    text.configure(yscrollcommand=scroll.set)
    scroll.pack(side="right", fill="y")
    text.pack(side="left", fill="both", expand=True)
    text.box = box
    return text


def in_background(widget, work, done):
    """Runs work() on a thread (network calls) and then done(result) on the
    UI thread. work returns a value; exceptions are passed to done as-is."""
    result = {}

    def run():
        try:
            result["value"] = work()
        except Exception as e:  # handed to done() on the UI thread
            result["value"] = e

    thread = threading.Thread(target=run)
    thread.daemon = True
    thread.start()

    def check():
        if thread.is_alive():
            widget.after(150, check)
        elif widget.winfo_exists():
            done(result.get("value"))

    widget.after(150, check)
