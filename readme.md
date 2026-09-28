# Personal Accounting

A double-entry personal accounting app with a white workspace, charcoal application header, blue menu selections, outlined toolbar buttons, and compact banded accounting tables. Desktop has a wide application menu; phone screens use a touch-friendly drawer and independently scrollable tables. Plain browser JavaScript; no production build dependencies.

## Run on your computer

Install Node.js 22 or later, then:

```sh
npm start
```

Open http://127.0.0.1:4173. You do not need `npm install` to run the app. A static HTTPS host such as GitHub Pages works too. Do not open `index.html` as a `file://` URL; browser modules and storage require an HTTP origin.

## Textastic and other local preview apps

1. Download the **entire project folder**, keeping `index.html`, the JavaScript files, `styles.css`, and `sw.js` together. In Textastic, put the folder in **Local Files**, **iCloud**, or a folder added using **Add External Folder**. Opening only an individual HTML file can prevent access to its linked files.
2. In **Textastic → Settings → Web Preview**, turn **Random Port off** and use a fixed port, such as **8080**.
3. Open `index.html` with Web Preview. You can use **Preview in Safari**; keep using the same browser/app and exact address for these books.
4. Choose **Use on this device**. The app verifies that local database writes can be committed and read before opening local books. Accounts and posted journal entries are saved to IndexedDB before a success message appears.
5. Closing/reopening the browser or refreshing does not intentionally clear records. Different browsers, private sessions, hostnames, ports, and the hosted GitHub site each have separate storage. Keeping source files in iCloud does **not** sync the accounting database.
6. In **Backups**, inspect local storage details and use **Request persistent storage** if available. This is optional browser protection, not a permanent-storage guarantee.
7. Use **Backups → Export backup** and save the JSON to Files/iCloud Drive. If moving from Textastic to Safari or another address, export first and restore into empty local books there. iOS, browser/app-data deletion, and private preview modes can remove local records; the HTML file itself does not contain your books.

These rules also apply to comparable preview tools: use an HTTP local server with a stable origin and persistent website storage. A preview tool that clears its web data cannot be made durable by this web app. The application does not fall back to unsaved in-memory books if local storage is unavailable.

Textastic references: [Web Preview](https://www.textasticapp.com/v10/manual/viewing_editing_files/web_preview.html) and [fixed preview port](https://www.textasticapp.com/v10/manual/settings/web_preview.html). Textastic's specific iOS webview retention still needs an on-device close/reopen check; automated checks cover persistent Chromium profiles.

## Start using it

1. Choose **Use on this device** for independent local books, or sign in for cloud books.
2. On an empty chart, choose **Create starter accounts**, or add your own accounts.
3. Enter opening balances through a balanced **Journal Entry**. For example: debit Checking $1,000 and credit Opening equity $1,000.
4. Record income, expenses, and transfers with equal debit and credit totals.
5. Review the General Ledger, Trial Balance, Balance Sheet, and Income Statement. Apply report dates and print as needed.
6. Use **Backups → Export backup** regularly.

Local mode is **not cloud sync**. It uses this browser's IndexedDB and is separate from all signed-in users. Clearing site/browser data deletes local records. Anyone with access to that browser profile can open local books. JSON backups contain your financial records; keep them private. Restore is available only into empty local books, and validates entry balancing and record relationships before saving. Local books are not automatically uploaded when you sign in.

After the initial visit finishes installing its service worker, local mode can reopen offline. Browser storage availability and retention depend on the browser. For code updates, refresh after the new service worker installs. If an older screen remains in an open tab, close the app tabs and reopen. Activation never clears your accounting records. When changing cached application files, change the cache version in `sw.js` as part of the same release.

## Applications and master controls

- **General Ledger:** Chart of Accounts, Journal Entry, Review Journal (search and pagination), and General Ledger account activity.
- **Reports:** Trial Balance, Balance Sheet, Income Statement, and date-sensitive AP Aging.
- **Expenses:** Vendors, Accounts Payable invoices, partial/full Invoice Payments, Daily Expenses, Transfers & Card Payments, Bank & Card Statements, and Reconciliation.
- **Master Settings:** Book name, density, dashboard history length, fiscal year start, posting close date, required memos, reference prefix, journal review page size, default account visibility, per-report zero/empty-row options and date periods, print orientation, expense/payment/payable defaults, invoice due days, and default statement/reconciliation account.
- **Backups:** Version 2 JSON export includes settings, vendors, invoices, payments, expenses, statements, matches, reconciliations, and the original ledger records. Version 1 backups remain importable into completely empty local books. Restore validates document-to-journal links, statement totals, matches, and reconciliation continuity. Back up before changing devices or preview origins.

### Invoices and expenses

Create a liability account for Accounts payable in Chart of Accounts (for example, code 2100), add vendors, and choose the default payable account in Master Settings. Posting an invoice debits the selected expense and credits accounts payable. Invoice payments debit accounts payable and credit the bank/card account; they do not charge the expense twice. Partial payments are supported, and payments above the outstanding balance are rejected. Duplicate invoice numbers for the same vendor are rejected.

Daily Expenses debit an expense and credit a bank/cash asset or credit-card liability. Transfers and card payments debit the receiving asset/liability and credit the source bank asset. Posted documents are preserved; this release does not include invoice credit notes, vendor refunds, recurring bills, approval workflows, multi-currency accounting, or live bank connections.

### Statement import and reconciliation

Upload a CSV with `date,description,amount` headers (see `examples/statement-template.csv`). Use YYYY-MM-DD dates. For bank/debit-card accounts, deposits are positive and withdrawals negative. For credit cards with a credit normal balance, charges are positive and payments negative. Files may contain up to 2,000 rows and 1 MB of text. Opening balance plus signed transactions must equal closing balance. CSV import does not create journal entries; post missing activity before matching it. PDF/OCR statement extraction is not included.

Match each statement row to an existing transaction on the same account for the exact signed amount. A book transaction may be matched only once. Older outstanding transactions can be matched when they clear. Complete statements chronologically: opening balance must equal the previous completed closing balance, every row must be matched, and adjusted book balance must equal statement balance exactly. Unmatched book activity is shown as outstanding.

For first-time setup, an **opening reconciliation** is available only when all entries through a date are already cleared and the confirmed balance equals the books. It marks all entries through that date reconciled. If outstanding items exist, reconcile from the start of the books instead of using that shortcut. Completed reconciliations are retained, open imported statements may be removed without removing journal entries, and new backdated postings to a reconciled account are blocked.

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
        && collection in ['accounts', 'journalHeaders', 'journalLines',
          'preferences', 'vendors', 'invoices', 'payments', 'expenses',
          'statements', 'reconciliations'];
    }
  }
}
```

The new modules require access to the additional collections above. If permission is missing, the app preserves access to existing core books/reports and blocks new module writes; it does not silently claim that those records have synced.

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
node tests/persistence-browser.mjs
node tests/modules-browser.mjs
```

Set `TEST_BASE_URL` for another test deployment. It uses isolated browser profiles and only local-mode sample transactions, never your cloud books.
