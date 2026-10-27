// AUTO-SYNCED FROM 414Extensions/x_extension/xNostrCrypto.js — DO NOT EDIT DIRECTLY
// 414Extensions/x_extension/xNostrCrypto.js
// Self-contained NIP-01 / BIP-340 Schnorr secp256k1 + WebCrypto AES-256-GCM utilities

const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
const Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
const G = { x: Gx, y: Gy };

export function utf8ToBytes(str) {
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str);
    }
    const encoded = unescape(encodeURIComponent(str));
    const out = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) {
        out[i] = encoded.charCodeAt(i);
    }
    return out;
}

export function bytesToUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder().decode(bytes);
    }
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    return decodeURIComponent(escape(bin));
}

export function mod(a, m = P) {
    const r = a % m;
    return r >= 0n ? r : r + m;
}

export function modPow(base, exp, m = P) {
    let result = 1n;
    let b = mod(base, m);
    let e = exp;
    while (e > 0n) {
        if (e & 1n) result = (result * b) % m;
        b = (b * b) % m;
        e >>= 1n;
    }
    return result;
}

export function modInv(a, m = P) {
    let [old_r, r] = [mod(a, m), m];
    let [old_s, s] = [1n, 0n];
    while (r !== 0n) {
        const q = old_r / r;
        [old_r, r] = [r, old_r - q * r];
        [old_s, s] = [s, old_s - q * s];
    }
    return mod(old_s, m);
}

export function pointAdd(p1, p2) {
    if (!p1) return p2;
    if (!p2) return p1;
    if (p1.x === p2.x && p1.y !== p2.y) return null;

    let lam;
    if (p1.x === p2.x && p1.y === p2.y) {
        if (p1.y === 0n) return null;
        lam = mod(3n * p1.x * p1.x * modInv(2n * p1.y, P), P);
    } else {
        lam = mod((p2.y - p1.y) * modInv(p2.x - p1.x, P), P);
    }

    const x3 = mod(lam * lam - p1.x - p2.x, P);
    const y3 = mod(lam * (p1.x - x3) - p1.y, P);
    return { x: x3, y: y3 };
}

export function scalarMultiply(k, point = G) {
    let scalar = mod(k, N);
    if (scalar === 0n) return null;
    let result = null;
    let addend = point;
    while (scalar > 0n) {
        if (scalar & 1n) {
            result = pointAdd(result, addend);
        }
        addend = pointAdd(addend, addend);
        scalar >>= 1n;
    }
    return result;
}

export function hasEvenY(point) {
    return (point.y & 1n) === 0n;
}

export function liftX(x) {
    if (x <= 0n || x >= P) return null;
    const c = mod(modPow(x, 3n, P) + 7n, P);
    const y = modPow(c, (P + 1n) / 4n, P);
    if (mod(y * y, P) !== c) return null;
    return { x, y: (y & 1n) === 0n ? y : P - y };
}

export function bytesToHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0) {
        throw new Error('Invalid hex string');
    }
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return arr;
}

export function bytesToBigInt(bytes) {
    const hex = bytesToHex(bytes);
    return hex ? BigInt('0x' + hex) : 0n;
}

export function bigIntToBytes32(num) {
    const hex = num.toString(16).padStart(64, '0');
    return hexToBytes(hex);
}

export function concatBytes(...arrays) {
    const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}

export async function sha256Bytes(...arrays) {
    const combined = arrays.length === 1 ? arrays[0] : concatBytes(...arrays);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', combined);
    return new Uint8Array(digest);
}

const tagHashCache = new Map();

export async function taggedHash(tag, ...messages) {
    let tagHash = tagHashCache.get(tag);
    if (!tagHash) {
        tagHash = await sha256Bytes(utf8ToBytes(tag));
        tagHashCache.set(tag, tagHash);
    }
    return sha256Bytes(tagHash, tagHash, ...messages);
}

export function generateRandomBytesHex(byteLength = 32) {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

export function generateSecretKeyHex() {
    while (true) {
        const hex = generateRandomBytesHex(32);
        const d = BigInt('0x' + hex);
        if (d > 0n && d < N) return hex;
    }
}

export function getPublicKeyHex(privKeyHex) {
    const d0 = BigInt('0x' + privKeyHex);
    if (d0 <= 0n || d0 >= N) {
        throw new Error('Invalid private key scalar');
    }
    const point = scalarMultiply(d0, G);
    return bytesToHex(bigIntToBytes32(point.x));
}

export async function schnorrSign(msgHex, privKeyHex, auxRandHex = null) {
    const msgBytes = hexToBytes(msgHex);
    if (msgBytes.length !== 32) throw new Error('Message must be 32 bytes');

    const d0 = BigInt('0x' + privKeyHex);
    if (d0 <= 0n || d0 >= N) throw new Error('Invalid private key');

    const P_point = scalarMultiply(d0, G);
    const d = hasEvenY(P_point) ? d0 : N - d0;

    const auxBytes = auxRandHex ? hexToBytes(auxRandHex) : hexToBytes(generateRandomBytesHex(32));
    const auxHash = await taggedHash('BIP0340/aux', auxBytes);
    const dBytes = bigIntToBytes32(d);
    const t = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        t[i] = dBytes[i] ^ auxHash[i];
    }

    const pxBytes = bigIntToBytes32(P_point.x);
    const rand = await taggedHash('BIP0340/nonce', t, pxBytes, msgBytes);
    const k0 = mod(bytesToBigInt(rand), N);
    if (k0 === 0n) throw new Error('Failure: k0 is zero');

    const R = scalarMultiply(k0, G);
    const k = hasEvenY(R) ? k0 : N - k0;
    const rxBytes = bigIntToBytes32(R.x);

    const eHash = await taggedHash('BIP0340/challenge', rxBytes, pxBytes, msgBytes);
    const e = mod(bytesToBigInt(eHash), N);

    const s = mod(k + e * d, N);
    const sigBytes = concatBytes(rxBytes, bigIntToBytes32(s));
    return bytesToHex(sigBytes);
}

