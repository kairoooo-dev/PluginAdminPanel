/* Crowz-Plugins — license manager logic */
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
            navigator.clipboard.writeText(text).then(() => toast('Key copied.'), () => toast('Copy failed — select it manually.'));
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            toast('Key copied.');
        }
    }

    // ---------- Create license ----------
    function renderPicks() {
        const cat = store.getCatalog();
        const wrap = $('lic-plugins');
        wrap.innerHTML = cat.length
            ? cat.map(p => `
                <label class="lic-pick">
                    <input type="checkbox" name="lic-plugin" data-id="${p.id}">
                    <span class="tile tile-${p.category}">${p.monogram}</span>
                    <span><strong>${p.name}</strong><em>${CATEGORY_LABELS[p.category] || p.category}</em></span>
                </label>`).join('')
            : '<p class="muted">No plugins in the catalog yet.</p>';
        $('lic-count').textContent = cat.length + ' plugins';
    }

    $('lic-create').addEventListener('submit', (e) => {
        e.preventDefault();
        const ids = Array.from(document.querySelectorAll('#lic-plugins input:checked'), i => i.dataset.id);
        if (!ids.length) { toast('Pick at least one plugin.'); return; }
        const lic = store.createLicense(ids, $('lic-note').value.trim());
        $('new-key').textContent = lic.key;
        $('key-result').hidden = false;
        $('lic-note').value = '';
        renderPicks();
        renderLicenses();
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
        rows.innerHTML = list.map(l => `
            <tr>
                <td class="lic-key-cell">${l.key}</td>
                <td>${l.plugins.map(nameOf).join(', ') || '—'}</td>
                <td>${l.note || '—'}</td>
                <td>${new Date(l.created).toLocaleDateString()}</td>
                <td><span class="chip ${l.revoked ? 'chip-danger' : 'chip-ok'}">${l.revoked ? 'Revoked' : 'Active'}</span></td>
                <td><div class="row-actions">
                    ${l.revoked
                        ? `<button class="icon-btn danger" data-delete="${l.key}" title="Delete">✕</button>`
                        : `<button class="icon-btn danger" data-revoke="${l.key}" title="Revoke">Revoke</button>`}
                </div></td>
            </tr>`).join('');
        $('lic-empty').hidden = list.length > 0;
    }

    $('lic-rows').addEventListener('click', (e) => {
        const rev = e.target.closest('[data-revoke]');
        if (rev) {
            store.revokeLicense(rev.dataset.revoke);
            renderLicenses();
            toast('License revoked — downloads with this key are blocked.');
            return;
        }
        const del = e.target.closest('[data-delete]');
        if (del) {
            store.deleteLicense(del.dataset.delete);
            renderLicenses();
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
                    <input type="checkbox" class="req-toggle" data-id="${p.id}" ${p.requiresLicense ? 'checked' : ''}>
                    <span class="tile tile-${p.category}">${p.monogram}</span>
                    <span class="req-info">
                        <span class="req-name">${p.name}</span>
                        <span class="req-cat">${CATEGORY_LABELS[p.category] || p.category}</span>
                    </span>
                    <span class="chip req-state ${p.requiresLicense ? 'chip-lock' : ''}">${p.requiresLicense ? 'License required' : 'Free download'}</span>
                </label>`).join('')
            : '<p class="muted">No plugins in the catalog yet.</p>';
        wrap.querySelectorAll('.req-toggle').forEach(input => {
            input.addEventListener('change', () => {
                const id = input.dataset.id;
                store.saveCatalog(store.getCatalog().map(p => p.id === id
                    ? Object.assign({}, p, { requiresLicense: input.checked })
                    : p));
                renderRequirements();
                toast(input.checked ? 'License required — downloads are now gated.' : 'Free again — downloads are open.');
            });
        });
    }

    // ---------- Init ----------
    renderPicks();
    renderLicenses();
    renderRequirements();
})();
