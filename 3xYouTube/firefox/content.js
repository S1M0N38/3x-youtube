// 3xYouTube content script: applies the chosen playback rate to YouTube's
// video element, remembers it, re-applies it on every new video, and puts a
// native looking speed control inside the player's settings menu.

const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.1;
const MAX_SPEED = 3;

// The in-player slider runs 0.25x-3x, which is what YouTube gates behind
// Premium. The toolbar popup uses the same range.
const PANEL_MIN = 0.25;
const PANEL_MAX = MAX_SPEED;
const PANEL_STEP = 0.05;
const PANEL_BUTTON_STEP = 0.25;
const PANEL_CHIPS = [1, 1.25, 1.5, 2, 2.25, 2.5, 3];

const findVideoElement = () => document.querySelector("video");
const clampSpeed = (value) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));

// Returns a usable speed or null for anything that is not a finite number.
function toSpeed(value) {
    const speed = Number(value);
    if (!Number.isFinite(speed)) return null;
    return clampSpeed(speed);
}

function formatSpeed(speed) {
    return `${Number.parseFloat(Number(speed).toFixed(2))}x`;
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

// Applies the speed to the current video, mirrors it into the player UI and,
// unless told otherwise, remembers it as the preferred speed.
async function applySpeed(value, persist = true) {
    const speed = toSpeed(value);
    if (speed === null) return null;

    const video = findVideoElement();
    if (video) video.playbackRate = speed;
    if (persist) await storeSpeed(speed);
    updatePlayerUi(speed);
    return speed;
}

// Re-applies the remembered speed to whatever video YouTube is showing now.
async function restoreSpeed() {
    const speed = await readStoredSpeed();
    if (speed === DEFAULT_SPEED) {
        updatePlayerUi(DEFAULT_SPEED);
        return;
    }

    const video = findVideoElement();
    if (!video) return;

    if (Math.abs(video.playbackRate - speed) > 0.001) video.playbackRate = speed;
    updatePlayerUi(speed);
}

// The keyboard shortcuts are the only other caller.
browser.runtime.onMessage.addListener(async (request) => {
    const video = findVideoElement();
    switch (request.action) {
        case "stepSpeed": {
            const current = video ? video.playbackRate : await readStoredSpeed();
            return { status: "success", speed: await applySpeed(current + Number(request.delta || 0)) };
        }
        case "resetSpeed":
            return { status: "reset to default", speed: await applySpeed(DEFAULT_SPEED) };
        default:
            return undefined;
    }
});

// ---------------------------------------------------------------------------
// In-player control: a "Playback speed" row in the gear menu that opens a
// panel modelled on YouTube's own (but not capped at 2x / Premium).
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

function createElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === "class") el.className = value;
        else if (key === "text") el.textContent = value;
        else if (key === "dataset") Object.assign(el.dataset, value);
        else if (key === "attrs") for (const [a, v] of Object.entries(value)) el.setAttribute(a, v);
        else el[key] = value;
    }
    for (const child of children) el.append(child);
    return el;
}

function createIcon(pathData, size = 24) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
    return svg;
}

const ICON_BACK = "M15.41 7.41 14 6l-6 6 6 6 6-6-1.41-1.41L15.41 12z";
const ICON_MINUS = "M19 13H5v-2h14v2z";
const ICON_PLUS = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";

let panel = null;
let panelTitle = "Playback speed";
let settingsItem = null;
let syncQueued = false;

function playerRoot() {
    return document.querySelector("#movie_player") || document.body;
}

function chipMatches(chipSpeed, speed) {
    return Math.abs(chipSpeed - speed) < 0.001;
}

