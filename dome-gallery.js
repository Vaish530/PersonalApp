/**
 * Stacked Card Deck — Workspace Navigation
 *
 * Cards spread out like physical papers/cards on a desk.
 * All 4 cards are visible simultaneously at different rotations & offsets.
 * The "top" card is upright and fully readable; others peek from behind.
 * Click any card to bring it to the top.  Arrow buttons also cycle the deck.
 */

window.DomeGallery = (function () {

  /* ── Module data ─────────────────────────────────────────────── */
  const cardColors = {
    red:       { from: '#f94144', to: '#c1121f', glow: '249,65,68',   text: '#fff' },
    tangerine: { from: '#f3722c', to: '#b5431a', glow: '243,114,44',  text: '#fff' },
    sun:       { from: '#f9c74f', to: '#d4a017', glow: '249,199,79',  text: '#2d1e00' },
    seagrass:  { from: '#43aa8b', to: '#1f7a5e', glow: '67,170,139',  text: '#fff' },
    cerulean:  { from: '#277da1', to: '#1a526b', glow: '39,125,161',  text: '#fff' },
  };

  const modules = [
    { id: 'todo',      name: 'To-Do Tracker',   color: 'red',       icon: 'fa-list-check',    actionText: 'Open Tracker'    },
    { id: 'notes',     name: 'Sticky Notes',     color: 'tangerine', icon: 'fa-note-sticky',   actionText: 'Open Whiteboard' },
    { id: 'gate',      name: 'GATE Prep',        color: 'sun',       icon: 'fa-graduation-cap',actionText: 'Track Syllabus'  },
    { id: 'documents', name: 'Document Vault',   color: 'seagrass',  icon: 'fa-folder-open',   actionText: 'Open Vault'      },
    { id: 'acadexa',   name: 'Acadexa Hub',     color: 'cerulean',  icon: 'fa-user-graduate', actionText: 'Open Acadexa'    },
  ];

  /*
   * Stack slot transforms — index 0 = top card, 1 = second, 2 = third, 3 = bottom.
   * These create the "cards spread on a table" look from the sketch.
   */
  const slots = [
    // slot 0 — top / front card (slightly tilted, prominent)
    { rotate: '-3deg',  tx: '0px',   ty: '0px',   scale: 1,    z: 50, opacity: 1,    blur: 0   },
    // slot 1 — second card, fans to the left-back
    { rotate: '-14deg', tx: '-52px', ty: '18px',  scale: 0.96, z: 40, opacity: 0.88, blur: 0   },
    // slot 2 — third card, fans to the right-back
    { rotate: '11deg',  tx: '46px',  ty: '30px',  scale: 0.92, z: 30, opacity: 0.78, blur: 0   },
    // slot 3 — fourth card, fans to the left-back
    { rotate: '-7deg',  tx: '-18px', ty: '46px',  scale: 0.86, z: 20, opacity: 0.65, blur: 1.0 },
    // slot 4 — bottom / back card, mostly obscured
    { rotate: '6deg',   tx: '24px',  ty: '58px',  scale: 0.80, z: 10, opacity: 0.45, blur: 2.0 },
  ];

  /* ── State ───────────────────────────────────────────────────── */
  let topIndex       = 0;        // which module is currently on top
  let cardEls        = [];       // DOM elements for each module (stable refs)
  let deckEl         = null;     // .card-deck container
  let wrapperEl      = null;
  let onSelectCb     = null;
  let isAnimating    = false;
  let dashboardData  = {};

  /* ── Public init ─────────────────────────────────────────────── */
  function init(data, onCardSelect) {
    dashboardData  = data || {};
    onSelectCb     = onCardSelect;
    wrapperEl      = document.querySelector('.dome-gallery-wrapper');
    deckEl         = document.getElementById('dome-gallery');

    if (!deckEl || !wrapperEl) return;

    const onboardingEl = document.getElementById('gallery-onboarding');
    const controlsEl   = document.getElementById('gallery-controls');
    if (onboardingEl) onboardingEl.style.display = 'none';
    if (controlsEl)   controlsEl.style.display   = 'flex';

    buildCards();
    layoutCards();
    bindEvents();
  }

  /* ── Build card DOM (once) ───────────────────────────────────── */
  function buildCards() {
    deckEl.innerHTML = '';
    cardEls = [];

    modules.forEach((mod, i) => {
      const c    = cardColors[mod.color] || cardColors.seagrass;
      const card = document.createElement('div');
      card.className        = 'deck-card';
      card.dataset.modIndex = i;
      card.style.background = `linear-gradient(145deg, ${c.from} 0%, ${c.to} 100%)`;
      card.style.color      = c.text;
      card.style.setProperty('--glow', c.glow);

      const metrics = getMetrics(mod.id);

      card.innerHTML = `
        <div class="dc-top">
          <div class="dc-icon"><i class="fa-solid ${mod.icon}"></i></div>
          <span class="dc-badge">${i + 1}/5</span>
        </div>
        <div class="dc-title">${mod.name}</div>
        <div class="dc-body">
          <div class="dc-metric primary">${metrics.primary}</div>
          <div class="dc-metric secondary">${metrics.secondary}</div>
          <button class="dc-btn">
            ${mod.actionText}
            <i class="fa-solid fa-arrow-right" style="font-size:0.65rem; margin-left:4px;"></i>
          </button>
        </div>
      `;

      deckEl.appendChild(card);
      cardEls.push(card);
    });
  }

  /* ── Assign positions based on current topIndex ──────────────── */
  function layoutCards(animated) {
    cardEls.forEach((card, modIdx) => {
      // slot = distance from top (0 = top, 1 = next, ...)
      const slot = ((modIdx - topIndex) % 5 + 5) % 5;
      const s    = slots[slot];

      card.style.transition = animated
        ? 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease, filter 0.4s ease, z-index 0s'
        : 'none';

      card.style.transform  = `translateX(${s.tx}) translateY(${s.ty}) rotate(${s.rotate}) scale(${s.scale})`;
      card.style.zIndex     = s.z;
      card.style.opacity    = s.opacity;
      card.style.filter     = s.blur > 0 ? `blur(${s.blur}px)` : 'none';
      card.style.pointerEvents = slot === 0 ? 'auto' : 'auto';

      card.classList.toggle('is-top', slot === 0);
    });
  }

  /* ── Rotate deck: bring card at modIndex to top ──────────────── */
  function bringToTop(modIdx) {
    if (isAnimating) return;
    isAnimating = true;
    topIndex    = modIdx;
    layoutCards(true);
    setTimeout(() => { isAnimating = false; }, 520);
  }

  function cycleNext() {
    bringToTop((topIndex + 1) % 5);
  }

  // Helper function: standard remainder
  function mod5(val) {
    return ((val % 5) + 5) % 5;
  }

  function cyclePrev() {
    bringToTop(mod5(topIndex - 1));
  }

  /* ── Events ───────────────────────────────────────────────────── */
  function bindEvents() {
    // Card clicks
    deckEl.addEventListener('click', (e) => {
      const card = e.target.closest('.deck-card');
      if (!card) return;

      const modIdx = parseInt(card.dataset.modIndex);
      const slot   = ((modIdx - topIndex) % 5 + 5) % 5;

      if (slot === 0) {
        // Already on top — navigate
        if (onSelectCb) onSelectCb(modules[modIdx].id);
      } else {
        // Bring this card to top
        bringToTop(modIdx);
      }
    });

    // Arrow buttons — up: prev, down: next
    const btnPrev = document.getElementById('btn-gallery-prev');
    const btnNext = document.getElementById('btn-gallery-next');
    if (btnPrev) btnPrev.onclick = (e) => { e.stopPropagation(); cyclePrev(); };
    if (btnNext) btnNext.onclick = (e) => { e.stopPropagation(); cycleNext(); };

    // Swipe support (touch)
    let touchStartX = 0, touchStartY = 0;
    wrapperEl.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    wrapperEl.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        dx < 0 ? cycleNext() : cyclePrev();
      }
    });
  }

  /* ── Helpers ────────────────────────────────────────────────── */
  function getMetrics(id) {
    const d = dashboardData;
    switch (id) {
      case 'todo':      return { primary: `${d.todosPending || 0} Active Tasks`,   secondary: `${d.todosHigh || 0} High Priority` };
      case 'notes':     return { primary: `${d.notesCount  || 0} Notes Written`,   secondary: d.latestNoteTitle ? `Latest: ${d.latestNoteTitle}` : 'No notes yet' };
      case 'gate':      return { primary: `${d.gateProgress || 0}% Completed`,     secondary: `${d.gateDaysLeft || 0} Days Until Exam` };
      case 'documents': return { primary: `${d.docsCount   || 0} Files Saved`,     secondary: d.latestDocName ? `Latest: ${d.latestDocName}` : 'No files yet' };
      case 'acadexa':   return { primary: `${d.subjectsCount || 0} Subjects Tracked`, secondary: `${d.eventsCount || 0} Scheduled Events` };
      default:          return { primary: '', secondary: '' };
    }
  }

  return { init };
})();
