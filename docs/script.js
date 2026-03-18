// ============================================================
//  script.js — Aedin Lai Portfolio
//  Linked from: index.html
// ============================================================

const progressBar  = document.getElementById('scrollProgress');
const mainNav      = document.getElementById('mainNav');
const hamburger    = document.getElementById('hamburger');
const navDrawer    = document.getElementById('navDrawer');
const heroSidenav  = document.getElementById('heroSidenav');

// ── SIDENAV FADE (based purely on scroll position) ──────
function updateSidenav() {
  const heroH = document.getElementById('hero').offsetHeight;
  if (window.scrollY < heroH * 0.75) {
    heroSidenav.classList.remove('hidden');
  } else {
    heroSidenav.classList.add('hidden');
  }
}

window.addEventListener('scroll', () => {
  // Scroll progress bar
  const pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
  progressBar.style.width = pct + '%';

  // Nav bar appearance
  const heroH = document.getElementById('hero').offsetHeight;
  mainNav.classList.toggle('scrolled', window.scrollY > heroH * 0.6);

  // Sidenav visibility
  updateSidenav();
});

// Show on load
setTimeout(() => { heroSidenav.classList.remove('hidden'); }, 400);

// ── HAMBURGER MENU ────────────────────────────────────────
hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navDrawer.classList.toggle('open');
});

// Close drawer when a nav link is clicked
document.querySelectorAll('.drawer-link').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navDrawer.classList.remove('open');
  });
});

// ── SCROLL REVEAL ─────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
