// Deterministic PNG assets using the established purple checkmark identity.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
function crc(bytes) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([size, name, data, checksum]); }
function distance(x, y, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))); return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy); }
const dir = path.resolve(__dirname, '../public/icons'); fs.mkdirSync(dir, { recursive: true });
for (const [name, size] of [['icon-192',192],['icon-512',512],['maskable-512',512],['apple-touch-icon',180]]) {
  const raw = Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) { const i=y*(size*4+1)+1+x*4; const check = Math.min(distance(x/size,y/size,[.28,.51],[.43,.66]),distance(x/size,y/size,[.43,.66],[.72,.35])) < .045; raw.set(check ? [255,255,255,255] : [107,33,232,255],i); }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  fs.writeFileSync(path.join(dir,name+'.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