function buildPanel() {
    const value = createElement("div", { class: "yt3x-value", text: "1.00x" });

    const slider = createElement("input", {
        class: "yt3x-slider",
        id: "yt3x-slider",
        type: "range",
        min: String(PANEL_MIN),
        max: String(PANEL_MAX),
        step: String(PANEL_STEP),
        attrs: { "aria-label": "Playback speed" },
    });
    // Applying on every input keeps dragging smooth; only the final value is
    // persisted, so a drag does not hammer storage.
    slider.addEventListener("input", () => applySpeed(Number(slider.value), false));
    slider.addEventListener("change", () => applySpeed(Number(slider.value), true));

    const minus = createElement("button", {
        class: "yt3x-round", type: "button", attrs: { "aria-label": "Slower" },
    }, [createIcon(ICON_MINUS)]);
    const plus = createElement("button", {
        class: "yt3x-round", type: "button", attrs: { "aria-label": "Faster" },
    }, [createIcon(ICON_PLUS)]);

    const step = (direction) => {
        const video = findVideoElement();
        const current = video ? video.playbackRate : PANEL_MIN;
        const next = Math.min(PANEL_MAX, Math.max(PANEL_MIN, current + direction * PANEL_BUTTON_STEP));
        applySpeed(next);
    };
    minus.addEventListener("click", () => step(-1));
    plus.addEventListener("click", () => step(1));

    const chips = createElement("div", { class: "yt3x-chips" });
    for (const speed of PANEL_CHIPS) {
        const chip = createElement("button", {
            class: "yt3x-chip", type: "button",
            text: speed === 1 ? "1.0" : String(speed),
            dataset: { speed: String(speed) },
            attrs: { "aria-pressed": "false" },
        });
        chip.addEventListener("click", () => applySpeed(speed));
        chips.append(chip);
    }

    const back = createElement("button", {
        class: "yt3x-back", type: "button", attrs: { "aria-label": "Back" },
    }, [createIcon(ICON_BACK, 26)]);
    back.addEventListener("click", () => closePanel());

    const title = createElement("span", { class: "yt3x-title", text: panelTitle });

    const el = createElement("div", {
        id: "yt3x-panel",
        attrs: { role: "dialog", "aria-label": "Playback speed" },
    }, [
        createElement("div", { class: "yt3x-header" }, [back, title]),
        value,
        createElement("div", { class: "yt3x-row" }, [minus, slider, plus]),
        chips,
    ]);
    el.hidden = true;
    el._yt3x = { value, slider, minus, plus, chips, title };

    // Clicks inside the panel must not pause/seek the video underneath.
    for (const type of ["click", "dblclick", "pointerdown", "mousedown"]) {
        el.addEventListener(type, (event) => event.stopPropagation());
    }
    return el;
}

function ensurePanel() {
    if (!panel || !panel.isConnected) {
        panel = buildPanel();
        playerRoot().append(panel);
        updatePlayerUi(findVideoElement()?.playbackRate ?? DEFAULT_SPEED);
    }
    return panel;
}

function nativeMenu() {
    return document.querySelector(".ytp-settings-menu");
}

function closePanel() {
    if (panel) panel.hidden = true;
    nativeMenu()?.classList.remove("yt3x-hidden");
    if (settingsItem) settingsItem.focus({ preventScroll: true });
}

function openPanel() {
    const el = ensurePanel();
    nativeMenu()?.classList.add("yt3x-hidden");
    updatePlayerUi(findVideoElement()?.playbackRate ?? DEFAULT_SPEED);
    el.hidden = false;
    el._yt3x.slider.focus({ preventScroll: true });
}

function onDocumentPointerDown(event) {
    if (!panel || panel.hidden) return;
    if (panel.contains(event.target)) return;
    closePanel();
}

function onDocumentKeyDown(event) {
    if (event.key === "Escape" && panel && !panel.hidden) {
        event.stopPropagation();
        closePanel();
    }
}

function updatePlayerUi(speed) {
    const itemContent = settingsItem?.querySelector(".ytp-menuitem-content");
    if (itemContent) itemContent.textContent = speed === 1 ? "Normal" : formatSpeed(speed);

    if (!panel || !panel.isConnected) return;
    const { value, slider, minus, plus, chips, title } = panel._yt3x;

    title.textContent = panelTitle;
    value.textContent = `${Number(speed).toFixed(2)}x`;

    const sliderValue = Math.min(PANEL_MAX, Math.max(PANEL_MIN, speed));
    slider.value = String(sliderValue);
    const fill = ((sliderValue - PANEL_MIN) / (PANEL_MAX - PANEL_MIN)) * 100;
    slider.style.setProperty("--yt3x-fill", `${fill}%`);

    minus.disabled = speed <= PANEL_MIN;
    plus.disabled = speed >= PANEL_MAX;
    for (const chip of chips.children) {
        const chipSpeed = Number(chip.dataset.speed);
        chip.setAttribute("aria-pressed", chipMatches(chipSpeed, speed) ? "true" : "false");
    }

}

