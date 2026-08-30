import { chromium } from '/Users/vsl/.gemini/mcp-servers/google-flow-mcp/node_modules/playwright/index.mjs';
import { performance } from 'perf_hooks';

async function runBenchmark() {
    const memStart = process.memoryUsage();
    const t0 = performance.now();
    
    // 1. Connection
    const browser = await chromium.connectOverCDP('http://localhost:9333');
    const t1 = performance.now();
    const connectTime = t1 - t0;
    
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('labs.google')) || context.pages()[0];
    
    // 2. DOM Query / Element Discovery
    const t2 = performance.now();
    const elements = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, input, [contenteditable="true"]')).map(el => ({
            tag: el.tagName,
            text: (el.innerText || '').trim(),
            rect: el.getBoundingClientRect()
        }));
    });
    const t3 = performance.now();
    const domQueryTime = t3 - t2;
    
    // 3. Screenshot Capture
    const t4 = performance.now();
    const screenshotBuf = await page.screenshot({ timeout: 5000, animations: 'disabled' });
    const t5 = performance.now();
    const screenshotTime = t5 - t4;
    
    // 4. JS Evaluation
    const t6 = performance.now();
    const title = await page.title();
    const t7 = performance.now();
    const evalTime = t7 - t6;
    
    const memEnd = process.memoryUsage();
    const totalTime = performance.now() - t0;
    
    const results = {
        framework: 'Playwright CDP (Node.js)',
        metrics: {
            connectTimeMs: parseFloat(connectTime.toFixed(2)),
            domQueryTimeMs: parseFloat(domQueryTime.toFixed(2)),
            screenshotTimeMs: parseFloat(screenshotTime.toFixed(2)),
            evalTimeMs: parseFloat(evalTime.toFixed(2)),
            totalExecutionTimeMs: parseFloat(totalTime.toFixed(2)),
            memoryRssMb: parseFloat((memEnd.rss / 1024 / 1024).toFixed(2)),
            heapUsedMb: parseFloat((memEnd.heapUsed / 1024 / 1024).toFixed(2)),
            discoveredElementsCount: elements.length,
            screenshotSizeBytes: screenshotBuf.length
        }
    };
    
    console.log(JSON.stringify(results, null, 2));
    await browser.close();
}

runBenchmark().catch(err => {
    console.error('Playwright Benchmark Error:', err);
    process.exit(1);
});
