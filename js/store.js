/* Crowz-Plugins — shared data store.
   One source of truth for the site catalog, admin edits, settings and download stats.
   Everything lives in localStorage; nothing leaves the browser. */
window.CrowzStore = (() => {
    const CATALOG_KEY = 'crowz_catalog';
    const SETTINGS_KEY = 'crowz_settings';
    const LOG_KEY = 'crowz_dl_log';
    const LICENSES_KEY = 'crowz_licenses';
    const LOG_CAP = 1000;

    const read = (key, fallback) => {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : fallback;
        } catch { return fallback; }
    };
    const write = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    };
    const remove = (key) => {
        try { localStorage.removeItem(key); } catch {}
    };

    // ---------- Catalog ----------
    function getCatalog() {
        const stored = read(CATALOG_KEY, null);
        if (Array.isArray(stored) && stored.length) return stored;
        return Array.isArray(PLUGINS) ? PLUGINS : [];
    }
    function saveCatalog(list) {
        write(CATALOG_KEY, list);
    }
    function resetCatalog() {
        remove(CATALOG_KEY);
    }

    // ---------- Settings ----------
    const DEFAULT_SETTINGS = {
        siteName: 'Crowz-Plugins',
        tagline: 'Everything on this site runs on our own servers before it ships — PvP cores, anticheat, voice chat and the unglamorous utilities that keep a server alive. Free to download, actively maintained, no paywalls hiding the good stuff.',
        contactEmail: 'contact@crowzplugins.gg',
        adminPassword: 'crowz-admin'
    };
    function getSettings() {
        const stored = read(SETTINGS_KEY, {});
        return Object.assign({}, DEFAULT_SETTINGS, stored);
    }
    function saveSettings(settings) {
        write(SETTINGS_KEY, settings);
    }
    function resetSettings() {
        remove(SETTINGS_KEY);
    }

    // ---------- Download stats ----------
    function delta(id) {
        return read('crowz_dl_' + id, 0) || 0;
    }
    function downloadCount(p) {
        return (p.baseDownloads || 0) + delta(p.id);
    }
    function totalDownloads() {
        return getCatalog().reduce((acc, p) => acc + downloadCount(p), 0);
    }
    function recordDownload(id) {
        try { localStorage.setItem('crowz_dl_' + id, String(delta(id) + 1)); } catch {}
        const log = getLog();
        log.push({ id, t: Date.now() });
        if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
        write(LOG_KEY, log);
    }
    function getLog() {
        const l = read(LOG_KEY, []);
        return Array.isArray(l) ? l : [];
    }
    function resetStats() {
        getCatalog().forEach(p => remove('crowz_dl_' + p.id));
        remove(LOG_KEY);
    }

    // ---------- Licenses ----------
    function getLicenses() {
        const l = read(LICENSES_KEY, []);
        return Array.isArray(l) ? l : [];
    }
    function saveLicenses(list) {
        write(LICENSES_KEY, list);
    }
    function genKey() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const bytes = new Uint8Array(15);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
        else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        const group = (start) => Array.from(bytes.slice(start, start + 5), b => chars[b % chars.length]).join('');
        return 'CROWZ-' + group(0) + '-' + group(5) + '-' + group(10);
    }
    function createLicense(pluginIds, note, owner) {
        const license = {
            key: genKey(),
            plugins: pluginIds.slice(),
            note: note || '',
            owner: owner || '',
            created: Date.now(),
            revoked: false
        };
        const list = getLicenses();
        list.push(license);
        saveLicenses(list);
        if (license.owner) addLicenseToAccount(license.owner, license.key);
        return license;
    }
    function revokeLicense(key) {
        saveLicenses(getLicenses().map(l => l.key === key ? Object.assign({}, l, { revoked: true }) : l));
    }
    function deleteLicense(key) {
        saveLicenses(getLicenses().filter(l => l.key !== key));
        saveAccounts(getAccounts().map(a => a.licenses ? Object.assign({}, a, { licenses: a.licenses.filter(k => k !== key) }) : a));
    }
    function validateLicense(key) {
        const k = String(key || '').trim().toUpperCase();
        if (!k) return null;
        return getLicenses().find(l => l.key === k && !l.revoked) || null;
    }
    function hasLicenseFor(pluginId) {
        return getLicenses().some(l => !l.revoked && l.plugins.includes(pluginId));
    }
    function resetLicenses() {
        remove(LICENSES_KEY);
    }

    // ---------- Accounts ----------
    const ACCOUNTS_KEY = 'crowz_accounts';
    const SESSION_KEY = 'crowz_session';

    function sha256hex(str) {
        function rrot(n, x) { return (x >>> n) | (x << (32 - n)); }
        const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
            0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
            0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
            0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
            0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
            0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            if (c < 128) bytes.push(c);
            else if (c < 2048) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
            else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
        const bitLen = bytes.length * 8;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56) bytes.push(0);
        bytes.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);
        let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
            h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
        const w = new Array(64);
        for (let i = 0; i < bytes.length; i += 64) {
            for (let j = 0; j < 16; j++) {
                w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
            }
            for (let j = 16; j < 64; j++) {
                const s0 = rrot(7, w[j - 15]) ^ rrot(18, w[j - 15]) ^ (w[j - 15] >>> 3);
                const s1 = rrot(17, w[j - 2]) ^ rrot(19, w[j - 2]) ^ (w[j - 2] >>> 10);
                w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
            }
            let a = h0, b = h1, c2 = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
            for (let j = 0; j < 64; j++) {
                const S1 = rrot(6, e) ^ rrot(11, e) ^ rrot(25, e);
                const ch = (e & f) ^ (~e & g);
                const t1 = (h + S1 + ch + K[j] + w[j]) | 0;
                const S0 = rrot(2, a) ^ rrot(13, a) ^ rrot(22, a);
                const maj = (a & b) ^ (a & c2) ^ (b & c2);
                const t2 = (S0 + maj) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0;
                d = c2; c2 = b; b = a; a = (t1 + t2) | 0;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c2) | 0; h3 = (h3 + d) | 0;
            h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
        }
        return [h0, h1, h2, h3, h4, h5, h6, h7].map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
    }

    function getAccounts() {
        const a = read(ACCOUNTS_KEY, []);
        return Array.isArray(a) ? a : [];
    }
    function saveAccounts(list) {
        write(ACCOUNTS_KEY, list);
    }
    function registerAccount(username, email, password) {
        const u = String(username || '').trim().toLowerCase();
        const em = String(email || '').trim().toLowerCase();
        if (!u || !em || !password) throw new Error('All fields are required.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('Invalid email address.');
        const accs = getAccounts();
        if (accs.some(a => a.username === u)) throw new Error('That username is taken.');
        if (accs.some(a => a.email === em)) throw new Error('An account with that email already exists.');
        const acc = { username: u, email: em, pass: sha256hex(String(password)), created: Date.now(), banned: false, licenses: [] };
        accs.push(acc);
        saveAccounts(accs);
        return acc;
    }
    function loginAccount(login, password) {
        const l = String(login || '').trim().toLowerCase();
        const acc = getAccounts().find(a => a.email === l || a.username === l);
        if (!acc || acc.pass !== sha256hex(String(password || ''))) return { error: 'Wrong username/email or password.' };
        if (acc.banned) return { error: 'This account has been banned.' };
        write(SESSION_KEY, acc.email);
        return { account: acc };
    }
    function logout() {
        remove(SESSION_KEY);
    }
    function currentAccount() {
        const em = read(SESSION_KEY, null);
        if (!em) return null;
        return getAccounts().find(a => a.email === em) || null;
    }
    function banAccount(email) {
        saveAccounts(getAccounts().map(a => a.email === email ? Object.assign({}, a, { banned: true }) : a));
    }
    function unbanAccount(email) {
        saveAccounts(getAccounts().map(a => a.email === email ? Object.assign({}, a, { banned: false }) : a));
    }
    function deleteAccount(email) {
        saveAccounts(getAccounts().filter(a => a.email !== email));
        if (currentAccount() && currentAccount().email === email) remove(SESSION_KEY);
    }
    function resetPassword(email, newPassword) {
        saveAccounts(getAccounts().map(a => a.email === email ? Object.assign({}, a, { pass: sha256hex(String(newPassword)) }) : a));
    }
    function addLicenseToAccount(email, key) {
        const accs = getAccounts();
        const acc = accs.find(a => a.email === email);
        if (acc && !acc.licenses.includes(key)) {
            acc.licenses.push(key);
            saveAccounts(accs);
        }
    }
    function ownsLicense(account, pluginId) {
        if (!account) return false;
        return account.licenses.some(k => {
            const lic = validateLicense(k);
            return !!lic && !lic.revoked && lic.plugins.includes(pluginId);
        });
    }
    function resetAccounts() {
        remove(ACCOUNTS_KEY);
    }

    // ---------- Export / import ----------
    function exportData() {
        return JSON.stringify({
            catalog: getCatalog(),
            settings: getSettings(),
            log: getLog(),
            licenses: getLicenses(),
            accounts: getAccounts(),
            exportedAt: new Date().toISOString()
        }, null, 2);
    }
    function importData(json) {
        const data = JSON.parse(json);
        if (!Array.isArray(data.catalog)) throw new Error('Invalid file: no plugin catalog found.');
        saveCatalog(data.catalog);
        if (data.settings && typeof data.settings === 'object') saveSettings(data.settings);
        if (Array.isArray(data.log)) write(LOG_KEY, data.log);
        if (Array.isArray(data.licenses)) saveLicenses(data.licenses);
        if (Array.isArray(data.accounts)) saveAccounts(data.accounts);
        return data.catalog.length;
    }

    // ---------- Helpers ----------
    function slugify(name) {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^(\d)/, 'p$1') || 'plugin' + Date.now().toString(36);
    }
    function timeAgo(ts) {
        const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
        if (s < 60) return s + 's ago';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h ago';
        const d = Math.floor(h / 24);
        if (d < 30) return d + 'd ago';
        return new Date(ts).toLocaleDateString();
    }

    return {
        getCatalog, saveCatalog, resetCatalog,
        getSettings, saveSettings, resetSettings,
        delta, downloadCount, totalDownloads, recordDownload, getLog, resetStats,
        getLicenses, saveLicenses, createLicense, revokeLicense, deleteLicense,
        validateLicense, hasLicenseFor, resetLicenses,
        getAccounts, saveAccounts, registerAccount, loginAccount, logout, currentAccount,
        banAccount, unbanAccount, deleteAccount, resetPassword,
        addLicenseToAccount, ownsLicense, resetAccounts,
        exportData, importData, slugify, timeAgo
    };
})();
