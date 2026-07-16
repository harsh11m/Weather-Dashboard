"use strict";

import { WeatherApiError, fetchDashboardData } from "./api.js";
import {
  loadPreferences,
  savePreferences,
  loadFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
} from "./storage.js";

/* ==========================================================================
   DOM references
   ========================================================================== */

const dom = {
  homeButton: document.getElementById("home-button"),
  searchForm: document.getElementById("search-form"),
  cityInput: document.getElementById("city-input"),
  geoButton: document.getElementById("geo-button"),
  searchStatus: document.getElementById("search-status"),

  unitToggle: document.getElementById("unit-toggle"),
  themeToggle: document.getElementById("theme-toggle"),

  favoritesList: document.getElementById("favorites-list"),

  loadingPanel: document.getElementById("loading-panel"),
  errorPanel: document.getElementById("error-panel"),
  errorMessage: document.getElementById("error-message"),
  retryButton: document.getElementById("retry-button"),
  emptyPanel: document.getElementById("empty-panel"),

  currentWeather: document.getElementById("current-weather"),
  currentCityName: document.getElementById("current-city-name"),
  currentDate: document.getElementById("current-date"),
  currentIcon: document.getElementById("current-icon"),
  currentTemp: document.getElementById("current-temp"),
  currentDescription: document.getElementById("current-description"),
  currentFeelsLike: document.getElementById("current-feels-like"),
  favoriteToggle: document.getElementById("favorite-toggle"),

  statHumidity: document.getElementById("stat-humidity"),
  statWind: document.getElementById("stat-wind"),
  statPressure: document.getElementById("stat-pressure"),
  statVisibility: document.getElementById("stat-visibility"),
  statSunrise: document.getElementById("stat-sunrise"),
  statSunset: document.getElementById("stat-sunset"),

  forecast: document.getElementById("forecast"),
  forecastList: document.getElementById("forecast-list"),
};

/* ==========================================================================
   App state
   ========================================================================== */

const state = {
  preferences: loadPreferences(),
  currentLocation: null, // { city } or { lat, lon, city }
  lastRequest: null, // retained so "Try again" can re-run the same request
};

const DEBOUNCE_DELAY_MS = 450;

/* ==========================================================================
   Small utilities
   ========================================================================== */

/**
 * Returns a debounced version of fn: calls are delayed until
 * `delay` ms have passed without another invocation.
 * @param {Function} fn
 * @param {number} delay
 */
const debounce = (fn, delay) => {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
};

const iconUrl = (icon) => `https://openweathermap.org/img/wn/${icon}@2x.png`;

const formatDate = (date, timezoneOffsetSeconds = 0) =>
  new Date(date.getTime() + timezoneOffsetSeconds * 1000).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

const formatDayLabel = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });

