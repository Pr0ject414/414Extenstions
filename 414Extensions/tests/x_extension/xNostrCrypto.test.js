import { webcrypto } from 'crypto';
import {
    generateSecretKeyHex,
    getPublicKeyHex,
    signEvent,
    verifyEvent,
    deriveInboxInfo,
    derivePairwiseInfo,
    encryptJson,
    decryptJson
} from '../../x_extension/xNostrCrypto.js';

if (!globalThis.crypto || !globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

describe('xNostrCrypto', () => {
    test('should generate valid secp256k1 keypair and sign/verify NIP-01 Nostr event', async () => {
        const privKey = generateSecretKeyHex();
        expect(privKey).toMatch(/^[0-9a-f]{64}$/);

        const pubKey = getPublicKeyHex(privKey);
        expect(pubKey).toMatch(/^[0-9a-f]{64}$/);

        const event = await signEvent({
            kind: 30078,
            created_at: 1700000000,
            tags: [['d', '414x-seen-v1']],
            content: 'hello-nostr'
        }, privKey);

        expect(event.pubkey).toBe(pubKey);
        expect(event.id).toMatch(/^[0-9a-f]{64}$/);
        expect(event.sig).toMatch(/^[0-9a-f]{128}$/);

        const isValid = await verifyEvent(event);
        expect(isValid).toBe(true);

        // Tampering with content should fail verification
        const tampered = { ...event, content: 'tampered' };
        expect(await verifyEvent(tampered)).toBe(false);
    });

    test('should encrypt and decrypt JSON payloads with AES-256-GCM', async () => {
        const keyHex = generateSecretKeyHex();
        const original = { ids: ['1848392019283746512', '1848392019283746599'], email: 'kyle@test.com' };

        const encrypted = await encryptJson(original, keyHex);
        expect(typeof encrypted).toBe('string');
        expect(encrypted).toContain(':');

        const decrypted = await decryptJson(encrypted, keyHex);
        expect(decrypted).toEqual(original);

        const wrongKey = generateSecretKeyHex();
        const failedDecrypt = await decryptJson(encrypted, wrongKey);
        expect(failedDecrypt).toBeNull();
    });

    test('should derive matching symmetric pairwise keys and reciprocal tags for two emails', async () => {
        const aliceView = await derivePairwiseInfo('Alice@Example.com ', 'bob@example.com');
        const bobView = await derivePairwiseInfo('BOB@example.com', 'alice@example.com');

        expect(aliceView.pairKeyHex).toBe(bobView.pairKeyHex);
        expect(aliceView.outgoingTag).toBe(bobView.incomingTag);
        expect(aliceView.incomingTag).toBe(bobView.outgoingTag);

        const inbox1 = await deriveInboxInfo('Bob@Example.com');
        const inbox2 = await deriveInboxInfo('  bob@example.com ');
        expect(inbox1).toEqual(inbox2);
    });
});
