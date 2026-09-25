# Interventioner — React starter

This is a React/Vite implementation of the Interventioner design mockup.

## Run it

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in your terminal.

## Structure

- `src/App.jsx` — page layout and reusable UI components
- `src/styles.css` — Montserrat typography, responsive layout, cards, theme colors
- `src/data.js` — placeholder data intended to be replaced by API calls

## Replacing placeholder data with an API

The UI intentionally keeps data separate from presentation. For example, in `src/data.js`:

```js
export const students = await fetch("/api/students").then(r => r.json());
```

For a real app, I would move fetching into a service/hook:

```js
export async function getStudents() {
  const response = await fetch("/api/students");
  if (!response.ok) throw new Error("Failed to load students");
  return response.json();
}
```

Then load it in a React component with `useEffect`, or use a data-fetching library later if the project grows.

### Suggested API shape

```json
{
  "id": 1,
  "name": "Little Timmy",
  "grade": 4,
  "teacher": "Ms. PP",
  "group": 69,
  "interventionTeacher": "Ms. Poop",
  "scores": {
    "English": 80.56,
    "Math": 30.51,
    "Reading": 87.67
  }
}
```

The frontend does not depend on the placeholder values, so these can be swapped for your C# backend/MySQL data later.
