import { ModuleManager } from '../shared_modules/moduleManager.js';
import { jest } from '@jest/globals';

describe('ModuleManager', () => {
    let moduleManager;

    beforeEach(() => {
        moduleManager = new ModuleManager();
    });

    describe('register', () => {
        it('should successfully register a valid module', () => {
            const mockModule = { handleMessage: jest.fn() };
            const config = { actions: ['action1', 'action2'] };

            moduleManager.register(mockModule, config);

            expect(moduleManager.modules).toHaveLength(1);
            expect(moduleManager.modules[0].handler).toBe(mockModule);
            expect(moduleManager.modules[0].actions).toEqual(new Set(config.actions));
        });

        it('should not register if module is missing', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const config = { actions: ['action1'] };

            moduleManager.register(null, config);

            expect(moduleManager.modules).toHaveLength(0);
            expect(consoleSpy).toHaveBeenCalledWith(
                "ModuleManager: Invalid module registration.",
                null,
                config
            );
            consoleSpy.mockRestore();
        });

        it('should not register if config is missing', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const mockModule = { handleMessage: jest.fn() };

            moduleManager.register(mockModule, null);

            expect(moduleManager.modules).toHaveLength(0);
            expect(consoleSpy).toHaveBeenCalledWith(
                "ModuleManager: Invalid module registration.",
                mockModule,
                null
            );
            consoleSpy.mockRestore();
        });

        it('should not register if config.actions is not an array', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const mockModule = { handleMessage: jest.fn() };
            const config = { actions: 'not-an-array' };

            moduleManager.register(mockModule, config);

            expect(moduleManager.modules).toHaveLength(0);
            expect(consoleSpy).toHaveBeenCalledWith(
                "ModuleManager: Invalid module registration.",
                mockModule,
                config
            );
            consoleSpy.mockRestore();
        });
    });

    describe('initializeAll', () => {
        it('should call init on all registered modules with an init function', async () => {
            let init1Called = false;
            let init2Called = false;

            moduleManager.register({
                init: async () => { init1Called = true; }
            }, { actions: ['action1'] });

            moduleManager.register({
                init: async () => { init2Called = true; }
            }, { actions: ['action2'] });

            await moduleManager.initializeAll();

            expect(init1Called).toBe(true);
            expect(init2Called).toBe(true);
        });

        it('should handle modules without an init function', async () => {
            let init1Called = false;

            moduleManager.register({
                init: async () => { init1Called = true; }
            }, { actions: ['action1'] });

            moduleManager.register({
                // No init function
            }, { actions: ['action2'] });

            await moduleManager.initializeAll();

            expect(init1Called).toBe(true);
        });

        it('should await asynchronous init calls', async () => {
            let executionOrder = [];

            moduleManager.register({
                init: async () => {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    executionOrder.push('module1');
                }
            }, { actions: ['action1'] });

            moduleManager.register({
                init: async () => {
                    executionOrder.push('module2');
                }
            }, { actions: ['action2'] });

            await moduleManager.initializeAll();

            expect(executionOrder).toEqual(['module1', 'module2']);
        });

        it('should work when no modules are registered', async () => {
            await expect(moduleManager.initializeAll()).resolves.toBeUndefined();
        });

        it('should handle synchronous init functions', async () => {
            let initCalled = false;

            moduleManager.register({
                init: () => { initCalled = true; }
            }, { actions: ['action1'] });

            await moduleManager.initializeAll();
            expect(initCalled).toBe(true);
        });
    });
});
