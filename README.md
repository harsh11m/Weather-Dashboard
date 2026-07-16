# Skyline Weather Dashboard

A responsive weather dashboard that fetches live current-conditions and 5-day forecast data from the OpenWeatherMap API, with user preferences (default city, °C/°F units, light/dark theme) and saved cities persisted in Local Storage.

**Live demo:** _add your GitHub Pages link here after deployment_
**Course:** Week 6 — Advanced JavaScript & APIs

---

## 1. Project Overview

### Goals
- Practice asynchronous JavaScript (`async`/`await`, `Promise.all`) against a real, external REST API.
- Handle JSON data end-to-end: request, normalize, render, and persist.
- Build a UI that clearly communicates loading, error, empty, and success states.
- Persist user preferences and favorite cities across sessions with Local Storage.
- Keep the codebase organized into single-responsibility modules (`api.js`, `storage.js`, `app.js`) rather than one large script.

### Core features
- **Current weather** — temperature, "feels like", description, humidity, wind, pressure, visibility, sunrise/sunset.
- **5-day forecast** — one card per day, condensed from the API's 3-hour interval data.
- **City search** — form submit plus a debounced live search as you type.
- **Geolocation** — "use my location" button using the browser Geolocation API.
- **Favorites** — save/remove cities, shown as quick-access chips.
- **Preferences** — unit system and theme are remembered between visits; last-searched city becomes the new default.
- **Loading / error / empty states** — every network request has a corresponding UI state, including a "Try again" retry action.
- **Responsive & accessible** — mobile-first layout, semantic landmarks, `aria-live` status updates, visible focus states, skip link.

---

## 2. Setup Instructions

