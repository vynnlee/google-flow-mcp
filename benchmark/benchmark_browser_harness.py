import asyncio
import json
import time
import os
import resource
import urllib.request
import base64
import websockets

async def run_benchmark():
    t0 = time.perf_hooks_time = time.perf_counter()
    
    # 1. Connection via HTTP JSON list & WebSocket
    t_conn_start = time.perf_counter()
    req = urllib.request.urlopen("http://localhost:9333/json/list", timeout=5)
    targets = json.loads(req.read().decode('utf-8'))
    
    flow_target = next((t for t in targets if 'labs.google' in t.get('url', '') and t.get('type') == 'page'), None)
    if not flow_target:
        flow_target = next((t for t in targets if t.get('type') == 'page'), targets[0])
        
    ws_url = flow_target['webSocketDebuggerUrl']
    ws = await websockets.connect(ws_url, max_size=25 * 1024 * 1024)
    t1 = time.perf_counter()
    connect_time = (t1 - t_conn_start) * 1000
    
    msg_id = 1
    async def send_cdp(method, params=None):
        nonlocal msg_id
        current_id = msg_id
        msg_id += 1
        payload = {"id": current_id, "method": method, "params": params or {}}
        await ws.send(json.dumps(payload))
        while True:
            raw = await ws.recv()
            data = json.loads(raw)
            if data.get("id") == current_id:
                if "error" in data:
                    raise RuntimeError(data["error"])
                return data.get("result", {})
    
    # 2. DOM Query / Element Discovery
    t2 = time.perf_counter()
    js_query = """
    (() => {
        return Array.from(document.querySelectorAll('button, input, [contenteditable="true"]')).map(el => ({
            tag: el.tagName,
            text: (el.innerText || '').trim(),
            rect: el.getBoundingClientRect()
        }));
    })()
    """
    eval_res = await send_cdp("Runtime.evaluate", {"expression": js_query, "returnByValue": True})
    elements = eval_res.get("result", {}).get("value", [])
    t3 = time.perf_counter()
    dom_query_time = (t3 - t2) * 1000
    
    # 3. Screenshot Capture via CDP Page.captureScreenshot
    t4 = time.perf_counter()
    screenshot_res = await send_cdp("Page.captureScreenshot", {"format": "png"})
    screenshot_b64 = screenshot_res.get("data", "")
    screenshot_bytes = base64.b64decode(screenshot_b64)
    t5 = time.perf_counter()
    screenshot_time = (t5 - t4) * 1000
    
    # 4. JS Evaluation (Page title)
    t6 = time.perf_counter()
    title_res = await send_cdp("Runtime.evaluate", {"expression": "document.title", "returnByValue": True})
    t7 = time.perf_counter()
    eval_time = (t7 - t6) * 1000
    
    total_time = (time.perf_counter() - t0) * 1000
    
    # Get memory RSS (macOS ru_maxrss is in bytes)
    rusage = resource.getrusage(resource.RUSAGE_SELF)
    mem_rss_mb = rusage.ru_maxrss / (1024 * 1024) if sys_is_mac() else rusage.ru_maxrss / 1024
    
    results = {
        "framework": "Browser Harness / Direct CDP (Python)",
        "metrics": {
            "connectTimeMs": round(connect_time, 2),
            "domQueryTimeMs": round(dom_query_time, 2),
            "screenshotTimeMs": round(screenshot_time, 2),
            "evalTimeMs": round(eval_time, 2),
            "totalExecutionTimeMs": round(total_time, 2),
            "memoryRssMb": round(mem_rss_mb, 2),
            "discoveredElementsCount": len(elements),
            "screenshotSizeBytes": len(screenshot_bytes)
        }
    }
    
    print(json.dumps(results, indent=2))
    await ws.close()

def sys_is_mac():
    import platform
    return platform.system() == 'Darwin'

if __name__ == "__main__":
    asyncio.run(run_benchmark())
