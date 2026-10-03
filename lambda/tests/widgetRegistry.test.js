/**
 * A widget's content lives in the data store on the device, which outlives
 * anything the skill does with its own records. Three failures matter, each
 * silent:
 *
 * - A removed widget's data stays on the device, using up the skill's 1 MB
 *   data store limit, unless the skill deletes it.
 * - A disabled skill's data keeps showing on every device of the account.
 * - The installed-widgets record is bookkeeping: if it ever throws, the widget
 *   stops getting content, which is the one thing the user can see.
 *
 * And installStateChanges defaulted to AUTOMATIC, under which Alexa sends no
 * UsagesInstalled at all, so a widget must also be recorded when it asks for
 * data.
 */
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/userDataCleanup.js");

const {
  getAccessToken,
  updateDatastore,
} = require("../handlers/apiHandler.js");
const { deleteUserDataEverywhere } = require("../handlers/userDataCleanup.js");
const { SkillEventHandler } = require("../handlers/skillEventHandler.js");
const {
  InstallHadithWidgetRequestHandler,
  RemoveHadithWidgetRequestHandler,
  UpdateHadithWidgetRequestHandler,
  UpdateHadithAPLEventHandler,
} = require("../handlers/hadithWidgetHandler.js");
const {
  markWidgetInstalled,
  markWidgetRemoved,
} = require("../handlers/widgetRegistry.js");
const { buildHandlerInput } = require("./support/handlerInput");

const NOW = "2026-10-03T10:00:00.000Z";
const LATER = "2026-10-04T10:00:00.000Z";
const TOKEN = { access_token: "token", token_type: "Bearer" };
// What buildHandlerInput puts in the envelope.
const DEVICE_ID = "device-1";
const USER_ID = "user-1";

const activeRecord = (overrides = {}) => ({
  packageId: "HadithOfTheDay",
  deviceId: DEVICE_ID,
  version: "1.0.0",
  instanceIds: ["instance-1"],
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
  removedAt: null,
  ...overrides,
});

const buildPackageEvent = (requestType, request = {}, options = {}) => {
  const handlerInput = buildHandlerInput({ requestType, ...options });
  Object.assign(handlerInput.requestEnvelope.request, request);
  return handlerInput;
};

const installedWidgets = (handlerInput) =>
  handlerInput._getPersistentAttributes().installedWidgets;

