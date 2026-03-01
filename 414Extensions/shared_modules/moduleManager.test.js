import { ModuleManager } from './moduleManager.js';
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
});
