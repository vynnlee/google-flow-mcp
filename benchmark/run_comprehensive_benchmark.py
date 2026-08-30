import subprocess
import json
import statistics

def run_cmd(cmd):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed: {p.stderr}")
    return json.loads(p.stdout)

print("Running 5 iterations of Playwright CDP Benchmark...")
pw_runs = []
for i in range(5):
    res = run_cmd("node benchmark/benchmark_playwright.mjs")
    pw_runs.append(res["metrics"])
    print(f"  Playwright Run {i+1}: {res['metrics']['totalExecutionTimeMs']}ms, RSS: {res['metrics']['memoryRssMb']}MB")

print("\nRunning 5 iterations of Browser Harness / Direct CDP Benchmark...")
bh_runs = []
for i in range(5):
    res = run_cmd("python3 benchmark/benchmark_browser_harness.py")
    bh_runs.append(res["metrics"])
    print(f"  Browser Harness Run {i+1}: {res['metrics']['totalExecutionTimeMs']}ms, RSS: {res['metrics']['memoryRssMb']}MB")

def aggregate(runs):
    keys = runs[0].keys()
    agg = {}
    for k in keys:
        vals = [r[k] for r in runs]
        agg[k] = {
            "mean": round(statistics.mean(vals), 2),
            "min": round(min(vals), 2),
            "max": round(max(vals), 2),
            "std": round(statistics.stdev(vals) if len(vals) > 1 else 0.0, 2)
        }
    return agg

final_summary = {
    "playwright_cdp": aggregate(pw_runs),
    "browser_harness_cdp": aggregate(bh_runs)
}

with open("benchmark/benchmark_results.json", "w") as f:
    json.dump(final_summary, f, indent=2)

print("\n=== FINAL BENCHMARK SUMMARY (5-Run Avg) ===")
print(json.dumps(final_summary, indent=2))