function isSpeedRow(el) {
    const content = el.querySelector(".ytp-menuitem-content")?.textContent?.trim() ?? "";
    if (/^[\d.,]+\s*x$/i.test(content)) return true;
    const label = el.querySelector(".ytp-menuitem-label")?.textContent?.trim() ?? "";
    return /playback speed|wiedergabegeschwindigkeit|vitesse de lecture|velocidad de reproducci|velocità di riproduzione|velocidade de reprodu|afspeelsnelheid|szybkość odtwarzania|скорость воспроизведения|再生速度|재생 속도/i.test(label);
}

function buildSettingsItem() {
    return createElement("div", {
        class: "ytp-menuitem",
        id: "yt3x-menuitem",
        attrs: { role: "menuitem", tabindex: "0" },
    }, [
        createElement("div", { class: "ytp-menuitem-icon" }),
        createElement("div", { class: "ytp-menuitem-label", text: panelTitle }),
        createElement("div", { class: "ytp-menuitem-content", text: "Normal" }),
    ]);
}

function attachSettingsItemHandlers(item) {
    item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPanel();
    });
    item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            openPanel();
        }
    });
}

// YouTube rebuilds the settings menu on every open, so re-inject ours whenever
// the menu is (re)rendered, and keep its value in sync.
function syncSettingsItem() {
    syncQueued = false;
    const menu = document.querySelector(".ytp-settings-menu");
    if (!menu) return;

    if (!panel || !panel.isConnected) ensurePanel();

    const root = menu.querySelector(".ytp-panel-menu");
    if (!root) return;

    const rows = [...root.querySelectorAll(".ytp-menuitem")].filter((el) => el.id !== "yt3x-menuitem");
    const nativeRow = rows.find(isSpeedRow) ?? null;

    if (nativeRow) {
        panelTitle = nativeRow.querySelector(".ytp-menuitem-label")?.textContent?.trim() || panelTitle;
        nativeRow.classList.add("yt3x-hidden");
        nativeRow.setAttribute("aria-hidden", "true");
    }

    const existing = root.querySelector("#yt3x-menuitem");
    if (existing) {
        settingsItem = existing;
    } else {
        settingsItem = buildSettingsItem();
        attachSettingsItemHandlers(settingsItem);
        if (nativeRow) nativeRow.parentNode.insertBefore(settingsItem, nativeRow);
        else root.append(settingsItem);
    }

    // Keep our row where YouTube's own speed row is, even after the menu is
    // rebuilt or reordered on a later open.
    if (nativeRow && settingsItem.nextElementSibling !== nativeRow) {
        nativeRow.parentNode.insertBefore(settingsItem, nativeRow);
    }

    updatePlayerUi(findVideoElement()?.playbackRate ?? DEFAULT_SPEED);

    if (panel && !panel.hidden && playerRoot().classList.contains("ytp-autohide")) closePanel();
}

function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(syncSettingsItem);
}

const playerObserver = new MutationObserver(scheduleSync);
playerObserver.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener("pointerdown", onDocumentPointerDown, true);
document.addEventListener("keydown", onDocumentKeyDown, true);

// Keep the UI truthful when the rate changes from anywhere (YouTube's own
// menu, the toolbar popup or the keyboard shortcuts).
document.addEventListener("ratechange", (event) => {
    if (event.target instanceof HTMLVideoElement) updatePlayerUi(event.target.playbackRate);
}, true);

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
            scheduleSync();
            return;
        }
        if (++attempts > 40) return; // give up after ~20s; loadedmetadata covers the rest
        setTimeout(check, 500);
    };
    check();
})();
