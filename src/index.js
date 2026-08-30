#!/usr/bin/env node
/**
 * Google Flow MCP Server (Anthropic Specification & MCP Standard Edition)
 * 
 * Provides Tools, Resources, and Prompts for Google Flow (Nano Banana 2/Pro & Veo 3)
 * with Direct CDP WebSocket acceleration, Multi-Reference Chip Injection, and Live Telemetry.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './utils/logger.js';
import { launchKiaraProfile, navigateToFlow } from './browser/launch-profile.js';
import { getPage, getBrowser, setBrowser, closeBrowser as closeBrowserConnection, isBrowserConnected } from './browser/connect.js';
import { verifyAccount as checkAccount } from './browser/account-check.js';
import { handleFlowStatus } from './tools/flow-status.js';
import { handleGenerateImage } from './tools/generate-image.js';
import { handleGenerateVideo } from './tools/generate-video.js';
import { handleDownloadLatest } from './tools/download-latest.js';
import { jobQueue } from './queue/job-queue.js';
import { get } from './utils/config.js';
import fs from 'fs';
import path from 'path';

// ==========================================
// 1. TOOL DEFINITIONS (Anthropic Best Practice)
// ==========================================
const TOOL_DEFINITIONS = [
  {
    name: 'flow_generate_image',
    description: 
      'Generates high-fidelity images on Google Flow using Nano Banana 2, Nano Banana Pro, or Imagen 4. ' +
      'Supports attaching multiple reference images (e.g. character sheet + background environment) as prompt attachment chips. ' +
      'When auto_confirm=true, submits the prompt and downloads high-res images to output_folder. ' +
      'When auto_confirm=false (default), prepares the prompt and references in the UI for safety review without consuming credits.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed image prompt describing subject, emotion, lighting, camera angle, shot size (ECU/MCU/MS/WS), and style.',
        },
        reference_images: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of absolute or relative file paths to reference images (e.g. character canonical PNG and location background JPG).',
        },
        model: {
          type: 'string',
          enum: ['Nano Banana 2', 'Nano Banana Pro', 'Imagen 4'],
          description: 'Model to use. Default is "Nano Banana 2".',
          default: 'Nano Banana 2',
        },
        ratio: {
          type: 'string',
          enum: ['16:9', '9:16', '1:1', '4:3', '3:4'],
          description: 'Aspect ratio of the generated image. Default is "16:9".',
          default: '16:9',
        },
        auto_confirm: {
          type: 'boolean',
          description: 'Set to true to execute generation and consume Google Flow credits. If false, prepares without generating.',
          default: false,
        },
        output_folder: {
          type: 'string',
          description: 'Directory path where generated images should be saved.',
        },
        response_format: {
          type: 'string',
          enum: ['concise', 'detailed'],
          description: 'Control verbosity of returned output (Anthropic Tool Standard). Default is "detailed".',
          default: 'detailed',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'flow_generate_video',
    description: 
      'Generates cinematic video clips on Google Flow using Veo 3.1 or Omni Flash. ' +
      'When auto_confirm=true, submits generation, monitors rendering progress, and downloads the MP4 file. ' +
      'When auto_confirm=false, prepares prompt without consuming credits.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Video prompt describing camera movement (dolly, pan, tilt), subject motion, lighting, and pacing.',
        },
        model: {
          type: 'string',
          enum: ['Veo 3.1 Lite', 'Veo 3.1 Quality', 'Omni Flash'],
          description: 'Video generation model.',
          default: 'Veo 3.1 Lite',
        },
        duration: {
          type: 'string',
          enum: ['4s', '6s', '8s'],
          description: 'Duration of the generated video.',
          default: '6s',
        },
        ratio: {
          type: 'string',
          enum: ['16:9', '9:16', '1:1'],
          description: 'Aspect ratio of the video.',
          default: '16:9',
        },
        auto_confirm: {
          type: 'boolean',
          description: 'Set to true to execute video generation and consume credits.',
          default: false,
        },
        output_folder: {
          type: 'string',
          description: 'Directory path to save the generated MP4 file.',
        },
        response_format: {
          type: 'string',
          enum: ['concise', 'detailed'],
          description: 'Control verbosity of returned output.',
          default: 'detailed',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'flow_status',
    description: 
      'Checks the health and telemetry of Google Flow: Chrome CDP connection state, active user account, session expiration, and real-time remaining credit balance.',
    inputSchema: {
      type: 'object',
      properties: {
        full: {
          type: 'boolean',
          description: 'Include detailed session metadata and telemetry.',
          default: true,
        },
      },
    },
  },
  {
    name: 'flow_manage_project',
    description: 'Lists existing Flow projects or creates a new project on the user canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create'],
          description: 'Action to perform on projects.',
          default: 'list',
        },
        name: {
          type: 'string',
          description: 'Name of the project (required when action is "create").',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'flow_download_latest',
    description: 'Downloads the most recently rendered image or video asset from the active Flow project without re-generating.',
    inputSchema: {
      type: 'object',
      properties: {
        output_folder: {
          type: 'string',
          description: 'Destination directory path.',
        },
      },
    },
  },
  {
    name: 'flow_connect',
    description: 'Establishes connection to Google Flow Chrome instance on CDP port (default: 9333).',
    inputSchema: {
      type: 'object',
      properties: {
        headless: {
          type: 'boolean',
          description: 'Launch headless (default: false for anti-bot safety).',
          default: false,
        },
      },
    },
  },
  {
    name: 'flow_disconnect',
    description: 'Closes the browser connection and cleans up MCP state.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ==========================================
// 2. RESOURCE DEFINITIONS (MCP Standard)
// ==========================================
const RESOURCE_DEFINITIONS = [
  {
    uri: 'flow://credits',
    name: 'Google Flow Credits & Tier',
    description: 'Real-time account credit balance, payment tier, and subscription quota.',
    mimeType: 'application/json',
  },
  {
    uri: 'flow://session',
    name: 'Google Flow User Session',
    description: 'Logged-in user profile, email address, and OAuth expiration timestamp.',
    mimeType: 'application/json',
  },
  {
    uri: 'flow://projects',
    name: 'Google Flow Projects',
    description: 'List of projects on the user canvas.',
    mimeType: 'application/json',
  },
];

// ==========================================
// 3. PROMPT TEMPLATES (MCP Standard)
// ==========================================
const PROMPT_DEFINITIONS = [
  {
    name: 'consistent-storyboard-cut',
    description: 'Guides the agent in crafting high-adherence image generation prompts with canonical character and background references.',
    arguments: [
      { name: 'scene_id', description: 'e.g. S03-S01-C02', required: true },
      { name: 'shot_size', description: 'e.g. ECU, MCU, MS, WS', required: true },
      { name: 'character_name', description: 'e.g. Jinwoo (CEO)', required: true },
      { name: 'emotion_and_action', description: 'e.g. In deep panic holding phone receiver flipping schedule papers', required: true },
      { name: 'location_description', description: 'e.g. Korean factory office interior night', required: true },
    ],
  },
];

// ==========================================
// 4. SERVER SETUP & HANDLERS
// ==========================================
const server = new Server(
  {
    name: 'google-flow-mcp',
    version: '1.2.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// --- TOOLS HANDLERS ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOL_DEFINITIONS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info('Executing MCP Tool Call', { tool: name });

  try {
    switch (name) {
      case 'flow_generate_image': {
        const result = await handleGenerateImage(args);
        if (args.response_format === 'concise') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: result.success,
                status: result.status,
                files: result.artifacts?.map(a => a.path) || [],
                remaining_credits: result.credits?.remaining,
              }, null, 2),
            }],
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'flow_generate_video': {
        const result = await handleGenerateVideo(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'flow_status': {
        const result = await handleFlowStatus();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'flow_manage_project': {
        const page = getPage();
        if (args.action === 'list') {
          const list = await listExistingProjects(page);
          return { content: [{ type: 'text', text: JSON.stringify({ projects: list }, null, 2) }] };
        } else if (args.action === 'create') {
          const newProj = await createNewProject(page, args.name);
          return { content: [{ type: 'text', text: JSON.stringify({ project: newProj }, null, 2) }] };
        }
        throw new Error(`Unknown project action: ${args.action}`);
      }

      case 'flow_download_latest': {
        const result = await handleDownloadLatest(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'flow_connect': {
        const result = await launchKiaraProfile(args?.headless || false);
        return { content: [{ type: 'text', text: JSON.stringify({ status: 'connected', result }, null, 2) }] };
      }

      case 'flow_disconnect': {
        await closeBrowserConnection();
        jobQueue.clear();
        return { content: [{ type: 'text', text: JSON.stringify({ status: 'disconnected' }, null, 2) }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }
  } catch (error) {
    logger.error('Tool execution error', { tool: name, error: error.message });
    return {
      isError: true,
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error.message,
          code: error.code || 'TOOL_EXECUTION_ERROR',
        }, null, 2),
      }],
    };
  }
});

// --- RESOURCES HANDLERS ---
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCE_DEFINITIONS };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const page = getPage();

  if (uri === 'flow://credits') {
    const credits = await page.evaluate(async () => {
      const session = await fetch('/fx/api/auth/session').then(r => r.json()).catch(() => null);
      if (session && session.access_token) {
        return await fetch('https://aisandbox-pa.googleapis.com/v1/credits?key=AIzaSyBtrm0o5ab1c-Ec8ZuLcGt3oJAA5VWt3pY', {
          headers: { 'Authorization': 'Bearer ' + session.access_token }
        }).then(r => r.json());
      }
      return { error: 'No active session' };
    });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(credits, null, 2),
      }],
    };
  }

  if (uri === 'flow://session') {
    const session = await page.evaluate(async () => {
      return await fetch('/fx/api/auth/session').then(r => r.json()).catch(e => ({ error: e.message }));
    });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(session, null, 2),
      }],
    };
  }

  if (uri === 'flow://projects') {
    const projects = await listExistingProjects(page);
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(projects, null, 2),
      }],
    };
  }

  throw new McpError(ErrorCode.InvalidRequest, `Resource URI not supported: ${uri}`);
});

// --- PROMPTS HANDLERS ---
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: PROMPT_DEFINITIONS };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === 'consistent-storyboard-cut') {
    return {
      description: 'Generates consistent storyboard cut prompt and parameter blueprint.',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `[STORYBOARD BLUEPRINT for ${args.scene_id}]\n` +
              `Shot Size: ${args.shot_size}\n` +
              `Character: ${args.character_name}\n` +
              `Emotion & Action: ${args.emotion_and_action}\n` +
              `Location: ${args.location_description}\n\n` +
              `Recommended Imperative Prompt:\n` +
              `"Cinematic live-action Korean TV commercial still, dynamic ${args.shot_size} of the Korean character shown in the first reference image. ` +
              `${args.emotion_and_action}. The background is the authentic location shown in the second reference image (${args.location_description}) ` +
              `with 35-degree rotated camera perspective. High commercial broadcast saturation, natural soft contrast, 85mm prime lens, ultra-sharp 8k photography."`
          },
        },
      ],
    };
  }
  throw new McpError(ErrorCode.InvalidRequest, `Prompt template not found: ${name}`);
});

// ==========================================
// 5. SERVER LAUNCH
// ==========================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Google Flow MCP Server running on Stdio transport (v1.2.0)');
}

main().catch((error) => {
  logger.error('Fatal Server Error', { error: error.message });
  process.exit(1);
});
