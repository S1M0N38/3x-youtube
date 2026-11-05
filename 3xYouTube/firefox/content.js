// 3xYouTube content script.
//
// Applies a playback rate between 0.25x and 3x to YouTube's video element,
// remembers it, re-applies it to every new video, and replaces the player's own
// "Playback speed" row with one that is not capped at 2x.

const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.25;
const MAX_SPEED = 3;
const SLIDER_STEP = 0.05;   // fine control while dragging
const BUTTON_STEP = 0.25;   // the -/+ buttons and the keyboard shortcuts
const PRESETS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const STORAGE_KEY = "speed";
const OSD_VISIBLE_MS = 1200;

const findVideoElement = () => document.querySelector("video");

// Compact form used in the menu row: 1 -> "1x", 1.25 -> "1.25x".
function formatSpeed(speed) {
    return `${Number.parseFloat(Number(speed).toFixed(2))}x`;
}

// Fixed form used in the panel readout: 1 -> "1.00x".
function formatSpeedFixed(speed) {
    return `${Number(speed).toFixed(2)}x`;
}

// Returns a usable speed, or null for anything that is not a finite number.
function toSpeed(value) {
    const speed = Number(value);
    if (!Number.isFinite(speed)) return null;
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

async function readStoredSpeed() {
    try {
        const { [STORAGE_KEY]: stored } = await browser.storage.local.get(STORAGE_KEY);
        return toSpeed(stored) ?? DEFAULT_SPEED;
    } catch (error) {
        return DEFAULT_SPEED;
    }
}

async function storeSpeed(speed) {
    try {
        await browser.storage.local.set({ [STORAGE_KEY]: speed });
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

    const video = findVideoElement();
    if (video && speed !== DEFAULT_SPEED && Math.abs(video.playbackRate - speed) > 0.001) {
        video.playbackRate = speed;
    }
    updatePlayerUi(speed);
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_MINUS = "M19 13H5v-2h14v2z";
const ICON_PLUS = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";

function createElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === "class") el.className = value;
        else if (key === "text") el.textContent = value;
        else if (key === "dataset") Object.assign(el.dataset, value);
        else if (key === "attrs") for (const [name, v] of Object.entries(value)) el.setAttribute(name, v);
        else el[key] = value;
    }
    for (const child of children) el.append(child);
    return el;
}

// YouTube's own back-button background, copied so the chevron matches exactly.
const BACK_ARROW_SVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZmlsbD0iI2ZmZiIgZD0ibTE5LjQxIDIwLjA5LTQuNTgtNC41OSA0LjU4LTQuNTlMMTggOS41bC02IDYgNiA2eiIvPjwvc3ZnPg==";

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

function playerRoot() {
    return document.querySelector("#movie_player") || document.body;
}

function nativeSettingsMenu() {
    return document.querySelector(".ytp-settings-menu");
}

// ---------------------------------------------------------------------------
// In-player panel (styled like YouTube's own speed panel)
// ---------------------------------------------------------------------------

let panel = null;
let panelParts = null;   // { value, slider, minus, plus, chips, title }
let osd = null;
let osdParts = null;     // { label, value }
let osdTimer = null;
let settingsItem = null;
let syncQueued = false;
let panelTitle = "Playback speed";   // taken from YouTube's own row, so it is localised

