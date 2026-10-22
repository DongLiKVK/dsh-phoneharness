@echo off
rem Start the DSH instance that hosts dsh-phone-harness (phone profile).
rem Launched at logon by the DSHPhone scheduled task, window hidden (see start-phone.vbs).
rem Keep this file ASCII-only: cmd may decode it as GBK and split non-ASCII lines.
set "DSH_HOME=<HOME>\.dsh"
set "ELECTRON_RUN_AS_NODE=1"
cd /d <HOME>
"<DSH_INSTALL>\DeepSeek Harness.exe" --expose-internals "<DSH_INSTALL>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" --profile phone --port 8399 --no-open >> "<HOME>\.dsh\phone-harness\boot.log" 2>&1
