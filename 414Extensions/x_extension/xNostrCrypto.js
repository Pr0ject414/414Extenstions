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

function jacobianDouble(p) {
    if (!p || p.Z === 0n || p.Y === 0n) return null;
    const Y2 = (p.Y * p.Y) % P;
    const S = (4n * p.X * Y2) % P;
    const M = (3n * p.X * p.X) % P;
    const X3 = mod(M * M - 2n * S, P);
    const Y4 = (Y2 * Y2) % P;
    const Y3 = mod(M * (S - X3) - 8n * Y4, P);
    const Z3 = (2n * p.Y * p.Z) % P;
    return { X: X3, Y: Y3, Z: Z3 };
}

function jacobianAdd(p1, p2) {
    if (!p1 || p1.Z === 0n) return p2;
    if (!p2 || p2.Z === 0n) return p1;

    const Z1Z1 = (p1.Z * p1.Z) % P;
    const Z2Z2 = (p2.Z * p2.Z) % P;
    const U1 = (p1.X * Z2Z2) % P;
    const U2 = (p2.X * Z1Z1) % P;
    const S1 = (((p1.Y * p2.Z) % P) * Z2Z2) % P;
    const S2 = (((p2.Y * p1.Z) % P) * Z1Z1) % P;

    if (U1 === U2) {
        if (S1 !== S2) return null;
        return jacobianDouble(p1);
    }

    const H = mod(U2 - U1, P);
    const R = mod(S2 - S1, P);
    const HH = (H * H) % P;
    const HHH = (H * HH) % P;
    const U1HH = (U1 * HH) % P;

    const X3 = mod(R * R - HHH - 2n * U1HH, P);
    const Y3 = mod(R * (U1HH - X3) - S1 * HHH, P);
    const Z3 = (((p1.Z * p2.Z) % P) * H) % P;
    return { X: X3, Y: Y3, Z: Z3 };
}

function jacobianToAffine(p) {
    if (!p || p.Z === 0n) return null;
    if (p.Z === 1n) return { x: p.X, y: p.Y };
    const zInv = modInv(p.Z, P);
    const zInv2 = (zInv * zInv) % P;
    const zInv3 = (zInv2 * zInv) % P;
    return {
        x: (p.X * zInv2) % P,
        y: (p.Y * zInv3) % P
    };
}

export function scalarMultiply(k, point = G) {
    let scalar = mod(k, N);
    if (scalar === 0n || !point) return null;
    let result = null;
    let addend = { X: point.x, Y: point.y, Z: 1n };
    while (scalar > 0n) {
        if (scalar & 1n) {
            result = jacobianAdd(result, addend);
        }
        addend = jacobianDouble(addend);
        scalar >>= 1n;
    }
    return jacobianToAffine(result);
}

export function hasEvenY(point) {
    return (point.y & 1n) === 0n;
}

const liftXCache = new Map();
const privKeyCache = new Map();
const verifiedSchnorrCache = new Map();
const inboxInfoCache = new Map();
const pairwiseInfoCache = new Map();
const selfSyncInfoCache = new Map();
const aesKeyCache = new Map();

function setBoundedMap(map, key, value, maxSize) {
    if (map.has(key)) {
        map.delete(key);
    } else if (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, value);
}

export function liftX(x) {
    if (x <= 0n || x >= P) return null;
    const cached = liftXCache.get(x);
    if (cached !== undefined) return cached;
    const c = mod(modPow(x, 3n, P) + 7n, P);
    const y = modPow(c, (P + 1n) / 4n, P);
    const pt = mod(y * y, P) === c ? { x, y: (y & 1n) === 0n ? y : P - y } : null;
    setBoundedMap(liftXCache, x, pt, 512);
    return pt;
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

function getPrivKeyInfo(privKeyHex) {
    const cached = privKeyCache.get(privKeyHex);
    if (cached) return cached;
    const d0 = BigInt('0x' + privKeyHex);
    if (d0 <= 0n || d0 >= N) {
        throw new Error('Invalid private key scalar');
    }
    const P_point = scalarMultiply(d0, G);
    const d = hasEvenY(P_point) ? d0 : N - d0;
    const pxBytes = bigIntToBytes32(P_point.x);
    const dBytes = bigIntToBytes32(d);
    const pubkeyHex = bytesToHex(pxBytes);
    const info = { d0, P_point, d, pxBytes, dBytes, pubkeyHex };
    setBoundedMap(privKeyCache, privKeyHex, info, 128);
    setBoundedMap(liftXCache, P_point.x, { x: P_point.x, y: hasEvenY(P_point) ? P_point.y : P - P_point.y }, 512);
    return info;
}

export function getPublicKeyHex(privKeyHex) {
    return getPrivKeyInfo(privKeyHex).pubkeyHex;
}

export async function schnorrSign(msgHex, privKeyHex, auxRandHex = null) {
    const msgBytes = hexToBytes(msgHex);
    if (msgBytes.length !== 32) throw new Error('Message must be 32 bytes');

    const { d, dBytes, pxBytes, pubkeyHex } = getPrivKeyInfo(privKeyHex);

    const auxBytes = auxRandHex ? hexToBytes(auxRandHex) : hexToBytes(generateRandomBytesHex(32));
    const auxHash = await taggedHash('BIP0340/aux', auxBytes);
    const t = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        t[i] = dBytes[i] ^ auxHash[i];
    }

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
    const sigHex = bytesToHex(sigBytes);
    setBoundedMap(verifiedSchnorrCache, `${msgHex}:${pubkeyHex}:${sigHex}`, true, 2000);
    return sigHex;
}

