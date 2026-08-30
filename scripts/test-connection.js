import { connectDirectCDP, evaluateJS, captureScreenshotCDP } from '../src/cdp/client.js';

async function testConnection() {
  console.log('Testing Direct CDP Connection to Google Flow...');
  try {
    const { target } = await connectDirectCDP(9333);
    console.log('✅ Connected to target:', target.title, '(', target.url, ')');

    const title = await evaluateJS('document.title');
    console.log('✅ Page title evaluated:', title);

    const screenshot = await captureScreenshotCDP('png');
    console.log('✅ Screenshot captured, size:', screenshot.length, 'bytes');

    console.log('\n🎉 Direct CDP Engine test passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection test failed:', err.message);
    process.exit(1);
  }
}

testConnection();
