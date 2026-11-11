"""Vehicle speed and trouble codes from the van's OBD-II port (ELM327 adapter).

Hardware: any ELM327-compatible OBD-II adapter. On the CF-29 the most
reliable is an RS-232 (serial cable) ELM327 on the laptop's built-in COM1;
USB and Bluetooth adapters also work - they show up as a COM port
(Windows) or /dev/ttyUSB0 / /dev/rfcomm0 (Linux).

The logger asks for PID 01 0D (vehicle speed, km/h) every few seconds and
stores each reading (in mph, with the time) in the local database. Every few
minutes it also reads the diagnostic trouble codes (mode 03 stored, mode 07
pending, and the check-engine light from PID 01 01); when they change, a
report is queued. The sync engine uploads both to the portal, where admins
see them (Admin > Vehicles) and get emailed about new codes.
"""

import os
import re
import sys
import threading
import time

from .paths import app_dir

sys.path.insert(0, os.path.join(app_dir(), "vendor"))
# Bundled pyserial (see vendor/README.md). OBD-II is optional: if serial
# support can't load on some laptop, the rest of the app must still open.
try:
    import serial  # noqa: E402
    SERIAL_ERROR = None
except Exception as e:  # pragma: no cover - platform specific
    serial = None
    SERIAL_ERROR = "{0}: {1}".format(type(e).__name__, e)

BAUD_RATES = (38400, 9600, 115200, 57600)  # 38400 is the ELM327 default
DEFAULT_INTERVAL = 10  # seconds between readings
CODES_INTERVAL = 300  # seconds between trouble-code checks
KMH_TO_MPH = 0.621371


class ObdError(Exception):
    pass


def available_ports():
    """[(device, description)] of the serial ports on this laptop."""
    if serial is None:
        return []
    try:
        from serial.tools import list_ports
        return [(p.device, p.description or p.device) for p in sorted(list_ports.comports())]
    except Exception:
        pass
    # Fallback (old Windows): try opening COM1..COM16.
    found = []
    if sys.platform.startswith("win"):
        for n in range(1, 17):
            name = "COM{0}".format(n)
            try:
                serial.Serial(name).close()
                found.append((name, name))
            except serial.SerialException as e:
                if "denied" in str(e).lower():  # exists, but in use
                    found.append((name, name + " (in use)"))
            except Exception:
                pass
    return found


def parse_speed_kmh(lines):
    """Finds the reply to 01 0D ("41 0D 3C" -> 60 km/h). Returns None when the
    car isn't answering (ignition off: "NO DATA" / "UNABLE TO CONNECT")."""
    for line in lines:
        compact = line.replace(" ", "").upper()
        m = re.search(r"410D([0-9A-F]{2})", compact)
        if m:
            return int(m.group(1), 16)
    return None


def _payload(lines, service):
    """Joins a (possibly multi-frame) reply into hex bytes after the service
    byte, e.g. service "43" for mode 03. Handles CAN multi-frame output like
    "00A" / "0: 43 04 01 33 ..." / "1: ...". Returns None if not found."""
    hexes = []
    for line in lines:
        compact = line.replace(" ", "").upper()
        if re.match(r"^[0-9A-F]{3}$", compact):
            continue  # CAN byte-count line
        compact = re.sub(r"^[0-9A-F]:", "", compact)
        if re.match(r"^[0-9A-F]+$", compact):
            hexes.append(compact)
    data = "".join(hexes)
    idx = data.find(service)
    if idx < 0:
        return None
    data = data[idx + len(service):]
    return [int(data[i:i + 2], 16) for i in range(0, len(data) - 1, 2)]


def decode_dtc(b1, b2):
    """Two bytes -> "P0301" style code."""
    letter = "PCBU"[(b1 >> 6) & 3]
    return "{0}{1}{2:X}{3:02X}".format(letter, (b1 >> 4) & 3, b1 & 0xF, b2)


def parse_dtcs(lines, service):
    """Mode 03/07 reply -> list of codes. CAN replies start with a count byte
    (odd number of bytes); older protocols send 3 codes per frame, padded."""
    data = _payload(lines, service)
    if not data:
        return []
    if len(data) % 2 == 1:
        data = data[1:1 + 2 * data[0]]
    codes = []
    for i in range(0, len(data) - 1, 2):
        if data[i] or data[i + 1]:
            code = decode_dtc(data[i], data[i + 1])
            if code not in codes:
                codes.append(code)
    return codes


def parse_mil(lines):
    """PID 01 01 -> (check_engine_light_on, code_count) or None."""
    data = _payload(lines, "4101")
    if not data:
        return None
    return bool(data[0] & 0x80), data[0] & 0x7F


def kmh_to_mph(kmh):
    return int(round(kmh * KMH_TO_MPH))