export async function schnorrVerify(sigHex, msgHex, pubkeyHex) {
    try {
        if (typeof sigHex !== 'string' || sigHex.length !== 128) return false;
        if (typeof msgHex !== 'string' || msgHex.length !== 64) return false;
        if (typeof pubkeyHex !== 'string' || pubkeyHex.length !== 64) return false;

        const cacheKey = `${msgHex}:${pubkeyHex}:${sigHex}`;
        const cachedValid = verifiedSchnorrCache.get(cacheKey);
        if (cachedValid !== undefined) {
            return cachedValid;
        }

        const P_point = liftX(BigInt('0x' + pubkeyHex));
        if (!P_point) {
            setBoundedMap(verifiedSchnorrCache, cacheKey, false, 2000);
            return false;
        }

        const r = BigInt('0x' + sigHex.slice(0, 64));
        const s = BigInt('0x' + sigHex.slice(64, 128));
        if (r >= P || s >= N) {
            setBoundedMap(verifiedSchnorrCache, cacheKey, false, 2000);
            return false;
        }

        const msgBytes = hexToBytes(msgHex);
        const rxBytes = bigIntToBytes32(r);
        const pxBytes = bigIntToBytes32(P_point.x);

        const eHash = await taggedHash('BIP0340/challenge', rxBytes, pxBytes, msgBytes);
        const e = mod(bytesToBigInt(eHash), N);

        const sG = scalarMultiply(s, G);
        const negEP = scalarMultiply(mod(N - e, N), P_point);
        const R = pointAdd(sG, negEP);

        const isValid = Boolean(R && hasEvenY(R) && R.x === r);
        setBoundedMap(verifiedSchnorrCache, cacheKey, isValid, 2000);
        return isValid;
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
    const cached = inboxInfoCache.get(norm);
    if (cached) return cached;
    const inboxTag = await deriveTagHash('414x-inbox-tag-v1', norm);
    const keyBytes = await sha256Bytes(utf8ToBytes(`414x-inbox-key-v1:${norm}`));
    const result = {
        inboxTag: `414x-inbox-${inboxTag}`,
        inboxKeyHex: bytesToHex(keyBytes)
    };
    setBoundedMap(inboxInfoCache, norm, result, 256);
    return result;
}

export async function derivePairwiseInfo(emailA, emailB) {
    const normA = normalizeIdentifier(emailA);
    const normB = normalizeIdentifier(emailB);
    const cacheKey = `${normA}|${normB}`;
    const cached = pairwiseInfoCache.get(cacheKey);
    if (cached) return cached;
    const sorted = [normA, normB].sort();
    const pairKeyBytes = await sha256Bytes(utf8ToBytes(`414x-pair-key-v1:${sorted[0]}|${sorted[1]}`));
    const abTag = await deriveTagHash('414x-hs-v1', `${normA}->${normB}`);
    const baTag = await deriveTagHash('414x-hs-v1', `${normB}->${normA}`);
    const result = {
        pairKeyHex: bytesToHex(pairKeyBytes),
        outgoingTag: `414x-hs-${abTag}`,
        incomingTag: `414x-hs-${baTag}`
    };
    setBoundedMap(pairwiseInfoCache, cacheKey, result, 512);
    return result;
}

export async function deriveSelfSyncInfo(email, passphrase = '') {
    const norm = normalizeIdentifier(email);
    const cleanPass = typeof passphrase === 'string' ? passphrase.trim() : '';
    const seed = cleanPass ? `${norm}|${cleanPass}` : norm;
    const cached = selfSyncInfoCache.get(seed);
    if (cached) return cached;
    const selfTagHash = await deriveTagHash('414x-self-tag-v1', seed);
    const keyBytes = await sha256Bytes(utf8ToBytes(`414x-self-key-v1:${seed}`));
    const result = {
        selfTag: `414x-self-${selfTagHash}`,
        selfKeyHex: bytesToHex(keyBytes)
    };
    setBoundedMap(selfSyncInfoCache, seed, result, 128);
    return result;
}

async function importAesKey(keyHex) {
    const cached = aesKeyCache.get(keyHex);
    if (cached) return cached;
    const rawKey = hexToBytes(keyHex);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
    setBoundedMap(aesKeyCache, keyHex, cryptoKey, 256);
    return cryptoKey;
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
