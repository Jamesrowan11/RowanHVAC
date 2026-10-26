"""Start the Rowan HVAC van terminal (double-click on Windows).

Started with pythonw.exe there is no console window, so a startup problem
would otherwise just look like "nothing happens". Instead, any error is shown
in a message box and written to rowanvan-error.log (next to this file, or in
the temp folder if that isn't writable).

Keep this file Python 2 compatible too: an old Python 2 install on the laptop
may be what opens .pyw files, and it must still be able to say so.
"""
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))


def show_error(title, message):
    try:
        import tkinter
        from tkinter import messagebox
        root = tkinter.Tk()
        root.withdraw()
        messagebox.showerror(title, message)
        root.destroy()
        return
    except Exception:
        pass
    if sys.platform.startswith("win"):
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, u"" + message, u"" + title, 0x10)
            return
        except Exception:
            pass
    sys.stderr.write(title + "\n" + message + "\n")


def write_log(text):
    import tempfile
    for folder in (HERE, tempfile.gettempdir()):
        path = os.path.join(folder, "rowanvan-error.log")
        try:
            f = open(path, "a")
            f.write(text + "\n")
            f.close()
            return path
        except Exception:
            continue
    return None


def main():
    if sys.version_info < (3, 4):
        show_error("Rowan Van", "Rowan Van needs Python 3.4 or newer, but it was started with Python "
                   + sys.version.split()[0] + " (" + sys.executable + ").\n\n"
                   "Install Python 3.4.4 (Windows XP) or a newer Python 3, then run "
                   "windows\\install.bat again and start Rowan Van from its desktop icon.")
        return
    try:
        import tkinter  # noqa: F401
    except ImportError:
        show_error("Rowan Van", "This Python (" + sys.executable + ") was installed without Tcl/Tk, "
                   "which Rowan Van needs for its window.\n\nRun the Python installer again, choose "
                   "Modify (or Change), turn on \"Tcl/Tk\", and finish. Then start Rowan Van again.")
        return

    sys.path.insert(0, HERE)
    try:
        from rowanvan.app import main as run_app
        run_app()
    except SystemExit:
        raise
    except Exception:
        details = traceback.format_exc()
        log = write_log("Python " + sys.version + "\n" + details)
        show_error("Rowan Van could not start",
                   "Rowan Van hit a problem while starting:\n\n" + details.strip().splitlines()[-1]
                   + "\n\nFull details were saved to:\n" + (log or "(could not write a log file)")
                   + "\n\nPlease send that file to the office.")


if __name__ == "__main__":
    main()
