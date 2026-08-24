/**
 * WinZip-AES zip reader, just enough of it to open a Greencopper content bundle.
 *
 * Written against `node:crypto` + `node:zlib` on purpose: this repo ships **zero
 * runtime dependencies**, and pulling a zip library in for one adapter would be the
 * first. The format is small and stable (AE-1/AE-2, APPNOTE 6.3.x + the WinZip AES
 * spec), so implementing it costs less than carrying the dependency:
 *
 *   local header ─┬─ salt            (8/12/16 bytes for AES-128/192/256)
 *                 ├─ password verifier (2 bytes)
 *                 ├─ ciphertext      (AES-CTR, little-endian counter from 1)
 *                 └─ auth code       (HMAC-SHA1, truncated to 10 bytes)
 *
 * Key material is PBKDF2-HMAC-SHA1(password, salt, 1000) split into
 * [encKey | authKey | verifier].
 *
 * NOTE on CTR: WinZip AES counts the counter block as a **little-endian** integer
 * starting at 1, which is not what `aes-256-ctr` does (big-endian). So the keystream
 * is generated block-by-block through ECB instead — the one place this differs from
 * the obvious implementation.
 */
import { createCipheriv, createHmac, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import type { GreencopperBundle } from "./greencopper.js";

/** Salt length by AES strength byte (1=128, 2=192, 3=256). */
const SALT_LEN: Record<number, number> = { 1: 8, 2: 12, 3: 16 };
const KEY_LEN: Record<number, number> = { 1: 16, 2: 24, 3: 32 };

const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const METHOD_AES = 99;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** Generate `n` bytes of WinZip-AES keystream (AES-ECB over a LE counter from 1). */
function ctrKeystream(key: Buffer, n: number): Buffer {
  const blocks = Math.ceil(n / 16);
  const out = Buffer.allocUnsafe(blocks * 16);
  // The keystream is the ECB *encryption* of each counter block.
  const c = createCipheriv(`aes-${key.length * 8}-ecb`, key, Buffer.alloc(0));
  c.setAutoPadding(false);
  const counter = Buffer.alloc(16);
  for (let i = 0; i < blocks; i++) {
    // Little-endian increment, starting at 1.
    let carry = 1;
    for (let b = 0; b < 16 && carry; b++) {
      const v = counter[b]! + carry;
      counter[b] = v & 0xff;
      carry = v >> 8;
    }
    c.update(counter).copy(out, i * 16);
  }
  return out.subarray(0, n);
}

function xor(data: Buffer, ks: Buffer): Buffer {
  const out = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i]! ^ ks[i]!;
  return out;
}

interface CentralEntry {
  name: string;
  method: number;
  localOffset: number;
  compressedSize: number;
}

/** Walk the central directory (the authoritative index; local headers may lie). */
function readCentralDirectory(buf: Buffer): CentralEntry[] {
  // EOCD is at the end, after an optional comment — scan backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");

  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  // Zip64: the 32-bit fields saturate and the real values live in the zip64 EOCD.
  if (cdOffset === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (buf.readUInt32LE(i) === SIG_EOCD64) {
        count = Number(buf.readBigUInt64LE(i + 32));
        cdOffset = Number(buf.readBigUInt64LE(i + 48));
        break;
      }
    }
  }

  const entries: CentralEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, localOffset, compressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The AES extra field (0x9901) carries the strength and the real compression method. */
function readAesExtra(extra: Buffer): { strength: number; realMethod: number } | null {
  let off = 0;
  while (off + 4 <= extra.length) {
    const id = extra.readUInt16LE(off);
    const size = extra.readUInt16LE(off + 2);
    if (id === 0x9901 && size >= 7) {
      return { strength: extra[off + 8]!, realMethod: extra.readUInt16LE(off + 9) };
    }
    off += 4 + size;
  }
  return null;
}

