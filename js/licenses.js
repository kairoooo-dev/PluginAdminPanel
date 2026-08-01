/* Crowz-Plugins — license generator logic */
(() => {
    const store = window.CrowzStore;
    if (!store) throw new Error('CrowzStore missing — load store.js first.');

    const $ = (id) => document.getElementById(id);
    const CATEGORY_LABELS = { pvp: 'PvP', voice: 'Voice', security: 'Security', economy: 'Economy', utility: 'Utility', core: 'Core' };

    let toastTimer = null;
    function toast(msg) {
        const el = $('lic-toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => toast('Key copied to clipboard.'), () => toast('Copy failed — select it manually.'));
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            toast('Key copied to clipboard.');
        }
    }

    // ---------- Stats ----------
    function renderStats() {
        const list = store.getLicenses();
        const active = list.filter(l => !l.revoked).length;
        const gated = store.getCatalog().filter(p => p.requiresLicense !== false).length;
        $('lic-stats').innerHTML = `
            <div class="stat-card accent"><span class="stat-label">Active licenses</span><span class="stat-value">${active}</span><span class="stat-sub">${list.length - active} revoked</span></div>
            <div class="stat-card"><span class="stat-label">Plugins gated</span><span class="stat-value">${gated}</span><span class="stat-sub">need a key to download</span></div>
            <div class="stat-card"><span class="stat-label">Total keys</span><span class="stat-value">${list.length}</span><span class="stat-sub">ever generated</span></div>`;
    }

    // ---------- Plugin picker ----------
    function renderPicks() {
        const cat = store.getCatalog();
        $('lic-plugins').innerHTML = cat.length
            ? cat.map(p => `
                <label class="lic-pick">
                    <input type="checkbox" name="lic-plugin" data-id="${p.id}">
                    <span class="tile tile-${p.category}">${p.monogram}</span>
                    <span><strong>${p.name}</strong><em>${CATEGORY_LABELS[p.category] || p.category}</em></span>
                </label>`).join('')
            : '<p class="muted">No plugins in the catalog yet.</p>';
        $('lic-count').textContent = cat.length + ' plugins available';
    }

    // ---------- Key reveal ----------
    function typeKey(el, key) {
        el.innerHTML = '';
        key.split('').forEach((c, i) => {
            const ch = document.createElement('span');
            ch.className = 'key-char';
            ch.textContent = c;
            ch.style.animationDelay = (0.30 + i * 0.04) + 's';
            el.appendChild(ch);
        });
        const caret = document.createElement('span');
        caret.className = 'key-caret';
        el.appendChild(caret);
    }

    function renderOwnerSelect() {
        const sel = $('lic-owner-select');
        if (!sel) return;
        const accounts = store.getAccounts();
        const cur = sel.value;
        sel.innerHTML = '<option value="">— Unassigned —</option>' + accounts.map(a =>
            `<option value="${a.email}">${a.username} (${a.email})</option>`).join('');
        if (cur && accounts.some(a => a.email === cur)) sel.value = cur;
    }

    $('lic-create').addEventListener('submit', (e) => {
        e.preventDefault();
        const ids = Array.from(document.querySelectorAll('#lic-plugins input:checked'), i => i.dataset.id);
        if (!ids.length) { toast('Pick at least one plugin.'); return; }
        const owner = $('lic-owner-select').value || '';
        const lic = store.createLicense(ids, '', owner);
        const names = ids.map(id => { const p = store.getCatalog().find(x => x.id === id); return p ? p.name : id; });
        typeKey($('new-key'), lic.key);
        $('gen-covers').textContent = 'Unlocks: ' + names.join(', ') + (owner ? ' · for ' + owner : '');
        const result = $('key-result');
        result.hidden = false;
        result.classList.remove('pop');
        void result.offsetWidth;
        result.classList.add('pop');
        renderLicenses();
        renderStats();
        renderOwnerSelect();
        toast('License generated.');
    });

    $('copy-key').addEventListener('click', () => {
        const key = $('new-key').textContent;
        if (key) copyText(key);
    });

    // ---------- License list ----------
    function renderLicenses() {
        const rows = $('lic-rows');
        const cat = store.getCatalog();
        const nameOf = (id) => { const p = cat.find(x => x.id === id); return p ? p.name : id; };
        const list = store.getLicenses();
        rows.innerHTML = list.map(l => {
            const owner = l.owner
                ? (() => { const a = store.getAccounts().find(x => x.email === l.owner); return a ? a.username : l.owner; })()
                : '—';
            return `
            <tr>
                <td class="lic-key-cell">${l.key}</td>
                <td>${l.plugins.map(nameOf).join(', ') || '—'}</td>
                <td>${owner}</td>
                <td>${new Date(l.created).toLocaleDateString()}</td>
                <td><span class="chip ${l.revoked ? 'chip-danger' : 'chip-ok'}">${l.revoked ? 'Revoked' : 'Active'}</span></td>
                <td><div class="row-actions">
                    ${l.revoked
                        ? `<button class="icon-btn danger" data-delete="${l.key}" title="Delete">✕</button>`
                        : `<button class="icon-btn danger" data-revoke="${l.key}" title="Revoke">Revoke</button>`}
                </div></td>
            </tr>`;
        }).join('');
        $('lic-empty').hidden = list.length > 0;
    }

    $('lic-rows').addEventListener('click', (e) => {
        const rev = e.target.closest('[data-revoke]');
        if (rev) {
            store.revokeLicense(rev.dataset.revoke);
            renderLicenses();
            renderStats();
            toast('License revoked — downloads with this key are blocked.');
            return;
        }
        const del = e.target.closest('[data-delete]');
        if (del) {
            store.deleteLicense(del.dataset.delete);
            renderLicenses();
            renderStats();
            toast('License deleted.');
        }
    });

    // ---------- License requirements ----------
    function renderRequirements() {
        const cat = store.getCatalog();
        const wrap = $('lic-requirements');
        wrap.innerHTML = cat.length
            ? cat.map(p => `
                <label>
                    <input type="checkbox" class="req-toggle" data-id="${p.id}" ${p.requiresLicense !== false ? 'checked' : ''}>
                    <span class="tile tile-${p.category}">${p.monogram}</span>
                    <span class="req-info">
                        <span class="req-name">${p.name}</span>
                        <span class="req-cat">${CATEGORY_LABELS[p.category] || p.category}</span>
                    </span>
                    <span class="chip req-state ${p.requiresLicense !== false ? 'chip-lock' : ''}">${p.requiresLicense !== false ? 'License required' : 'Free download'}</span>
                </label>`).join('')
            : '<p class="muted">No plugins in the catalog yet.</p>';
        wrap.querySelectorAll('.req-toggle').forEach(input => {
            input.addEventListener('change', () => {
                const id = input.dataset.id;
                store.saveCatalog(store.getCatalog().map(p => p.id === id
                    ? Object.assign({}, p, { requiresLicense: input.checked })
                    : p));
                renderRequirements();
                renderStats();
                toast(input.checked ? 'License required — downloads are now gated.' : 'Free again — downloads are open.');
            });
        });
    }

    // ---------- Init ----------
    renderStats();
    renderPicks();
    renderOwnerSelect();
    renderLicenses();
    renderRequirements();
})();