### Prerequisites
- A free [OpenWeatherMap](https://openweathermap.org/api) account and API key (the free tier covers Current Weather + 5 Day / 3 Hour Forecast).
- Any static file server, since ES modules (`import`/`export`) must be served over HTTP(S), not opened via `file://`.

### Steps
1. **Clone or download** this repository.
2. **Add your API key.** Open `js/api.js` and replace:
   ```js
   const API_KEY = "YOUR_OPENWEATHERMAP_API_KEY";
   ```
   with your actual key from the OpenWeatherMap dashboard.
3. **Serve the folder locally.** Because the app uses JS modules, use a local server rather than double-clicking `index.html`. For example, with VS Code's Live Server extension, or:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```
4. **Open the app** in your browser at the address the server prints (e.g. `http://localhost:8080`).
5. **Search a city** or click the location icon to load weather for your current position.

### Deploying to GitHub Pages
1. Push this folder to a repository (e.g. `weather-dashboard`).
2. In **Settings → Pages**, set the source branch to `main` and folder to `/ (root)`.
3. Wait for the deploy to finish, then visit the generated `https://<username>.github.io/<repo>/` URL.
4. Because the API key lives in client-side JS, anyone can technically view it in DevTools. For a course project this is an accepted trade-off — see [Technical Details](#4-technical-details) for the production alternative.

---

## 3. Code Structure

```
weather-dashboard/
├── index.html          # Semantic markup + all UI states (loading/error/empty/data)
├── css/
│   └── styles.css      # Design tokens, responsive layout, light/dark theme
├── js/
│   ├── api.js           # All fetch calls to OpenWeatherMap + response normalization
│   ├── storage.js        # Local Storage reads/writes for prefs & favorites
│   └── app.js            # DOM refs, state, event handlers, rendering (orchestrator)
├── screenshots/         # App screenshots for documentation
└── README.md
```

**Why three JS modules instead of one file?**
- `api.js` — knows *how to talk to the API*. It has no knowledge of the DOM.
- `storage.js` — knows *how to persist data*. It has no knowledge of the API or DOM.
- `app.js` — the only module that touches the DOM. It imports the other two and wires them together.

This separation means each module can be tested or reused independently, and a change to the API provider (say, swapping OpenWeatherMap for another service) only touches `api.js`.

---

## 4. Technical Details

### Asynchronous JavaScript
All network calls use `async`/`await` on top of `fetch`, wrapped in `try/catch` (see `requestJson()` in `js/api.js`). Loading the dashboard fires the current-weather and forecast requests **concurrently** with `Promise.all`, rather than sequentially, so the two responses resolve together:

```js
const [current, forecast] = await Promise.all([
  fetchWeatherByCity(city, units),
  fetchForecastByCity(city, units),
]);
```

### REST API integration
- **Endpoints used:** `GET /data/2.5/weather` (current conditions) and `GET /data/2.5/forecast` (3-hour interval, 5-day forecast).
- **HTTP method:** `GET` for all requests — no request body, parameters passed as a query string.
- **Response handling:** every response is checked with `response.ok` before parsing; non-2xx responses are translated into a custom `WeatherApiError` with a human-readable message (see [API Documentation](#6-api-documentation)).

### JSON data handling
The raw OpenWeatherMap payload is deeply nested and inconsistent between endpoints. `api.js` normalizes both responses into flat, predictable objects (`normalizeCurrentWeather`, `normalizeForecast`) before anything reaches the UI layer — the rendering code in `app.js` never touches raw API field names like `main.temp` or `weather[0].description` directly.

### Forecast aggregation algorithm
The forecast endpoint returns 40 entries (5 days × 8 three-hour slots). `normalizeForecast()` groups entries by calendar date using a `Map`, and for each date keeps only the entry whose hour is closest to 12:00 (midday), which best represents that day's typical conditions:

```js
const distanceFromNoon = Math.abs(12 - hour);
if (!existing || distanceFromNoon < existing.distanceFromNoon) {
  dayBuckets.set(date, { entry, distanceFromNoon });
}
```

### Debounced search
`handleCityInput` calls a debounced function (`debounce()`, a closure-based utility in `app.js`) that waits 450ms after the user stops typing before firing a request — this avoids sending a network request on every keystroke.

### Local Storage implementation
- `skyline.preferences` — JSON object: `{ defaultCity, units, theme }`. Updated whenever a search succeeds (new default city) or a toggle is used.
- `skyline.favorites` — JSON array of city name strings.
- All reads/writes go through `readJson()`/`writeJson()` helpers in `storage.js`, which catch and log errors (e.g. Local Storage disabled or full) and fall back to sensible defaults instead of throwing.

### Error handling strategy
Three failure modes are handled distinctly:
1. **Network failure** (offline, DNS, CORS) → caught in the `fetch()` try/catch → generic connectivity message.
2. **API error status** (404 city not found, 401 bad key, other) → mapped to a specific `WeatherApiError` message.
3. **Unexpected runtime errors** → caught at the `loadWeather()` level and logged to the console, with a generic fallback message shown to the user.

Every error path calls `setView("error")`, which shows the error panel and a **Try again** button that replays the last request (`state.lastRequest`).

### Accessibility
- Semantic landmarks: `<header>`, `<main>`, `<nav>`, `<footer>`.
- `aria-live="polite"` status region announces loading/success/error text for screen readers.
- All icon-only buttons have `aria-label`s; toggle buttons expose `aria-pressed`.
- Visible focus outlines (`:focus-visible`) and a skip-to-content link.
- Respects `prefers-reduced-motion` by disabling animations/transitions.

---

## 5. Testing Evidence

Manual test cases performed during development:

| # | Test case | Steps | Expected result | Result |
|---|-----------|-------|------------------|--------|
| 1 | Valid city search | Type "Tokyo", submit | Current weather + 5-day forecast render | ✅ Pass |
| 2 | Invalid city search | Type "asdkjhasd", submit | Error panel shows "City not found" message | ✅ Pass |
| 3 | Empty search | Submit with empty input | No request sent, no UI change | ✅ Pass |
| 4 | Debounced live search | Type "Lon" then pause | One request fires after ~450ms pause, not per keystroke | ✅ Pass |
| 5 | Geolocation | Click location icon, allow permission | Weather loads for current coordinates | ✅ Pass |
| 6 | Geolocation denied | Click location icon, deny permission | Error panel shows permission message | ✅ Pass |
| 7 | Unit toggle | Click °C/°F toggle | Temperatures re-fetch and re-render in new units; preference persists after reload | ✅ Pass |
| 8 | Theme toggle | Click theme button | Page switches light/dark instantly; persists after reload | ✅ Pass |
| 9 | Add/remove favorite | Star a city, reload page, remove it | Favorite chip appears, survives reload, disappears after removal | ✅ Pass |
| 10 | Retry after failure | Trigger a 404, click "Try again" after fixing input | Last request re-runs and succeeds | ✅ Pass |
| 11 | Offline request | Disable network in DevTools, search a city | "Unable to reach the weather service" message shown | ✅ Pass |
| 12 | Responsive layout | Resize viewport to 375px, 768px, 1280px | Layout reflows without horizontal scroll or overlap | ✅ Pass |
| 13 | Keyboard navigation | Tab through all interactive elements | All controls reachable and operable via keyboard, focus visible | ✅ Pass |
| 14 | Local Storage disabled | Block storage in browser settings, use app | App still functions using in-memory defaults; no crash | ✅ Pass |

Screenshots of each state (desktop + mobile) are in the `screenshots/` folder — see file names for which test case they correspond to.

---

## 6. API Documentation

Base URL: `https://api.openweathermap.org`

### `GET /data/2.5/weather`
Current weather for a city name or coordinates.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|--------------|
| `q` | string | one of `q` or `lat`/`lon` | City name, e.g. `London` |
| `lat`, `lon` | number | one of `q` or `lat`/`lon` | Latitude/longitude coordinates |
| `appid` | string | yes | Your OpenWeatherMap API key |
| `units` | string | no | `metric` (°C) or `imperial` (°F); defaults to Kelvin if omitted |

**Example request**
```
GET https://api.openweathermap.org/data/2.5/weather?q=London&appid=API_KEY&units=metric
```

**Example response (truncated)**
```json
{
  "name": "London",
  "sys": { "country": "GB", "sunrise": 1720670000, "sunset": 1720722000 },
  "main": { "temp": 18.4, "feels_like": 17.9, "humidity": 71, "pressure": 1012 },
  "weather": [{ "description": "light rain", "icon": "10d" }],
  "wind": { "speed": 4.1 },
  "visibility": 10000,
  "timezone": 3600
}
```

**Used by:** `fetchWeatherByCity()`, `fetchWeatherByCoords()` in `js/api.js`.

### `GET /data/2.5/forecast`
5-day forecast in 3-hour intervals (40 entries total) for a city name or coordinates. Same query parameters as above.

**Example response (truncated)**
```json
{
  "list": [
    {
      "dt_txt": "2026-07-17 12:00:00",
      "main": { "temp": 19.2, "temp_min": 17.1, "temp_max": 20.4 },
      "weather": [{ "description": "scattered clouds", "icon": "03d" }]
    }
  ]
}
```

**Used by:** `fetchForecastByCity()`, `fetchForecastByCoords()` in `js/api.js`, then condensed to one entry/day by `normalizeForecast()`.

### Error responses

| Status | Meaning | App behavior |
|--------|---------|---------------|
| `401` | Invalid or missing API key | "Invalid API key. Add your OpenWeatherMap key in js/api.js." |
| `404` | City not found | "City not found. Check the spelling and try again." |
| other non-2xx | Server-side/rate-limit error | "Weather service error (status &lt;code&gt;)." |
| network failure | No response (offline, DNS, CORS) | "Unable to reach the weather service. Check your connection." |

Full endpoint reference: [OpenWeatherMap Current Weather API docs](https://openweathermap.org/current) and [5 Day Forecast API docs](https://openweathermap.org/forecast5).

---

## 7. Day-by-Day Implementation Log

### Day 4: Data Display — Create UI to show weather data
- Built the `<section id="current-weather">` and `<section id="forecast">` markup in `index.html`, covering city/date, weather icon, temperature, description, "feels like," and a `<dl>` of stats (humidity, wind, pressure, visibility, sunrise, sunset).
- Wrote `renderCurrentWeather()` and `renderForecast()` in `js/app.js` to populate that markup from the normalized data returned by `api.js` — no raw API field names appear in the rendering code.
- Styled the cards in `css/styles.css` using CSS custom-property design tokens (`--space-*`, `--radius-*`, `--shadow-*`) so spacing and elevation stay consistent across the current-weather card, stat grid, and forecast cards.
- Forecast cards are generated dynamically with `document.createElement`, one per day, from the 5-day array produced by `normalizeForecast()`.

### Day 5: Local Storage — Implement user preferences saving
- Created `js/storage.js` as a dedicated persistence module, isolated from both the API and DOM layers.
- `loadPreferences()` / `savePreferences()` manage a single `skyline.preferences` JSON object (`defaultCity`, `units`, `theme`), merged over defaults so a partial update never wipes out other saved fields.
- Every successful weather load calls `savePreferences({ defaultCity: current.city })`, so the last-searched city becomes the city that loads automatically next visit.
- The unit toggle and theme toggle each call `savePreferences()` on click and immediately update the UI, so preferences persist across page reloads.
- All reads/writes are wrapped in `try/catch` (`readJson`/`writeJson`) so a disabled or full Local Storage degrades gracefully to in-memory defaults instead of crashing the app (see Testing Evidence, case 14).

### Day 6: Advanced Features — Add search, favorites, geolocation
- **Search:** `handleSearchSubmit` handles the form submit; `handleCityInput` adds a debounced live-search (`debounce()`, 450ms) so results update as you type without spamming the API on every keystroke.
- **Favorites:** `js/storage.js` exposes `addFavorite`/`removeFavorite`/`isFavorite`/`loadFavorites` backed by a `skyline.favorites` array in Local Storage. The star icon on the current-weather card toggles favorite status; the favorites bar renders each saved city as a removable chip that re-triggers a search on click.
- **Geolocation:** `handleGeoButtonClick` uses the browser's `navigator.geolocation.getCurrentPosition()` API, feeding coordinates into `fetchWeatherByCoords`/`fetchForecastByCoords` in `api.js`. Permission denial and unsupported-browser cases both fall through to the error panel with a clear message.

### Day 7: Polish & Deploy — Add error handling, loading states, deploy
- **Error handling:** `api.js` defines a custom `WeatherApiError` class and maps HTTP status codes (401, 404, other) plus network failures to distinct, human-readable messages. `app.js` catches these in `loadWeather()` and displays them via the error panel with a **Try again** button that replays `state.lastRequest`.
- **Loading states:** `setView()` in `app.js` is the single source of truth for which of the four states (loading / error / empty / data) is visible, driven by the `hidden` attribute. Fixed a CSS specificity bug during testing where `.state-panel { display: flex }` was overriding the browser's default `[hidden] { display: none }` rule — resolved by adding an explicit `[hidden] { display: none !important; }` rule in `styles.css`.
- **Deploy:** documented GitHub Pages deployment steps in [Setup Instructions](#2-setup-instructions), including the requirement to serve the app over `http://` (not `file://`) since ES modules are blocked by CORS when opened directly from disk — encountered and resolved this during local testing with VS Code Live Server.
- **Responsive/accessible polish:** verified layout at 375px/768px/1280px breakpoints, added `aria-live` status announcements, `aria-pressed` on toggle buttons, visible focus states, and a skip-to-content link (see Testing Evidence, cases 12–13).

---

## 8. Known Limitations

- The API key is embedded in client-side code, which is acceptable for a course/demo project but not for production — a real deployment should proxy requests through a backend that holds the key server-side.
- The free OpenWeatherMap tier is rate-limited (60 calls/minute); heavy debounced typing plus favorites could theoretically approach that limit.
- Forecast "one reading per day" is an approximation (closest to midday), not a true daily min/max/average.
