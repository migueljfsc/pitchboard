/**
 * A zip archive, written in the browser with nothing bundled for it.
 *
 * Only what "download everything" needs: files (no directory entries — a path with slashes is
 * a folder to every unzipper), deflated through the native `CompressionStream` as share links
 * are, with UTF-8 names so a board called "Saída de bola" keeps its name. No Zip64: an account
 * holds at most a few hundred small files, far inside the 4 GB and 65,535-entry limits.
 */

export type ZipEntry = {
  /** Forward slashes, no leading slash: `Football/Season/High press.json`. */
  path: string;
  data: Uint8Array;
  /** Unix seconds; stored at the two-second resolution zip keeps. */
  modified: number;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Zip's MS-DOS clock: local-free, two-second steps, and nothing before 1980. */
function dosTime(seconds: number): { time: number; date: number } {
  const d = new Date(Math.max(seconds * 1000, Date.UTC(1980, 0, 1)));
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** General purpose flag bit 11: the name is UTF-8. */
const UTF8 = 0x0800;
const DEFLATE = 8;
const STORE = 0;

export async function zip(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const packed = await deflate(entry.data);
    // Deflate can grow data that does not compress; stored is always the smaller then.
    const method = packed.length < entry.data.length ? DEFLATE : STORE;
    const body = method === DEFLATE ? packed : entry.data;
    const { time, date } = dosTime(entry.modified);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8, true);
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, UTF8, true);
    record.setUint16(10, method, true);
    record.setUint16(12, time, true);
    record.setUint16(14, date, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, body.length, true);
    record.setUint32(24, entry.data.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);

    parts.push(new Uint8Array(local.buffer), name, body);
    central.push(new Uint8Array(record.buffer), name);
    offset += 30 + name.length + body.length;
  }

  const size = central.reduce((n, part) => n + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: "application/zip",
  });
}
