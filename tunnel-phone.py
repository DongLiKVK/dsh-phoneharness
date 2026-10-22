# Keep an SSH reverse tunnel alive: cloud 127.0.0.1:7100  ->  local 127.0.0.1:8737.
# nginx on the cloud exposes it as http://43.142.153.74/a4f41d8f5c00/
# Registered as scheduled task DSHPhoneTunnel (onlogon) + DSHPhoneTunnelWatch (5 min). ASCII only.
#
# Two things make this survive years of unattended running:
#   1. a named mutex, not a pidfile, decides "am I already running" -- immune to PID reuse;
#   2. the ssh child is put in a job object with KILL_ON_JOB_CLOSE, so if this supervisor is
#      killed (taskkill /F without /T, crash, logoff) the ssh child dies too instead of
#      orphaning and holding remote port 7100 forever.
import ctypes
import os
import subprocess
import sys
import time
from ctypes import wintypes

HERE = os.path.dirname(os.path.abspath(__file__))
TEMP = os.environ.get("TEMP", HERE)
PIDFILE = os.path.join(TEMP, "dsh-phone-tunnel.pid")
LOGDIR = os.path.join(os.environ.get("DSH_HOME", r"<HOME>\.dsh"), "phone-harness")
LOG = os.path.join(LOGDIR, "tunnel.log")

SSH = r"C:\Windows\System32\OpenSSH\ssh.exe"
KEY = r"<HOME>\.ssh\jingyu_ssh_ed25519"
HOST = "ubuntu@43.142.153.74"
REMOTE = "127.0.0.1:7100:127.0.0.1:8737"
MUTEX = "Local\\dsh-phone-tunnel-supervisor"

ARGS = [
    SSH, "-N", "-T",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=6",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=15",
    "-i", KEY,
    "-R", REMOTE,
    HOST,
]

ERROR_ALREADY_EXISTS = 183
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
STILL_ACTIVE = 259
DETACHED_PROCESS = 0x00000008
CREATE_NO_WINDOW = 0x08000000
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
JobObjectExtendedLimitInformation = 9

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)


class IO_COUNTERS(ctypes.Structure):
    _fields_ = [
        ("ReadOperationCount", ctypes.c_ulonglong),
        ("WriteOperationCount", ctypes.c_ulonglong),
        ("OtherOperationCount", ctypes.c_ulonglong),
        ("ReadTransferCount", ctypes.c_ulonglong),
        ("WriteTransferCount", ctypes.c_ulonglong),
        ("OtherTransferCount", ctypes.c_ulonglong),
    ]


class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", wintypes.LARGE_INTEGER),
        ("PerJobUserTimeLimit", wintypes.LARGE_INTEGER),
        ("LimitFlags", wintypes.DWORD),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", wintypes.DWORD),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", wintypes.DWORD),
        ("SchedulingClass", wintypes.DWORD),
    ]


class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
        ("IoInfo", IO_COUNTERS),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


def log(line):
    os.makedirs(LOGDIR, exist_ok=True)
    with open(LOG, "ab", buffering=0) as fh:
        stamp = time.strftime("%Y-%m-%dT%H:%M:%S").encode()
        fh.write(stamp + b"  " + line.encode("utf-8", "replace") + b"\r\n")


def take_mutex():
    """Named mutex = single instance. Returns the handle, or None if another instance owns it."""
    handle = kernel32.CreateMutexW(None, False, MUTEX)
    if not handle:
        log("CreateMutex failed err=%d" % ctypes.get_last_error())
        return 0
    if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
        kernel32.CloseHandle(handle)
        return None
    return handle


def make_job():
    """A job that kills its members when the last handle to it closes (= when we die)."""
    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        log("CreateJobObject failed err=%d" % ctypes.get_last_error())
        return 0
    info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    ok = kernel32.SetInformationJobObject(
        job, JobObjectExtendedLimitInformation, ctypes.byref(info), ctypes.sizeof(info)
    )
    if not ok:
        log("SetInformationJobObject failed err=%d" % ctypes.get_last_error())
        kernel32.CloseHandle(job)
        return 0
    return job


def running(pid):
    """True when a live process has this pid (only used to tidy the pidfile)."""
    if pid <= 0:
        return False
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if handle:
        code = ctypes.c_ulong()
        ok = kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        kernel32.CloseHandle(handle)
        return bool(ok) and code.value == STILL_ACTIVE
    return False


def read_pidfile():
    try:
        with open(PIDFILE, "r", encoding="ascii") as fh:
            return int(fh.read().strip() or "0")
    except (OSError, ValueError):
        return 0


def main():
    mutex = take_mutex()
    if mutex is None:
        return 0  # another supervisor is already running
    stale = read_pidfile()
    if stale and stale != os.getpid() and running(stale):
        log("note: pidfile still points at live pid %d" % stale)
    with open(PIDFILE, "w", encoding="ascii") as fh:
        fh.write(str(os.getpid()))

    job = make_job()
    os.makedirs(LOGDIR, exist_ok=True)
    log("supervisor start pid=%d" % os.getpid())

    backoff = 5
    while True:
        started = time.time()
        log("ssh connect")
        try:
            with open(LOG, "ab", buffering=0) as out:
                proc = subprocess.Popen(
                    ARGS,
                    stdin=subprocess.DEVNULL,
                    stdout=out,
                    stderr=subprocess.STDOUT,
                    creationflags=DETACHED_PROCESS | CREATE_NO_WINDOW,
                    close_fds=True,
                )
                if job:
                    if not kernel32.AssignProcessToJobObject(job, int(proc._handle)):
                        log("AssignProcessToJobObject failed err=%d" % ctypes.get_last_error())
                code = proc.wait()
        except Exception as error:  # noqa: BLE001 - the supervisor must never die
            log("spawn failed: %r" % (error,))
            code = -1
        lived = time.time() - started
        log("ssh exited code=%d after %.0fs" % (code, lived))
        if lived > 120:
            backoff = 5
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)


if __name__ == "__main__":
    sys.exit(main())
