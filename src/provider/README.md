# Provider Folder

This folder keeps frontend Firebase setup and login context files.

## Files

- `FirebaseConfig.jsx`: connects the frontend app to Firebase.
- `AuthContext.jsx`: keeps the current login user, role, and profile data.
- `FirebaseFunc.jsx`: keeps old small Firestore helper functions.
- `DatabaseScheme.jsx`: keeps old default data shapes.

## Notes

- New pages should usually call files in `services`.
- Page UI code should stay in `pages` or `components`.
- Do not put backend function code in this folder.
