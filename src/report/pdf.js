// A minimal PDF writer: pages with Helvetica text and JPEG images (DCTDecode). No dependencies.
// page = { w, h, items: [{ text, x, y, size?, bold? } | { jpeg: Uint8Array, iw, ih, x, y, w, h }] }  (points, origin bottom-left)
const ascii = (s) => String(s).replace(/[−–—]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[·•]/g, '-').replace(/°/g, ' deg')
  .replace(/[²]/g, '2').replace(/[₂]/g, '2').replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, (c) => `\\${c}`);

export function makePdf(pages) {
  const enc = new TextEncoder(), parts = [], offsets = [];
  let len = 0;
  const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const objs = []; // [id, () => content]
  let next = 1;
  const reserve = () => next++;
  const catalog = reserve(), pagesId = reserve(), font = reserve(), fontB = reserve();
  const pageIds = [];
  const bodies = new Map();
  bodies.set(font, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  bodies.set(fontB, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  for (const pg of pages) {
    const pid = reserve(), cid = reserve(), imgs = [];
    let ops = '';
    for (const it of pg.items) {
      if (it.jpeg) {
        const iid = reserve(), name = `Im${iid}`;
        imgs.push(`/${name} ${iid} 0 R`);
        bodies.set(iid, { dict: `<< /Type /XObject /Subtype /Image /Width ${it.iw} /Height ${it.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${it.jpeg.length} >>`, data: it.jpeg });
        ops += `q ${it.w} 0 0 ${it.h} ${it.x} ${it.y} cm /${name} Do Q\n`;
      } else {
        ops += `BT /${it.bold ? 'F2' : 'F1'} ${it.size ?? 10} Tf ${it.x} ${it.y} Td (${ascii(it.text)}) Tj ET\n`;
      }
    }
    const content = enc.encode(ops);
    bodies.set(cid, { dict: `<< /Length ${content.length} >>`, data: content });
    bodies.set(pid, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pg.w} ${pg.h}] /Contents ${cid} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> /XObject << ${imgs.join(' ')} >> >> >>`);
    pageIds.push(pid);
  }
  bodies.set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  bodies.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  for (let id = 1; id < next; id++) {
    offsets[id] = len;
    const b = bodies.get(id);
    put(`${id} 0 obj\n`);
    if (typeof b === 'string') put(`${b}\n`);
    else { put(`${b.dict}\nstream\n`); put(b.data); put('\nendstream\n'); }
    put('endobj\n');
  }
  const xref = len;
  put(`xref\n0 ${next}\n0000000000 65535 f \n`);
  for (let id = 1; id < next; id++) put(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${next} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
