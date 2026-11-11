"""Email address checks (no UI imports, so it is easy to test)."""

import re

EMAIL_RE = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")
MAX_RECIPIENTS = 25


def split_addresses(text):
    """'a@x.com, b@y.com; c@z.com' -> (valid list, invalid list)."""
    parts = [p.strip() for p in re.split(r"[,;\s]+", text or "") if p.strip()]
    valid, invalid = [], []
    for p in parts:
        (valid if EMAIL_RE.match(p) else invalid).append(p)
    seen = set()
    valid = [v for v in valid if not (v.lower() in seen or seen.add(v.lower()))]
    return valid, invalid
