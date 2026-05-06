# ELS Upload Server

Simple Node/Express example to accept multipart file uploads and return a JSON URL. Intended for local testing with the demo `index.html`.

## Setup

1. Open a terminal and change into the `server` directory:

```bash
cd "C:\Users\HP\.vscode\ELS.online store\server"
```

2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

The server will listen on port `8001` by default and expose `POST /upload` which accepts a `file` field (multipart/form-data) and returns `{ "url": "http://localhost:8001/uploads/<filename>" }`.

## Example curl

```bash
curl -F "file=@./path/to/image.jpg" http://localhost:8001/upload
```

## Notes
- This server is for local development only. For production, use proper authentication, storage (S3, GCS, Azure Blob, etc.), and secure upload rules.