function buildPanel() {
    const value = createElement("div", { class: "yt3x-value", text: formatSpeedFixed(DEFAULT_SPEED) });

    const slider = createElement("input", {
        class: "yt3x-slider",
        type: "range",
        min: String(MIN_SPEED),
        max: String(MAX_SPEED),
        step: String(SLIDER_STEP),
        attrs: { "aria-label": "Playback speed" },
    });
    // Applying on every input keeps dragging smooth; only the final value is
    // persisted, so a drag does not hammer storage.
    slider.addEventListener("input", () => applySpeed(Number(slider.value), false));
    slider.addEventListener("change", () => applySpeed(Number(slider.value)));

    const minus = createElement("button", {
        class: "yt3x-round", type: "button", attrs: { "aria-label": "Slower" },
    }, [createIcon(ICON_MINUS)]);
    const plus = createElement("button", {
        class: "yt3x-round", type: "button", attrs: { "aria-label": "Faster" },
    }, [createIcon(ICON_PLUS)]);

    const stepBy = (direction) => {
        const video = findVideoElement();
        const current = video ? video.playbackRate : DEFAULT_SPEED;
        applySpeed(current + direction * BUTTON_STEP);
    };
    minus.addEventListener("click", () => stepBy(-1));
    plus.addEventListener("click", () => stepBy(1));

    const chips = createElement("div", { class: "yt3x-chips" });
    for (const speed of PRESETS) {
        const chip = createElement("button", {
            class: "yt3x-chip",
            type: "button",
            text: Number.isInteger(speed) ? speed.toFixed(1) : String(speed),
            dataset: { speed: String(speed) },
            attrs: { "aria-pressed": "false" },
        });
        chip.addEventListener("click", () => applySpeed(speed));
        chips.append(chip);
    }

    const back = createElement("button", {
        class: "yt3x-back", type: "button", attrs: { "aria-label": "Back" },
    });
    back.style.backgroundImage = `url("${BACK_ARROW_SVG}")`;
    back.addEventListener("click", () => closePanel());

    const title = createElement("span", { class: "yt3x-title", text: panelTitle });

    const el = createElement("div", {
        id: "yt3x-panel",
        // focus lands here on open so the slider does not flash its focus ring;
        // Tab still reaches the controls in order
        attrs: { role: "dialog", "aria-label": "Playback speed", tabindex: "-1" },
    }, [
        createElement("div", { class: "yt3x-header" }, [back, title]),
        value,
        createElement("div", { class: "yt3x-row" }, [minus, slider, plus]),
        chips,
    ]);
    el.hidden = true;

    // Clicks inside the panel must not pause/seek the video underneath.
    for (const type of ["click", "dblclick", "pointerdown", "mousedown"]) {
        el.addEventListener(type, (event) => event.stopPropagation());
    }

    panelParts = { value, slider, minus, plus, chips, title };
    return el;
}

function ensurePanel() {
    if (!panel || !panel.isConnected) {
        panel = buildPanel();
        playerRoot().append(panel);
    }
    return panel;
}

function openPanel() {
    ensurePanel();
    nativeSettingsMenu()?.classList.add("yt3x-hidden");
    updatePlayerUi(findVideoElement()?.playbackRate ?? DEFAULT_SPEED);
    panel.hidden = false;
    panel.focus({ preventScroll: true });
}

function closePanel() {
    if (panel) panel.hidden = true;
    nativeSettingsMenu()?.classList.remove("yt3x-hidden");
    if (settingsItem) settingsItem.focus({ preventScroll: true });
}

function buildOsd() {
    const label = createElement("div", { class: "yt3x-osd-label", text: panelTitle });
    const value = createElement("div", { class: "yt3x-osd-value", text: formatSpeedFixed(DEFAULT_SPEED) });
    const el = createElement("div", {
        id: "yt3x-osd",
        attrs: { role: "status", "aria-live": "polite" },
        dataset: { visible: "false" },
    }, [label, value]);
    osdParts = { label, value };
    return el;
}

function ensureOsd() {
    if (!osd || !osd.isConnected) {
        osd = buildOsd();
        playerRoot().append(osd);
    }
    return osd;
}

// Big transient readout over the video, like YouTube's own shortcut overlays.
function showSpeedOsd(speed) {
    if (speed === null || speed === undefined) return;
    const el = ensureOsd();
    osdParts.label.textContent = panelTitle;
    osdParts.value.textContent = formatSpeedFixed(speed);
    el.dataset.visible = "true";
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => { el.dataset.visible = "false"; }, OSD_VISIBLE_MS);
}

