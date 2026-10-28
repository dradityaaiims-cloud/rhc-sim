// About page: author, links, feedback, citation, disclosures, privacy (same structure as the bronchoscopy and ventilator simulators').
import { CONFIG, mailto } from './config.js';

const ME = {
  name: 'Aditya Singh, MD',
  photo: 'assets/aditya-singh.jpg',
  bio: [
    'I am an internal medicine resident with an interest in pulmonary and critical care medicine and in medical education. I build free interactive web apps and write about health and medical education.',
    'I made this simulator because right heart catheterization waveforms are hard to picture from a textbook. Advancing a catheter through a 3D heart while the pressure trace changes beside it lets students, residents and fellows connect each waveform to where the tip is and why it looks the way it does.',
  ],
  links: [
    ['LinkedIn', 'https://www.linkedin.com/in/drsinghaditya03/'],
    ['Linktree (all my links)', 'https://linktr.ee/aditya.md'],
    ['Google Scholar', 'https://scholar.google.com/citations?hl=en&user=-EqF9yEAAAAJ'],
    ['Articles on KevinMD', 'https://kevinmd.com/post-author/aditya-singh'],
    ['Writing on Medium', 'https://medium.com/@draditya.aiims'],
  ],
  apps: [
    ["Dr. Singh's Vent Sim (mechanical ventilator simulator)", 'https://dradityaaiims-cloud.github.io/vent-sim/'],
    ["Dr. Singh's Bronch Sim (bronchoscopy simulator)", 'https://dradityaaiims-cloud.github.io/bronchoscopy-sim/'],
  ],
};

const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

function citations() {
  const ref = CONFIG.doi ? `https://doi.org/${CONFIG.doi}` : 'https://github.com/dradityaaiims-cloud';
  return {
    apaText: `Singh, A. (${CONFIG.year}). ${CONFIG.title} (Version ${CONFIG.version}) [Computer software]. ${ref}`,
    apa: `Singh, A. (${CONFIG.year}). <i>${esc(CONFIG.title)}</i> (Version ${CONFIG.version}) [Computer software]. ${ref}`,
    bib: `@software{singh_rhcsim_${CONFIG.year},\n  author  = {Singh, Aditya},\n  title   = {${CONFIG.title}},\n  year    = {${CONFIG.year}},\n  version = {${CONFIG.version}},\n${CONFIG.doi ? `  doi     = {${CONFIG.doi}},\n` : ''}  url     = {${ref}}\n}`,
  };
}

export function renderAbout(box) {
  const c = citations();
  const photo = `${import.meta.env.BASE_URL}${ME.photo}`;
  box.innerHTML = `<div class="prose">
<h2>About</h2>
<div class="aboutme">
  <img class="headshot" src="${photo}" alt="Portrait of ${esc(ME.name)}" width="180" height="180">
  <div>
    <h3>${esc(ME.name)}</h3>
    ${ME.bio.map((p) => `<p>${esc(p)}</p>`).join('')}
  </div>
</div>

<h3>Find me</h3>
<ul>${ME.links.map(([t, u]) => `<li>${a(u, t)}</li>`).join('')}</ul>
<h3>More apps by me</h3>
<ul>${ME.apps.map(([t, u]) => `<li>${a(u, t)}</li>`).join('')}</ul>

<h3>Contact, feedback and bug reports</h3>
<p>Questions, ideas, corrections and bug reports are welcome. For bugs, please say which mode, scenario, browser and what you pressed.</p>
<div class="btns">
  <a class="btnlink primary" id="fb-link" target="_blank" rel="noopener noreferrer">Give feedback / report a bug</a>
  <a class="btnlink" id="mail-link">Email me</a>
</div>

<h3>Cite this tool</h3>
<p>If you use this simulator in teaching or in a publication, please cite it${CONFIG.doi ? ` (DOI: <a href="https://doi.org/${CONFIG.doi}" target="_blank" rel="noopener noreferrer">${CONFIG.doi}</a>)` : ''}.</p>
<p><b>APA</b></p><pre class="cite">${c.apa}</pre><button data-copy="apa">Copy APA</button>
<p><b>BibTeX</b></p><pre class="cite">${esc(c.bib)}</pre><button data-copy="bib">Copy BibTeX</button>

<h3>Disclosures</h3>
<ul>
<li><b>Purpose.</b> Educational use only. This is not a medical device and must not be used for clinical decisions, procedure planning, assessment or exams. All waveforms, pressures and cases are simulated. Never enter patient information into any part of this site.</li>
<li><b>Manufacturers.</b> Not affiliated with or endorsed by any catheter or haemodynamic monitoring manufacturer. "Swan-Ganz style" describes a class of balloon-tipped, flow-directed catheters only; the monitor is a generic look.</li>
<li><b>Assistant.</b> Boba, the assistant dog, is rule-based (no AI model, no network) and is shared with the ventilator and bronchoscopy simulators.</li>
<li><b>3D anatomy.</b> The heart and great vessels are derived from the NIH Human Reference Atlas (HuBMAP), 3D Reference Organs for the Heart and Blood Vasculature, Male, v1.2 (Visible Human Male data from the U.S. National Library of Medicine), CC BY 4.0. Changes: selected structures, simplified meshes, re-centred; the catheter path, distal pulmonary artery branch and venous extensions are drawn by the simulator. See <code>public/models/ATTRIBUTION.md</code>.</li>
<li><b>Funding and conflicts of interest.</b> None declared.</li>
<li><b>Software development.</b> The software was developed with AI coding assistance (Claude, by Anthropic), directed by the author, and is covered by automated tests of the waveform, catheter and scoring logic.</li>
<li><b>Views.</b> The views here are my own and do not represent my employer or training program.</li>
<li><b>Licence.</b> The software is open source under the MIT licence. The 3D heart model in <code>public/models</code> keeps the CC BY 4.0 licence of its source; please credit it.</li>
</ul>

<h3>Privacy</h3>
<p>The simulator runs entirely in your browser. Progress, scores and settings are saved only in your browser's local storage. This site does not use analytics or cookies. If you send feedback by email, I receive what you type and your email address. Please do not include anything identifying a patient.</p>
</div>`;
  const fb = box.querySelector('#fb-link');
  fb.href = CONFIG.feedbackUrl || mailto('RHC Simulator feedback / bug report');
  if (!CONFIG.feedbackUrl) fb.removeAttribute('target');
  box.querySelector('#mail-link').href = mailto('RHC Simulator');
  box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const text = b.dataset.copy === 'apa' ? c.apaText : c.bib;
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch { prompt('Copy this citation', text); }
    setTimeout(() => { b.textContent = b.dataset.copy === 'apa' ? 'Copy APA' : 'Copy BibTeX'; }, 1500);
  }));
}
