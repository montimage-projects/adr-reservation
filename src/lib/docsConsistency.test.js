import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static checks that the setup docs still match the code (#20). They catch
// the drift #20 fixed: a README version badge that disagrees with
// package.json, a Supabase badge for a Firebase backend, a copy of the
// Firestore rules pasted into FIREBASE_MIGRATION.md, and links to files that
// no longer exist.

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const repoPath = (path) => join(LIB_DIR, '..', '..', path);
const readText = (path) => readFileSync(repoPath(path), 'utf8');

const DOCS = ['README.md', 'FIREBASE_MIGRATION.md'];

const readme = readText('README.md');
const migration = readText('FIREBASE_MIGRATION.md');
const { version } = JSON.parse(readText('package.json'));

// img.shields.io badge URLs, e.g. https://img.shields.io/badge/version-0.1.5-blue
const badgeUrls = (markdown) =>
  [...markdown.matchAll(/https:\/\/img\.shields\.io\/badge\/[^"')\s]+/g)].map(
    ([url]) => url
  );

// Relative Markdown link targets, without any #anchor.
const relativeLinks = (markdown) =>
  [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
    .map(([, target]) => target)
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.split('#')[0]);

describe('README badges', () => {
  it('shows the package.json version in the version badge', () => {
    const versionBadges = badgeUrls(readme).filter((url) =>
      url.includes('/badge/version-')
    );
    expect(versionBadges).toHaveLength(1);
    expect(versionBadges[0]).toContain(`/badge/version-${version}-`);
  });

  it('has a Firebase badge and no Supabase badge', () => {
    const badges = badgeUrls(readme).map((url) => url.toLowerCase());
    expect(badges.some((url) => url.includes('firebase'))).toBe(true);
    expect(badges.some((url) => url.includes('supabase'))).toBe(false);
  });

  it('names Firebase as the backend in the tech stack', () => {
    const backend = readme.match(/^- \*\*Backend\*\*:(.*)$/m);
    expect(backend).not.toBeNull();
    expect(backend[1]).toMatch(/Firebase/);
    expect(backend[1]).not.toMatch(/Supabase/i);
  });
});

describe('FIREBASE_MIGRATION.md', () => {
  it('links to firestore.rules instead of copying the rules', () => {
    expect(migration).toContain('](firestore.rules)');
    expect(migration).not.toMatch(/rules_version|service cloud\.firestore|match \/databases/);
  });

  it('links to the auth model decision record', () => {
    expect(migration).toContain('](docs/auth-model.md');
  });

  it('documents the rules and indexes deploy that firebase.json supports', () => {
    const { firestore } = JSON.parse(readText('firebase.json'));
    expect(firestore.rules).toBeDefined();
    expect(firestore.indexes).toBeDefined();
    expect(migration).toContain('firebase deploy --only firestore:rules,firestore:indexes');
  });
});

describe.each(DOCS)('%s', (doc) => {
  it.each(relativeLinks(readText(doc)))('links to an existing file: %s', (target) => {
    expect(existsSync(repoPath(target))).toBe(true);
  });
});
