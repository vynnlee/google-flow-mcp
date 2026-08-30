#!/bin/bash
# Idempotent: ensures the dedicated Chrome for Google Flow is listening on CDP 9222.
# macOS version

CDP_PORT=9333
USER_DATA_DIR="$HOME/Library/Application Support/Google/FlowAutomationChrome"
FLOW_URL="https://labs.google/fx/tools/flow"
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

test_cdp() {
    curl -s --connect-timeout 2 "http://127.0.0.1:$CDP_PORT/json/version" > /dev/null 2>&1
    return $?
}

if test_cdp; then
    echo "READY: Chrome already up on CDP $CDP_PORT"
    exit 0
fi

if [ ! -f "$CHROME_PATH" ]; then
    echo "FAILED: Google Chrome not found at $CHROME_PATH"
    exit 1
fi

mkdir -p "$USER_DATA_DIR"

# Launch Chrome in background
"$CHROME_PATH" \
    --remote-debugging-port=$CDP_PORT \
    --user-data-dir="$USER_DATA_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --disable-blink-features=AutomationControlled \
    --window-size=1920,1080 \
    "$FLOW_URL" > /dev/null 2>&1 &

for i in $(seq 1 12); do
    sleep 1
    if test_cdp; then
        echo "LAUNCHED: Chrome up on CDP $CDP_PORT. If labs.google shows the landing page, click 'Sign in to Flow' once."
        exit 0
    fi
done

echo "FAILED: Chrome launched but CDP $CDP_PORT not responding within 12s"
exit 1
