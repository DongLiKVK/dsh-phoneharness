# Watchdog: bring the phone-profile DSH instance back if port 8737 stops listening.
# Registered as scheduled task DSHPhoneWatch (every 5 minutes). ASCII only.
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PYTHONW = sys.executable
START = os.path.join(HERE, "start-phone.py")
LOCK = os.path.join(os.environ.get("TEMP", HERE), "dsh-phone-watch.lock")
PORT = 8737
MIN_GAP = 180.0


def listening():
    s = socket.socket()
    s.settimeout(2.0)
    try:
        s.connect(("127.0.0.1", PORT))
        return True
    except OSError:
        return False
    finally:
        s.close()


def recent():
    try:
        return (time.time() - os.path.getmtime(LOCK)) < MIN_GAP
    except OSError:
        return False


def main():
    if listening():
        return 0
    if recent():
        return 0
    open(LOCK, "a").close()
    os.utime(LOCK, None)
    subprocess.Popen([PYTHONW, START], cwd=HERE, close_fds=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
