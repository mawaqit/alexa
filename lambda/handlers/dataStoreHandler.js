const apiHandler = require("./apiHandler");

/* *
 * Thin wrapper over the Data Store REST API for commands that are not a
 * widget's own content push (CLEAR, REMOVE_NAMESPACE, ...).
 *
 * Every lookup is optional-chained: lifecycle events (SkillDisabled,
 * PackageManager.*) are not guaranteed to carry a device, so a missing target
 * resolves to null and the caller skips the call instead of throwing.
 * */

const getDeviceTarget = (handlerInput) => {
  const deviceId =
    handlerInput?.requestEnvelope?.context?.System?.device?.deviceId;
  return typeof deviceId === "string" && deviceId
    ? { type: "DEVICES", items: [deviceId] }
    : null;
};

// USER reaches every data-store-capable device on the account, which is what
// account-wide changes (mosque, skill disabled) need — the request's own
// device may not even have a screen.
const getUserTarget = (handlerInput) => {
  const envelope = handlerInput?.requestEnvelope;
  const userId =
    envelope?.context?.System?.user?.userId ?? envelope?.session?.user?.userId;
  return typeof userId === "string" && userId
    ? { type: "USER", id: userId }
    : null;
};

const sendDataStoreCommands = async (handlerInput, commands, target) => {
  const token = await apiHandler.getAccessToken();
  if (!token?.access_token) {
    throw new Error("Data Store access token missing from LWA response");
  }
  // undefined falls back to updateDatastore's default (EU) endpoint.
  const apiEndpoint =
    handlerInput?.requestEnvelope?.context?.System?.apiEndpoint;
  return apiHandler.updateDatastore(token, commands, target, apiEndpoint);
};

// Replaces a widget's content on the requesting device. Throws when the
// request has no device, like any other delivery failure.
const putWidgetObject = async (handlerInput, namespace, key, content) => {
  const target = getDeviceTarget(handlerInput);
  if (!target) {
    throw new Error(`No device to deliver ${namespace}/${key} to`);
  }
  return sendDataStoreCommands(
    handlerInput,
    [{ type: "PUT_OBJECT", namespace, key, content }],
    target,
  );
};

module.exports = {
  getDeviceTarget,
  getUserTarget,
  sendDataStoreCommands,
  putWidgetObject,
};
