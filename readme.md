# Personal Accounting

A mobile-friendly, double-entry personal accounting app. Plain browser JavaScript; no production build dependencies.

## Run on your computer

Install Node.js 22 or later, then:

```sh
npm start
```

Open http://127.0.0.1:4173. You do not need `npm install` to run the app. A static HTTPS host such as GitHub Pages works too. Do not open `index.html` as a `file://` URL; browser modules and storage require an HTTP origin.

## Start using it

1. Choose **Use on this device** for independent local books, or sign in for cloud books.
2. On an empty chart, choose **Create starter accounts**, or add your own accounts.
3. Enter opening balances through a balanced **Journal Entry**. For example: debit Checking $1,000 and credit Opening equity $1,000.
4. Record income, expenses, and transfers with equal debit and credit totals.
5. Review the General Ledger, Trial Balance, Balance Sheet, and Income Statement. Apply report dates and print as needed.
6. Use **Settings → Export backup** regularly.

Local mode is **not cloud sync**. It uses this browser's IndexedDB and is separate from all signed-in users. Clearing site/browser data deletes local records. Anyone with access to that browser profile can open local books. JSON backups contain your financial records; keep them private. Restore is available only into empty local books, and validates entry balancing and record relationships before saving. Local books are not automatically uploaded when you sign in.

After the initial visit finishes installing its service worker, local mode can reopen offline. Browser storage availability and retention depend on the browser. For code updates, close all tabs for this app and reopen; the waiting service worker activates after the older tabs close. When changing cached application files, change the cache version in `sw.js` as part of the same release.

## Accounting behavior

- USD amounts; cent-based calculations and two-decimal posting validation.
- Each journal entry needs at least two lines. Each line has one positive debit or credit.
- Entries are saved atomically as a header and all lines. Correct posted entries with a new reversing entry.
- Disabled accounts cannot receive new postings but remain in historical reports.
- Accounts with posted activity cannot be deleted or reclassified; unused accounts can be edited/deleted.
- Dashboard and balance sheet use all activity through the selected as-of date.
- Income statement respects both range boundaries. General Ledger includes an opening balance before its range.
- Unclosed revenue/expense balances are included in equity without requiring an account named Retained Earnings.
- Contra-account balances reduce the corresponding report category.

## Firebase cloud setup

The repository's existing Firebase web configuration is preserved in `db.js`. Firebase's public web configuration identifies the project; **Firestore security rules protect the records**. Never commit service-account private keys or user credentials.

In that Firebase project:

1. Enable Authentication → Email/Password.
2. Create/enable Cloud Firestore.
3. Add the deployed hostname to Authentication → Settings → Authorized domains where required.
4. Review and deploy owner-only security rules. This baseline isolates users but does not enforce every accounting invariant on the server:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{collection}/{recordId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId
        && collection in ['accounts', 'journalHeaders', 'journalLines'];
    }
  }
}
```

Do not use open/public Firestore rules. The app does not deploy or verify project rules for you. Cloud sign-in, permissions, and cross-device sync require verification with your account; local tests do not prove the live Firebase project is configured correctly.

Cloud writes are committed locally first with a per-user queue, then sent using Firestore atomic batches. Refresh/sync, successful posting, and reconnecting (when no journal draft is being edited) trigger sync. A failed cloud request displays a warning and retains the pending records. A first-time cloud load failure blocks edits, avoiding accidental changes to unknown books. Do not clear browser storage while changes are pending. Avoid concurrent account edits on different devices: account metadata uses last-write-wins; this is not a multi-user accounting server.

## GitHub Pages

This repository already has a Pages build/deployment history for `main`. In repository Settings → Pages, verify **Deploy from a branch → main → /(root)**. Changes merged into `main` should trigger the existing Pages workflow. Use the website URL displayed there. The application uses relative asset URLs to support a repository subpath.

## Tests

```sh
npm ci
npm test
```

Tests cover accounting invariants, date filters, contra balances, disabled history, backup validation, UI form events, storage persistence, atomic local journal saving, and per-user pending queues. DOM/storage integration tests use jsdom and fake-indexeddb, not a real browser or live Firebase account.

An optional real-browser regression script is included:

```sh
npm install --no-save playwright
npx playwright install chromium
# In another terminal: npm start
node tests/browser.mjs
```

Set `TEST_BASE_URL` for another test deployment. It uses isolated browser profiles and only local-mode sample transactions, never your cloud books.
