# YouTube Helper Module

## Description

The YouTube Helper module enhances your viewing experience on YouTube by providing tools to customize the player interface.

This module operates under the global extension power switch and has its own dedicated power toggle in the extension popup.

## Features

* **Remove End-of-Video Suggestions:** Automatically removes the grid of suggested videos that appears over the player at the end of a video, allowing you to see the final frames of the content without obstruction.

## Configuration

All settings for the YouTube Helper module are accessible via the main extension popup, under the "YouTube Helper" tab:

* **YouTube Helper Power:** Enables or disables all functionalities of the YouTube Helper module. This is dependent on the global "Extension Power (All)" switch.
* **Remove Video Suggestions:** Toggles the automatic removal of the video suggestion overlay on the YouTube player.

## How It Works

1.  **Settings & Initialization:** User settings are loaded from storage. The main background script initializes the YouTube module.
2.  **Content Script Interaction:**
    * On YouTube watch pages (`youtubePlayerPage.js`), the script monitors the video player. If the "Remove Video Suggestions" feature is enabled, it will watch for when the suggestion elements (`.ytp-ce-element`) are added to the page and promptly remove them.
3.  **Status Updates:** The popup UI reflects the current operational status of the YouTube module.