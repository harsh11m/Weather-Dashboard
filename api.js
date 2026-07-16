"use strict";

/**
 * api.js
 * Handles all communication with the OpenWeatherMap REST API.
 * Every exported function returns a Promise and normalizes the raw
 * API response into a shape the rest of the app can rely on.
 */

const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_URL = "https://api.openweathermap.org/geo/1.0";

// Replace with your own free key from https://openweathermap.org/api
const API_KEY = "52f710c47f98fbc9ad1ec042c0f3ab5c";

const IS_DEV = false;

/** Thrown for any predictable, user-facing API failure. */
class WeatherApiError extends Error {
  constructor(message, statusCode = null) {
    super(message);
    this.name = "WeatherApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Builds a query string from a params object, skipping empty values.
 * @param {Record<string, string|number>} params
 * @returns {string}
 */
const buildQuery = (params) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

/**
 * Wraps fetch with consistent error handling and JSON parsing.
 * @param {string} url
 * @returns {Promise<any>}
 */
const requestJson = async (url) => {
  let response;

  try {
    response = await fetch(url);
  } catch (networkError) {
    throw new WeatherApiError("Unable to reach the weather service. Check your connection.");
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new WeatherApiError("City not found. Check the spelling and try again.", 404);
    }
    if (response.status === 401) {
      throw new WeatherApiError("Invalid API key. Add your OpenWeatherMap key in js/api.js.", 401);
    }
    throw new WeatherApiError(`Weather service error (status ${response.status}).`, response.status);
  }

  return response.json();
};

/**
 * Normalizes a raw "current weather" API payload into the shape
 * used throughout the UI layer.
 * @param {object} data
 * @param {string} units
 */
const normalizeCurrentWeather = (data, units) => ({
  city: data.name,
  country: data.sys?.country ?? "",
  temperature: Math.round(data.main.temp),
  feelsLike: Math.round(data.main.feels_like),
  description: data.weather[0]?.description ?? "",
  icon: data.weather[0]?.icon ?? "01d",
  humidity: data.main.humidity,
  windSpeed: units === "metric" ? Math.round(data.wind.speed * 3.6) : Math.round(data.wind.speed),
  pressure: data.main.pressure,
  visibility: Math.round((data.visibility ?? 0) / 1000),
  sunrise: data.sys?.sunrise,
  sunset: data.sys?.sunset,
  timezone: data.timezone,
  coord: data.coord,
  units,
});

/**
 * Groups a 3-hour-interval forecast list into one entry per day,
 * picking the reading closest to midday for each date.
 * @param {object} data - raw response from the /forecast endpoint
 * @param {string} units
 */
const normalizeForecast = (data, units) => {
  const dayBuckets = new Map();

  data.list.forEach((entry) => {
    const date = entry.dt_txt.split(" ")[0];
    const hour = Number(entry.dt_txt.split(" ")[1].split(":")[0]);
    const distanceFromNoon = Math.abs(12 - hour);

    const existing = dayBuckets.get(date);
    if (!existing || distanceFromNoon < existing.distanceFromNoon) {
      dayBuckets.set(date, { entry, distanceFromNoon });
    }
  });

  return Array.from(dayBuckets.entries())
    .slice(0, 5)
    .map(([date, { entry }]) => ({
      date,
      temperature: Math.round(entry.main.temp),
      tempMin: Math.round(entry.main.temp_min),
      tempMax: Math.round(entry.main.temp_max),
      description: entry.weather[0]?.description ?? "",
      icon: entry.weather[0]?.icon ?? "01d",
      units,
    }));
};

/**
 * Fetches current weather for a city name.
 * @param {string} city
 * @param {string} units - "metric" | "imperial"
 */
const fetchWeatherByCity = async (city, units = "metric") => {
  const query = buildQuery({ q: city, appid: API_KEY, units });
  const data = await requestJson(`${BASE_URL}/weather?${query}`);
  return normalizeCurrentWeather(data, units);
};

/**
 * Fetches current weather for geographic coordinates.
 * @param {number} lat
 * @param {number} lon
 * @param {string} units
 */
const fetchWeatherByCoords = async (lat, lon, units = "metric") => {
  const query = buildQuery({ lat, lon, appid: API_KEY, units });
  const data = await requestJson(`${BASE_URL}/weather?${query}`);
  return normalizeCurrentWeather(data, units);
};

/**
 * Fetches a 5-day forecast (one entry per day) for a city name.
 * @param {string} city
 * @param {string} units
 */
const fetchForecastByCity = async (city, units = "metric") => {
  const query = buildQuery({ q: city, appid: API_KEY, units });
  const data = await requestJson(`${BASE_URL}/forecast?${query}`);
  return normalizeForecast(data, units);
};

/**
 * Fetches a 5-day forecast (one entry per day) for coordinates.
 * @param {number} lat
 * @param {number} lon
 * @param {string} units
 */
const fetchForecastByCoords = async (lat, lon, units = "metric") => {
  const query = buildQuery({ lat, lon, appid: API_KEY, units });
  const data = await requestJson(`${BASE_URL}/forecast?${query}`);
  return normalizeForecast(data, units);
};

/**
 * Convenience helper that fetches current weather and forecast together.
 * @param {{city?: string, lat?: number, lon?: number}} location
 * @param {string} units
 */
const fetchDashboardData = async (location, units = "metric") => {
  const useCoords = location.lat !== undefined && location.lon !== undefined;

  const [current, forecast] = await Promise.all([
    useCoords
      ? fetchWeatherByCoords(location.lat, location.lon, units)
      : fetchWeatherByCity(location.city, units),
    useCoords
      ? fetchForecastByCoords(location.lat, location.lon, units)
      : fetchForecastByCity(location.city, units),
  ]);

  if (IS_DEV) {
    console.log("[api] dashboard data", { current, forecast });
  }

  return { current, forecast };
};

export {
  WeatherApiError,
  fetchWeatherByCity,
  fetchWeatherByCoords,
  fetchForecastByCity,
  fetchForecastByCoords,
  fetchDashboardData,
};
