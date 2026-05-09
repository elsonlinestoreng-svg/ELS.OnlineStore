# ELS.OnlineStore — Local Development

This workspace contains a simple single-file static demo of an e-commerce UI with product listing and image upload support.

## Quick test (Windows PowerShell)
1. Open PowerShell in this folder: `C:\Users\HP\.vscode\ELS.online store`
2. Start the server and auto-open your browser:

```powershell
.\serve.ps1
```

If PowerShell execution is restricted, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

3. The site should open at `http://localhost:8000`.
4. To test the Open Store flow:
   - Click **Login** and enter an email (demo auth).
   - Go to **Open Store**, fill in product name, price, category and description.
   - Click the image upload area or drag an image (JPG/PNG/WebP). A preview and size info will appear.
   - Optionally toggle "Optimize" to compress the image client-side.
   - Click **List Product** — the product will be created locally or uploaded via configured cloud upload.

## Cloud uploads
- To use a custom HTTP upload endpoint, set `window.cloudImageUploadUrl` (or `window.CLOUD_IMAGE_UPLOAD_URL`) to your upload URL. The page will POST a `file` field and expects JSON `{ "url": "https://..." }`.
- Or provide a custom handler in JS:
```html
<script>
  window.cloudImageUploadHandler = async (dataUrl) => {
    // return remote URL string after uploading the dataUrl
  };
</script>
```
- Firebase Storage: set `window.FIREBASE_CONFIG = { /* your firebase config object */ }` before the app script runs. The page will attempt client-side upload when configured.

## Troubleshooting
- If the server fails to start, run PowerShell as Administrator or change the port in `serve.ps1`.
  
Remote access / URL ACL
- If you want the `serve.ps1` listener to accept connections from other machines on your LAN, Windows may block non-admin bindings by default.
- A helper script `register-urlacl.ps1` is included to register a URL ACL and open the firewall for the chosen port. Run it as Administrator:

```powershell
.\register-urlacl.ps1 -Port 8000
```

After running the helper, re-run `serve.ps1` (you may need to restart it). Alternatively, run `serve.ps1` itself as Administrator.
- If images don't upload to cloud, check the browser console for errors and ensure the upload endpoint accepts multipart form `file` uploads.

## Notes
- Uploaded images are compressed/resized client-side by default (Optimize checkbox) to improve UX and reduce bandwidth.
- The demo falls back to in-memory product creation if no backend `dataSdk` is available.

If you'd like, I can:
- Add a Node/Express upload example, or
- Wire Firebase configuration into the page for end-to-end testing.
