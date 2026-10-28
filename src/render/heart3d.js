// Transparent schematic heart and great vessels, with the catheter and balloon. Draws only.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const BLUE = 0x5a8cff, RED = 0xff5a6e, PURPLE = 0x9b7bff;
const V = (a) => new THREE.Vector3(...a);

// chambers: centre, radii, rotation (rad, about z), colour; `site` = tip site that highlights it
const CHAMBERS = [
  { id: 'ra', label: 'RA', c: [-3.0, 0.3, 0.2], r: [2.3, 2.6, 2.2], rz: 0, col: BLUE },
  { id: 'rv', label: 'RV', c: [1.0, -1.4, 2.6], r: [3.0, 2.4, 1.5], rz: -0.35, col: BLUE },
  { id: 'la', label: 'LA', c: [1.6, 2.2, -2.8], r: [2.3, 1.6, 1.8], rz: 0, col: RED },
  { id: 'lv', label: 'LV', c: [3.0, -1.6, -0.3], r: [2.5, 3.4, 2.3], rz: 0.6, col: RED },
];
const VESSELS = [
  { id: 'svc', label: 'SVC', col: BLUE, r: 0.9, pts: [[-4.6, 15, 0.2], [-3.6, 8, -0.4], [-3.2, 2.4, 0]] },
  { id: 'ivc', label: 'IVC', col: BLUE, r: 1.1, pts: [[-2.4, -11, -1.2], [-2.6, -6, -1.0], [-2.9, -1.8, -0.2]] },
  { id: 'pa', label: 'PA', col: PURPLE, r: 1.3, pts: [[1.4, 3.4, 3.1], [1.5, 5.4, 1.6], [0.4, 6.4, 0.1]] },
  { id: 'rpa', label: 'RPA', col: PURPLE, r: 0.9, pts: [[0.4, 6.4, 0.1], [-2.2, 6.4, -0.9], [-5.0, 5.7, -1.4], [-7.4, 4.5, -1.8]] },
  { id: 'lpa', label: 'LPA', col: PURPLE, r: 0.85, pts: [[0.4, 6.4, 0.1], [3.0, 6.8, -1.0], [5.6, 6.0, -1.6], [7.4, 4.8, -1.9]] },
  { id: 'rvot', label: '', col: BLUE, r: 1.2, pts: [[1.6, -0.6, 3.4], [2.0, 1.2, 3.8], [1.4, 3.4, 3.1]] },
  { id: 'ao', label: 'Ao', col: RED, r: 1.2, pts: [[1.4, 1.0, 0.4], [0.6, 4.5, 0.8], [0.0, 8.2, -0.4], [1.6, 9.0, -2.8], [2.6, 6.5, -4.2], [2.6, -9, -4.2]] },
];