class Elm327(object):
    """Minimal ELM327 driver: just enough to read vehicle speed."""

    def __init__(self, port, baud):
        if serial is None:
            raise ObdError("Serial port support couldn't load on this laptop ({0}).".format(SERIAL_ERROR))
        try:
            self.ser = serial.serial_for_url(port, baudrate=baud, timeout=0.2)
        except (serial.SerialException, ValueError, OSError) as e:
            raise ObdError("Can't open {0}: {1}".format(port, e))
        self.version = None

    def close(self):
        try:
            self.ser.close()
        except Exception:
            pass

    def command(self, cmd, timeout=5.0):
        """Sends a command, returns the reply lines (up to the '>' prompt)."""
        try:
            self.ser.reset_input_buffer()
            self.ser.write((cmd + "\r").encode("ascii"))
            buf = b""
            deadline = time.time() + timeout
            while time.time() < deadline:
                chunk = self.ser.read(64)
                if chunk:
                    buf += chunk
                    if b">" in buf:
                        break
            else:
                raise ObdError("No answer from the adapter (is it plugged in?)")
        except (serial.SerialException, OSError) as e:
            raise ObdError("Adapter disconnected: {0}".format(e))
        text = buf.decode("ascii", "replace").replace(">", "")
        lines = [l.strip() for l in re.split(r"[\r\n]+", text)]
        return [l for l in lines if l and l != cmd and not l.startswith("SEARCHING")]

    def setup(self):
        """Resets the adapter and lets it find the car's OBD protocol."""
        reply = self.command("ATZ", timeout=4)
        version = [l for l in reply if "ELM" in l.upper()]
        if not version:
            raise ObdError("No ELM327 adapter answered on this port.")
        self.version = version[-1]
        for cmd in ("ATE0", "ATL0", "ATS0", "ATH0", "ATSP0"):
            self.command(cmd)
        return self.version

    def speed_kmh(self):
        reply = self.command("010D", timeout=8)  # first query may search protocols
        if any("ERROR" in l.upper() for l in reply):
            raise ObdError("Adapter error: " + " ".join(reply))
        return parse_speed_kmh(reply)

    def trouble_codes(self):
        """{"milOn": bool, "stored": [...], "pending": [...]} or None if the
        vehicle isn't answering."""
        status = parse_mil(self.command("0101", timeout=8))
        if status is None:
            return None
        return {
            "milOn": status[0],
            "stored": parse_dtcs(self.command("03", timeout=8), "43"),
            "pending": parse_dtcs(self.command("07", timeout=8), "47"),
        }


def connect(port, baud="auto"):
    """Opens and sets up the adapter, trying the common baud rates."""
    rates = BAUD_RATES if baud in (None, "", "auto") else (int(baud),)
    last = None
    for rate in rates:
        elm = Elm327(port, rate)
        try:
            elm.setup()
            return elm
        except ObdError as e:
            last = e
            elm.close()
    raise last or ObdError("Couldn't talk to the adapter.")


class SpeedLogger(threading.Thread):
    """Background thread: keeps the adapter connected and logs the speed.

    Settings live in the local database (meta keys obd_enabled, obd_port,
    obd_baud, obd_interval) and are re-read after reconfigure()."""

    def __init__(self, db_path, events):
        threading.Thread.__init__(self, name="obd")
        self.daemon = True
        self.db_path = db_path
        self.events = events  # ("obd", {"state": ..., "mph": ..., "message": ...})
        self._wake = threading.Event()
        self._halt = threading.Event()

    def reconfigure(self):
        self._wake.set()

    def stop(self):
        self._halt.set()
        self._wake.set()

    def _status(self, state, mph=None, message=""):
        self.events.put(("obd", {"state": state, "mph": mph, "message": message}))

    def _sleep(self, seconds):
        """Waits, returning True if woken early by reconfigure()/stop()."""
        woke = self._wake.wait(seconds)
        self._wake.clear()
        return woke

    def run(self):
        from .store import Store
        store = Store(self.db_path)
        elm = None
        next_codes = 0
        try:
            while not self._halt.is_set():
                port = store.get("obd_port")
                if store.get("obd_enabled") != "1" or not port or not store.get("token"):
                    if elm:
                        elm.close()
                        elm = None
                    self._status("off")
                    self._sleep(5)
                    continue
                try:
                    if elm is None:
                        self._status("connecting", message=port)
                        elm = connect(port, store.get("obd_baud", "auto"))
                        next_codes = 0  # check codes right after connecting
                    if time.time() >= next_codes:
                        codes = elm.trouble_codes()
                        if codes is not None:
                            store.record_codes(codes)
                            next_codes = time.time() + CODES_INTERVAL
                    kmh = elm.speed_kmh()
                    if kmh is None:
                        self._status("vehicle_off", message="Adapter connected; the vehicle isn't answering (engine off?)")
                    else:
                        mph = kmh_to_mph(kmh)
                        store.add_speed(mph)
                        self._status("ok", mph=mph)
                    interval = int(store.get("obd_interval") or DEFAULT_INTERVAL)
                    if self._sleep(max(2, interval)) and elm:
                        elm.close()  # settings may have changed: reconnect
                        elm = None
                except ObdError as e:
                    if elm:
                        elm.close()
                        elm = None
                    self._status("error", message=str(e))
                    self._sleep(15)
        finally:
            if elm:
                elm.close()
            store.close()


def test_connection(port, baud="auto"):
    """For the settings screen: returns a human-readable result line."""
    elm = connect(port, baud)
    try:
        kmh = elm.speed_kmh()
        if kmh is None:
            return "Found {0}, but the vehicle didn't answer. Turn the ignition on and try again.".format(elm.version)
        return "Working! {0} reports {1} mph.".format(elm.version, kmh_to_mph(kmh))
    finally:
        elm.close()
