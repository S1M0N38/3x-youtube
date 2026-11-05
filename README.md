## 3xYouTube

YouTube caps its own speed menu at 2x and keeps 3x behind Premium. This
extension replaces that row in the player's settings menu with an equivalent
one that goes up to 3x, and it remembers the speed you pick.

![Playback speed panel](docs/panel.jpg)

## Features

- **Speed panel in the player**: gear menu → *Playback speed*, with a slider
  from 0.25x to 3x and the presets 1.0 · 1.25 · 1.5 · 1.75 · 2.0 · 2.25 · 2.5.
- **Remembers your speed** and re-applies it to every video, including after
  navigating and when the player is rebuilt.
- **Keyboard shortcuts**: <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd>
  step by 0.25x and show the new speed over the video.

## Install

1. Open `about:debugging#/runtime/this-firefox`.
2. Click *Load Temporary Add-on…* and select `3xYouTube/firefox/manifest.json`.
3. Reload the YouTube tab.

Repeat step 2 after restarting the browser, or use
[web-ext](https://github.com/mozilla/web-ext) so the extension reloads while you
edit the source:

```sh
npx web-ext run --source-dir 3xYouTube/firefox
```

A permanent install needs an XPI signed by
[addons.mozilla.org](https://addons.mozilla.org/developers/). Requires
Firefox 142+.

## Usage

Open the player's gear menu and choose *Playback speed*, then drag the slider,
press ⊖/⊕ (±0.25x) or pick a preset; *‹* goes back to the menu. The chosen speed
is stored locally and re-applied to the next video.
