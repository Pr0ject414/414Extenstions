# 414 Extensions (Kyle's Chrome Extensions)

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](414Extensions/LICENSE_GPLv3_youtube_auto_hd.txt)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**414 Extensions** is a modular, high-performance Chromium extension (Manifest V3) that bundles automation, interface decluttering, media enhancements, and transparency tools for everyday web browsing. 

All modules operate under a centralized background coordinator with a global master switch, per-module toggles, and popup customization.

---

## 🚀 Features & Modules

### 1. 𝕏 (Twitter) Helper & Location Transparency
* **Account Location & Device Transparency:** Identifies where an account is based using X's official GraphQL `AboutAccountQuery` transparency metadata.
* **Country Flags & Platform Badges:** Injects official Twemoji SVG country flags and device icons (iOS, Android, Web/Browser) beside account handles in tweets and user cells.
* **Hovercard Dossier:** Hover over the info icon next to any badge to see an account dossier containing country of origin, posting device, account creation date, and rest ID.
* **Feed Geo-Filtering / Country Blocking:** Select countries in the extension popup to automatically hide matching posts from your timeline in real time.
* **Dual-Tier Caching:** Combines a local LRU storage cache (`chrome.storage.local`) with an asynchronous community Cloudflare Worker cache to avoid platform rate limits.
* **Always-Mute Video Enforcement:** Ensures X videos always start muted. Intercepts clicks on video bodies to play/pause rather than triggering X's default click-to-unmute behavior.
* **Video & HLS Stream Downloader:** Right-click videos to download direct MP4s or automatically stitch multi-fragment M3U8 (HLS fMP4) playlists into a single playable MP4 file.

### 2. 📺 YouTube Helper
* **Auto HD Quality Selector:** Automatically selects and enforces your preferred playback quality (up to 8K / 4320p), with support for Enhanced Bitrate (1080p Premium) and Super Resolution.
* **End-of-Video Suggestion Remover:** Removes obstructive suggestion overlays (`.ytp-ce-element`) that appear during the final seconds of videos.

### 3. ⏩ Video Speed Controller (VSC)
* **HTML5 Playback Speed Control:** Speed up, slow down, advance, and rewind any HTML5 video using configurable keyboard shortcuts (`s`, `d`, `r`, `g`, `z`, `x`, `v`).
* **Visual On-Screen Indicator:** Real-time speed overlay HUD on video players.
* **Site Persistence & Blacklists:** Remembers playback speeds per domain or enforces a global fallback speed. Includes customizable blacklist support (domains or regexes).
* **Audio Pitch Support:** Preserves natural audio pitch when speeding up or slowing down playback.

### 4. 🔊 Volume Booster
* **Up to 600% Audio Boost:** Boosts tab audio up to 6x (600%) using Web Audio API `AudioContext` gain nodes.
* **Shadow DOM & Dynamic Element Piercing:** Intercepts audio across shadow roots, nested iframes, and dynamic media elements.
* **Per-Domain Persistence:** Automatically saves and restores custom volume levels for specific websites.

### 5. 🛍️ FAB Helper (Epic Games / Unreal Engine Marketplace)
* **Hide Owned Items:** Automatically hides owned/claimed assets on Fab browse and search pages to reduce catalog clutter.
* **Auto-Open Free Promotional Assets:** Detects free promotional items (e.g., monthly free assets) and opens their product pages in background tabs.
* **Auto-Claim Free Licenses:** Automatically detects and claims free licenses on product listing pages.
* **Verification Queue & Rate Limit Guard:** Verifies library ownership after tab closing, backs off automatically upon encountering rate limits, and pauses processing if verification fails.

### 6. 🍿 Crunchyroll Helper
* **Auto-Close Recommendation Carousels:** Automatically closes the full-screen recommendations carousel modal after an episode ends when no unwatched episodes remain.
* **Hide Controls on Speed:** Automatically hides on-screen player controls when playing at accelerated speeds to provide an unobstructed viewing experience.

---

## 🛠️ Architecture

* **Manifest V3 Compliant:** Uses ES modules in background service workers, fine-grained alarms, and isolated content scripts.
* **Dual Execution Worlds:** Leverages `world: "MAIN"` for prototype hijacking (e.g., audio gain nodes, video muted/volume interception, GraphQL header sniffing) and `world: "ISOLATED"` for DOM observation and secure Chrome API access.
* **Modular Coordinator Pattern:** Centralized event router (`moduleManager.js`) and persistent state manager (`appState.js`) coordinates message delivery across all individual feature modules.

---

## 📦 Installation & Development

### Load in Google Chrome / Brave / Edge:
1. Clone or download this repository:
   ```bash
   git clone https://github.com/Pr0ject414/414Extenstions.git
   ```
2. Open your browser and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `414Extensions` directory.

### Running Tests:
```bash
npm install
npm test
```
*(Runs Jest tests with Node experimental VM modules enabled for ES Modules support).*

---

## 📜 Third-Party Attributions & Open Source Credits

This project incorporates and builds upon several outstanding open-source projects. We gratefully acknowledge and credit the original authors:

| Component / Feature | Original Project | Author / Maintainer | Upstream License | Description |
| :--- | :--- | :--- | :--- | :--- |
| **YouTube Auto HD** | [avi12/youtube-auto-hd](https://github.com/avi12/youtube-auto-hd) | Avi Levin ([@avi12](https://github.com/avi12)) | **GPL-3.0** | Automatic quality enforcement up to 8K, Enhanced Bitrate & Super Resolution logic. Full license text preserved in [LICENSE_GPLv3_youtube_auto_hd.txt](414Extensions/LICENSE_GPLv3_youtube_auto_hd.txt). |
| **X Account Location & Device Info** | [xaitax/x-account-location-device](https://github.com/xaitax/x-account-location-device) | Alexander Hagenah ([@xaitax](https://github.com/xaitax)) | **MIT** | X GraphQL `AboutAccountQuery` extraction, Cloudflare Worker cloud cache client, country flag mapping, and device badges. |
| **Video Speed Controller** | [igrigorik/videospeed](https://github.com/igrigorik/videospeed) | Ilya Grigorik ([@igrigorik](https://github.com/igrigorik)) | **MIT** | HTML5 video speed controller overlay HUD, keyboard shortcuts, rate persistence, and blacklist management. |
| **Twemoji Flag SVGs** | [twitter/twemoji](https://github.com/twitter/twemoji) | Twitter / X Open Source | **CC-BY 4.0** | Vector country flags loaded dynamically via official CDN endpoints (`abs-0.twimg.com/emoji/v2/svg/`). |

All original modules (FAB Helper, Crunchyroll Helper, Volume Booster, X Video Downloader & click-interceptor, and the Unified Extension Coordinator) are authored by **Kyle / Pr0ject414**.

---

## ⚖️ Licensing

* The **YouTube Auto HD** component is licensed under the **GNU General Public License v3.0 (GPLv3)**. See [LICENSE_GPLv3_youtube_auto_hd.txt](414Extensions/LICENSE_GPLv3_youtube_auto_hd.txt) for the complete text.
* The **Video Speed Controller** and **X-Posed Location/Device** components are licensed under the **MIT License**.
* All original code written for this extension suite is released under the **MIT License** unless otherwise required by upstream copyleft licenses.

---

## ⚠️ Disclaimer

This extension is an independent project and is not affiliated with, endorsed by, or sponsored by Epic Games, Google/YouTube, X Corp. (Twitter), or Crunchyroll. All trademarks and brand names belong to their respective owners.
