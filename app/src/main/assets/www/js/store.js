/* SWYP — local storage layer (IndexedDB). Projects are JSON; photos are Blobs. */
(function () {
  'use strict';
  const DB_NAME = 'swyp';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then((r) => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const Store = {
    uid(prefix) {
      return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },
    async listProjects() {
      const db = await open();
      const all = await reqP(db.transaction('projects').objectStore('projects').getAll());
      return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async getProject(id) {
      const db = await open();
      return reqP(db.transaction('projects').objectStore('projects').get(id));
    },
    saveProject(p) {
      return tx('projects', 'readwrite', (s) => { s.put(p); });
    },
    async deleteProject(id) {
      const p = await Store.getProject(id);
      await tx('projects', 'readwrite', (s) => { s.delete(id); });
      if (p) await Store.gcAssets();
    },
    putAsset(id, blob, w, h) {
      return tx('assets', 'readwrite', (s) => { s.put({ id, blob, w, h }); });
    },
    async getAsset(id) {
      const db = await open();
      return reqP(db.transaction('assets').objectStore('assets').get(id));
    },
    /* Remove photos no project references any more. */
    async gcAssets() {
      const projects = await Store.listProjects();
      const used = new Set();
      projects.forEach((p) => (p.elements || []).forEach((e) => { if (e.src) used.add(e.src); }));
      const db = await open();
      const keys = await reqP(db.transaction('assets').objectStore('assets').getAllKeys());
      const stale = keys.filter((k) => !used.has(k));
      if (stale.length) await tx('assets', 'readwrite', (s) => { stale.forEach((k) => s.delete(k)); });
    },
    pref(key, fallback) {
      try { const v = localStorage.getItem('swyp.' + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    setPref(key, value) {
      try { localStorage.setItem('swyp.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    }
  };

  window.Store = Store;
})();