const formatTime = (unixSeconds, timezoneOffsetSeconds = 0) => {
  const shifted = new Date((unixSeconds + timezoneOffsetSeconds) * 1000);
  const hours = shifted.getUTCHours().toString().padStart(2, "0");
  const minutes = shifted.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const unitSuffix = (units) => (units === "metric" ? "C" : "F");
const windUnit = (units) => (units === "metric" ? "km/h" : "mph");

/* ==========================================================================
   Rendering
   ========================================================================== */

const PANELS = ["loadingPanel", "errorPanel", "emptyPanel"];

/** Shows exactly one of the state panels (or none) and toggles the data sections. */
const setView = (view) => {
  PANELS.forEach((key) => {
    dom[key].hidden = true;
  });

  dom.currentWeather.hidden = view !== "data";
  dom.forecast.hidden = view !== "data";

  if (view === "loading") dom.loadingPanel.hidden = false;
  if (view === "error") dom.errorPanel.hidden = false;
  if (view === "empty") dom.emptyPanel.hidden = false;
};

const renderCurrentWeather = (current) => {
  dom.currentCityName.textContent = current.country
    ? `${current.city}, ${current.country}`
    : current.city;
  dom.currentDate.textContent = formatDate(new Date());
  dom.currentIcon.src = iconUrl(current.icon);
  dom.currentIcon.alt = current.description;
  dom.currentTemp.textContent = `${current.temperature}°${unitSuffix(current.units)}`;
  dom.currentDescription.textContent = current.description;
  dom.currentFeelsLike.textContent = `Feels like ${current.feelsLike}°${unitSuffix(current.units)}`;

  dom.statHumidity.textContent = `${current.humidity}%`;
  dom.statWind.textContent = `${current.windSpeed} ${windUnit(current.units)}`;
  dom.statPressure.textContent = `${current.pressure} hPa`;
  dom.statVisibility.textContent = `${current.visibility} km`;
  dom.statSunrise.textContent = formatTime(current.sunrise, current.timezone);
  dom.statSunset.textContent = formatTime(current.sunset, current.timezone);

  const favorited = isFavorite(current.city);
  dom.favoriteToggle.setAttribute("aria-pressed", String(favorited));
  dom.favoriteToggle.setAttribute(
    "aria-label",
    favorited ? "Remove from saved cities" : "Save this city"
  );
};

const renderForecast = (forecastDays) => {
  dom.forecastList.innerHTML = "";

  forecastDays.forEach((day) => {
    const item = document.createElement("li");
    item.className = "forecast__card";
    item.innerHTML = `
      <p class="forecast__day">${formatDayLabel(day.date)}</p>
      <img class="forecast__icon" src="${iconUrl(day.icon)}" alt="${day.description}" width="48" height="48" loading="lazy" />
      <p class="forecast__desc">${day.description}</p>
      <p class="forecast__temps">${day.tempMax}°<span class="low">${day.tempMin}°</span></p>
    `;
    dom.forecastList.appendChild(item);
  });
};

const renderFavorites = () => {
  const favorites = loadFavorites();
  dom.favoritesList.innerHTML = "";

  favorites.forEach((city) => {
    const item = document.createElement("li");
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "favorites__chip";
    chip.dataset.city = city;

    const label = document.createElement("span");
    label.textContent = city;

    const removeBtn = document.createElement("span");
    removeBtn.className = "favorites__remove";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("role", "button");
    removeBtn.setAttribute("aria-label", `Remove ${city} from saved cities`);

    chip.appendChild(label);
    chip.appendChild(removeBtn);
    item.appendChild(chip);
    dom.favoritesList.appendChild(item);
  });
};

const applyTheme = (theme) => {
  document.body.setAttribute("data-theme", theme);
  dom.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
};

const applyUnitToggleUI = (units) => {
  dom.unitToggle.setAttribute("aria-pressed", String(units === "imperial"));
  dom.unitToggle.querySelectorAll(".unit-toggle__option").forEach((el) => {
    el.classList.toggle("unit-toggle__option--active", el.dataset.unit === units);
  });
};

/* ==========================================================================
   Data loading
   ========================================================================== */

/**
 * Loads weather + forecast for a location and renders the result.
 * Persists the request so the "Try again" button can retry it.
 * @param {{city?: string, lat?: number, lon?: number}} location
 */
const loadWeather = async (location) => {
  state.lastRequest = location;
  setView("loading");
  dom.searchStatus.textContent = "Loading weather data...";

  try {
    const { current, forecast } = await fetchDashboardData(location, state.preferences.units);

    state.currentLocation = { city: current.city };
    renderCurrentWeather(current);
    renderForecast(forecast);
    setView("data");
    dom.searchStatus.textContent = `Weather loaded for ${current.city}.`;

    savePreferences({ defaultCity: current.city });
  } catch (error) {
    const message =
      error instanceof WeatherApiError
        ? error.message
        : "Unexpected error while loading weather data.";
    dom.errorMessage.textContent = message;
    setView("error");
    dom.searchStatus.textContent = message;
    console.error("[app] Failed to load weather:", error);
  }
};

/* ==========================================================================
   Event handlers
   ========================================================================== */

const handleSearchSubmit = (event) => {
  event.preventDefault();
  const city = dom.cityInput.value.trim();
  if (!city) return;
  loadWeather({ city });
};

const debouncedSearchPreview = debounce((city) => {
  if (city.length < 2) return;
  loadWeather({ city });
}, DEBOUNCE_DELAY_MS);

const handleCityInput = (event) => {
  const city = event.target.value.trim();
  if (city) debouncedSearchPreview(city);
};

const handleGeoButtonClick = () => {
  if (!("geolocation" in navigator)) {
    dom.errorMessage.textContent = "Geolocation is not supported by your browser.";
    setView("error");
    return;
  }

  setView("loading");
  dom.searchStatus.textContent = "Locating you...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      loadWeather({ lat: latitude, lon: longitude });
    },
    (geoError) => {
      dom.errorMessage.textContent = "Could not access your location. Please search manually.";
      setView("error");
      console.error("[app] Geolocation error:", geoError);
    },
    { timeout: 10000 }
  );
};

