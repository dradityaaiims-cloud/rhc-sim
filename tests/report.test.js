import test from 'node:test';
import assert from 'node:assert/strict';
import { makePdf } from '../src/report/pdf.js';
import { Session, stripWindows, clock } from '../src/report/session.js';

test('PDF has a header, valid xref offsets and an EOF', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = makePdf([{ w: 842, h: 595, items: [{ text: 'RV 25/4 (EDP) – mPAP ≤ 20 (test)', x: 40, y: 550, size: 12 }, { jpeg, iw: 2, ih: 2, x: 40, y: 40, w: 100, h: 50 }] }, { w: 842, h: 595, items: [{ text: 'page 2', x: 40, y: 550 }] }]);
  const s = new TextDecoder('latin1').decode(pdf);
  assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
  assert.match(s, /\/Count 2/);
  assert.match(s, /\(RV 25\/4 \\\(EDP\\\) - mPAP <= 20 \\\(test\\\)\) Tj/);
  const xref = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.ok(s.slice(xref).startsWith('xref'));
  for (const [, off, id] of [...s.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m, i) => [m, Number(m[1]), i + 1])) assert.ok(s.slice(off).startsWith(`${id} 0 obj`), `object ${id}`);
});
test('session keeps time from the case start, and strips cover each site change and recording', () => {
  const ses = new Session();
  for (let t = 100; t < 160; t += 0.004) ses.push({ t, ecg: 0, p: 5, site: t < 120 ? 'ra' : 'rv' });
  ses.event(100, 'case', 'start'); ses.event(120, 'site', 'RV'); ses.event(150, 'record', 'RV 25/4');
  assert.ok(Math.abs(ses.duration - 60) < 0.05);
  assert.deepEqual(stripWindows(ses.events, ses.duration), [[18, 26], [48, 56]]);
  assert.equal(clock(75.4), '01:15');
});