const sentCommands = () =>
  updateDatastore.mock.calls.map(([, commands, target]) => ({
    commands,
    target,
  }));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.setSystemTime(new Date(NOW));
  jest.clearAllMocks();
  getAccessToken.mockResolvedValue(TOKEN);
  updateDatastore.mockResolvedValue({ results: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("recording an installed widget", () => {
  it("records the package on the device it was installed on", async () => {
    const handlerInput = buildPackageEvent(
      "Alexa.DataStore.PackageManager.UsagesInstalled",
      {
        payload: {
          packageId: "HadithOfTheDay",
          packageVersion: "1.1.0",
          usages: [{ instanceId: "instance-1", location: "FAVORITE" }],
        },
      },
    );

    await InstallHadithWidgetRequestHandler.handle(handlerInput);

    expect(installedWidgets(handlerInput)).toEqual([
      activeRecord({ version: "1.1.0" }),
    ]);
  });

  it("records a widget Alexa never announced, the first time it asks for data", async () => {
    // Under installStateChanges AUTOMATIC no UsagesInstalled ever arrives;
    // the widget's own fetch is then the only sign it exists. Its version
    // comes from context, its instance from the presentation URI.
    const handlerInput = buildPackageEvent("Alexa.Presentation.APL.UserEvent", {
      arguments: ["FETCH_NEW_HADITH", 0],
      presentationUri:
        "widget://amzn1.ask.skill.test_development/HadithOfTheDay/instance-1",
    });
    handlerInput.requestEnvelope.context["Alexa.DataStore.PackageManager"] = {
      installedPackages: [{ packageId: "HadithOfTheDay", version: "1.0.1" }],
    };

    await UpdateHadithAPLEventHandler.handle(handlerInput);

    expect(installedWidgets(handlerInput)).toEqual([
      activeRecord({ version: "1.0.1" }),
    ]);
  });

  it("records the version an update installs", async () => {
    const handlerInput = buildPackageEvent(
      "Alexa.DataStore.PackageManager.UpdateRequest",
      { packageId: "HadithOfTheDay", fromVersion: "1.0.0", toVersion: "1.1.0" },
      { persistentAttributes: { installedWidgets: [activeRecord()] } },
    );

    await UpdateHadithWidgetRequestHandler.handle(handlerInput);

    expect(installedWidgets(handlerInput)[0]).toMatchObject({
      version: "1.1.0",
      createdAt: NOW,
    });
  });

  it("reactivates a removed widget instead of adding a second record", () => {
    const attributes = {
      installedWidgets: [activeRecord({ active: false, removedAt: NOW })],
    };

    markWidgetInstalled(attributes, {
      packageId: "HadithOfTheDay",
      deviceId: DEVICE_ID,
      instanceIds: ["instance-2"],
      now: LATER,
    });

    expect(attributes.installedWidgets).toEqual([
      activeRecord({
        instanceIds: ["instance-1", "instance-2"],
        updatedAt: LATER,
      }),
    ]);
  });

  it("keeps one record per device for the same package", () => {
    const attributes = { installedWidgets: [activeRecord()] };

    markWidgetInstalled(attributes, {
      packageId: "HadithOfTheDay",
      deviceId: "device-2",
      now: LATER,
    });

    expect(attributes.installedWidgets.map((w) => w.deviceId)).toEqual([
      DEVICE_ID,
      "device-2",
    ]);
  });

  it("reports no change for a widget already recorded, so nothing is re-saved", () => {
    // Every hourly hadith refresh lands here; it must not cost a write.
    const attributes = { installedWidgets: [activeRecord()] };

    const changed = markWidgetInstalled(attributes, {
      packageId: "HadithOfTheDay",
      deviceId: DEVICE_ID,
      version: "1.0.0",
      instanceIds: ["instance-1"],
      now: LATER,
    });

    expect(changed).toBe(false);
    expect(attributes.installedWidgets[0].updatedAt).toBe(NOW);
  });

  it("drops the per-widget flags the registry replaces", () => {
    const attributes = {
      uuid: "mosque-uuid",
      isHadithWidgetInstalled: true,
      lastHadithWidgetUpdate: NOW,
      isPrayerTimeWidgetInstalled: false,
    };

    markWidgetInstalled(attributes, {
      packageId: "HadithOfTheDay",
      deviceId: DEVICE_ID,
      now: NOW,
    });

    expect(Object.keys(attributes).sort()).toEqual(
      ["installedWidgets", "uuid"].sort(),
    );
  });

  it("discards malformed entries instead of crashing on them", () => {
    const attributes = {
      installedWidgets: [null, "junk", { packageId: "HadithOfTheDay" }],
    };

    markWidgetInstalled(attributes, {
      packageId: "HadithOfTheDay",
      deviceId: DEVICE_ID,
      now: NOW,
    });

    expect(attributes.installedWidgets).toHaveLength(1);
  });

  it("still pushes the widget's content when the record can't be saved", async () => {
    const handlerInput = buildPackageEvent(
      "Alexa.DataStore.PackageManager.UsagesInstalled",
      { payload: { packageId: "HadithOfTheDay" } },
    );
    handlerInput._savePersistentAttributes.mockRejectedValue(
      new Error("DynamoDB throttled"),
    );

    await InstallHadithWidgetRequestHandler.handle(handlerInput);

    expect(updateDatastore).toHaveBeenCalledTimes(1);
    expect(updateDatastore.mock.calls[0][1][0].type).toBe("PUT_OBJECT");
  });

  it("records nothing, and doesn't throw, when the request has no device", async () => {
    const handlerInput = buildPackageEvent(
      "Alexa.DataStore.PackageManager.UpdateRequest",
      { packageId: "HadithOfTheDay", toVersion: "1.1.0" },
    );
    delete handlerInput.requestEnvelope.context.System.device;

    await expect(
      UpdateHadithWidgetRequestHandler.handle(handlerInput),
    ).resolves.toBeDefined();
    expect(installedWidgets(handlerInput)).toBeUndefined();
  });
});

describe("removing a widget", () => {
  const buildRemoval = (persistentAttributes = {}) =>
    buildPackageEvent(
      "Alexa.DataStore.PackageManager.UsagesRemoved",
      {
        payload: {
          packageId: "HadithOfTheDay",
          usages: [{ instanceId: "instance-1", location: "FAVORITE" }],
        },
      },
      { persistentAttributes },
    );

  it("deletes the widget's data from that device and marks it removed", async () => {
    const handlerInput = buildRemoval({ installedWidgets: [activeRecord()] });

    await RemoveHadithWidgetRequestHandler.handle(handlerInput);

    expect(sentCommands()).toEqual([
      {
        commands: [{ type: "REMOVE_NAMESPACE", namespace: "hadithOfTheDay" }],
        target: { type: "DEVICES", items: [DEVICE_ID] },
      },
    ]);
    expect(installedWidgets(handlerInput)).toEqual([
      activeRecord({ active: false, removedAt: NOW, instanceIds: [] }),
    ]);
  });

  it("deletes the data even for a widget installed before the registry existed", async () => {
    // Alexa only sends a removal for an installed widget; an unknown one is
    // simply untracked, and REMOVE_NAMESPACE on nothing is ignored.
    const handlerInput = buildRemoval({ isHadithWidgetInstalled: true });

    await RemoveHadithWidgetRequestHandler.handle(handlerInput);

    expect(sentCommands()).toHaveLength(1);
    expect(
      handlerInput._getPersistentAttributes().isHadithWidgetInstalled,
    ).toBeUndefined();
  });

  it("deactivates the record even if other instances are on file", () => {
    // Instance ids only accumulate, so a stale one must not keep a removed
    // widget "in use" (and its data on the device) forever.
    const attributes = {
      installedWidgets: [
        activeRecord({ instanceIds: ["instance-1", "instance-stale"] }),
      ],
    };

    markWidgetRemoved(attributes, {
      packageId: "HadithOfTheDay",
      deviceId: DEVICE_ID,
      instanceIds: ["instance-1"],
      now: LATER,
    });

    expect(attributes.installedWidgets[0]).toMatchObject({
      active: false,
      removedAt: LATER,
      instanceIds: ["instance-stale"],
    });
  });

  it("records the removal even when the data store call fails", async () => {
    updateDatastore.mockRejectedValue(new Error("data store down"));
    const handlerInput = buildRemoval({ installedWidgets: [activeRecord()] });

    await RemoveHadithWidgetRequestHandler.handle(handlerInput);

    expect(installedWidgets(handlerInput)[0].active).toBe(false);
  });

  it("sends nothing, and doesn't throw, when the request has no device", async () => {
    const handlerInput = buildRemoval({ installedWidgets: [activeRecord()] });
    delete handlerInput.requestEnvelope.context.System.device;

    await RemoveHadithWidgetRequestHandler.handle(handlerInput);

    expect(updateDatastore).not.toHaveBeenCalled();
  });
});

describe("disabling the skill", () => {
  const buildDisabled = () => {
    const handlerInput = buildHandlerInput({
      requestType: "AlexaSkillEvent.SkillDisabled",
      accessToken: null,
    });
    handlerInput.attributesManager.deletePersistentAttributes = jest.fn(
      async () => {},
    );
    return handlerInput;
  };

  it("clears the data store on every device of the account", async () => {
    await SkillEventHandler.handle(buildDisabled());

    expect(sentCommands()).toEqual([
      { commands: [{ type: "CLEAR" }], target: { type: "USER", id: USER_ID } },
    ]);
  });

  it("still deletes the user's data when the CLEAR fails", async () => {
    getAccessToken.mockRejectedValue(new Error("LWA down"));
    const handlerInput = buildDisabled();

    await SkillEventHandler.handle(handlerInput);

    expect(deleteUserDataEverywhere).toHaveBeenCalled();
    expect(
      handlerInput.attributesManager.deletePersistentAttributes,
    ).toHaveBeenCalled();
  });

  it("sends nothing when the token response carries no token", async () => {
    // updateDatastore would otherwise build "undefined undefined" as the
    // Authorization header.
    getAccessToken.mockResolvedValue({});

    await SkillEventHandler.handle(buildDisabled());

    expect(updateDatastore).not.toHaveBeenCalled();
  });
});
