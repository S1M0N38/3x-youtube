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
playback speeds of up to 11x the default value. <br/>

## Browser Compatibility 

This repository contains a single build, in `3xYouTube/firefox`,
which utilizes Manifest V2 and is designed to work with Firefox
(and Firefox based browsers).

Available for FireFox here: [https://addons.mozilla.org/en-US/firefox/addon/3xyoutube/](https://addons.mozilla.org/en-US/firefox/addon/3xyoutube/)

## Loading it locally

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose *Load Temporary Add-on…* and select `3xYouTube/firefox/manifest.json`.

Or run it with [web-ext](https://github.com/mozilla/web-ext):
`npx web-ext run --source-dir 3xYouTube/firefox`