export async function schnorrVerify(sigHex, msgHex, pubkeyHex) {
    try {
        if (typeof sigHex !== 'string' || sigHex.length !== 128) return false;
        if (typeof msgHex !== 'string' || msgHex.length !== 64) return false;
        if (typeof pubkeyHex !== 'string' || pubkeyHex.length !== 64) return false;

        const P_point = liftX(BigInt('0x' + pubkeyHex));
        if (!P_point) return false;

        const r = BigInt('0x' + sigHex.slice(0, 64));
        const s = BigInt('0x' + sigHex.slice(64, 128));
        if (r >= P || s >= N) return false;

        const msgBytes = hexToBytes(msgHex);
        const rxBytes = bigIntToBytes32(r);
        const pxBytes = bigIntToBytes32(P_point.x);

        const eHash = await taggedHash('BIP0340/challenge', rxBytes, pxBytes, msgBytes);
        const e = mod(bytesToBigInt(eHash), N);

        const sG = scalarMultiply(s, G);
        const negEP = scalarMultiply(mod(N - e, N), P_point);
        const R = pointAdd(sG, negEP);

        if (!R || !hasEvenY(R) || R.x !== r) return false;
        return true;
    } catch (err) {
        return false;
    }
}

export async function computeEventId(event) {
    const serialized = JSON.stringify([
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content
    ]);
    const hashBytes = await sha256Bytes(utf8ToBytes(serialized));
    return bytesToHex(hashBytes);
}

export async function signEvent(template, privKeyHex) {
    const pubkey = getPublicKeyHex(privKeyHex);
    const event = {
        pubkey,
        created_at: template.created_at ?? Math.floor(Date.now() / 1000),
        kind: template.kind,
        tags: template.tags || [],
        content: template.content || ''
    };
    event.id = await computeEventId(event);
    event.sig = await schnorrSign(event.id, privKeyHex);
    return event;
}

export async function verifyEvent(event) {
    if (!event || !event.id || !event.pubkey || !event.sig) return false;
    const expectedId = await computeEventId(event);
    if (expectedId !== event.id) return false;
    return schnorrVerify(event.sig, event.id, event.pubkey);
}

// --- Deterministic Tag & AES-256-GCM Encryption Utilities ---

export function normalizeIdentifier(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().toLowerCase();
}

export async function deriveTagHash(namespace, value) {
    const input = `${namespace}:${normalizeIdentifier(value)}`;
    const hash = await sha256Bytes(utf8ToBytes(input));
    return bytesToHex(hash).slice(0, 32);
}

export async function deriveInboxInfo(email) {
    const norm = normalizeIdentifier(email);
    const inboxTag = await deriveTagHash('414x-inbox-tag-v1', norm);
    const keyBytes = await sha256Bytes(utf8ToBytes(`414x-inbox-key-v1:${norm}`));
    return {
        inboxTag: `414x-inbox-${inboxTag}`,
        inboxKeyHex: bytesToHex(keyBytes)
    };
}

export async function derivePairwiseInfo(emailA, emailB) {
    const normA = normalizeIdentifier(emailA);
    const normB = normalizeIdentifier(emailB);
    const sorted = [normA, normB].sort();
    const pairKeyBytes = await sha256Bytes(utf8ToBytes(`414x-pair-key-v1:${sorted[0]}|${sorted[1]}`));
    const abTag = await deriveTagHash('414x-hs-v1', `${normA}->${normB}`);
    const baTag = await deriveTagHash('414x-hs-v1', `${normB}->${normA}`);
    return {
        pairKeyHex: bytesToHex(pairKeyBytes),
        outgoingTag: `414x-hs-${abTag}`,
        incomingTag: `414x-hs-${baTag}`
    };
}

export async function deriveSelfSyncInfo(email, passphrase = '') {
    const norm = normalizeIdentifier(email);
    const cleanPass = typeof passphrase === 'string' ? passphrase.trim() : '';
    const seed = cleanPass ? `${norm}|${cleanPass}` : norm;
    const selfTagHash = await deriveTagHash('414x-self-tag-v1', seed);
    const keyBytes = await sha256Bytes(utf8ToBytes(`414x-self-key-v1:${seed}`));
    return {
        selfTag: `414x-self-${selfTagHash}`,
        selfKeyHex: bytesToHex(keyBytes)
    };
}

async function importAesKey(keyHex) {
    const rawKey = hexToBytes(keyHex);
    return globalThis.crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptJson(obj, keyHex) {
    const key = await importAesKey(keyHex);
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);
    const plaintext = utf8ToBytes(JSON.stringify(obj));
    const cipherBuf = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintext
    );
    return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(cipherBuf))}`;
}

export async function decryptJson(payload, keyHex) {
    try {
        if (!payload || typeof payload !== 'string' || !payload.includes(':')) return null;
        const [ivHex, cipherHex] = payload.split(':');
        const iv = hexToBytes(ivHex);
        const cipherBytes = hexToBytes(cipherHex);
        const key = await importAesKey(keyHex);
        const plainBuf = await globalThis.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            cipherBytes
        );
        return JSON.parse(bytesToUtf8(new Uint8Array(plainBuf)));
    } catch (err) {
        return null;
    }
}
