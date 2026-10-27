// D:\Dev\X414\src\bridge\cryptoPolyfill.js
// Provides WebCrypto (getRandomValues + subtle SHA-256 & AES-256-GCM) on Android Hermes / React Native
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';

function toUint8Array(input) {
    if (input instanceof Uint8Array) return input;
    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }
    return new Uint8Array(input || []);
}

export function ensureCryptoPolyfill() {
    if (typeof globalThis.TextEncoder === 'undefined') {
        globalThis.TextEncoder = class TextEncoder {
            encode(str = '') {
                const utf8 = unescape(encodeURIComponent(String(str)));
                const out = new Uint8Array(utf8.length);
                for (let i = 0; i < utf8.length; i++) {
                    out[i] = utf8.charCodeAt(i);
                }
                return out;
            }
        };
    }

    if (typeof globalThis.TextDecoder === 'undefined') {
        globalThis.TextDecoder = class TextDecoder {
            decode(bytes) {
                const arr = toUint8Array(bytes);
                let bin = '';
                for (let i = 0; i < arr.length; i++) {
                    bin += String.fromCharCode(arr[i]);
                }
                try {
                    return decodeURIComponent(escape(bin));
                } catch (e) {
                    return bin;
                }
            }
        };
    }

    if (typeof globalThis.crypto === 'undefined') {
        globalThis.crypto = {};
    }

    if (typeof globalThis.crypto.getRandomValues !== 'function') {
        globalThis.crypto.getRandomValues = function (typedArray) {
            try {
                // Use expo-crypto when running inside Expo on Android
                // eslint-disable-next-line global-require
                const ExpoCrypto = require('expo-crypto');
                if (ExpoCrypto && typeof ExpoCrypto.getRandomValues === 'function') {
                    return ExpoCrypto.getRandomValues(typedArray);
                }
            } catch (e) {}

            const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
            return typedArray;
        };
    }

    if (!globalThis.crypto.subtle) {
        globalThis.crypto.subtle = {
            async digest(algorithm, data) {
                const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
                if (!name || name.toUpperCase().replace('-', '') !== 'SHA256') {
                    throw new Error(`Unsupported digest algorithm: ${name}`);
                }
                const out = sha256(toUint8Array(data));
                return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
            },
            async importKey(format, keyData, algorithm, extractable, keyUsages) {
                if (format !== 'raw') {
                    throw new Error(`Unsupported key format: ${format}`);
                }
                return {
                    type: 'secret',
                    extractable: Boolean(extractable),
                    algorithm,
                    usages: keyUsages,
                    _rawBytes: new Uint8Array(toUint8Array(keyData))
                };
            },
            async encrypt(algorithm, key, data) {
                const iv = toUint8Array(algorithm.iv);
                const rawKey = key._rawBytes || toUint8Array(key);
                const aes = gcm(rawKey, iv);
                const ciphertext = aes.encrypt(toUint8Array(data));
                return ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength);
            },
            async decrypt(algorithm, key, data) {
                const iv = toUint8Array(algorithm.iv);
                const rawKey = key._rawBytes || toUint8Array(key);
                const aes = gcm(rawKey, iv);
                const plaintext = aes.decrypt(toUint8Array(data));
                return plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength);
            }
        };
    }
}

ensureCryptoPolyfill();