// Mirrors a speed into the menu row and the panel, which stays in sync even
// while hidden so opening it never shows a stale value.
function updatePlayerUi(speed) {
    const rowContent = settingsItem?.querySelector(".ytp-menuitem-content");
    const rowText = speed === 1 ? "Normal" : formatSpeed(speed);
    if (rowContent && rowContent.textContent !== rowText) rowContent.textContent = rowText;

    ensurePanel();
    const { value, slider, minus, plus, chips, title } = panelParts;

    if (title.textContent !== panelTitle) title.textContent = panelTitle;
    value.textContent = formatSpeedFixed(speed);

    const sliderValue = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
    slider.value = String(sliderValue);
    const fillPercent = ((sliderValue - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
    slider.style.setProperty("--yt3x-fill", `${fillPercent}%`);

    minus.disabled = speed <= MIN_SPEED;
    plus.disabled = speed >= MAX_SPEED;

    for (const chip of chips.children) {
        const pressed = Math.abs(Number(chip.dataset.speed) - speed) < 0.001;
        const current = chip.getAttribute("aria-pressed") === "true";
        if (pressed !== current) chip.setAttribute("aria-pressed", String(pressed));
    }
}

// ---------------------------------------------------------------------------
// The gear-menu row
// ---------------------------------------------------------------------------

// YouTube labels the row differently per locale, so rely on the value it shows
// ("Normal", "2x", ...) and fall back to the label.
const SPEED_ROW_LABEL = /playback speed|wiedergabegeschwindigkeit|vitesse de lecture|velocidad de reproducci|velocità di riproduzione|velocidade de reprodu|afspeelsnelheid|szybkość odtwarzania|скорость воспроизведения|再生速度|재생 속도/i;
const SPEED_ROW_VALUE = /^[\d.,]+\s*x$/i;

function isSpeedRow(row) {
    const content = row.querySelector(".ytp-menuitem-content")?.textContent?.trim() ?? "";
    if (SPEED_ROW_VALUE.test(content)) return true;
    const label = row.querySelector(".ytp-menuitem-label")?.textContent?.trim() ?? "";
    return SPEED_ROW_LABEL.test(label);
}

// Our row is cloned before YouTube has necessarily filled in its icon, and the
// clone is reused afterwards, so the icon is copied over whenever it is missing.
function ensureRowIcon(row, nativeRow) {
    const cell = row.querySelector(".ytp-menuitem-icon");
    const icon = nativeRow?.querySelector(".ytp-menuitem-icon svg");
    if (!cell || !icon || cell.querySelector("svg")) return;
    cell.append(icon.cloneNode(true));
}

// Cloning YouTube's own row keeps its icon, chevron, cell widths and hover
// behaviour identical; only the label and value are replaced.
function buildSettingsItem(nativeRow) {
    const row = nativeRow
        ? nativeRow.cloneNode(true)
        : createElement("div", { class: "ytp-menuitem", attrs: { role: "menuitem", tabindex: "0" } }, [
            createElement("div", { class: "ytp-menuitem-icon" }),
            createElement("div", { class: "ytp-menuitem-label" }),
            createElement("div", { class: "ytp-menuitem-content" }),
        ]);

    row.id = "yt3x-menuitem";
    // the source row is hidden before it is cloned, so undo that on the copy
    row.classList.remove("yt3x-hidden");
    row.removeAttribute("aria-hidden");
    row.setAttribute("role", "menuitem");
    row.setAttribute("aria-haspopup", "true");
    row.setAttribute("tabindex", "0");

    const label = row.querySelector(".ytp-menuitem-label");
    if (label) label.textContent = panelTitle;
    const content = row.querySelector(".ytp-menuitem-content");
    if (content) content.textContent = "Normal";
    ensureRowIcon(row, nativeRow);
    return row;
}

function attachSettingsItemHandlers(item) {
    const activate = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPanel();
    };
    item.addEventListener("click", activate);
    item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") activate(event);
    });
}

// YouTube rebuilds the settings menu on every open, so ours is re-injected
// whenever that happens.
function syncSettingsItem() {
    syncQueued = false;

    const menu = nativeSettingsMenu();
    if (!menu) return;

    watchSettingsMenu(menu);
    ensurePanel();

    // YouTube reuses the very same panel when a sub-menu (Quality, Subtitles,
    // ...) opens, so we must stay out of it: drop our row and bail out.
    const submenuOpen = [...menu.querySelectorAll(".ytp-panel-header")]
        .some((header) => header.offsetHeight > 0);
    if (submenuOpen) {
        for (const stale of menu.querySelectorAll("#yt3x-menuitem")) stale.remove();
        settingsItem = null;
        return;
    }

    const root = menu.querySelector(".ytp-panel-menu");
    if (!root) return;

    const rows = [...root.querySelectorAll(".ytp-menuitem")].filter((row) => row.id !== "yt3x-menuitem");
    const nativeRow = rows.find(isSpeedRow) ?? null;

    if (nativeRow) {
        panelTitle = nativeRow.querySelector(".ytp-menuitem-label")?.textContent?.trim() || panelTitle;
        nativeRow.classList.add("yt3x-hidden");
        nativeRow.setAttribute("aria-hidden", "true");
    }

    const existing = root.querySelector("#yt3x-menuitem");
    if (existing) {
        settingsItem = existing;
        ensureRowIcon(settingsItem, nativeRow);
    } else {
        settingsItem = buildSettingsItem(nativeRow);
        attachSettingsItemHandlers(settingsItem);
        if (nativeRow) nativeRow.parentNode.insertBefore(settingsItem, nativeRow);
        else root.append(settingsItem);
    }

    // Keep our row exactly where YouTube's own row is, even if the menu was
    // rebuilt in a different order.
    if (nativeRow && settingsItem.nextElementSibling !== nativeRow) {
        nativeRow.parentNode.insertBefore(settingsItem, nativeRow);
    }

    updatePlayerUi(findVideoElement()?.playbackRate ?? DEFAULT_SPEED);
}

