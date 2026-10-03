const {
  getDeviceTarget,
  getUserTarget,
  sendDataStoreCommands,
} = require("./dataStoreHandler");

/* *
 * Tracks which widget packages are installed on which of the user's devices,
 * in persistentAttributes.installedWidgets — one record per package per
 * device, since a widget is installed on a device but persistent attributes
 * belong to the user:
 *
 *   {
 *     packageId: "HadithOfTheDay",
 *     deviceId: "amzn1.ask.device...",
 *     version: "1.1.0" | null,    // last version Alexa reported
 *     instanceIds: ["amzn1.ask.package.v1.instance..."],
 *     active: true,               // false once removed; kept for history
 *     createdAt, updatedAt,       // ISO strings
 *     removedAt: null | ISO,
 *   }
 * */

// The data store namespace each package's document binds to. Must match
// settings.DataStore.dataBindings in each package's document.json.
const WIDGET_NAMESPACES = Object.freeze({
  NextPrayerTime: "nextPrayerTimeWidget",
  HadithOfTheDay: "hadithOfTheDay",
  AllPrayerTime: "allPrayerTimeWidget",
});

// The namespaces whose content is derived from the selected mosque.
const MOSQUE_WIDGET_NAMESPACES = Object.freeze([
  WIDGET_NAMESPACES.NextPrayerTime,
  WIDGET_NAMESPACES.AllPrayerTime,
]);

// Per-widget flags this registry replaces. Dropped from a record the next
// time the registry saves it.
const LEGACY_WIDGET_FIELDS = Object.freeze([
  "isHadithWidgetInstalled",
  "isPrayerTimeWidgetInstalled",
  "isAllPrayerTimeWidgetInstalled",
  "lastHadithWidgetUpdate",
  "lastPrayerTimeWidgetUpdate",
  "lastAllPrayerTimeWidgetUpdate",
]);

/**
 * Returns whether the value is a nonempty string; whitespace is accepted.
 */
const isNonEmptyString = (value) => typeof value === "string" && value !== "";

/**
 * Checks only that a record has nonempty string package and device ids.
 */
const isWidgetRecord = (record) =>
  record !== null &&
  typeof record === "object" &&
  isNonEmptyString(record.packageId) &&
  isNonEmptyString(record.deviceId);

/**
 * Returns valid widget record references, including inactive records, or an
 * empty array when installedWidgets is absent or not an array.
 */
const getInstalledWidgets = (attributes) =>
  Array.isArray(attributes?.installedWidgets)
    ? attributes.installedWidgets.filter(isWidgetRecord)
    : [];

/**
 * Returns the request device id, or null if it is not a nonempty string.
 */
const getDeviceId = (envelope) => {
  const deviceId = envelope?.context?.System?.device?.deviceId;
  return isNonEmptyString(deviceId) ? deviceId : null;
};

// UsagesInstalled/UsagesRemoved carry payload.packageVersion; UpdateRequest
// carries toVersion at the top of the request.
/**
 * Returns payload.packageVersion or, when nullish, request.toVersion;
 * returns null unless the selected value is a nonempty string.
 */
const getRequestPackageVersion = (envelope) => {
  const request = envelope?.request;
  const version = request?.payload?.packageVersion ?? request?.toVersion;
  return isNonEmptyString(version) ? version : null;
};

// Every request from a device lists its installed packages in context. Amazon
// documents the field as packageVersion, but devices have been seen sending
// `version`, so both are accepted.
/**
 * Returns the first matching context package's packageVersion, falling back
 * to version when nullish, or null if no nonempty string version is found.
 */
const getContextPackageVersion = (envelope, packageId) => {
  const installed =
    envelope?.context?.["Alexa.DataStore.PackageManager"]?.installedPackages;
  if (!Array.isArray(installed)) return null;
  const match = installed.find((pkg) => pkg?.packageId === packageId);
  const version = match?.packageVersion ?? match?.version;
  return isNonEmptyString(version) ? version : null;
};

/**
 * Returns nonempty string instance ids from the request usages, or an empty
 * array when usages is absent or not an array. Duplicates are retained.
 */
const getUsageInstanceIds = (envelope) => {
  const usages = envelope?.request?.payload?.usages;
  if (!Array.isArray(usages)) return [];
  return usages.map((usage) => usage?.instanceId).filter(isNonEmptyString);
};

// A widget's own UserEvent identifies its instance only through the
// presentation URI: widget://<skillId>_<stage>/<packageId>/<instanceId>.
/**
 * Returns the segment following packageId in a widget presentation URI,
 * or null when unavailable. Uses the context URI only if the request URI is
 * nullish; does not decode URI segments.
 */
