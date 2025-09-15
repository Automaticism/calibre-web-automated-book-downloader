// Modern UI script: search, cards, details, downloads, status, theme
// Reuses existing API endpoints. Keeps logic minimal and accessible.

(function () {
  // ---- DOM ----
  const el = {
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-button'),
    advToggle: document.getElementById('toggle-advanced'),
    filtersForm: document.getElementById('search-filters'),
    isbn: document.getElementById('isbn-input'),
    author: document.getElementById('author-input'),
    title: document.getElementById('title-input'),
    lang: document.getElementById('lang-input'),
    sort: document.getElementById('sort-input'),
    content: document.getElementById('content-input'),
    resultsGrid: document.getElementById('results-grid'),
    noResults: document.getElementById('no-results'),
    searchLoading: document.getElementById('search-loading'),
    modalOverlay: document.getElementById('modal-overlay'),
    detailsContainer: document.getElementById('details-container'),
    refreshStatusBtn: document.getElementById('refresh-status-button'),
    clearCompletedBtn: document.getElementById('clear-completed-button'),
    statusLoading: document.getElementById('status-loading'),
    statusList: document.getElementById('status-list'),
    activeDownloadsCount: document.getElementById('active-downloads-count'),
    // Active downloads (top section under search)
    activeTopSec: document.getElementById('active-downloads-top'),
    activeTopList: document.getElementById('active-downloads-list'),
    activeTopRefreshBtn: document.getElementById('active-refresh-button'),
    themeToggle: document.getElementById('theme-toggle'),
    themeText: document.getElementById('theme-text'),
    themeMenu: document.getElementById('theme-menu')
  };

  // ---- Constants ----
  const API = {
    search: '/request/api/search',
    info: '/request/api/info',
    download: '/request/api/download',
    status: '/request/api/status',
    cancelDownload: '/request/api/download',
    setPriority: '/request/api/queue',
    clearCompleted: '/request/api/queue/clear',
    activeDownloads: '/request/api/downloads/active'
  };
  const FILTERS = ['isbn', 'author', 'title', 'lang', 'sort', 'content', 'format'];

  // ---- Utils ----
  const utils = {
    show(node) { node && node.classList.remove('hidden'); },
    hide(node) { node && node.classList.add('hidden'); },
    async j(url, opts = {}) {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    // Build query string from basic + advanced filters
    buildQuery() {
      const q = [];
      const basic = el.searchInput?.value?.trim();
      if (basic) q.push(`query=${encodeURIComponent(basic)}`);

      if (!el.filtersForm || el.filtersForm.classList.contains('hidden')) {
        return q.join('&');
      }

      FILTERS.forEach((name) => {
        if (name === 'format') {
          const checked = Array.from(document.querySelectorAll('[id^="format-"]:checked'));
          checked.forEach((cb) => q.push(`format=${encodeURIComponent(cb.value)}`));
        } else {
          const input = document.querySelectorAll(`[id^="${name}-input"]`);
          input.forEach((node) => {
            const val = node.value?.trim();
            if (val) q.push(`${name}=${encodeURIComponent(val)}`);
          });
        }
      });

      return q.join('&');
    },
    // Simple notification via alert fallback
    toast(msg) { try { console.info(msg); } catch (_) {} },
    // Escapes text for safe HTML injection
    e(text) { return (text ?? '').toString(); }
  };

  // ---- Modal ----
  const modal = {
    open() { el.modalOverlay?.classList.add('active'); },
    close() { el.modalOverlay?.classList.remove('active'); el.detailsContainer.innerHTML = ''; }
  };

  // ---- Cards ----
  function renderCard(book) {
    const cover = book.preview ? `<img src="${utils.e(book.preview)}" alt="Cover" class="w-full h-full object-cover">` :
      `<div class="w-full h-full flex items-center justify-center opacity-70" style="background: var(--bg-soft)">No Cover</div>`;

    const html = `
      <article class="group relative flex flex-col rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300" style="background-color: var(--card-background);">
        <div class="aspect-[4/5] overflow-hidden">
          ${cover}
        </div>
        <div class="p-4 flex-1 flex flex-col">
          <h3 class="font-bold text-lg leading-tight flex-1">${utils.e(book.title) || 'Untitled'}</h3>
          <p class="text-sm opacity-80 mt-1">${utils.e(book.author) || 'Unknown author'}</p>
          <div class="text-xs opacity-70 mt-2 flex flex-wrap gap-x-2">
            <span>${utils.e(book.year) || '-'}</span>
            <span>•</span>
            <span>${utils.e(book.language) || '-'}</span>
            <span>•</span>
            <span>${utils.e(book.format) || '-'}</span>
            ${book.size ? `<span>•</span><span>${utils.e(book.size)}</span>` : ''}
          </div>
        </div>
        <div class="p-4 pt-0 flex gap-3">
          <button class="px-4 py-2 rounded-md border text-sm font-semibold flex-1" data-action="details" data-id="${utils.e(book.id)}" style="border-color: var(--border-muted);">Details</button>
          <button class="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex-1" data-action="download" data-id="${utils.e(book.id)}">Download</button>
        </div>
      </article>`;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    // Bind actions
    const detailsBtn = wrapper.querySelector('[data-action="details"]');
    const downloadBtn = wrapper.querySelector('[data-action="download"]');
    detailsBtn?.addEventListener('click', () => bookDetails.show(book.id));
    downloadBtn?.addEventListener('click', () => bookDetails.download(book));
    return wrapper.firstElementChild;
  }

  function renderCards(books) {
    el.resultsGrid.innerHTML = '';
    if (!books || books.length === 0) {
      utils.show(el.noResults);
      return;
    }
    utils.hide(el.noResults);
    const frag = document.createDocumentFragment();
    books.forEach((b) => frag.appendChild(renderCard(b)));
    el.resultsGrid.appendChild(frag);
  }

  // ---- Search ----
  const search = {
    async run() {
      const qs = utils.buildQuery();
      if (!qs) { renderCards([]); return; }
      utils.show(el.searchLoading);
      try {
        const data = await utils.j(`${API.search}?${qs}`);
        renderCards(data);
      } catch (e) {
        renderCards([]);
      } finally {
        utils.hide(el.searchLoading);
      }
    }
  };

  // ---- Details ----
  const bookDetails = {
    async show(id) {
      try {
        modal.open();
        el.detailsContainer.innerHTML = '<div class="p-4">Loading…</div>';
        const book = await utils.j(`${API.info}?id=${encodeURIComponent(id)}`);
        el.detailsContainer.innerHTML = this.tpl(book);
        document.getElementById('close-details')?.addEventListener('click', modal.close);
        document.getElementById('download-button')?.addEventListener('click', () => this.download(book));
      } catch (e) {
        el.detailsContainer.innerHTML = '<div class="p-4">Failed to load details.</div>';
      }
    },
    tpl(book) {
      const cover = book.preview ? `<img src="${utils.e(book.preview)}" alt="Cover" class="w-full object-cover rounded-lg shadow-md">` : '';
      const infoList = book.info ? Object.entries(book.info).map(([k, v]) => `<li class="flex flex-col"><span class="font-semibold">${utils.e(k)}</span> <span class="opacity-80">${utils.e((v||[]).join ? v.join(', ') : v)}</span></li>`).join('') : '';

      return `
        <div class="p-6 space-y-6 relative">
          <button id="close-details" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="md:col-span-1">${cover}</div>
            <div class="md:col-span-2 space-y-4">
              <div>
                <h2 class="text-3xl font-bold">${utils.e(book.title) || 'Untitled'}</h2>
                <p class="text-lg opacity-80">${utils.e(book.author) || 'Unknown author'}</p>
              </div>
              <div class="text-sm space-y-2 pt-4 border-t border-[color:var(--border-muted)]">
                <p><strong>Publisher:</strong> ${utils.e(book.publisher) || '-'}</p>
                <p><strong>Year:</strong> ${utils.e(book.year) || '-'}</p>
                <p><strong>Language:</strong> ${utils.e(book.language) || '-'}</p>
                <p><strong>Format:</strong> ${utils.e(book.format) || '-'}</p>
                <p><strong>Size:</strong> ${utils.e(book.size) || '-'}</p>
              </div>
            </div>
          </div>
          ${infoList ? `<div class="pt-4 border-t border-[color:var(--border-muted)]"><h4 class="text-xl font-semibold mb-3">Further Information</h4><ul class="space-y-2 text-sm">${infoList}</ul></div>` : ''}
          <div class="flex gap-4 pt-4 border-t border-[color:var(--border-muted)]">
            <button id="download-button" class="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex-1">Download</button>
          </div>
        </div>`;
    },
    async download(book) {
      if (!book) return;
      utils.j(`${API.download}?id=${encodeURIComponent(book.id)}`)
        .then(() => {
          utils.toast('Queued for download');
          modal.close();
          status.fetch();
        })
        .catch(err => {
          console.error('Download error:', err);
          utils.toast('Failed to queue download.');
        });
    }
  };

  // ---- Status ----
  const status = {
    async fetch() {
      try {
        utils.show(el.statusLoading);
        const data = await utils.j(API.status);
        this.render(data);
        // Also reflect active downloads in the top section
        this.renderTop(data);
        this.updateActive();
      } catch (e) {
        el.statusList.innerHTML = '<div class="text-sm opacity-80">Error loading status.</div>';
      } finally { utils.hide(el.statusLoading); }
    },
    render(data) {
      const statusMap = {
        queued: { icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'yellow' },
        downloading: { icon: 'M4 16v1h16v-1l-2-6-4 4-4-4-2 6zM4 4h16v1H4z', color: 'blue' },
        completed: { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'green' },
        error: { icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'red' },
      };

      const sections = [];
      for (const [name, items] of Object.entries(data || {})) {
        if (!items || Object.keys(items).length === 0) continue;

        const rows = Object.values(items).map((b) => {
          const s = statusMap[name] || { icon: '', color: 'gray' };
          const actions = (name === 'queued' || name === 'downloading')
            ? `<button class="px-3 py-1 rounded-md border text-xs font-semibold" data-cancel="${utils.e(b.id)}" style="border-color: var(--border-muted);">Cancel</button>`
            : '';
          const progress = (name === 'downloading' && typeof b.progress === 'number')
            ? `<div class="h-2 rounded overflow-hidden" style="background-color: var(--bg);"><div class="h-2 bg-${s.color}-500" style="width:${Math.round(b.progress)}%"></div></div>`
            : '';

          return `
            <li class="p-4 rounded-lg flex flex-col gap-3" style="background-color: var(--card-background);">
              <div class="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-${s.color}-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${s.icon}" /></svg>
                <div class="flex-1">
                  <p class="font-semibold">${utils.e(b.title || '-')}</p>
                  <p class="text-sm opacity-70">${name.charAt(0).toUpperCase() + name.slice(1)}</p>
                </div>
                <div class="shrink-0">${actions}</div>
              </div>
              ${progress}
            </li>`;
        }).join('');

        sections.push(`
          <div>
            <h3 class="text-lg font-semibold mb-3">${name.charAt(0).toUpperCase() + name.slice(1)}</h3>
            <ul class="space-y-3">${rows}</ul>
          </div>`);
      }

      el.statusList.innerHTML = sections.join('') || '<div class="text-center p-6 rounded-lg" style="background-color: var(--card-background);">No items in queue.</div>';
      el.statusList.querySelectorAll('[data-cancel]')?.forEach(btn => {
        btn.addEventListener('click', () => queue.cancel(btn.getAttribute('data-cancel')));
      });
    },
    renderTop(data) {
      const downloading = (data && data.downloading) ? Object.values(data.downloading) : [];
      if (!el.activeTopSec || !el.activeTopList) return;
      if (!downloading.length) {
        el.activeTopList.innerHTML = '';
        utils.hide(el.activeTopSec);
        return;
      }

      const rows = downloading.map((b) => {
        const prog = (typeof b.progress === 'number') ? `<div class="h-1.5 bg-blue-500" style="width:${Math.round(b.progress)}%"></div>` : '';
        const cancel = `<button class="px-2 py-1 rounded-md border text-xs font-semibold" data-cancel="${utils.e(b.id)}" style="border-color: var(--border-muted);">Cancel</button>`;
        return `
          <div class="p-3 rounded-lg" style="background-color: var(--card-background);">
            <div class="flex items-center justify-between gap-3 mb-2">
              <p class="text-sm font-semibold truncate">${utils.e(b.title || '-')}</p>
              <div class="shrink-0">${cancel}</div>
            </div>
            <div class="h-1.5 rounded overflow-hidden" style="background-color: var(--bg);">${prog}</div>
          </div>`;
      }).join('');

      el.activeTopList.innerHTML = rows;
      utils.show(el.activeTopSec);
      el.activeTopList.querySelectorAll('[data-cancel]')?.forEach(btn => {
        btn.addEventListener('click', () => queue.cancel(btn.getAttribute('data-cancel')));
      });
    },
    async updateActive() {
      utils.j(API.activeDownloads)
        .then(d => {
          const n = Array.isArray(d.active_downloads) ? d.active_downloads.length : 0;
          if (el.activeDownloadsCount) el.activeDownloadsCount.textContent = `Active: ${n}`;
        })
        .catch(err => console.error('Failed to update active downloads count:', err));
    }
  };

  // ---- Queue ----
  const queue = {
    async cancel(id) {
      fetch(`${API.cancelDownload}/${encodeURIComponent(id)}/cancel`, { method: 'DELETE' })
        .then(() => status.fetch())
        .catch(err => {
          console.error('Cancel download error:', err);
          utils.toast('Failed to cancel download.');
        });
    }
  };

  // ---- Theme ----
  const theme = {
    KEY: 'preferred-theme',
    init() {
      const saved = localStorage.getItem(this.KEY) || 'auto';
      this.apply(saved);
      this.updateLabel(saved);
      // toggle dropdown
      el.themeToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!el.themeMenu) return;
        el.themeMenu.classList.toggle('hidden');
      });
      // outside click to close
      document.addEventListener('click', (ev) => {
        if (!el.themeMenu || !el.themeToggle) return;
        if (el.themeMenu.contains(ev.target) || el.themeToggle.contains(ev.target)) return;
        el.themeMenu.classList.add('hidden');
      });
      // selection
      el.themeMenu?.querySelectorAll('a[data-theme]')?.forEach((a) => {
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          const pref = a.getAttribute('data-theme');
          localStorage.setItem(theme.KEY, pref);
          theme.apply(pref);
          theme.updateLabel(pref);
          el.themeMenu.classList.add('hidden');
        });
      });
      // react to system change if auto
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', (e) => {
        if ((localStorage.getItem(theme.KEY) || 'auto') === 'auto') {
          document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
      });
    },
    apply(pref) {
      if (pref === 'auto') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', pref);
      }
    },
    updateLabel(pref) { if (el.themeText) el.themeText.textContent = `Theme (${pref})`; }
  };

  // ---- Wire up ----
  function initEvents() {
    el.searchBtn?.addEventListener('click', () => search.run());
    el.searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') search.run(); });
    document.getElementById('adv-search-button')?.addEventListener('click', () => search.run());

    if (el.advToggle && el.filtersForm) {
      el.advToggle.addEventListener('click', (e) => {
        e.preventDefault();
        el.filtersForm.classList.toggle('hidden');
      });
    }

    el.refreshStatusBtn?.addEventListener('click', () => status.fetch());
    el.activeTopRefreshBtn?.addEventListener('click', () => status.fetch());
    el.clearCompletedBtn?.addEventListener('click', async () => {
      try { await fetch(API.clearCompleted, { method: 'DELETE' }); status.fetch(); } catch (_) {}
    });

    // Close modal on overlay click
    el.modalOverlay?.addEventListener('click', (e) => { if (e.target === el.modalOverlay) modal.close(); });
  }

  // ---- Init ----
  theme.init();
  initEvents();
  status.fetch();
})();
