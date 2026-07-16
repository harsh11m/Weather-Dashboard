"use strict";

/**
 * storage.js
 * Wraps all Local Storage reads/writes for the app. Centralizing this
 * keeps key names and JSON parsing in one place and makes it easy to
 * change the persistence strategy later without touching the UI code.
 */

const STORAGE_KEYS = {
  PREFERENCES: "skyline.preferences",
  FAVORITES: "skyline.favorites",
};

const DEFAULT_PREFERENCES = {
  defaultCity: "London",
  units: "metric",
  theme: "light",
};

/**
 * Safely reads and parses a JSON value from Local Storage.
 * Falls back to the provided default if the key is missing,
 * storage is unavailable, or the stored value is corrupted.
 * @param {string} key
 * @param {*} fallback
 */
const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`[storage] Could not read "${key}", using fallback.`, error);
    return fallback;
  }
};

/**
 * Safely serializes and writes a value to Local Storage.
 * @param {string} key
 * @param {*} value
 * @returns {boolean} whether the write succeeded
 */
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[storage] Could not write "${key}".`, error);
    return false;
  }
};

/** Loads saved preferences, merged over sensible defaults. */
const loadPreferences = () => ({
  ...DEFAULT_PREFERENCES,
  ...readJson(STORAGE_KEYS.PREFERENCES, {}),
});

/**
 * Persists a partial or full preferences update.
 * @param {Partial<typeof DEFAULT_PREFERENCES>} updates
 */
const savePreferences = (updates) => {
  const merged = { ...loadPreferences(), ...updates };
  writeJson(STORAGE_KEYS.PREFERENCES, merged);
  return merged;
};

/** Loads the list of favorite city names (max order preserved). */
const loadFavorites = () => readJson(STORAGE_KEYS.FAVORITES, []);

/**
 * Adds a city to favorites if not already present.
 * @param {string} city
 */
const addFavorite = (city) => {
  const favorites = loadFavorites();
  if (favorites.some((entry) => entry.toLowerCase() === city.toLowerCase())) {
    return favorites;
  }
  const updated = [...favorites, city];
  writeJson(STORAGE_KEYS.FAVORITES, updated);
  return updated;
};

/**
 * Removes a city from favorites.
 * @param {string} city
 */
const removeFavorite = (city) => {
  const updated = loadFavorites().filter(
    (entry) => entry.toLowerCase() !== city.toLowerCase()
  );
  writeJson(STORAGE_KEYS.FAVORITES, updated);
  return updated;
};

/**
 * Checks whether a city is already saved as a favorite.
 * @param {string} city
 */
const isFavorite = (city) =>
  loadFavorites().some((entry) => entry.toLowerCase() === city.toLowerCase());

export {
  STORAGE_KEYS,
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  loadFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
};
