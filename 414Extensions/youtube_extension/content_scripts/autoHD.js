// KylesChromeExtensions/youtube_extension/content_scripts/autoHD.js
/*
    Copyright (C) 2024 YouTube Auto HD (https://github.com/avi12/youtube-auto-hd)
    
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
*/


(function () {
    const SELECTORS = {
        title: "title",
        video: "video",
        buttonSettings: ".ytp-settings-button",
        optionQuality: ".ytp-settings-menu[data-layer] .ytp-menuitem:last-child",
        menuOption: ".ytp-settings-menu[data-layer] .ytp-menuitem",
        menuOptionContent: ".ytp-menuitem-content",
        panelHeaderBack: ".ytp-panel-header button",
        player: ".html5-video-player:not(#inline-preview-player)",
        labelPremium: ".ytp-premium-label"
    };

    const OBSERVER_OPTIONS = { childList: true, subtree: true };

    const SUFFIX_EBR = "p_hdr"; // Usually "premium" or similar marker, simplified logic
    const SUFFIX_SUPER_RESOLUTION = "p_sr";

    // Initial default state
    let state = {
        isExtensionEnabled: true,
        targetQuality: '2160', // Default high
        isEnhancedBitrate: false,
        isUseSuperResolution: false,
        qualities: {} 
    };

    let isApplying = false;
    let qualityApplied = false;
    let applyTimeout = null;

    // --- UTILS ---

    function getVisibleElement(selector) {
        const elements = [...document.querySelectorAll(selector)];
        return elements.find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
    }

    function getPlayerDiv(elVideo) {
        return elVideo.closest(SELECTORS.player);
    }

    // --- LOGIC ---

    function getIsSettingsMenuOpen() {
        const elButtonSettings = getVisibleElement(SELECTORS.buttonSettings);
        return elButtonSettings?.ariaExpanded === "true";
    }

    function closeMenu(elPlayer) {
        const clickPanelBackIfPossible = () => {
            const elPanelHeaderBack = elPlayer.querySelector(SELECTORS.panelHeaderBack);
            if (elPanelHeaderBack) {
                elPanelHeaderBack.click();
                return true;
            }
            return false;
        };

        if (clickPanelBackIfPossible()) {
            return;
        }

        // If deep in menu, we might need to back out multiple times or wait
        // Simplified: wait for it to be possible, or let user close it. 
        // For this port we'll try to be non-intrusive.
        // The original uses a mutation observer to back out.
        
        const observer = new MutationObserver((_, obs) => {
             if (clickPanelBackIfPossible() || !getIsSettingsMenuOpen()) {
                 obs.disconnect();
             }
        });
        observer.observe(elPlayer, OBSERVER_OPTIONS);
        
        // Failsafe to just click settings button again if it remains open too long?
        // Original code relies on clicking "Back" until closed or clicking settings to toggle.
    }

    function getIsQualityElement(element) {
        // Needs to have a number
        const isQuality = /\d/.test(element.textContent);
        // Should not be a "submenu" parent (usually just text + arrow) but actual radio items don't have children in the same way
        // In YouTube's current DOM, quality items are specific.
        return isQuality;
    }

    function getCurrentQualityElements() {
        // We assume the menu is OPEN for this to work
        const elPlayer = getVisibleElement(SELECTORS.player);
        if(!elPlayer) return [];
        const elMenuOptions = [...elPlayer.querySelectorAll(SELECTORS.menuOption)];
        return elMenuOptions.filter(getIsQualityElement);
    }

    function parseQualityLabel(label) {
        const numberMatch = label.match(/(\d+)/);
        if (!numberMatch) return null;
        const value = parseInt(numberMatch[1], 10);
        const isPremium = /Premium|Enhanced/i.test(label); // "1080p Premium"
        return { value, isPremium, label };
    }

    function changeQuality() {
        const elQualities = getCurrentQualityElements();
        if (elQualities.length === 0) return;

        // Sort available qualities high to low
        const avail = elQualities.map((el, index) => {
            const parsed = parseQualityLabel(el.textContent);
            return { el, ...parsed, index };
        }).filter(item => item.value !== null);
        
        // Find best match
        // 1. Filter by target quality (<= target)
        // 2. If Enhanced Bitrate is requested and available for that quality, prefer it.
        
        const targetVal = parseInt(state.targetQuality, 10);

        let candidates = avail.filter(q => q.value <= targetVal);
        
        if (candidates.length === 0) {
            // Nothing lower or equal? Pick lowest available (should usually be 144p etc)
            // Or if we want "Highest possible" and target is 8k, we grab the top one.
             // If we just want "Highest", candidates is empty if *all* are > target? No, target is usually max.
             // If user sets 480p, and only 720p+ is available, we should probably pick 720p (lowest)
             // But if user sets 4k, and max is 1080p, candidates has everything.
             candidates = avail; // fallback to all
        }

        // Sort candidates by value DESC
        candidates.sort((a,b) => b.value - a.value);

        // Best candidate logic
        // We want the highest value <= target. (candidates[0] after sort)
        // BUT, if there are duplicates (1080p vs 1080p Premium), check pref.
        
        let best = candidates[0]; // Start with highest available <= target

        // Check if there's a Premium version of this 'best' value
        const siblings = candidates.filter(c => c.value === best.value);
        if (siblings.length > 1) {
            // We have regular and premium
            // If user wants enhanced, pick premium. Else regular.
            const premiumOne = siblings.find(s => s.isPremium);
            const regularOne = siblings.find(s => !s.isPremium);
            
            if (state.isEnhancedBitrate && premiumOne) {
                best = premiumOne;
            } else if (!state.isEnhancedBitrate && regularOne) {
                best = regularOne;
            }
             // If strict preference not found, default to whatever 'best' was (usually the first one found)
        }
        
        // Click it!
        // Check if already selected?
        // YouTube marks selected item with aria-checked="true"
        if (best && best.el) {
             const isSelected = best.el.getAttribute('aria-checked') === 'true';
             if (isSelected) {
                 console.log(`[YouTube AutoHD] Quality already set to: ${best.label}. Skipping click.`);
                 return;
             }
             
             console.log(`[YouTube AutoHD] Applying quality: ${best.label}`);
             best.el.click();
        }
    }

    async function performQualityChange(elVideo) {
        if (isApplying) return;
        isApplying = true;

        const elPlayer = getPlayerDiv(elVideo);
        if (!elPlayer) {
            isApplying = false;
            return;
        }

        const elSettingsBtn = elPlayer.querySelector(SELECTORS.buttonSettings);
        if (!elSettingsBtn) {
            isApplying = false;
            return;
        }

        // Helper to hide menu
        const addStyle = () => {
             if (document.getElementById('ythd-hide-menu')) return;
             const style = document.createElement('style');
             style.id = 'ythd-hide-menu';
             style.innerHTML = `
                 .ytp-settings-menu, .ytp-popup {
                     opacity: 0 !important;
                     visibility: hidden !important;
                     display: block !important; /* Force block so it renders for interaction */
                     pointer-events: none !important; /* Prevent clicks while hidden */
                     z-index: -1000 !important;
                 }
             `;
             (document.head || document.documentElement).appendChild(style);
        };

        addStyle(); // execute immediately

        try {
            // 1. Open Settings
            if (!getIsSettingsMenuOpen()) {
                elSettingsBtn.click();
            }
            
            // 2. Open "Quality" submenu
            // Increased wait slightly to ensure menu render
            await new Promise(r => setTimeout(r, 100)); 
            
            let elQualityMenuBtn = elPlayer.querySelector(SELECTORS.optionQuality);
            
            if (!elQualityMenuBtn) {
                 const menuItems = [...elPlayer.querySelectorAll(SELECTORS.menuOption)];
                 elQualityMenuBtn = menuItems.find(i => i.textContent.includes("Quality") || i.textContent.includes("Qualität")); 
                 if (!elQualityMenuBtn) elQualityMenuBtn = elPlayer.querySelector(SELECTORS.optionQuality);
            }
    
            if (elQualityMenuBtn) {
                elQualityMenuBtn.click();
                await new Promise(r => setTimeout(r, 100));
                
                // 3. Select Quality
                changeQuality();
                qualityApplied = true;
            }
            
            // Ensure menu is closed if it remained open
            // We wait a moment for the click to register
            await new Promise(r => setTimeout(r, 50));
            if (getIsSettingsMenuOpen()) {
                 elSettingsBtn.click(); 
            }
            
            elSettingsBtn.blur();

        } catch (e) {
            console.error("[YouTube AutoHD] Error during quality change:", e);
        } finally {
            // Wait for the menu closing animations to finish before removing style and releasing lock
            await new Promise(r => setTimeout(r, 500));
            const style = document.getElementById('ythd-hide-menu');
            if (style) style.remove();
            isApplying = false;
        }
    }

    // --- TRIGGERS ---

    let userInteracted = false;

    // Detect user manual quality selection
    document.addEventListener('click', (e) => {
        if (!e.isTrusted) return; // Ignore programmatic clicks

        // Check if the click happened inside the quality menu
        // User provided screenshot confirms class 'ytp-quality-menu' on the panel
        const qualityMenu = e.target.closest('.ytp-quality-menu');
        if (qualityMenu) {
            // Further verification: clicked a menu item?
            const menuItem = e.target.closest('.ytp-menuitem');
            if (menuItem) {
                console.log("[YouTube AutoHD] User manually selected a quality. Pausing auto-quality.");
                userInteracted = true;
            }
        }
    }, { capture: true });

    async function applySettings() {
        if (!state.isExtensionEnabled) return;
        if (userInteracted) return; // Do not override user choice
        if (qualityApplied) return; // Already applied quality for current video
        if (isApplying) return; // Already in progress
        
        const elVideo = getVisibleElement(SELECTORS.video);
        if (!elVideo) return;
        
        // Debounce applySettings to avoid rapid-fire triggers (like during scrubbing or navigation transitions)
        if (applyTimeout) clearTimeout(applyTimeout);
        applyTimeout = setTimeout(async () => {
             await performQualityChange(elVideo);
        }, 300);
    }

    function init() {
        // Load settings
        chrome.storage.local.get(['isYouTubeModuleEnabled', 'preferredQuality', 'isEnhancedBitrate'], (data) => {
            state.isExtensionEnabled = data.isYouTubeModuleEnabled !== false;
            state.targetQuality = data.preferredQuality || '2160';
            state.isEnhancedBitrate = data.isEnhancedBitrate || false;
            
            if (state.isExtensionEnabled) {
                // Try immediately if video exists
                 applySettings();
            }
        });
        
        // Watch for changes
        chrome.storage.onChanged.addListener((changes) => {
             let shouldUpdate = false;
             if (changes.isYouTubeModuleEnabled) {
                 state.isExtensionEnabled = changes.isYouTubeModuleEnabled.newValue;
                 shouldUpdate = true;
             }
             if (changes.preferredQuality) {
                 state.targetQuality = changes.preferredQuality.newValue;
                 shouldUpdate = true;
             }
             if (changes.isEnhancedBitrate) {
                 state.isEnhancedBitrate = changes.isEnhancedBitrate.newValue;
                 shouldUpdate = true;
             }
             
             if (shouldUpdate && state.isExtensionEnabled) {
                  // If settings change, we assume user wants to re-apply them even if they manually changed quality before?
                  // Or typically, new settings = FORCE apply.
                  // Let's reset userInteracted so the new setting takes effect.
                  userInteracted = false; 
                  qualityApplied = false;
                  applySettings();
             }
        });

        // Watch for page navigation / video load
        // YouTube is SPA. We need to observe URL changes or video element attachment.
        
        // URL Change Detection Strategy:
        // YouTube fires 'yt-navigate-finish' when internal navigation completes.
        // We also use a lightweight interval as a fallback for URL changes not caught by events.
        
        let lastUrl = location.href;
        
        const handleNavigation = () => {
             if (location.pathname.startsWith('/watch')) {
                 userInteracted = false; // Reset on new video
                 qualityApplied = false;  // Reset applied flag on new video
                 setTimeout(applySettings, 1000); // Wait for player to settle
             }
        };

        window.addEventListener('yt-navigate-finish', () => {
             lastUrl = location.href;
             handleNavigation();
        });

        // Fallback: Check URL every 1s (much cheaper than observing body mutations)
        setInterval(() => {
             if (location.href !== lastUrl) {
                 lastUrl = location.href;
                 if (location.pathname.startsWith('/watch')) handleNavigation();
             }
        }, 1000);

        // Video Element Detection Strategy:
        // Instead of observing the entire body for VIDEO tag insertion, we can check specific containers
        // or just rely on the navigation event + 'canplay' on existing videos.
        // YouTube recycles the <video> element often.
        
        // We will add a listener to the document capturing phase for 'canplay' 
        // which will bubble up (or rather capture down) for any media element.
        // Actually 'canplay' does not bubble, so we must use capture: true.
        
        document.addEventListener('canplay', (e) => {
            if (e.target.tagName === 'VIDEO') {
                 // Debounce slightly
                 setTimeout(() => {
                    // Only apply if it's not a user interaction
                    applySettings();
                 }, 500);
            }
        }, { capture: true }); // Capture phase catches events from elements deep in DOM

    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    if (typeof window !== 'undefined') {
        window.YouTubeAutoHD = {
            parseQualityLabel,
            state
        };
    }

})();
