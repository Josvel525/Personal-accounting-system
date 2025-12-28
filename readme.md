# Personal Accounting (Double-Entry) — GitHub Pages + Firebase Sync

A mobile-first personal accounting system:
- Chart of Accounts (add/edit/disable/delete in-app)
- Double-entry Journal Entries
- General Ledger
- Trial Balance (must foot)
- Balance Sheet (must balance)
- Income Statement (date-range aware)
- Cloud sync across iPhone + PC using Firebase
- Offline queue + local cache (IndexedDB)

---

## 1) Create Firebase Project

1. Go to Firebase Console
2. Create a project
3. Add a **Web App**
4. Enable:
   - **Authentication → Email/Password**
   - **Firestore Database**

### Firestore Rules (starter)
In Firestore → Rules, you can use: