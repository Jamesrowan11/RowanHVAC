"""Equipment manuals kept on the laptop for offline use.

The manual list arrives with every sync; the files themselves are downloaded
on demand (tap Open) or all at once (on shop Wi-Fi), verified by SHA-256, and
kept in the data folder. A manual replaced or deleted in the portal is
cleaned up from the laptop automatically.
"""

import hashlib
import os
import re
import subprocess
import sys

from . import api
from .paths import data_dir


def manuals_dir():
    path = os.path.join(data_dir(), "manuals")
    if not os.path.isdir(path):
        os.makedirs(path)
    return path


def file_name(manual):
    m = re.search(r"\.[A-Za-z0-9]{1,8}$", manual.get("original_name") or "")
    ext = m.group(0).lower() if m else ".pdf"
    return "{0}-{1}{2}".format(manual["id"], (manual.get("sha256") or "")[:16], ext)


def local_path(manual):
    return os.path.join(manuals_dir(), file_name(manual))


def is_downloaded(manual):
    path = local_path(manual)
    return os.path.exists(path) and os.path.getsize(path) == manual.get("size")


def prune(store):
    """Deletes files for manuals no longer in the library (or replaced)."""
    keep = set(file_name(m) for m in store.manuals())
    for name in os.listdir(manuals_dir()):
        if name not in keep:
            try:
                os.remove(os.path.join(manuals_dir(), name))
            except OSError:
                pass


def download(store, manual, progress=None):
    """Downloads one manual. progress(done_bytes, total_bytes) is called as it
    goes. Raises api.Offline / api.ApiError / api.SignedOut."""
    dest = local_path(manual)
    tmp = dest + ".part"
    digest = hashlib.sha256()
    try:
        with open(tmp, "wb") as out:
            for chunk, done in api.get_stream(store.get("server"), "/api/van/v1/manuals/" + manual["id"],
                                              store.get("token")):
                out.write(chunk)
                digest.update(chunk)
                if progress:
                    progress(done, manual.get("size") or done)
        if manual.get("sha256") and digest.hexdigest() != manual["sha256"]:
            raise api.ApiError("The download was damaged; try again.")
        if os.path.exists(dest):
            os.remove(dest)
        os.rename(tmp, dest)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass
    return dest


def open_file(path):
    """Opens the file in the laptop's PDF / image viewer."""
    if sys.platform.startswith("win"):
        os.startfile(path)  # noqa - Windows only
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])
