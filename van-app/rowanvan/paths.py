import os
import sys


def data_dir():
    """Where the local database and settings live (created on first use).

    Windows: %APPDATA%\\RowanVan   Linux: ~/.local/share/rowanvan
    Override with the ROWANVAN_HOME environment variable.
    """
    path = os.environ.get("ROWANVAN_HOME")
    if not path:
        if sys.platform.startswith("win"):
            base = os.environ.get("APPDATA") or os.path.expanduser("~")
            path = os.path.join(base, "RowanVan")
        else:
            base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
            path = os.path.join(base, "rowanvan")
    if not os.path.isdir(path):
        os.makedirs(path)
    return path


def db_path():
    return os.path.join(data_dir(), "rowanvan.db")


def app_dir():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ca_bundle_path():
    """Root certificates shipped with the app. Windows XP's own certificate
    store predates Let's Encrypt (what Plesk issues by default), so we bring
    our own."""
    return os.path.join(app_dir(), "certs", "ca-bundle.pem")