/**
 * Decrypt every AES entry in `buf`, returning name -> plaintext bytes.
 * Throws on a wrong password (caught by the 2-byte verifier, before any output)
 * or a failed HMAC (caught after, meaning corruption/tampering).
 */
export function readAesZipEntries(buf: Buffer, password: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const e of readCentralDirectory(buf)) {
    if (e.name.endsWith("/")) continue;

    // Re-read sizes from the local header: name/extra lengths differ from central.
    const lo = e.localOffset;
    const nameLen = buf.readUInt16LE(lo + 26);
    const extraLen = buf.readUInt16LE(lo + 28);
    const extra = buf.subarray(lo + 30 + nameLen, lo + 30 + nameLen + extraLen);
    let dataStart = lo + 30 + nameLen + extraLen;

    if (e.method !== METHOD_AES) {
      // An unencrypted member inside an otherwise-encrypted bundle.
      const raw = buf.subarray(dataStart, dataStart + e.compressedSize);
      out.set(e.name, e.method === METHOD_DEFLATE ? inflateRawSync(raw) : raw);
      continue;
    }

    const aes = readAesExtra(extra);
    if (!aes) throw new Error(`AES entry without an AES extra field: ${e.name}`);
    const saltLen = SALT_LEN[aes.strength];
    const keyLen = KEY_LEN[aes.strength];
    if (!saltLen || !keyLen) throw new Error(`unsupported AES strength ${aes.strength} in ${e.name}`);

    const salt = buf.subarray(dataStart, dataStart + saltLen);
    const verifier = buf.subarray(dataStart + saltLen, dataStart + saltLen + 2);
    dataStart += saltLen + 2;

    const dk = pbkdf2Sync(Buffer.from(password, "utf8"), salt, 1000, keyLen * 2 + 2, "sha1");
    const encKey = dk.subarray(0, keyLen);
    const authKey = dk.subarray(keyLen, keyLen * 2);
    const expectVerifier = dk.subarray(keyLen * 2, keyLen * 2 + 2);
    if (!timingSafeEqual(verifier, expectVerifier)) {
      throw new Error(`wrong password for ${e.name} (AES verifier mismatch)`);
    }

    // compressedSize spans salt + verifier + ciphertext + 10-byte auth code.
    const cipherLen = e.compressedSize - saltLen - 2 - 10;
    const cipher = buf.subarray(dataStart, dataStart + cipherLen);
    const authCode = buf.subarray(dataStart + cipherLen, dataStart + cipherLen + 10);

    const mac = createHmac("sha1", authKey).update(cipher).digest().subarray(0, 10);
    if (!timingSafeEqual(mac, authCode)) {
      throw new Error(`authentication failed for ${e.name} (bundle corrupt or tampered)`);
    }

    const plain = xor(cipher, ctrKeystream(encKey, cipher.length));
    out.set(
      e.name,
      aes.realMethod === METHOD_DEFLATE ? inflateRawSync(plain) : plain,
    );
    if (aes.realMethod !== METHOD_DEFLATE && aes.realMethod !== METHOD_STORE) {
      throw new Error(`unsupported compression method ${aes.realMethod} in ${e.name}`);
    }
  }
  return out;
}

function required(entries: Map<string, Buffer>, path: string): unknown {
  const b = entries.get(path);
  if (!b) {
    throw new Error(`greencopper bundle is missing ${path} — not the expected content layout`);
  }
  return JSON.parse(b.toString("utf8"));
}

/** Pull the four files the lineup parser needs out of a decrypted bundle. */
export function readGreencopperBundle(entries: Map<string, Buffer>, locale = "en-GB"): GreencopperBundle {
  return {
    strings: required(entries, `core/strings/${locale}.json`) as Record<string, string>,
    stages: required(entries, "event/data/stages.json") as GreencopperBundle["stages"],
    scheduleItems: required(entries, "event/data/scheduleItems.json") as GreencopperBundle["scheduleItems"],
    timeSlots: required(entries, "event/data/timeSlots.json") as GreencopperBundle["timeSlots"],
  };
}
