import http from 'http';
import { logger } from '../utils/logger.js';
import { get } from '../utils/config.js';

let activeWs = null;
let activeTarget = null;
let messageId = 1;
const pendingCallbacks = new Map();
const eventListeners = new Map();

/**
 * Connect directly to Chrome DevTools Protocol WebSocket.
 * Latency is typically < 25ms.
 */
export async function connectDirectCDP(port = null) {
  const cdpPort = port || get('cdpPort', 9333);
  
  // 1. Fetch targets from HTTP endpoint
  const targets = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${cdpPort}/json/list`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse CDP JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });

  // 2. Select Google Flow page target
  const flowTarget = targets.find(t => t.url && t.url.includes('labs.google') && t.type === 'page') 
    || targets.find(t => t.type === 'page') 
    || targets[0];

  if (!flowTarget || !flowTarget.webSocketDebuggerUrl) {
    throw new Error('No valid CDP WebSocket debugger target found.');
  }

  activeTarget = flowTarget;

  // 3. Connect via native WebSocket
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    activeWs.close();
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(flowTarget.webSocketDebuggerUrl);

    ws.onopen = () => {
      logger.info('Connected to Direct CDP WebSocket', { targetUrl: flowTarget.url, port: cdpPort });
      activeWs = ws;
      resolve({ target: flowTarget, ws });
    };

    ws.onerror = (err) => {
      logger.error('CDP WebSocket error', { error: err.message });
      reject(err);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && pendingCallbacks.has(msg.id)) {
          const { resolve, reject } = pendingCallbacks.get(msg.id);
          pendingCallbacks.delete(msg.id);
          if (msg.error) {
            reject(new Error(`CDP Error (${msg.error.code}): ${msg.error.message}`));
          } else {
            resolve(msg.result || {});
          }
        } else if (msg.method) {
          const listeners = eventListeners.get(msg.method) || [];
          listeners.forEach(fn => fn(msg.params));
        }
      } catch (err) {
        logger.warn('Failed to parse CDP message', { error: err.message });
      }
    };
  });
}

/**
 * Send a raw CDP method call.
 */
export async function sendCDP(method, params = {}) {
  if (!activeWs || activeWs.readyState !== WebSocket.OPEN) {
    await connectDirectCDP();
  }

  const id = messageId++;
  const payload = JSON.stringify({ id, method, params });

  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, { resolve, reject });
    activeWs.send(payload);
  });
}

/**
 * High-speed JavaScript evaluation in target page context.
 */
export async function evaluateJS(expression) {
  const res = await sendCDP('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(`JS Eval Exception: ${res.exceptionDetails.text || res.exceptionDetails.exception?.description}`);
  }
  return res.result?.value;
}

/**
 * Capture high-speed page screenshot directly via CDP.
 */
export async function captureScreenshotCDP(format = 'png', quality = 90) {
  const params = { format };
  if (format === 'jpeg') params.quality = quality;
  const res = await sendCDP('Page.captureScreenshot', params);
  return Buffer.from(res.data, 'base64');
}

/**
 * Add CDP event listener.
 */
export function onCDPEvent(method, handler) {
  if (!eventListeners.has(method)) {
    eventListeners.set(method, []);
  }
  eventListeners.get(method).push(handler);
}
