// 3xYouTube content script: applies the chosen playback rate to YouTube's
// video element, remembers it, and re-applies it on every new video.

const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.1;
const MAX_SPEED = 16;

const findVideoElement = () => document.querySelector("video");
const clampSpeed = (value) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));

// Returns a usable speed or null for anything that is not a finite number.
function toSpeed(value) {
    const speed = Number(value);
    if (!Number.isFinite(speed)) return null;
    return clampSpeed(speed);
}

async function readStoredSpeed() {
    try {
        const { speed } = await browser.storage.local.get("speed");
        const stored = toSpeed(speed);
        return stored === null ? DEFAULT_SPEED : stored;
    } catch (error) {
        return DEFAULT_SPEED;
    }
}

async function storeSpeed(speed) {
    try {
        await browser.storage.local.set({ speed });
    } catch (error) {
        // Storage unavailable: the speed still applies to the current video.
    }
}

// The popup is usually closed, so a missing receiver is expected and harmless.
function notifyPopup(speed) {
    browser.runtime.sendMessage({ action: "updateSpeed", speed }).catch(() => {});
}

// Applies the speed to the current video and remembers it as the preferred one.
async function applySpeed(value) {
    const speed = toSpeed(value);
    if (speed === null) return null;

    const video = findVideoElement();
    if (video) {
        video.playbackRate = speed;
        console.log(`playback speed modified to: ${speed}x`);
    }
    await storeSpeed(speed);
    notifyPopup(speed);
    return speed;
}

// Re-applies the remembered speed to whatever video YouTube is showing now.
async function restoreSpeed() {
    const speed = await readStoredSpeed();
    if (speed === DEFAULT_SPEED) return;

    const video = findVideoElement();
    if (!video) return;

    if (Math.abs(video.playbackRate - speed) > 0.001) {
        video.playbackRate = speed;
        console.log(`playback speed restored to: ${speed}x`);
    }
    notifyPopup(speed);
}

browser.runtime.onMessage.addListener(async (request) => {
    switch (request.action) {
        case "setSpeed": {
            const speed = await applySpeed(request.speed);
            return speed === null ? { status: "invalid speed" } : { status: "success", speed };
        }
        case "stepSpeed": {
            const video = findVideoElement();
            const current = video ? video.playbackRate : await readStoredSpeed();
            const speed = await applySpeed(current + Number(request.delta || 0));
            return speed === null ? { status: "invalid speed" } : { status: "success", speed };
        }
        case "getSpeed": {
            const video = findVideoElement();
            return { speed: video ? video.playbackRate : await readStoredSpeed() };
        }
        case "resetSpeed":
            return { status: "reset to default", speed: await applySpeed(DEFAULT_SPEED) };
        default:
            return undefined;
    }
});

// YouTube replaces or reuses the video element on navigation, ads and player
// rebuilds, and its own player resets the rate. Re-apply on every new media.
document.addEventListener("loadedmetadata", (event) => {
    if (event.target instanceof HTMLVideoElement) restoreSpeed();
}, true);

// The script can be injected after the first metadata event already fired, so
// poll briefly (never forever) until a playable video shows up.
(function syncWhenVideoAppears() {
    let attempts = 0;
    const check = () => {
        const video = findVideoElement();
        if (video && video.readyState >= 1) {
            restoreSpeed();
            return;
        }
        if (++attempts > 40) return; // give up after ~20s; loadedmetadata covers the rest
        setTimeout(check, 500);
    };
    check();
})();
