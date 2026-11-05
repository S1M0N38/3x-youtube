const MIN_SPEED = 0.1;
const MAX_SPEED = 16;

document.addEventListener("DOMContentLoaded", async () => {
    const speedInput = document.getElementById("speedInput");
    const setSpeedButton = document.getElementById("setSpeed");
    const resetSpeedButton = document.getElementById("resetSpeed");
    const speedButtons = document.querySelectorAll(".speed-option");
    const currentSpeedDisplay = document.getElementById("currentSpeed");
    const status = document.getElementById("status");

    // The limits live in one place; mirror them onto the input.
    speedInput.min = String(MIN_SPEED);
    speedInput.max = String(MAX_SPEED);

    const setStatus = (message) => { status.textContent = message || ""; };
    const formatSpeed = (speed) => `${Number.parseFloat(Number(speed).toFixed(2))}x`;

    function updateCurrentSpeed(speed) {
        currentSpeedDisplay.textContent = speed === null ? "—" : formatSpeed(speed);
    }

    function parseSpeed(value) {
        const speed = Number.parseFloat(value);
        return Number.isFinite(speed) ? speed : null;
    }

    async function sendToVideo(message) {
        try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (!tab || tab.id === undefined) return { error: "no active tab" };
            return { response: await browser.tabs.sendMessage(tab.id, message) };
        } catch (error) {
            return { error: error.message };
        }
    }

    // Applying the user specified custom playback speed.
    async function applySpeed(value) {
        const speed = parseSpeed(value);
        if (speed === null || speed < MIN_SPEED || speed > MAX_SPEED) {
            setStatus(`Choose a speed between ${MIN_SPEED}x and ${MAX_SPEED}x`);
            return;
        }
        setStatus("");

        const { response, error } = await sendToVideo({ action: "setSpeed", speed });
        if (error) {
            setStatus("Open a YouTube video tab to change the speed");
            return;
        }
        if (response && Number.isFinite(Number(response.speed))) {
            speedInput.value = String(response.speed);
            updateCurrentSpeed(response.speed);
        }
    }

    // Show the live speed, or the remembered one when no video is in reach.
    const { response, error } = await sendToVideo({ action: "getSpeed" });
    if (error) {
        let stored = null;
        try {
            const { speed } = await browser.storage.local.get("speed");
            stored = Number.isFinite(Number(speed)) && speed !== null ? Number(speed) : null;
        } catch (storageError) {
            stored = null;
        }
        updateCurrentSpeed(stored);
        setStatus("No YouTube tab in focus — open a video to apply a speed");
    } else if (response && Number.isFinite(Number(response.speed))) {
        updateCurrentSpeed(response.speed);
    } else {
        updateCurrentSpeed(null);
    }

    resetSpeedButton.addEventListener("click", () => applySpeed(1));

    setSpeedButton.addEventListener("click", () => applySpeed(speedInput.value));

    speedInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") applySpeed(speedInput.value);
    });

    speedInput.addEventListener("input", () => {
        if (parseSpeed(speedInput.value) !== null) setStatus("");
    });

    // Pre-defined custom speeds.
    speedButtons.forEach((button) => {
        button.addEventListener("click", () => {
            speedInput.value = button.dataset.speed;
            applySpeed(button.dataset.speed);
        });
    });

    // Live updates from the content script and the keyboard shortcuts.
    browser.runtime.onMessage.addListener((request) => {
        if (request.action === "updateSpeed") updateCurrentSpeed(request.speed);
    });
});
