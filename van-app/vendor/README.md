# Bundled libraries

- `serial/`: [pyserial](https://github.com/pyserial/pyserial) 3.5 (BSD license,
  see `serial/LICENSE.txt`). Used to talk to the OBD-II adapter; bundled so the
  van laptops need nothing beyond Python itself. Changes from upstream:
  - removed the Jython/IronPython backends;
  - two small patches (marked `[Rowan Van patch]`) so it loads on
    **Windows XP**: `win32.py` falls back to `CancelIo` where `CancelIoEx`
    (Vista+) is missing, and `tools/list_ports_windows.py` maps error codes
    itself where `CM_MapCrToWin32Err` (Windows 8+) is missing.
