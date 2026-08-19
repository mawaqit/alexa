// Shared, dependency-free request-payload validators for the website's
// PUT/POST/query-param inputs (webConfigHandler.js, webMosqueHandler.js).
// Kept in one place so the limits these values need downstream — DynamoDB
// item size, EventBridge schedule name length, Intl timezone parsing — can't
// drift between the handlers that both read and write them.

const MAX_SHORT_STRING = 200;
const MAX_URL_LENGTH = 2000;

function isNonEmptyString(value, maxLength = MAX_SHORT_STRING) {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maxLength
  );
}

function isOptionalString(value, maxLength = MAX_SHORT_STRING) {
  return (
    value === undefined || value === null || isNonEmptyString(value, maxLength)
  );
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value) {
  return value === undefined || value === null || isFiniteNumber(value);
}

// Intl.DateTimeFormat throws RangeError for anything that isn't a real IANA
// zone identifier — this is the one validation Node gives us for free,
// no timezone-data dependency needed. `timezone` ends up embedded in
// EventBridge schedule expressions (eventBridgeScheduler.js), so a garbage
// value here would otherwise only surface as a confusing failure later.
function isValidTimezone(value) {
  if (!isNonEmptyString(value, 100)) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isValidLatitude(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

function isValidLongitude(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

function isStringArray(
  value,
  { maxLength = 20, itemMaxLength = MAX_SHORT_STRING } = {},
) {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
    value.every((item) => isNonEmptyString(item, itemMaxLength))
  );
}

// An optional field that, once saved, is rendered as-is on the dashboard
// (image ends up in an <img src>) — restricted to http(s) so a
// javascript:/data: value can never be staged in the first place.
function isOptionalHttpUrl(value, maxLength = MAX_URL_LENGTH) {
  if (value === undefined || value === null) return true;
  if (!isNonEmptyString(value, maxLength)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

module.exports = {
  isNonEmptyString,
  isOptionalString,
  isFiniteNumber,
  isOptionalFiniteNumber,
  isValidTimezone,
  isValidLatitude,
  isValidLongitude,
  isStringArray,
  isOptionalHttpUrl,
};