const getPresentationInstanceId = (envelope, packageId) => {
  const uri =
    envelope?.request?.presentationUri ??
    envelope?.context?.["Alexa.Presentation.APL"]?.presentationUri;
  if (!isNonEmptyString(uri) || !uri.startsWith("widget://")) return null;
  const segments = uri.slice("widget://".length).split("/");
  const packageIndex = segments.indexOf(packageId);
  if (packageIndex === -1) return null;
  const instanceId = segments[packageIndex + 1];
  return isNonEmptyString(instanceId) ? instanceId : null;
};

/**
 * Deletes legacy widget flags and update timestamps from attributes; returns
 * whether any field was found.
 */
const dropLegacyFields = (attributes) => {
  let dropped = false;
  LEGACY_WIDGET_FIELDS.forEach((field) => {
    if (field in attributes) {
      delete attributes[field];
      dropped = true;
    }
  });
  return dropped;
};

/**
 * Records that `packageId` is installed on `deviceId`, reactivating a removed
 * record rather than adding a second one. Mutates `attributes`; returns
 * whether anything changed, so callers can skip a pointless save.
 */
const markWidgetInstalled = (
  attributes,
  { packageId, deviceId, version = null, instanceIds = [], now },
) => {
  if (!attributes || typeof attributes !== "object") return false;
  if (!isNonEmptyString(packageId) || !isNonEmptyString(deviceId)) {
    return false;
  }

  const widgets = getInstalledWidgets(attributes);
  // A malformed entry would otherwise survive every save.
  let changed =
    !Array.isArray(attributes.installedWidgets) ||
    widgets.length !== attributes.installedWidgets.length;
  changed = dropLegacyFields(attributes) || changed;

  const record = widgets.find(
    (widget) => widget.packageId === packageId && widget.deviceId === deviceId,
  );

  if (!record) {
    widgets.push({
      packageId,
      deviceId,
      version: isNonEmptyString(version) ? version : null,
      instanceIds: [...new Set(instanceIds.filter(isNonEmptyString))],
      active: true,
      createdAt: now,
      updatedAt: now,
      removedAt: null,
    });
    attributes.installedWidgets = widgets;
    return true;
  }

  let recordChanged = false;
  if (record.active !== true) {
    record.active = true;
    record.removedAt = null;
    recordChanged = true;
  }
  if (isNonEmptyString(version) && record.version !== version) {
    record.version = version;
    recordChanged = true;
  }
  const knownIds = Array.isArray(record.instanceIds)
    ? record.instanceIds.filter(isNonEmptyString)
    : [];
  const mergedIds = [
    ...new Set([...knownIds, ...instanceIds.filter(isNonEmptyString)]),
  ];
  if (
    !Array.isArray(record.instanceIds) ||
    mergedIds.length !== record.instanceIds.length
  ) {
    record.instanceIds = mergedIds;
    recordChanged = true;
  }
  if (recordChanged) record.updatedAt = now;

  attributes.installedWidgets = widgets;
  return changed || recordChanged;
};

/**
 * Records that `packageId` was removed from `deviceId`. Mutates `attributes`;
 * returns whether anything changed.
 *
 * The record is always deactivated, even if instance ids suggest another copy
 * of the widget is still on the device: ids only accumulate, so a stale one
 * would otherwise keep a removed widget "in use" forever. A copy that really
 * is still there re-registers itself on its next data fetch.
 */
const markWidgetRemoved = (
  attributes,
  { packageId, deviceId, instanceIds = [], now },
) => {
  if (!attributes || typeof attributes !== "object") return false;
  const droppedLegacy = dropLegacyFields(attributes);
  const widgets = getInstalledWidgets(attributes);
  const record = widgets.find(
    (widget) => widget.packageId === packageId && widget.deviceId === deviceId,
  );
  if (!record) return droppedLegacy;

  const removedIds = new Set(instanceIds.filter(isNonEmptyString));
  record.instanceIds = (
    Array.isArray(record.instanceIds) ? record.instanceIds : []
  ).filter((id) => isNonEmptyString(id) && !removedIds.has(id));
  if (record.active !== false) {
    record.active = false;
    record.removedAt = now;
  }
  record.updatedAt = now;
  attributes.installedWidgets = widgets;
  return true;
};

/**
 * Sets and saves persistent attributes; persistence errors propagate.
 */
const saveAttributes = async (attributesManager, attributes) => {
  attributesManager.setPersistentAttributes(attributes);
  await attributesManager.savePersistentAttributes();
};

/**
 * Records the widget package the current request comes from. Called on
 * UsagesInstalled, UpdateRequest, and every widget data refresh, so a widget
 * installed while installStateChanges was AUTOMATIC (no UsagesInstalled sent)
 * still gets recorded the first time it asks for data. Never throws: a
 * bookkeeping failure must not stop the widget getting its content.
 */
