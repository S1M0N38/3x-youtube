// Keyboard shortcuts. The content script owns the playback rate, so the
// background page only translates a command into a message for the active tab.

const STEP = 0.25;

const MESSAGES = {
    "speed-up": { action: "stepSpeed", delta: STEP },
    "speed-down": { action: "stepSpeed", delta: -STEP },
    "speed-reset": { action: "resetSpeed" }
};

async function forwardToActiveTab(message) {
    try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.id === undefined) return;
        await browser.tabs.sendMessage(tab.id, message);
    } catch (error) {
        // No content script in the active tab (not a YouTube page): nothing to do.
    }
}

browser.commands.onCommand.addListener((command) => {
    const message = MESSAGES[command];
    if (message) forwardToActiveTab(message);
});
