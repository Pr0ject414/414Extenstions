# FAB Helper Module (Epic Games Unreal Engine Marketplace)

## Description

The FAB Helper module provides a suite of tools to automate and enhance your experience on the **Epic Games Unreal Engine Marketplace (often referred to as 'Fab' in the context of its web presence or by the community, particularly related to its previous branding or URL structure)**. It helps manage free items, hide owned content, and streamline interactions with product listings.

This module operates under the global extension power switch and has its own dedicated power toggle in the extension popup.

## Features

* **Hide Owned Items:** Automatically hides items marked as "owned" or "in library" on the Unreal Engine Marketplace browse and search pages, decluttering your view.
* **Auto-Open Free Items:** Identifies items listed as "Free" on browse pages (e.g., monthly free assets) and automatically opens their product pages in background tabs for further processing by the Auto-Add feature. This has a grace period to avoid opening items you might quickly scroll past.
* **Auto-Add Free License:** On individual Unreal Engine Marketplace product pages, if a "Free" item (especially those like "Free for the Month") is detected, this feature attempts to automatically add it to your library/vault.
* **Item Verification:** After a product tab (opened by Auto-Open or manually) is closed, the module can verify if the item was successfully added to your library.
* **Suspension on Failure:** If verification fails (item not found in library after attempting to add), auto-processing features can be automatically suspended to prevent issues, requiring manual review.
* **Rate Limit Awareness:** The module respects global rate limits detected by the extension and pauses its operations accordingly. It also informs the background if it encounters specific rate-limiting scenarios during its operations.

## Configuration

All settings for the FAB Helper module are accessible via the main extension popup, under the "FAB Helper" tab:

* **FAB Helper Power:** Enables or disables all functionalities of the FAB Helper module. This switch is dependent on the global "Extension Power (All)" switch being on.
* **Hide Owned (Browse Pages):** Toggles the automatic hiding of owned items on pages where multiple products are listed.
* **Auto-Add Free License (Product Pages):** Toggles the automatic adding of free items when visiting a product page that offers one.
* **Auto-Open Free Items (Browse Pages):** Toggles the automatic opening of free items found on browse/search pages into new background tabs.

## Key Components

The FAB Helper module is internally structured as follows:

* **`fabBackground.js`:** The central script for all FAB-specific background logic. It coordinates FAB operations, manages FAB state, and handles communication with content scripts and the main extension coordinator.
* **`background_modules/`:**
    * `fabConstants.js`: Contains all constant values specific to FAB operations (e.g., storage keys, alarm names, processing parameters).
    * `fabState.js`: Manages the internal state of the FAB module (e.g., URL processing queues, item verification queues, suspension status).
    * `fabQueueManager.js`: Handles the logic for queuing URLs (e.g., free items to be opened) and processing this queue by opening tabs.
    * `fabVerification.js`: Manages the verification process for items, checking if they are owned after their tabs are closed.
* **`content_scripts/`:**
    * `fabBrowsePage.js`: Injected into Unreal Engine Marketplace browse, search, and category pages. Responsible for hiding owned items and implementing the "Auto-Open Free Items" feature.
    * `fabProductPage.js`: Injected into individual Unreal Engine Marketplace product listing pages. Responsible for the "Auto-Add Free License" feature.

## How It Works (Simplified)

1.  **Settings & Initialization:** User settings are loaded from storage. `fabBackground.js` initializes its components and alarms.
2.  **Content Script Interaction:**
    * On browse pages (`fabBrowsePage.js`): Scans for owned items to hide them. Identifies free items and, if "Auto-Open" is enabled, messages `fabBackground.js` to queue the item's URL.
    * On product pages (`fabProductPage.js`): If "Auto-Add" is enabled, attempts to find and claim the free item. It may message `fabBackground.js` to close the tab upon success or to report issues like rate limiting.
3.  **Background Processing (`fabBackground.js` & its modules):**
    * `fabQueueManager.js` processes the queue of URLs to open, respecting concurrency limits and global rate limits.
    * When tabs opened by the module are closed, `fabVerification.js` checks if the item was added to the library.
    * Alarms trigger periodic checks (e.g., for verification).
4.  **Status Updates:** The popup UI reflects the current operational status, queue sizes, and stats from the FAB module.

## Notes

* **Website Dependent:** The functionality of this module, especially the content scripts, is highly dependent on the structure of the **Epic Games Unreal Engine Marketplace website**. Changes to the website's HTML, CSS, or API may break features.
* **Rate Limiting:** The **Epic Games Unreal Engine Marketplace** may implement rate limiting. The extension attempts to handle this gracefully by pausing operations and respecting `Retry-After` headers. If severe rate limiting is encountered, operations will pause, and this will be indicated in the popup status.

---