const registerWidgetUsage = async (handlerInput, packageId) => {
  try {
    const envelope = handlerInput?.requestEnvelope;
    const deviceId = getDeviceId(envelope);
    if (!deviceId) {
      console.log(
        `[widgetRegistry] ${packageId}: no device in request, not recorded`,
      );
      return;
    }
    const { attributesManager } = handlerInput;
    const attributes =
      (await attributesManager.getPersistentAttributes()) || {};
    const presentationInstanceId = getPresentationInstanceId(
      envelope,
      packageId,
    );
    const changed = markWidgetInstalled(attributes, {
      packageId,
      deviceId,
      version:
        getRequestPackageVersion(envelope) ??
        getContextPackageVersion(envelope, packageId),
      instanceIds: [
        ...getUsageInstanceIds(envelope),
        ...(presentationInstanceId ? [presentationInstanceId] : []),
      ],
      now: new Date().toISOString(),
    });
    if (changed) await saveAttributes(attributesManager, attributes);
  } catch (error) {
    console.error(`[widgetRegistry] Failed to record ${packageId}: `, error);
  }
};

/**
 * Removes the supplied Data Store namespaces from target and returns the
 * API response body. Token-fetch and delivery errors propagate.
 */
const removeNamespaces = async (handlerInput, namespaces, target) =>
  sendDataStoreCommands(
    handlerInput,
    namespaces.map((namespace) => ({ type: "REMOVE_NAMESPACE", namespace })),
    target,
  );

/**
 * UsagesRemoved: marks the record inactive and deletes the package's data
 * from that device. Runs even for a widget the registry never saw (installed
 * before it existed): Alexa only sends a removal for something installed, and
 * REMOVE_NAMESPACE on a missing namespace is ignored. Each step is attempted
 * even if the other fails. Never throws.
 */
const unregisterWidgetUsage = async (handlerInput, packageId) => {
  const envelope = handlerInput?.requestEnvelope;
  const deviceId = getDeviceId(envelope);

  if (deviceId) {
    try {
      const { attributesManager } = handlerInput;
      const attributes =
        (await attributesManager.getPersistentAttributes()) || {};
      const changed = markWidgetRemoved(attributes, {
        packageId,
        deviceId,
        instanceIds: getUsageInstanceIds(envelope),
        now: new Date().toISOString(),
      });
      if (changed) await saveAttributes(attributesManager, attributes);
    } catch (error) {
      console.error(
        `[widgetRegistry] Failed to record removal of ${packageId}: `,
        error,
      );
    }
  }

  const namespace = WIDGET_NAMESPACES[packageId];
  const target = getDeviceTarget(handlerInput);
  if (!namespace || !target) {
    console.log(
      `[widgetRegistry] ${packageId}: no namespace or device, data left in place`,
    );
    return;
  }
  try {
    await removeNamespaces(handlerInput, [namespace], target);
  } catch (error) {
    console.error(
      `[widgetRegistry] Failed to remove ${namespace} namespace: `,
      error,
    );
  }
};

/**
 * Deletes the mosque-derived widget data on every device of the account. A
 * prayer widget answers the resulting null OnObjectChanged by fetching again,
 * so it switches to the new mosque without waiting for its next refresh.
 * Never throws: the mosque change itself has already succeeded.
 */
const invalidateMosqueWidgets = async (handlerInput) => {
  const target = getUserTarget(handlerInput);
  if (!target) {
    console.log("[widgetRegistry] No user in request, widgets not refreshed");
    return;
  }
  try {
    await removeNamespaces(handlerInput, MOSQUE_WIDGET_NAMESPACES, target);
  } catch (error) {
    console.error("[widgetRegistry] Failed to clear mosque widgets: ", error);
  }
};

/**
 * SkillDisabled: wipes this skill's whole data store region on every device
 * of the account, so no widget keeps showing a disabled user's data. Never
 * throws: the rest of the user-data cleanup must still run.
 */
const clearWidgetDataForUser = async (handlerInput) => {
  const target = getUserTarget(handlerInput);
  if (!target) {
    console.log("[widgetRegistry] No user in request, data store not cleared");
    return;
  }
  try {
    await sendDataStoreCommands(handlerInput, [{ type: "CLEAR" }], target);
  } catch (error) {
    console.error("[widgetRegistry] Failed to clear the data store: ", error);
  }
};

module.exports = {
  WIDGET_NAMESPACES,
  MOSQUE_WIDGET_NAMESPACES,
  LEGACY_WIDGET_FIELDS,
  getInstalledWidgets,
  getContextPackageVersion,
  getPresentationInstanceId,
  markWidgetInstalled,
  markWidgetRemoved,
  registerWidgetUsage,
  unregisterWidgetUsage,
  invalidateMosqueWidgets,
  clearWidgetDataForUser,
};
