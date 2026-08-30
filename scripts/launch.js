import { spawn } from 'child_process';
import { findChromeExecutable, getDefaultUserDataDir } from '../src/browser/executable-finder.js';
import { get } from '../src/utils/config.js';

function launch() {
  try {
    const chromePath = findChromeExecutable();
    const userDataDir = getDefaultUserDataDir();
    const port = get('cdpPort', 9333);
    const targetUrl = 'https://labs.google/fx/tools/flow';

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      targetUrl
    ];

    console.log(`Starting browser for Google Flow MCP...`);
    console.log(`- Executable: ${chromePath}`);
    console.log(`- Port: ${port}`);
    console.log(`- Profile Directory: ${userDataDir}`);
    console.log(`- Target: ${targetUrl}\n`);
    console.log(`Please ensure you are logged into your Google account in the opened browser window.`);

    const proc = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore'
    });

    proc.unref();
    process.exit(0);
  } catch (err) {
    console.error(`Failed to launch browser: ${err.message}`);
    process.exit(1);
  }
}

launch();
