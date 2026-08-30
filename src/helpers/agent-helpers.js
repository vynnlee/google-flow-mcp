/**
 * Browser Harness Self-Healing Agent Helpers for Google Flow.
 * 
 * Agents can call, extend, and update these helpers at runtime.
 */
import { evaluateJS, sendCDP, captureScreenshotCDP } from '../cdp/client.js';
import { logger } from '../utils/logger.js';

export const AgentHelpers = {
  /**
   * Discovers all clickable and interactive buttons/inputs on the Flow canvas.
   */
  async discoverInteractiveElements() {
    return await evaluateJS(`
      (() => {
        const elements = Array.from(document.querySelectorAll('button, input, textarea, [contenteditable="true"], [role="button"], [role="menuitem"]'));
        return elements.map((el, index) => {
          const rect = el.getBoundingClientRect();
          return {
            index,
            tag: el.tagName,
            text: (el.innerText || el.getAttribute('aria-label') || el.placeholder || '').trim().replace(/\\s+/g, ' '),
            ariaLabel: el.getAttribute('aria-label'),
            role: el.getAttribute('role'),
            className: el.className,
            visible: rect.width > 0 && rect.height > 0,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          };
        }).filter(el => el.visible && el.text);
      })()
    `);
  },

  /**
   * Resiliently finds the Flow prompt container.
   */
  async findPromptInput() {
    return await evaluateJS(`
      (() => {
        const selectors = [
          '[contenteditable="true"]:not([style*="display: none"])',
          'textarea:not([style*="display: none"])',
          '[contenteditable="true"]',
          'textarea'
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.getBoundingClientRect().height > 0) {
            return { selector: sel, tag: el.tagName };
          }
        }
        return null;
      })()
    `);
  },

  /**
   * Reads media UUIDs present in the current DOM.
   */
  async getCanvasMediaUuids() {
    return await evaluateJS(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const uuids = new Set();
        imgs.forEach(img => {
          const match = (img.src || '').match(/media\\.getMediaUrlRedirect\\?name=([a-f0-9-]+)/);
          if (match && img.width > 100) {
            uuids.add(match[1]);
          }
        });
        return Array.from(uuids);
      })()
    `);
  },

  /**
   * Fetches image data as base64 in-page without navigation disruption.
   */
  async fetchMediaBase64(uuid) {
    return await evaluateJS(`
      (async () => {
        const url = 'https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${uuid}';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Fetch failed: ' + res.status);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({
            data: reader.result.split(',')[1],
            type: blob.type,
            size: blob.size
          });
          reader.readAsDataURL(blob);
        });
      })()
    `);
  }
};
