# Interventioner — React starter

This is a React/Vite implementation of the Interventioner design mockup.

## Run it

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in your terminal.

The Students page loads students and interventionists scoped to the signed-in
user's school from the FastAPI endpoints. Unassigned students can be assigned to
an interventionist at that school from the page.
Start the backend before using the Students page. The frontend defaults to
`http://localhost:8000`; set `VITE_API_URL` to use a different backend URL.

## Structure

- `src/App.jsx` — page layout and reusable UI components
- `src/styles.css` — Montserrat typography, responsive layout, cards, theme colors
- `src/data.js` — API request and data normalization, plus shared non-student data
