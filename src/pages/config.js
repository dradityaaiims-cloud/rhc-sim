// Site settings for the About page. Nothing here is secret.
export const CONFIG = {
  version: '0.1.0',
  year: 2026,
  doi: '10.5281/zenodo.23743411',
  title: "Dr. Singh's RHC Simulator: an open educational right heart catheterization waveform simulator",
  // Contact email split so it is not plain text in the page source (reduces scraping).
  emailUser: 'draditya.aiims',
  emailDomain: 'gmail.com',
  // Optional: a public feedback form (e.g. a Google Form link). Empty = the Feedback button falls back to email.
  feedbackUrl: '',
};
export const mailto = (subject = '') => `mailto:${CONFIG.emailUser}@${CONFIG.emailDomain}${subject ? '?subject=' + encodeURIComponent(subject) : ''}`;
