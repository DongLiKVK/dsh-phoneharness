# Start the DSH instance that hosts dsh-phone-harness (phone profile).
# Launched at logon by the DSHPhone scheduled task. ASCII only.
# pythonw has no console, so no window flashes; the child is detached from this process.
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DSH_HOME = r"<HOME>\.dsh"
EXE = r"<DSH_INSTALL>\DeepSeek Harness.exe"
CLI = r"<DSH_INSTALL>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js"
LOG = os.path.join(DSH_HOME, "phone-harness", "boot.log")

env = dict(os.environ)
env["DSH_HOME"] = DSH_HOME
env["ELECTRON_RUN_AS_NODE"] = "1"
env["ELECTRON_NO_ATTACH_CONSOLE"] = "1"

os.makedirs(os.path.dirname(LOG), exist_ok=True)
out = open(LOG, "ab", buffering=0)
out.write(b"\r\n=== %s ===\r\n" % __import__("datetime").datetime.now().isoformat().encode())

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000
flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW

p = subprocess.Popen(
    [EXE, "--expose-internals", CLI, "--profile", "phone", "--port", "8399", "--no-open"],
    cwd=r"<HOME>",
    env=env,
    stdin=subprocess.DEVNULL,
    stdout=out,
    stderr=subprocess.STDOUT,
    creationflags=flags,
    close_fds=True,
)
out.write(("pid=%d\r\n" % p.pid).encode())
out.close()
