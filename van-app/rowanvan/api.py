"""Tiny HTTPS client for the portal's van API (/api/van/v1/*)."""

import gzip
import json
import os
import socket
import ssl

try:  # Python 3
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError, URLError
    from urllib.parse import urlparse
except ImportError:  # pragma: no cover
    raise SystemExit("Rowan Van needs Python 3.4 or newer.")

from . import VERSION, PROTOCOL
from .paths import ca_bundle_path


class ApiError(Exception):
    """The server answered with an error the technician should see."""

    def __init__(self, message, status=None):
        Exception.__init__(self, message)
        self.status = status


class SignedOut(ApiError):
    """The device token was revoked or expired: show the sign-in screen."""


class Offline(Exception):
    """No connection to the server (no signal, DNS failure, timeout...)."""


def normalize_server(url):
    url = (url or "").strip().rstrip("/")
    if url and "://" not in url:
        url = "https://" + url
    return url


def check_server(url):
    """Returns an error message, or None if the URL is acceptable. Plain http is
    only allowed for local testing - passwords and customer data must not
    cross the cellular network unencrypted."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return "Enter the portal address, e.g. https://portal.example.com"
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        return "The portal address must start with https://"
    return None


def _ssl_context():
    ctx = ssl.create_default_context()
    bundle = ca_bundle_path()
    if os.path.exists(bundle):
        ctx.load_verify_locations(cafile=bundle)
    return ctx


def post(server, path, payload, token=None, timeout=30):
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "User-Agent": "RowanVan/" + VERSION,
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(server + path, data=body, headers=headers)
    kwargs = {"timeout": timeout}
    if server.startswith("https://"):
        kwargs["context"] = _ssl_context()
    try:
        resp = urlopen(req, **kwargs)
        status = resp.getcode()
        raw = _read(resp)
    except HTTPError as e:
        status = e.code
        raw = _read(e)
    except (ssl.SSLError, ssl.CertificateError) as e:
        raise ApiError("Secure connection failed (" + str(e) + "). Check the van's date and time.")
    except (URLError, socket.timeout, socket.error, OSError) as e:
        reason = getattr(e, "reason", e)
        if isinstance(reason, ssl.SSLError):
            raise ApiError("Secure connection failed (" + str(reason) + "). Check the van's date and time.")
        raise Offline(str(reason))

    try:
        data = json.loads(raw.decode("utf-8")) if raw else {}
    except ValueError:
        data = {}
    if status == 401 and token:
        raise SignedOut(data.get("error") or "Signed out.", status)
    if status >= 400 or not data.get("ok"):
        if status >= 500 or (status == 404 and not data):
            raise Offline("Server error " + str(status))
        raise ApiError(data.get("error") or "Server error " + str(status), status)
    return data


def get_stream(server, path, token, timeout=60, chunk_size=65536):
    """GETs a (large) file, yielding (chunk, bytes_so_far)."""
    headers = {"User-Agent": "RowanVan/" + VERSION, "Authorization": "Bearer " + token}
    req = Request(server + path, headers=headers)
    kwargs = {"timeout": timeout}
    if server.startswith("https://"):
        kwargs["context"] = _ssl_context()
    try:
        resp = urlopen(req, **kwargs)
    except HTTPError as e:
        if e.code == 401:
            raise SignedOut("Signed out.", 401)
        if e.code == 404:
            raise ApiError("That manual is no longer available.", 404)
        raise Offline("Server error " + str(e.code))
    except (ssl.SSLError, ssl.CertificateError) as e:
        raise ApiError("Secure connection failed (" + str(e) + "). Check the van's date and time.")
    except (URLError, socket.timeout, socket.error, OSError) as e:
        raise Offline(str(getattr(e, "reason", e)))
    done = 0
    try:
        while True:
            try:
                chunk = resp.read(chunk_size)
            except (socket.timeout, socket.error, OSError) as e:
                raise Offline("Connection lost: " + str(e))
            if not chunk:
                break
            done += len(chunk)
            yield chunk, done
    finally:
        resp.close()


def _read(resp):
    raw = resp.read()
    if resp.headers.get("Content-Encoding", "").lower() == "gzip":
        raw = gzip.decompress(raw)
    return raw


def login(server, email, password, device_name):
    return post(server, "/api/van/v1/login", {
        "email": email, "password": password,
        "deviceName": device_name, "appVersion": VERSION,
    })


def sync(server, token, ops, snapshot_hash):
    payload = {"protocol": PROTOCOL, "appVersion": VERSION, "ops": ops}
    if snapshot_hash:
        payload["snapshotHash"] = snapshot_hash
    return post(server, "/api/van/v1/sync", payload, token=token, timeout=60)


def logout(server, token):
    try:
        post(server, "/api/van/v1/logout", {}, token=token, timeout=10)
    except (ApiError, Offline):
        pass  # best effort; an admin can revoke the device from the portal


def connect_mailbox(server, token, address, password):
    """Checks the technician's webmail login on the server and saves it there
    (encrypted). The password is never stored on the laptop."""
    return post(server, "/api/van/v1/mailbox", {"address": address, "password": password},
                token=token, timeout=45)


def disconnect_mailbox(server, token):
    return post(server, "/api/van/v1/mailbox", {"disconnect": True}, token=token)