export class Heart3D {
  constructor(mount, labelsEl) {
    this.mount = mount; this.labelsEl = labelsEl; this.labelsOn = true;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    mount.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.resetView();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(8, 14, 20); this.scene.add(dl);

    this.parts = {}; this.labels = [];
    const mat = (col, op) => new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, shininess: 60 });
    for (const ch of CHAMBERS) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat(ch.col, ch.col === RED ? 0.08 : 0.16));
      m.position.set(...ch.c); m.scale.set(...ch.r); m.rotation.z = ch.rz; m.userData.base = m.scale.clone();
      this.scene.add(m); this.parts[ch.id] = m; this.addLabel(ch.label, V(ch.c).add(new THREE.Vector3(0, ch.r[1] * 0.55, 0)), ch.col === RED ? 'lbl-l' : '');
    }
    for (const v of VESSELS) {
      const curve = new THREE.CatmullRomCurve3(v.pts.map(V));
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, v.r, 20, false), mat(v.col, v.col === RED ? 0.08 : 0.15));
      this.scene.add(m); this.parts[v.id] = m;
      if (v.label) this.addLabel(v.label, curve.getPoint(v.id === 'ao' ? 0.4 : 0.55), v.col === RED ? 'lbl-l' : '');
    }
    this.valves = {};
    this.cath = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhongMaterial({ color: 0xffe066, emissive: 0x332200 }));
    this.scene.add(this.cath);
    this.balloon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshPhongMaterial({ color: 0xffb02e, transparent: true, opacity: 0.6, emissive: 0x331800 }));
    this.tipDot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    this.scene.add(this.balloon, this.tipDot);
    this.lastS = -1; this.inflate = 0;
    new ResizeObserver(() => this.resize()).observe(mount);
    this.resize();
  }

  addLabel(text, pos, cls = '') {
    const d = document.createElement('div'); d.className = `lbl ${cls}`; d.textContent = text;
    this.labelsEl.append(d); this.labels.push({ d, pos });
  }

  /** The path for the current access: draws the valve rings at the tricuspid and pulmonary valves. */
  setPath(path) {
    this.path = path; this.lastS = -1;
    for (const v of Object.values(this.valves)) { this.scene.remove(v.mesh); v.lbl.d.remove(); this.labels.splice(this.labels.indexOf(v.lbl), 1); }
    this.valves = {};
    for (const [id, s, label] of [['tv', path.tv, 'Tricuspid'], ['pv', path.pv, 'Pulmonary valve']]) {
      const i = path.cum.findIndex((c) => c >= s), p = V(path.pts[i].p), q = V(path.pts[Math.min(i + 1, path.pts.length - 1)].p);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(id === 'tv' ? 1.5 : 1.1, 0.08, 8, 40), new THREE.MeshBasicMaterial({ color: 0xe8eef6, transparent: true, opacity: 0.7 }));
      ring.position.copy(p); ring.lookAt(p.clone().add(q.sub(p)));
      this.scene.add(ring);
      this.addLabel(label, p.clone().add(new THREE.Vector3(id === 'tv' ? -0.6 : 1.8, id === 'tv' ? -1.8 : 0.2, 0)), 'lbl-v');
      this.valves[id] = { mesh: ring, lbl: this.labels.at(-1) };
    }
  }

  resetView() { this.camera.position.set(4, 3, 34); this.controls.target.set(-0.5, 1.5, 0); this.controls.update(); }
  setLabels(v) { this.labelsOn = v; this.labelsEl.hidden = !v; }

  resize() {
    const w = this.mount.clientWidth || 1, h = this.mount.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /** beat: {vSys 0..1 ventricular contraction, aSys 0..1 atrial contraction} */
  update(cath, beat, dt) {
    const P = this.path;
    if (Math.abs(cath.s + cath.slack - this.lastS) > 0.02) {
      this.lastS = cath.s + cath.slack;
      const pts = []; for (let i = 0; i < P.pts.length && P.cum[i] < cath.s; i++) pts.push(V(P.pts[i].p));
      if (cath.slack > 0.5) { // coiled catheter: draw the loop just behind the tip, growing with the slack
        const c = V(cath.pointAt(Math.max(0.5, cath.s - 1))), r = 0.6 + Math.min(1.4, cath.slack * 0.06), turns = 1 + Math.floor(cath.slack / 10);
        for (let i = 0; i <= 24 * turns; i++) { const a = (i / 24) * 2 * Math.PI; pts.push(c.clone().add(new THREE.Vector3(Math.cos(a) * r, -r + Math.sin(a) * r * 0.8 - i * 0.01, Math.sin(a) * 0.3))); }
      }
      pts.push(V(cath.pointAt()));
      if (pts.length < 2) pts.unshift(V(cath.pointAt(0)));
      this.cath.geometry.dispose();
      this.cath.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 2), 0.16, 8, false);
    }
    const tip = V(cath.pointAt());
    this.inflate += ((cath.balloon ? 1 : 0) - this.inflate) * Math.min(1, dt * 6);
    this.balloon.position.copy(tip); this.balloon.visible = this.inflate > 0.05; this.balloon.scale.setScalar(Math.max(0.05, this.inflate));
    this.tipDot.position.copy(tip);

    // gentle beating, and highlight the chamber the tip is in
    const site = cath.site;
    for (const ch of CHAMBERS) {
      const m = this.parts[ch.id], k = ch.id === 'rv' || ch.id === 'lv' ? 1 - 0.07 * beat.vSys : 1 - 0.05 * beat.aSys;
      m.scale.copy(m.userData.base).multiplyScalar(k);
    }
    const hl = { ra: 'ra', rv: 'rv', svc: 'svc', ivc: 'ivc', pa: 'rpa', pcw: 'rpa', puw: 'rpa', ow: 'rpa' }[site];
    for (const [id, m] of Object.entries(this.parts)) {
      const red = m.material.color.getHex() === RED, on = id === hl || (site === 'pa' && (id === 'pa' || id === 'rpa')) || (site === 'rv' && id === 'rvot');
      m.material.opacity = on ? 0.32 : red ? 0.07 : 0.14;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (this.labelsOn) {
      const w = this.mount.clientWidth, h = this.mount.clientHeight;
      for (const { d, pos } of this.labels) {
        const p = pos.clone().project(this.camera);
        d.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -50%)`;
        d.style.display = p.z < 1 ? '' : 'none';
      }
    }
  }
}
