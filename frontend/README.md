# Interventioner — React starter

This is a React/Vite implementation of the Interventioner design mockup.

## Run it

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in your terminal.

The app loads student records from the FastAPI `GET /students-fetch` endpoint.
For local development, Vite proxies that request to `http://127.0.0.1:8000`;
start the backend before using the dashboard or Students page. To use a remote
backend, set `VITE_API_BASE_URL` to its base URL.

## Structure

- `src/App.jsx` — page layout and reusable UI components
- `src/styles.css` — Montserrat typography, responsive layout, cards, theme colors
- `src/data.js` — API request and data normalization, plus shared non-student data