const handleUnitToggle = () => {
  const nextUnits = state.preferences.units === "metric" ? "imperial" : "metric";
  state.preferences = savePreferences({ units: nextUnits });
  applyUnitToggleUI(nextUnits);
  if (state.lastRequest) loadWeather(state.lastRequest);
};

const handleThemeToggle = () => {
  const nextTheme = state.preferences.theme === "dark" ? "light" : "dark";
  state.preferences = savePreferences({ theme: nextTheme });
  applyTheme(nextTheme);
};

const handleFavoriteToggle = () => {
  if (!state.currentLocation) return;
  const { city } = state.currentLocation;

  if (isFavorite(city)) {
    removeFavorite(city);
  } else {
    addFavorite(city);
  }

  renderFavorites();
  dom.favoriteToggle.setAttribute("aria-pressed", String(isFavorite(city)));
};

const handleFavoritesListClick = (event) => {
  const removeBtn = event.target.closest(".favorites__remove");
  const chip = event.target.closest(".favorites__chip");
  if (!chip) return;

  if (removeBtn) {
    removeFavorite(chip.dataset.city);
    renderFavorites();
    return;
  }

  loadWeather({ city: chip.dataset.city });
};

const handleHomeClick = () => {
  dom.cityInput.value = "";
  state.currentLocation = null;
  state.lastRequest = null;
  dom.searchStatus.textContent = "";
  setView("empty");
  dom.cityInput.focus();
};

const handleRetry = () => {
  if (state.lastRequest) loadWeather(state.lastRequest);
};

/* ==========================================================================
   Init
   ========================================================================== */

const registerEventListeners = () => {
  dom.homeButton.addEventListener("click", handleHomeClick);
  dom.searchForm.addEventListener("submit", handleSearchSubmit);
  dom.cityInput.addEventListener("input", handleCityInput);
  dom.geoButton.addEventListener("click", handleGeoButtonClick);
  dom.unitToggle.addEventListener("click", handleUnitToggle);
  dom.themeToggle.addEventListener("click", handleThemeToggle);
  dom.favoriteToggle.addEventListener("click", handleFavoriteToggle);
  dom.favoritesList.addEventListener("click", handleFavoritesListClick);
  dom.retryButton.addEventListener("click", handleRetry);
};

const init = () => {
  applyTheme(state.preferences.theme);
  applyUnitToggleUI(state.preferences.units);
  renderFavorites();
  registerEventListeners();

  if (state.preferences.defaultCity) {
    dom.cityInput.value = "";
    loadWeather({ city: state.preferences.defaultCity });
  } else {
    setView("empty");
  }
};

document.addEventListener("DOMContentLoaded", init);
