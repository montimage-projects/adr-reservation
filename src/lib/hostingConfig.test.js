import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static checks of the hosting config (#16). The app is served by Vercel, so
// vercel.json must send every non-file route to index.html for BrowserRouter
// deep links. Netlify's public/_redirects and the Firebase Hosting block are
// gone; firebase.json keeps only the Firestore block the emulator reads.

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const repoPath = (path) => join(LIB_DIR, '..', '..', path);
const readJson = (path) => JSON.parse(readFileSync(repoPath(path), 'utf8'));

const DEEP_LINKS = ['/', '/book', '/login', '/profile', '/admin', '/admin/slots'];

describe('vercel.json', () => {
  const vercel = readJson('vercel.json');
  const spaRewrite = (vercel.rewrites ?? []).find(
    (rewrite) => rewrite.destination === '/index.html'
  );

  it('rewrites to /index.html for the SPA fallback', () => {
    expect(spaRewrite).toBeDefined();
  });

  it.each(DEEP_LINKS)('routes the deep link %s to index.html', (path) => {
    const source = spaRewrite?.source ?? '';
    expect(new RegExp(`^${source}$`).test(path)).toBe(true);
  });

  it('uses rewrites, not the legacy routes key', () => {
    expect(vercel).not.toHaveProperty('routes');
  });
});

describe('legacy hosting config', () => {
  it('has no Netlify public/_redirects file', () => {
    expect(existsSync(repoPath('public/_redirects'))).toBe(false);
  });

  it('has no Firebase Hosting block in firebase.json', () => {
    expect(readJson('firebase.json')).not.toHaveProperty('hosting');
  });

  it('keeps the Firestore rules and indexes in firebase.json', () => {
    const { firestore } = readJson('firebase.json');
    expect(firestore.rules).toBe('firestore.rules');
    expect(firestore.indexes).toBe('firestore.indexes.json');
    expect(existsSync(repoPath(firestore.rules))).toBe(true);
    expect(existsSync(repoPath(firestore.indexes))).toBe(true);
  });
});