// Only react to mutations that actually touch the settings menu: YouTube
// mutates the page constantly and this observer must stay cheap.
function touchesSettingsMenu(records) {
    for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target && target.closest(".ytp-settings-menu")) return true;
        for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.classList.contains("ytp-settings-menu")) return true;
            if (node.querySelector(".ytp-settings-menu, .ytp-panel-menu, .ytp-menuitem")) return true;
        }
    }
    return false;
}

function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(syncSettingsItem);
}

const menuObserver = new MutationObserver((records) => {
    if (touchesSettingsMenu(records)) scheduleSync();
});
menuObserver.observe(document.documentElement, { childList: true, subtree: true });

// Opening/closing a sub-menu only flips classes and inline styles on the panel,
// which produces no childList mutations, so the menu element is watched too.
const menuStateObserver = new MutationObserver(() => scheduleSync());
let menuStateTarget = null;

function watchSettingsMenu(menu) {
    if (menu === menuStateTarget) return;
    menuStateObserver.disconnect();
    menuStateObserver.observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    menuStateTarget = menu;
}

// The player hides its controls after a moment of inactivity; do not leave the
// panel floating over a hidden control bar.
const autohideObserver = new MutationObserver(() => {
    if (panel && !panel.hidden && playerRoot().classList.contains("ytp-autohide")) closePanel();
});
let autohideTarget = null;
function watchAutohide() {
    const root = document.querySelector("#movie_player");
    if (!root || root === autohideTarget) return;
    autohideObserver.disconnect();
    autohideObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
    autohideTarget = root;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

document.addEventListener("pointerdown", (event) => {
    if (panel && !panel.hidden && !panel.contains(event.target)) closePanel();
}, true);

const SHORTCUT_KEYS = { ArrowUp: 1, ArrowDown: -1 };

function isEditable(element) {
    if (!(element instanceof Element)) return false;
    return element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
}

// Alt+Up / Alt+Down step the speed. This lives in the page (rather than in a
// browser command) because cancelling the key's default action is what stops
// the page from scrolling, and cancelling it would swallow the command too.
function stepSpeed(direction) {
    const video = findVideoElement();
    const current = video ? video.playbackRate : DEFAULT_SPEED;
    applySpeed(current + direction * BUTTON_STEP).then((speed) => showSpeedOsd(speed));
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel && !panel.hidden) {
        event.stopPropagation();
        closePanel();
        return;
    }

    const direction = SHORTCUT_KEYS[event.key];
    if (!direction || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditable(event.target)) return;

    event.preventDefault();
    stepSpeed(direction);
}, true);

// Keep the UI truthful when the rate changes from anywhere (YouTube's own
// menu or the keyboard shortcuts).
document.addEventListener("ratechange", (event) => {
    if (event.target instanceof HTMLVideoElement) updatePlayerUi(event.target.playbackRate);
}, true);

// YouTube replaces or reuses the video element on navigation, ads and player
// rebuilds, and its own player resets the rate. Re-apply to every new media.
document.addEventListener("loadedmetadata", (event) => {
    if (event.target instanceof HTMLVideoElement) restoreSpeed();
}, true);

// This script can be injected after the first metadata event already fired, so
// poll briefly (never forever) until a playable video shows up.
(function waitForVideo() {
    let attempts = 0;
    const check = () => {
        const video = findVideoElement();
        if (video && video.readyState >= 1) {
            watchAutohide();
            restoreSpeed();
            scheduleSync();
            return;
        }
        if (++attempts > 40) return; // ~20s, then rely on loadedmetadata
        setTimeout(check, 500);
    };
    check();
})();
