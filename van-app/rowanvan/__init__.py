"""Rowan HVAC van terminal: an offline-first desktop app for the Toughbooks.

Written for Python 3.4+ using only the standard library (tkinter, sqlite3,
urllib) so it runs on the CF-29's Windows XP as well as on Linux.
Do not use f-strings or other 3.5+ syntax anywhere in this package.
"""

VERSION = "1.0.0"
PROTOCOL = 1

# The company website: the vans sync with the same site customers visit.
DEFAULT_SERVER = "https://rowanheatingandair.com"
# Addresses the site used to live at. A van still pointed at one is moved to
# DEFAULT_SERVER automatically (same server and accounts, so it stays signed in).
MOVED_SERVERS = ("https://portal.rowanheatingandair.com", "https://www.rowanheatingandair.com")
