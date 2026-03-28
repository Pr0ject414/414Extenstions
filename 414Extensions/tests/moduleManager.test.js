import test from 'node:test';
import assert from 'node:assert';
import { ModuleManager } from '../shared_modules/moduleManager.js';

test('ModuleManager.initializeAll()', async (t) => {
    await t.test('should call init on all registered modules with an init function', async () => {
        const manager = new ModuleManager();
        let init1Called = false;
        let init2Called = false;

        manager.register({
            init: async () => { init1Called = true; }
        }, { actions: ['action1'] });

        manager.register({
            init: async () => { init2Called = true; }
        }, { actions: ['action2'] });

        await manager.initializeAll();

        assert.strictEqual(init1Called, true, 'First module init was not called');
        assert.strictEqual(init2Called, true, 'Second module init was not called');
    });

    await t.test('should handle modules without an init function', async () => {
        const manager = new ModuleManager();
        let init1Called = false;

        manager.register({
            init: async () => { init1Called = true; }
        }, { actions: ['action1'] });

        manager.register({
            // No init function
        }, { actions: ['action2'] });

        await manager.initializeAll();

        assert.strictEqual(init1Called, true, 'Module with init was not called');
    });

    await t.test('should await asynchronous init calls', async () => {
        const manager = new ModuleManager();
        let executionOrder = [];

        manager.register({
            init: async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push('module1');
            }
        }, { actions: ['action1'] });

        manager.register({
            init: async () => {
                executionOrder.push('module2');
            }
        }, { actions: ['action2'] });

        await manager.initializeAll();

        assert.deepStrictEqual(executionOrder, ['module1', 'module2'], 'Modules did not finish in correct order');
    });

    await t.test('should work when no modules are registered', async () => {
        const manager = new ModuleManager();
        await manager.initializeAll();
        // Should not throw and finish successfully
        assert.ok(true);
    });

    await t.test('should handle synchronous init functions', async () => {
        const manager = new ModuleManager();
        let initCalled = false;

        manager.register({
            init: () => { initCalled = true; }
        }, { actions: ['action1'] });

        await manager.initializeAll();
        assert.strictEqual(initCalled, true);
    });
});
