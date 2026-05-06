Firebase Storage — Quick Setup for ELS.online store

This document shows a minimal, safe workflow to enable Firebase Storage uploads for local development and testing with the demo `index.html` (which already contains `uploadToFirebaseStorage()` that reads `window.FIREBASE_CONFIG`).

1) Create a Firebase project
- Go to https://console.firebase.google.com/ and create a new project (or select an existing one).
- Enable **Storage** from the left sidebar.

2) Configure Storage rules (development)
- In the Firebase Console > Storage > Rules, set rules while testing. BE CAREFUL: the following rule makes the bucket writable by anyone — use only for short-term local testing.

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

- For safer testing allow read but restrict write to authenticated users:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read;
      allow write: if request.auth != null;
    }
  }
}
```

3) Get your Firebase config
- In the Console > Project settings > General > Your apps, register a Web app (if you haven't) and copy the config object.
- You'll get an object like:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
```

4) Add `FIREBASE_CONFIG` to the demo app
- For quick testing, open the browser console on the demo page and paste:

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

- Alternatively, add the object directly into `index.html` before the app script (development only):

```html
<script>
  window.FIREBASE_CONFIG = { /* paste config here */ };
</script>
```

5) How the demo uses it
- `uploadToFirebaseStorage(dataUrl)` in `index.html` loads the Firebase compat SDKs, initializes the app with `window.FIREBASE_CONFIG`, and uploads a blob to `uploads/<timestamp>.png`, returning a public download URL.
- The `uploadImageToCloud()` wrapper will call this when `window.FIREBASE_CONFIG` is set.

6) CORS / Hosting notes
- If you use the Firebase JS SDK as in this demo, you don't need to configure bucket CORS for browser uploads.
- If you instead create a custom upload HTTP endpoint (e.g., the Express server in `/server`), configure CORS on that server (already enabled in the example) or set Storage bucket CORS if using signed uploads.

7) Security and production notes
- Do NOT leave permissive Storage rules in production. Use authenticated uploads (Firebase Auth) or a secure server-side upload flow that validates and stores files in a storage service (S3/GCS/Azure) with restricted access.
- Consider adding:
  - File type and size checks server-side.
  - Virus/malware scanning for uploaded content.
  - Signed URLs for temporary access when serving private files.

8) Test flow (quick)
- Start local upload server (optional) or use Firebase method:
  - Ensure `window.FIREBASE_CONFIG` is set in page console.
  - Use the app's Open Store UI and add images; when `uploadToCloud` is triggered the images will be uploaded to Firebase and product payload will store returned URLs.

If you want, I can add a small sample snippet to `index.html` that injects a placeholder `window.FIREBASE_CONFIG` object (commented) and a small UI hint to guide testing.
