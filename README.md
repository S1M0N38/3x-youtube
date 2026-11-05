## 3xYouTube

> This extension started as a fork of [nathvnt/3x-youtube](https://github.com/nathvnt/3x-youtube) and evolve a lot since then. Big thanks to the original author :)

YouTube caps its own speed menu at 2x and keeps 3x behind Premium. This
extension replaces that row in the player's settings menu with an equivalent
one that goes up to 3x, and it remembers the speed you pick.

<p align="center">
  <img width="540" height="415" alt="playback speed screenshot" src="https://github.com/user-attachments/assets/77f3d1fe-390b-4c0f-a747-a62d01a8a662" />
</p>


## Features

- **Speed panel in the player**: gear menu → *Playback speed*, with a slider
  from 0.25x to 3x and the presets from 1.0 to 2.5.
- **Remembers your speed** and re-applies it to every video, including after
  navigating and when the player is rebuilt.
- **Keyboard shortcuts**: <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd>
  step by 0.25x and show the new speed over the video.

## Install

1. Open `about:debugging#/runtime/this-firefox`.
2. Click *Load Temporary Add-on…* and select `3xYouTube/firefox/manifest.json`.
3. Reload the YouTube tab.
