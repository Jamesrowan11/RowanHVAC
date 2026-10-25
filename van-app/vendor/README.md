# Bundled libraries

- `serial/`: [pyserial](https://github.com/pyserial/pyserial) 3.5 (BSD license,
  see `serial/LICENSE.txt`), unmodified except for removing the Jython/IronPython
  backends. Used to talk to the OBD-II adapter. Bundled so the van laptops
  need nothing beyond Python itself.
