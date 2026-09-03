/*!
 * Swarm Cloner behavior layer. Dependency-free, idempotent, offline-safe.
 * Re-emits interaction behavior on cloned/redesigned pages whose original
 * framework JS does not run. The build pass (lib/interaction-pass.js) tags
 * elements with data-bx-* hooks; this runtime wires them. FAQ accordions are
 * converted to native <details> by the pass and need no JS here.
 *
 * Hooks: data-bx-nav-toggle / data-bx-nav ; data-bx-accordion ;
 *        data-bx-tabs ; data-bx-gallery ; plus global smooth-scroll on a[href^="#"].
 */
(function () {
  'use strict';
  if (window.__bxInit) return; // idempotent across double-injection
  window.__bxInit = true;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var done = function (el) { return el.getAttribute('data-bx-done') === '1'; };
  var mark = function (el) { el.setAttribute('data-bx-done', '1'); };

  /* ---- mobile nav toggle -------------------------------------------------- */
  function wireNav() {
    document.querySelectorAll('[data-bx-nav-toggle]').forEach(function (btn) {
      if (done(btn)) return; mark(btn);
      var sel = btn.getAttribute('data-bx-nav-toggle');
      var menu = sel ? document.querySelector(sel) : btn.parentElement.querySelector('[data-bx-nav]');
      if (!menu) return;
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var open = menu.classList.toggle('bx-open');
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          // Builder menus hide via their own baked state ([data-undisplayed],
          // opacity:0 wrappers, visibility) that [hidden]-toggling can't undo.
          // Measure and reveal through the drawer's subtree.
          menu.removeAttribute('data-undisplayed');
          var els = [menu].concat([].slice.call(menu.querySelectorAll('*')).slice(0, 80));
          els.forEach(function (el) {
            var cs = getComputedStyle(el);
            if (cs.opacity === '0') el.style.opacity = '1';
            if (cs.visibility === 'hidden') el.style.visibility = 'visible';
          });
          if (menu.offsetHeight === 0) { menu.style.display = 'block'; menu.setAttribute('data-bx-forced', '1'); }
        } else if (menu.getAttribute('data-bx-forced')) {
          menu.style.display = 'none';
        }
      });
      // Close on nav-link click (mobile).
      menu.addEventListener('click', function (e) {
        if (e.target.closest('a')) { menu.classList.remove('bx-open'); btn.setAttribute('aria-expanded', 'false'); }
      });
    });
  }

  /* ---- accordion ---------------------------------------------------------- */
  // Headers are hooked individually (framework panels are rarely DOM siblings,
  // so we resolve the panel via aria-controls first). data-bx-acc-group ties
  // headers into one single-open set when present.
  function wireAccordion() {
    var headers = [].slice.call(document.querySelectorAll('[data-bx-acc-header]'));
    headers.forEach(function (h) {
      if (done(h)) return; mark(h);
      var panel = panelFor(h);
      if (!panel) return;
      var expanded = h.getAttribute('aria-expanded') === 'true';
      setAcc(h, panel, expanded);
      h.addEventListener('click', function (e) {
        e.preventDefault();
        var now = h.getAttribute('aria-expanded') !== 'true';
        var group = h.getAttribute('data-bx-acc-group');
        if (now && group) headers.forEach(function (o) {
          if (o !== h && o.getAttribute('data-bx-acc-group') === group) { var p = panelFor(o); if (p) setAcc(o, p, false); }
        });
        setAcc(h, panel, now);
      });
      h.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.click(); }
      });
    });
  }
  function panelFor(h) {
    var id = h.getAttribute('aria-controls');
    return (id && document.getElementById(id)) || h.nextElementSibling || null;
  }
  function setAcc(h, panel, open) {
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
    if (panel.hasAttribute('aria-hidden')) panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (panel.hasAttribute('data-state')) panel.setAttribute('data-state', open ? 'open' : 'closed');
    if (open && panel.offsetHeight === 0) uncollapse(panel);
  }
  // Frameworks bake the captured-closed state around AND inside the panel:
  // animation wrappers between the accordion item and the panel carry inline
  // display:none / opacity:0 / height:0 (react-animate-height's
  // "rah-static--height-zero", Wix's "*-collapse"). Clearing [hidden] alone
  // still renders 0-high. Measure after opening; neutralize upward first
  // (wrappers control the panel's box), then inward if still collapsed.
  function uncollapse(panel) {
    var fix = function (el) {
      [].slice.call(el.classList).forEach(function (cls) {
        if (/collapsed?$|height-zero/i.test(cls)) el.classList.remove(cls);
      });
      var cs = getComputedStyle(el);
      if (cs.display === 'none') el.style.display = 'block';
      if (cs.opacity === '0') el.style.opacity = '1';
      if (el.offsetHeight === 0) { el.style.height = 'auto'; el.style.maxHeight = 'none'; }
    };
    var up = panel;
    for (var d = 0; d < 4 && up && up.offsetHeight === 0; d++) { fix(up); up = up.parentElement; }
    if (panel.offsetHeight > 0) return;
    [].slice.call(panel.querySelectorAll('*')).slice(0, 60).forEach(function (el) {
      if (el.offsetHeight === 0) fix(el);
    });
  }

  /* ---- desktop nav dropdown ---------------------------------------------- */
  function wireDropdown() {
    var toggles = [].slice.call(document.querySelectorAll('[data-bx-dropdown-toggle]'));
    if (!toggles.length) return;
    var closeAll = function (except) {
      document.querySelectorAll('[data-bx-dropdown].bx-open').forEach(function (p) {
        if (p === except) return;
        p.classList.remove('bx-open'); p.hidden = true;
        var t = p.previousElementSibling; if (t) t.setAttribute('aria-expanded', 'false');
      });
    };
    toggles.forEach(function (t) {
      if (done(t)) return; mark(t);
      var panel = t.nextElementSibling && t.nextElementSibling.hasAttribute && t.nextElementSibling.hasAttribute('data-bx-dropdown') ? t.nextElementSibling : null;
      if (!panel) return;
      t.setAttribute('aria-expanded', 'false');
      t.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var open = !panel.classList.contains('bx-open');
        closeAll(open ? panel : null);
        panel.classList.toggle('bx-open', open); panel.hidden = !open;
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    document.addEventListener('click', function () { closeAll(null); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(null); });
  }

  /* ---- tabs --------------------------------------------------------------- */
  function wireTabs() {
    document.querySelectorAll('[data-bx-tabs]').forEach(function (group) {
      if (done(group)) return; mark(group);
      var tabs = [].slice.call(group.querySelectorAll('[data-bx-tab]'));
      var panels = tabs.map(function (t) {
        var id = t.getAttribute('data-bx-tab');
        return group.querySelector('[data-bx-panel="' + id + '"]') || document.getElementById(id);
      });
      function show(i) {
        tabs.forEach(function (t, j) {
          var on = i === j;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
          if (panels[j]) panels[j].hidden = !on;
        });
      }
      tabs.forEach(function (t, i) {
        t.addEventListener('click', function (e) { e.preventDefault(); show(i); });
        t.addEventListener('keydown', function (e) {
          var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          var n = (i + d + tabs.length) % tabs.length;
          show(n); tabs[n].focus();
        });
      });
      var sel = tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; });
      show(sel < 0 ? 0 : sel);
    });
  }

  /* ---- gallery lightbox --------------------------------------------------- */
  var dlg, dlgImg, dlgImgs, dlgIdx, lastFocus;
  function wireGallery() {
    var galleries = document.querySelectorAll('[data-bx-gallery]');
    if (!galleries.length) return;
    ensureDialog();
    galleries.forEach(function (g) {
      if (done(g)) return; mark(g);
      g.querySelectorAll('img').forEach(function (img) {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', function () { openLightbox(g, img); });
      });
    });
  }
  function ensureDialog() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'bx-lightbox';
    dlg.innerHTML =
      '<button class="bx-lb-close" aria-label="Close">×</button>' +
      '<button class="bx-lb-nav bx-lb-prev" aria-label="Previous">‹</button>' +
      '<img class="bx-lb-img" alt="">' +
      '<button class="bx-lb-nav bx-lb-next" aria-label="Next">›</button>';
    document.body.appendChild(dlg);
    dlgImg = dlg.querySelector('.bx-lb-img');
    dlg.querySelector('.bx-lb-close').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('.bx-lb-prev').addEventListener('click', function () { step(-1); });
    dlg.querySelector('.bx-lb-next').addEventListener('click', function () { step(1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); }); // backdrop
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    });
    dlg.addEventListener('close', function () { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
  }
  function openLightbox(g, img) {
    dlgImgs = [].slice.call(g.querySelectorAll('img'));
    dlgIdx = dlgImgs.indexOf(img);
    lastFocus = document.activeElement;
    render();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    dlg.querySelector('.bx-lb-close').focus();
  }
  function step(d) { if (!dlgImgs) return; dlgIdx = (dlgIdx + d + dlgImgs.length) % dlgImgs.length; render(); }
  function render() {
    var src = dlgImgs[dlgIdx];
    dlgImg.src = src.getAttribute('data-bx-full') || src.currentSrc || src.src;
    dlgImg.alt = src.alt || '';
    var multi = dlgImgs.length > 1;
    dlg.querySelectorAll('.bx-lb-nav').forEach(function (b) { b.style.display = multi ? '' : 'none'; });
  }

  /* ---- carousel ----------------------------------------------------------- */
  // Convert a detected slide track into a scroll-snap carousel with prev/next + dots.
  // Framework-agnostic: works off the DOM regardless of the original (dead) slider JS.
  function wireCarousel() {
    document.querySelectorAll('[data-bx-carousel]').forEach(function (c) {
      if (done(c)) return; mark(c);
      var slides = [].slice.call(c.querySelectorAll('[data-bx-slide]'));
      if (slides.length < 2) return;
      var track = slides[0].parentElement;
      if (!track) return;
      // Strip mode: the framework laid slides out absolutely along a horizontal
      // strip and drove scrolling from (now inert) JS. Keep the baked layout,
      // give the strip its real width, and unlock native scrolling — the
      // initial render is pixel-identical.
      var strip = slides.every(function (s) { return getComputedStyle(s).position === 'absolute'; });
      var scroller, host;
      if (strip) {
        scroller = c;
        host = c.parentElement || c;
        var w = 0;
        slides.forEach(function (s) { w = Math.max(w, s.offsetLeft + s.offsetWidth); s.removeAttribute('aria-hidden'); });
        track.style.position = 'relative';
        track.style.width = w + 'px';
        track.style.height = '100%';
        c.style.overflowX = 'auto';
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        // The framework baked viewport-specific pixel widths up the container
        // chain at capture time; let the strip's window track the page width.
        var upEl = c;
        for (var d = 0; d < 4 && upEl; d++) {
          if (/px$/.test(upEl.style.width || '')) upEl.style.width = '100%';
          upEl = upEl.parentElement;
        }
      } else {
        scroller = track;
        host = c;
        track.classList.add('bx-carousel-track');
        slides.forEach(function (s) { s.classList.add('bx-carousel-slide'); });
      }
      host.classList.add('bx-carousel');
      var mk = function (cls, label, glyph) { var b = document.createElement('button'); b.className = 'bx-car-btn ' + cls; b.setAttribute('aria-label', label); b.type = 'button'; b.innerHTML = glyph; return b; };
      var prev = mk('bx-car-prev', 'Previous', '‹'), next = mk('bx-car-next', 'Next', '›');
      host.appendChild(prev); host.appendChild(next);
      var step = function () { return slides[0].getBoundingClientRect().width + 16; };
      prev.addEventListener('click', function () { scroller.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }); });
      next.addEventListener('click', function () { scroller.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }); });
      // keyboard: arrows when the carousel has focus
      host.tabIndex = host.tabIndex || 0;
      host.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
      });
    });
  }

  /* ---- back-to-top -------------------------------------------------------- */
  // Builders position and show/hide this from (now inert) JS, leaving a fixed
  // button with a baked mid-viewport top offset. Re-pin it to the bottom
  // corner, restore the appear-on-scroll behavior, and wire the click.
  function wireBackToTop() {
    document.querySelectorAll('[id*="BACK_TO_TOP" i],[class*="back-to-top" i],[class*="backtotop" i],[aria-label*="back to top" i]').forEach(function (el) {
      if (done(el)) return; mark(el);
      if (getComputedStyle(el).position === 'fixed') { el.style.top = 'auto'; el.style.bottom = '24px'; }
      el.style.cursor = 'pointer';
      el.style.transition = 'opacity 0.2s ease';
      var show = function () {
        var on = window.scrollY > window.innerHeight;
        el.style.opacity = on ? '1' : '0';
        el.style.pointerEvents = on ? 'auto' : 'none';
      };
      show();
      window.addEventListener('scroll', show, { passive: true });
      el.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  }

  /* ---- smooth-scroll (global, safe) --------------------------------------- */
  function wireScroll() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id === '#' || a.hasAttribute('data-bx-tab')) return;
      var target = document.getElementById(id.slice(1)) || document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      if (history.replaceState) history.replaceState(null, '', id);
    });
  }

  function run() { wireNav(); wireDropdown(); wireAccordion(); wireTabs(); wireGallery(); wireCarousel(); wireBackToTop(); }
  wireScroll();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
