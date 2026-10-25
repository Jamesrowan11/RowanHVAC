"""Menu > Vehicle (OBD-II): adapter settings, connection test, and the
current trouble codes."""

import tkinter as tk
from tkinter import ttk

from . import obd
from .ui_common import NAVY, NAVY_LIGHT, ORANGE, WHITE, GREEN, GREY, RED, FONT, FONT_BOLD, FONT_BIG, \
    big_button, in_background


class VehicleDialog(tk.Toplevel):
    def __init__(self, screen):
        tk.Toplevel.__init__(self, screen)
        self.screen = screen
        self.store = screen.store
        self.title("Vehicle (OBD-II)")
        self.configure(bg=WHITE, padx=22, pady=16)
        self.transient(screen.winfo_toplevel())

        tk.Label(self, text="Vehicle (OBD-II)", font=FONT_BIG, fg=NAVY, bg=WHITE).pack(anchor="w")
        tk.Label(self, text="Plug an ELM327 OBD-II adapter into the van's diagnostic port (under the\n"
                            "dashboard) and into this laptop. The app then logs the van's speed and reads\n"
                            "trouble codes; both are sent to the office admins.",
                 font=FONT, fg=GREY, bg=WHITE, justify="left").pack(anchor="w", pady=(4, 10))

        self.enabled = tk.IntVar(value=1 if self.store.get("obd_enabled") == "1" else 0)
        tk.Checkbutton(self, text="Read speed and codes from the OBD-II adapter", variable=self.enabled,
                       font=FONT_BOLD, fg=NAVY, bg=WHITE, activebackground=WHITE,
                       selectcolor=WHITE).pack(anchor="w")

        grid = tk.Frame(self, bg=WHITE)
        grid.pack(fill="x", pady=8)
        ports = obd.available_ports()
        tk.Label(grid, text="Port", font=FONT_BOLD, fg=NAVY, bg=WHITE).grid(row=0, column=0, sticky="w")
        self.port = ttk.Combobox(grid, font=FONT, width=34,
                                 values=[p for p, _ in ports] or ["COM1", "COM3", "/dev/ttyUSB0", "/dev/rfcomm0"])
        self.port.set(self.store.get("obd_port") or (ports[0][0] if ports else "COM1"))
        self.port.grid(row=0, column=1, sticky="w", padx=8, pady=4)
        hint = "; ".join("{0} = {1}".format(p, d) for p, d in ports[:4]) or "No serial ports found - plug the adapter in."
        tk.Label(grid, text=hint, font=("Tahoma", 10), fg=GREY, bg=WHITE, wraplength=420,
                 justify="left").grid(row=1, column=1, sticky="w", padx=8)
        tk.Label(grid, text="Speed (baud)", font=FONT_BOLD, fg=NAVY, bg=WHITE).grid(row=2, column=0, sticky="w")
        self.baud = ttk.Combobox(grid, font=FONT, width=12, state="readonly",
                                 values=["auto"] + [str(b) for b in obd.BAUD_RATES])
        self.baud.set(self.store.get("obd_baud") or "auto")
        self.baud.grid(row=2, column=1, sticky="w", padx=8, pady=4)
        tk.Label(grid, text="Log speed every", font=FONT_BOLD, fg=NAVY, bg=WHITE).grid(row=3, column=0, sticky="w")
        self.interval = ttk.Combobox(grid, font=FONT, width=12, state="readonly",
                                     values=["5 seconds", "10 seconds", "30 seconds", "60 seconds"])
        self.interval.set("{0} seconds".format(self.store.get("obd_interval") or obd.DEFAULT_INTERVAL))
        self.interval.grid(row=3, column=1, sticky="w", padx=8, pady=4)

        self.result = tk.Label(self, text="", font=FONT, fg=GREY, bg=WHITE, wraplength=560, justify="left")
        self.result.pack(fill="x", pady=(4, 6))

        codes_box = tk.Frame(self, bg=NAVY_LIGHT, padx=12, pady=8)
        codes_box.pack(fill="x", pady=(0, 8))
        tk.Label(codes_box, text="Trouble codes", font=FONT_BOLD, fg=NAVY, bg=NAVY_LIGHT).pack(anchor="w")
        tk.Label(codes_box, text=self.codes_text(), font=FONT, fg=NAVY, bg=NAVY_LIGHT,
                 justify="left", wraplength=540).pack(anchor="w")

        buttons = tk.Frame(self, bg=WHITE)
        buttons.pack(fill="x")
        big_button(buttons, "Save", self.save, bg=ORANGE).pack(side="right")
        big_button(buttons, "Close", self.destroy, bg=NAVY_LIGHT, fg=NAVY).pack(side="right", padx=8)
        self.test_btn = big_button(buttons, "Test Connection", self.test, bg=NAVY)
        self.test_btn.pack(side="left")
        self.grab_set()

    def codes_text(self):
        codes = self.store.current_codes()
        if not codes:
            return "Not read yet (they're checked when the adapter connects, then every 5 minutes)."
        lines = ["Check-engine light: " + ("ON" if codes.get("milOn") else "off")]
        lines.append("Stored: " + (", ".join(codes.get("stored") or []) or "none"))
        lines.append("Pending: " + (", ".join(codes.get("pending") or []) or "none"))
        return "\n".join(lines)

    def _interval(self):
        return self.interval.get().split()[0]

    def test(self):
        port, baud = self.port.get().strip(), self.baud.get()
        if not port:
            self.result.config(text="Choose the adapter's port.", fg=RED)
            return
        # The logger may hold the port; pause it while testing.
        self.store.set("obd_enabled", "0")
        self.screen.app.obd.reconfigure()
        self.result.config(text="Talking to the adapter on {0}...".format(port), fg=GREY)
        self.test_btn.config(state="disabled")

        def done(result):
            self.test_btn.config(state="normal")
            if isinstance(result, Exception):
                self.result.config(text=str(result), fg=RED)
            else:
                self.result.config(text=result, fg=GREEN)
            self.store.set("obd_enabled", "1" if self.enabled.get() else "0")
            self.screen.app.obd.reconfigure()

        in_background(self, lambda: obd.test_connection(port, baud), done)

    def save(self):
        self.store.set("obd_enabled", "1" if self.enabled.get() else "0")
        self.store.set("obd_port", self.port.get().strip())
        self.store.set("obd_baud", self.baud.get())
        self.store.set("obd_interval", self._interval())
        self.screen.app.obd.reconfigure()
        self.destroy()
