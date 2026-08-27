#!/usr/bin/env python3
"""
Smoke test minimalista para Xcode MCP Server.
Lanza el servidor, hace initialize + tools/list + tools/call xcode_sync_strings
"""
import subprocess, json, time, os, tempfile, sys, pathlib

def rpc(proc, obj):
    line = json.dumps(obj)
    proc.stdin.write(line + "\n")
    proc.stdin.flush()

tmp = tempfile.mkdtemp()
xcstrings_path = os.path.join(tmp, "Localizable.xcstrings")
data = {
    "sourceLanguage": "en",
    "strings": {
        "hello": {"localizations": {"en": {"stringUnit": {"state":"translated","value":"Hello"}}, "es": {"stringUnit": {"state":"translated","value":"Hola"}}}},
        "bye": {"localizations": {"en": {"stringUnit": {"state":"translated","value":"Bye"}}}}
    },
    "version": "1.0"
}
open(xcstrings_path, "w").write(json.dumps(data))

proc = subprocess.Popen(["node", "index.js"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

try:
    rpc(proc, {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}})
    time.sleep(0.8)
    rpc(proc, {"jsonrpc":"2.0","method":"notifications/initialized"})
    time.sleep(0.3)
    rpc(proc, {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})
    time.sleep(0.5)
    rpc(proc, {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"xcode_sync_strings","arguments":{"filePath": xcstrings_path}}})
    time.sleep(0.8)
    rpc(proc, {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"xcode_certificates_check","arguments":{}}})
    time.sleep(0.8)
    proc.stdin.close()
    try:
        out, err = proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = proc.communicate()
    print("STDERR:", err.strip()[:800], file=sys.stderr)
    ok = False
    for line in out.splitlines():
        try:
            j = json.loads(line)
            if j.get("id") == 2 and "result" in j:
                tools = j["result"]["tools"]
                names = [t["name"] for t in tools]
                assert "xcode_build" in names and "simctl_list" in names, "tools faltantes"
                print(f"✓ tools/list: {len(tools)} herramientas")
                ok = True
            if j.get("id") == 3:
                txt = j["result"]["content"][0]["text"]
                assert "bye" in txt, "xcode_sync_strings no detectó missing"
                print("✓ xcode_sync_strings OK")
            if j.get("id") == 4:
                print("✓ xcode_certificates_check OK")
        except Exception as e:
            pass
    if ok:
        print("✓ smoke test PASSED")
        sys.exit(0)
    else:
        print("✗ smoke test FAILED — no se recibió tools/list", file=sys.stderr)
        print("STDOUT:", out[:4000], file=sys.stderr)
        sys.exit(1)
finally:
    import shutil; shutil.rmtree(tmp, ignore_errors=True)
