// Transparent heart and great vessels from the NIH Human Reference Atlas (CC BY 4.0), with the catheter
// and balloon. Draws only. Units: cm, patient frame (x left, y superior, z anterior), heart centre at 0.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ORIGIN, LABELS, EXT } from '../anatomy/heartModel.js';

const BLUE = 0x5a8cff, RED = 0xff5a6e, PURPLE = 0x9b7bff, GREY = 0x9aa7b8, VALVE = 0xf2f5fa;
const V = (a) => new THREE.Vector3(...a);
// part id -> colour, resting opacity
const LOOK = {
  ra: [BLUE, 0.1], rv: [BLUE, 0.1], svc: [BLUE, 0.18], ivc: [BLUE, 0.16], bcv: [BLUE, 0.18], ivc2: [BLUE, 0.14], cil: [BLUE, 0.14], eil: [BLUE, 0.14],
  pa: [PURPLE, 0.12], rpa: [PURPLE, 0.12], lpa: [PURPLE, 0.1],
  la: [RED, 0.07], lv: [RED, 0.07], ao: [RED, 0.07], dao: [RED, 0.06], pvri: [RED, 0.07], pvrs: [RED, 0.07], pvli: [RED, 0.07], pvls: [RED, 0.07],
  septum: [GREY, 0.06], tv: [VALVE, 0.3], pv: [VALVE, 0.3], mv: [VALVE, 0.12], av: [VALVE, 0.12],
  // drawn here: the veins above and below the model, and the distal right PA branch where the balloon wedges
  ext_svc: [BLUE, 0.18], ext_ivc: [BLUE, 0.14], branch: [PURPLE, 0.14],
};
const CHAMBERS = ['ra', 'rv', 'la', 'lv'];
// tip site -> parts to highlight
const HIGHLIGHT = { svc: ['svc', 'bcv', 'ext_svc'], ivc: ['ivc', 'ivc2', 'cil', 'eil', 'ext_ivc'], ra: ['ra'], rv: ['rv'], pa: ['pa', 'rpa'], puw: ['rpa', 'branch'], pcw: ['branch'], ow: ['branch'] };
const TEXT = { ra: 'RA', rv: 'RV', la: 'LA', lv: 'LV', svc: 'SVC', ivc: 'IVC', pa: 'PA', rpa: 'RPA', lpa: 'LPA', ao: 'Ao', tv: 'Tricuspid', pv: 'Pulmonary valve' };

export class Heart3D {
  constructor(mount, labelsEl) {
    this.mount = mount; this.labelsEl = labelsEl; this.labelsOn = true;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    mount.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.resetView();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(8, 14, 20); this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.5); dl2.position.set(-10, -6, -12); this.scene.add(dl2);

    this.parts = {}; this.labels = [];
    for (const [id, text] of Object.entries(TEXT)) this.addLabel(text, V(LABELS[id]), ['la', 'lv', 'ao'].includes(id) ? 'lbl-l' : ['tv', 'pv'].includes(id) ? 'lbl-v' : '');
    // extensions beyond the HRA vessels, along the catheter route
    // each starts inside the model vessel's end, along its axis and at its radius, so the lumen is continuous
    for (const [id, e] of Object.entries(EXT)) this.addPart(id, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(e.pts.map(V)), 40, e.r, 16, false));
    this.loaded = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/heart.glb`).then((g) => this.addModel(g.scene));

    this.cath = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhongMaterial({ color: 0xffe066, emissive: 0x332200 }));
    this.balloon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshPhongMaterial({ color: 0xffb02e, transparent: true, opacity: 0.6, emissive: 0x331800 }));
    this.tipDot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff3b3b, depthTest: false }));
    this.tipDot.renderOrder = 10; // stays visible through the translucent walls
    this.scene.add(this.cath, this.balloon, this.tipDot);
    this.lastS = -1; this.inflate = 0;
    new ResizeObserver(() => this.resize()).observe(mount);
    this.resize();
  }

  /** One translucent part, its geometry centred on itself so it can beat in place. */
  addPart(id, geom) {
    const [col, op] = LOOK[id];
    geom.computeBoundingSphere();
    const c = geom.boundingSphere.center.clone();
    geom.translate(-c.x, -c.y, -c.z);
    geom.computeVertexNormals();
    const m = new THREE.Mesh(geom, new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, shininess: 50 }));
    m.position.copy(c); m.userData.op = op; m.renderOrder = col === VALVE ? 2 : 1;
    this.scene.add(m); this.parts[id] = m;
  }

  /** HRA meshes are in metres in the body frame: bake each into cm about the heart centre. */
  addModel(root) {
    root.scale.setScalar(100); root.position.set(...ORIGIN.map((v) => -v * 100)); root.updateMatrixWorld(true);
    for (const id of Object.keys(LOOK)) {
      const obj = root.getObjectByName(id);
      if (!obj) continue;
      const geoms = [];
      obj.traverse((o) => { if (o.isMesh) geoms.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });
      for (const [i, g] of geoms.entries()) {
        g.deleteAttribute('normal'); g.deleteAttribute('uv');
        this.addPart(i ? `${id}_${i}` : id, g);
        if (i) LOOK[`${id}_${i}`] = LOOK[id];
      }
    }
  }

  addLabel(text, pos, cls = '') {
    const d = document.createElement('div'); d.className = `lbl ${cls}`; d.textContent = text;
    this.labelsEl.append(d); this.labels.push({ d, pos });
  }

  setPath(path) { this.path = path; this.lastS = -1; }

  resetView() { this.camera.position.set(5, 2, 33); this.controls.target.set(0, 0.5, -1); this.controls.update(); }
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
        const c = V(cath.pointAt(Math.max(0.5, cath.s - 1))), r = 0.5 + Math.min(1.0, cath.slack * 0.05), turns = 1 + Math.floor(cath.slack / 10);
        for (let i = 0; i <= 24 * turns; i++) { const a = (i / 24) * 2 * Math.PI; pts.push(c.clone().add(new THREE.Vector3(Math.cos(a) * r, -r + Math.sin(a) * r * 0.8 - i * 0.01, Math.sin(a) * 0.3))); }
      }
      pts.push(V(cath.pointAt()));
      if (pts.length < 2) pts.unshift(V(cath.pointAt(0)));
      this.cath.geometry.dispose();
      this.cath.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 2), 0.14, 8, false);
    }
    const tip = V(cath.pointAt());
    this.inflate += ((cath.balloon ? 1 : 0) - this.inflate) * Math.min(1, dt * 6);
    this.balloon.position.copy(tip); this.balloon.visible = this.inflate > 0.05; this.balloon.scale.setScalar(Math.max(0.05, this.inflate));
    this.tipDot.position.copy(tip);

    // beat in place (ventricles in systole, atria with their contraction) and highlight where the tip is
    const on = HIGHLIGHT[cath.site] ?? [];
    for (const [id, m] of Object.entries(this.parts)) {
      const base = id.split('_')[0];
      if (CHAMBERS.includes(base)) m.scale.setScalar(base === 'rv' || base === 'lv' ? 1 - 0.06 * beat.vSys : 1 - 0.04 * beat.aSys);
      m.material.opacity = on.includes(base) || on.includes(id) ? Math.max(0.26, m.userData.op) : m.userData.op;
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
