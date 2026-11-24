// Draws the PWA icons (a git-branch glyph) into public/. Run: vpx scripts/gen-icons.ts
import { crc32, deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [38, 38, 38];
const FG = [245, 245, 245];

function png(size: number, rgb: Uint8Array): Buffer {
    const chunk = (type: string, data: Buffer) => {
        const body = Buffer.concat([Buffer.from(type), data]);
        const out = Buffer.alloc(12 + data.length);
        out.writeUInt32BE(data.length, 0);
        body.copy(out, 4);
        out.writeUInt32BE(crc32(body), 8 + data.length);
        return out;
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    const raw = Buffer.alloc(size * (size * 3 + 1));
    for (let y = 0; y < size; y++) {
        raw[y * (size * 3 + 1)] = 0; // filter: none
        Buffer.from(rgb.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

const distSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** `scale` shrinks the glyph so maskable icons keep it inside the safe zone. */
function icon(size: number, scale: number, rounded: boolean): Buffer {
    const rgb = new Uint8Array(size * size * 3);
    const SS = 3;
    const nodes = [
        [0.36, 0.27],
        [0.36, 0.73],
        [0.66, 0.4],
    ];
    const stroke = 0.045;
    const radius = 0.095;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let cov = 0;
            let bg = 0;
            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const u = (x + (sx + 0.5) / SS) / size;
                    const v = (y + (sy + 0.5) / SS) / size;
                    // rounded-square mask (anything outside shows as background colour)
                    if (rounded) {
                        const qx = Math.abs(u - 0.5) - (0.5 - 0.22);
                        const qy = Math.abs(v - 0.5) - (0.5 - 0.22);
                        if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) > 0.22) continue;
                    }
                    bg++;
                    const gx = 0.5 + (u - 0.5) / scale;
                    const gy = 0.5 + (v - 0.5) / scale;
                    const [a, b, c] = nodes;
                    const onGlyph =
                        distSeg(gx, gy, a[0], a[1], b[0], b[1]) < stroke ||
                        distSeg(gx, gy, c[0], c[1], 0.36, 0.58) < stroke ||
                        nodes.some(([nx, ny]) => Math.hypot(gx - nx, gy - ny) < radius);
                    if (onGlyph) cov++;
                }
            }
            const i = (y * size + x) * 3;
            const a = cov / (SS * SS);
            const m = bg / (SS * SS);
            for (let k = 0; k < 3; k++) rgb[i + k] = Math.round((BG[k] * (1 - a) + FG[k] * a) * m + 10 * (1 - m));
        }
    }
    return png(size, rgb);
}

writeFileSync("public/icon-192.png", icon(192, 1, true));
writeFileSync("public/icon-512.png", icon(512, 1, true));
writeFileSync("public/icon-maskable-512.png", icon(512, 0.7, false));
writeFileSync("public/apple-touch-icon.png", icon(180, 0.8, false));
console.log("wrote public/icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png");
