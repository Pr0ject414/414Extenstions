// KylesChromeExtensions/shared_modules/moduleManager.js

export class ModuleManager {
    constructor() {
        this.modules = [];
    }

    /**
     * Registers a module with the manager.
     * @param {object} module - The module's main background object (e.g., FabBackground).
     * @param {object} config - Configuration for the module.
     * @param {string[]} config.actions - A list of message actions the module can handle.
     */
    register(module, config) {
        if (!module || !config || !Array.isArray(config.actions)) {
            console.error("ModuleManager: Invalid module registration.", module, config);
            return;
        }
        this.modules.push({
            handler: module,
            actions: new Set(config.actions),
        });
        console.log(`ModuleManager: Registered module with actions:`, config.actions);
    }

    /**
     * Routes an incoming message to the appropriate registered module.
     * @param {object} request - The message request object.
     * @param {object} sender - The message sender object.
     * @param {function} sendResponse - The response callback.
     * @returns {boolean} True if the message is handled asynchronously.
     */
    routeMessage(request, sender, sendResponse) {
        for (const module of this.modules) {
            if (module.actions.has(request.action)) {
                return module.handler.handleMessage(request, sender, sendResponse);
            }
        }
        console.warn(`ModuleManager: No module found to handle action: ${request.action}`);
        return false; // No module handled this synchronous message
    }

    /**
     * Calls the `init` function for all registered modules.
     */
    async initializeAll() {
        console.log("ModuleManager: Initializing all registered modules...");
        for (const module of this.modules) {
            if (typeof module.handler.init === 'function') {
                await module.handler.init();
            }
        }
        console.log("ModuleManager: All modules initialized.");
    }

    /**
     * Calls the `onInstalled` function for all registered modules.
     */
    async handleOnInstalled(details) {
        console.log("ModuleManager: Handling onInstalled for all registered modules...");
        for (const module of this.modules) {
            if (typeof module.handler.onInstalled === 'function') {
                await module.handler.onInstalled(details);
            }
        }
    }
    
    /**
     * Calls the `onStartup` function for all registered modules.
     */
    async handleOnStartup() {
        console.log("ModuleManager: Handling onStartup for all registered modules...");
        for (const module of this.modules) {
            if (typeof module.handler.onStartup === 'function') {
                await module.handler.onStartup();
            }
        }
    }
}

export const moduleManager = new ModuleManager();