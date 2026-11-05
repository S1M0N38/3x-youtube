## 3x YouTube Browser Extension

***3x YouTube*** is software that locates
a video element being rendered on any webpage
(designed to target YouTube videos) and modifies
the HTMLMediaElement playbackRate property
with a custom value specified through the
browser extensions user interface. <br/>

By default YouTube has a limit of 2x default speed
when setting custom a playback rate for a video.
This browser extension allows users to easily set custom
playback speeds of anywhere between 0.1x and 16x. <br/>

The chosen speed is remembered and re-applied on every
new video, and it can also be changed without opening
the popup:

| Shortcut | Action |
| --- | --- |
| <kbd>Alt</kbd>+<kbd>↑</kbd> | faster by 0.25x |
| <kbd>Alt</kbd>+<kbd>↓</kbd> | slower by 0.25x |
| <kbd>Alt</kbd>+<kbd>0</kbd> | back to 1x |

## Browser Compatibility

This repository contains a single build, in `3xYouTube/firefox`,
which utilizes Manifest V2 and is designed to work with Firefox
(and Firefox based browsers).

Available for FireFox here: [https://addons.mozilla.org/en-US/firefox/addon/3xyoutube/](https://addons.mozilla.org/en-US/firefox/addon/3xyoutube/)

## Installation

### Option 1 — load it once per session

1. Open `about:debugging#/runtime/this-firefox`.
2. Click *Load Temporary Add-on…* and select `3xYouTube/firefox/manifest.json`.
3. The extension is active until Firefox restarts; repeat after every restart.

### Option 2 — run it with web-ext (auto-reloads when you edit the source)

```sh
npx web-ext run --source-dir 3xYouTube/firefox
```

On a Firefox fork, point it at that binary instead, for example Zen:

```sh
npx web-ext run --source-dir 3xYouTube/firefox \
  --firefox /Applications/Zen.app/Contents/MacOS/zen
```

Either way the extension is installed into a throwaway profile, so your
day-to-day profile stays untouched.

> A permanent install needs the XPI signed by
> [addons.mozilla.org](https://addons.mozilla.org/developers/); release builds of
> Firefox refuse unsigned extensions
> (`xpinstall.signatures.required = false` only works on Nightly/Developer Edition).

## Usage

Open the toolbar popup on any YouTube video to read the current speed, pick a
preset, or type any value between 0.1x and 16x. *Reset to 1x* goes back to
normal speed. The value is stored locally (`storage.local`) and nothing leaves
your machine.
