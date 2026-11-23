// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122.
// Reads /input/<id>/program.bin + input.bin, writes /output/<id>/stdout.bin
// + exit.txt. 32-bit wrapping ints, 256-value stack, 64-deep call stack,
// 256 memory words, 1,000,000 steps, 65,536 output bytes, ten traps with
// their own exit codes (2..11). Checks run in the ISA's order.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// opcode -> [immediate bytes, values popped, values pushed]
const T: Record<number, [number, number, number]> = {
  0: [0, 0, 0], 1: [1, 0, 1], 2: [4, 0, 1], 3: [0, 1, 0], 4: [0, 1, 2],
  5: [0, 2, 2], 6: [0, 2, 3], 7: [0, 3, 3],
  16: [0, 2, 1], 17: [0, 2, 1], 18: [0, 2, 1], 19: [0, 2, 1],
  20: [0, 2, 1], 21: [0, 2, 1], 22: [0, 2, 1], 23: [0, 1, 1],
  24: [0, 2, 1], 25: [0, 2, 1], 26: [0, 2, 1], 27: [0, 1, 1],
  28: [0, 2, 1], 29: [0, 2, 1], 30: [0, 2, 1],
  32: [0, 2, 1], 33: [0, 2, 1], 34: [0, 2, 1],
  48: [2, 0, 0], 49: [2, 1, 0], 50: [2, 1, 0], 51: [2, 0, 0], 52: [0, 0, 0],
  64: [0, 1, 1], 65: [0, 2, 0], 80: [0, 1, 0], 81: [0, 1, 0],
  82: [0, 0, 1], 83: [0, 1, 0],
};
const enc = new TextEncoder();

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const n = p.length;
  const d = new Int32Array(256);
  const c = new Int32Array(64);
  const m = new Int32Array(256);
  const o = new Uint8Array(65536);
  let s = 0; // data stack depth
  let k = 0; // call stack depth
  let l = 0; // output length
  let q = 0; // input position
  let pc = 0;
  let t = 0; // steps executed
  const end = (code: number) => ({ out: o.slice(0, l), code });
  for (;;) {
    if (t === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc];
    const g = T[op];
    if (g === undefined) return end(5);
    if (pc + g[0] >= n) return end(9);
    t++;
    const nx = pc + 1 + g[0];
    if (s < g[1]) return end(2);
    if (s - g[1] + g[2] > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0: return end(0);
      case 1: d[s++] = (p[nx - 1] << 24) >> 24; break;
      case 2: d[s++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: s--; break;
      case 4: d[s] = d[s - 1]; s++; break;
      case 5: { const v = d[s - 1]; d[s - 1] = d[s - 2]; d[s - 2] = v; break; }
      case 6: d[s] = d[s - 2]; s++; break;
      case 7: { const a = d[s - 3]; d[s - 3] = d[s - 2]; d[s - 2] = d[s - 1]; d[s - 1] = a; break; }
      case 23: d[s - 1] = -d[s - 1]; break;
      case 27: d[s - 1] = ~d[s - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30:
      case 32: case 33: case 34: {
        const b = d[s - 1];
        const a = d[s - 2];
        let r: number;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) {
          if (b === 0) return end(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 20) {
          if (b === 0) return end(4);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 21) {
          if (b === 0) return end(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 22) {
          if (b === 0) return end(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        s -= 2;
        d[s++] = r;
        break;
      }
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 48) {
          const v = d[--s];
          take = op === 49 ? v === 0 : v !== 0;
        }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (k === 64) return end(7);
        c[k++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 52:
        if (k === 0) return end(8);
        pc = c[--k];
        break;
      case 64: {
        const addr = d[s - 1];
        if (addr < 0 || addr >= 256) return end(6);
        d[s - 1] = m[addr];
        break;
      }
      case 65: {
        const addr = d[s - 1];
        const v = d[s - 2];
        if (addr < 0 || addr >= 256) return end(6);
        s -= 2;
        m[addr] = v;
        break;
      }
      case 80: {
        const b = enc.encode(String(d[s - 1]));
        if (l + b.length > 65536) return end(11);
        s--;
        o.set(b, l);
        l += b.length;
        break;
      }
      case 81:
        if (l + 1 > 65536) return end(11);
        o[l++] = d[--s] & 255;
        break;
      case 82:
        d[s++] = q < inp.length ? inp[q++] : -1;
        break;
      case 83:
        return end(d[--s] & 255);
    }
  }
}

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(IN_DIR).sort()) {
  const prog = new Uint8Array(readFileSync(join(IN_DIR, id, 'program.bin')));
  const input = new Uint8Array(readFileSync(join(IN_DIR, id, 'input.bin')));
  const r = run(prog, input);
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'stdout.bin'), r.out);
  writeFileSync(join(OUT_DIR, id, 'exit.txt'), `${r.code}\n`);
}
