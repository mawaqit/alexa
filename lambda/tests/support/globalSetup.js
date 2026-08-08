/**
 * The prayer-time helpers convert "now" through the device timezone and back
 * through the host's local time. Pinning TZ makes that round-trip deterministic
 * regardless of where the suite runs.
 */
module.exports = () => {
  process.env.TZ = "UTC";
};
