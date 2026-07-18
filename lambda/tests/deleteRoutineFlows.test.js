const {
  DeleteRoutineStartedHandler,
  DeleteRoutinePrayerIndexHandler,
  DeleteRoutinePrayerNameHandler,
} = require("../handlers/intentHandler.js");
const {
  DeleteRoutineTouchEventHandler,
} = require("../handlers/touchHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");

const TZ = "Europe/Paris";

const buildInput = ({ slots = {}, routinePrayers = [], intentName = "DeleteRoutineIntent", requestType = "IntentRequest" } = {}) => {
  const persistentAttributes = {
    uuid: "mosque-uuid",
    routinePrayers,
  };
  return buildHandlerInput({
    intentName,
    requestType,
    slots,
    sessionAttributes: {
      persistentAttributes,
    },
    persistentAttributes,
    timezone: TZ,
  });
};

describe("DeleteRoutineStartedHandler", () => {
  it("directly deletes the routine when there is only one routine", async () => {
    const routinePrayers = [{ name: "Fajr", canonicalName: "Fajr", time: "05:30" }];
    const handlerInput = buildInput({ routinePrayers });

    const response = await DeleteRoutineStartedHandler.handle(handlerInput);

    // Verify it was deleted from persistent attributes
    const updatedPersistent = handlerInput._getPersistentAttributes();
    expect(updatedPersistent.routinePrayers).toEqual([]);

    // Verify speech output contains routineDeletedPrompt text
    expect(spokenText(response)).toContain("deleted");
    // Verify it did not request Dialog.ConfirmSlot
    expect(response.directives).toBeUndefined();
    expect(response.shouldEndSession).toBe(false);
  });

  it("lists routines and asks for selection when there are multiple routines", async () => {
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ];
    const handlerInput = buildInput({ routinePrayers });

    const response = await DeleteRoutineStartedHandler.handle(handlerInput);

    // Verify nothing is deleted yet
    const updatedPersistent = handlerInput._getPersistentAttributes();
    expect(updatedPersistent.routinePrayers).toHaveLength(2);

    // Verify it elicits prayerIndex slot
    expect(response.directives).toContainEqual(
      expect.objectContaining({
        type: "Dialog.ElicitSlot",
        slotToElicit: "prayerIndex",
      }),
    );
    expect(response.shouldEndSession).toBe(false);
  });
});

describe("DeleteRoutinePrayerIndexHandler", () => {
  it("deletes the routine immediately without confirmation when prayerIndex is provided", async () => {
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ];
    // "1" will be "All Prayers" (helperFunctions.ALL_PRAYERS), "2" is Fajr, "3" is Asr.
    // Let's delete "Fajr" (index 2).
    const handlerInput = buildInput({
      routinePrayers,
      slots: {
        prayerIndex: { name: "prayerIndex", value: "2", confirmationStatus: "NONE" },
      },
    });

    const response = await DeleteRoutinePrayerIndexHandler.handle(handlerInput);

    // Verify Fajr was deleted
    const updatedPersistent = handlerInput._getPersistentAttributes();
    expect(updatedPersistent.routinePrayers).toEqual([
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ]);

    expect(spokenText(response)).toContain("deleted");
    expect(response.directives).toBeUndefined();
    expect(response.shouldEndSession).toBe(false);
  });

  it("returns error for invalid index", async () => {
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
    ];
    const handlerInput = buildInput({
      routinePrayers,
      slots: {
        prayerIndex: { name: "prayerIndex", value: "99", confirmationStatus: "NONE" },
      },
    });

    const response = await DeleteRoutinePrayerIndexHandler.handle(handlerInput);

    // Verify nothing deleted
    const updatedPersistent = handlerInput._getPersistentAttributes();
    expect(updatedPersistent.routinePrayers).toHaveLength(1);

    // Verify it elicits prayerIndex slot again
    expect(response.directives).toContainEqual(
      expect.objectContaining({
        type: "Dialog.ElicitSlot",
        slotToElicit: "prayerIndex",
      }),
    );
  });
});

describe("DeleteRoutinePrayerNameHandler", () => {
  it("deletes the routine immediately without confirmation when prayerName is provided", async () => {
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ];
    // Since prayerName slot uses resolution, we need to populate slot with resolutions
    const handlerInput = buildInput({
      routinePrayers,
      slots: {
        prayerName: {
          name: "prayerName",
          value: "fajr",
          confirmationStatus: "NONE",
          resolutions: {
            resolutionsPerAuthority: [
              {
                status: { code: "ER_SUCCESS_MATCH" },
                values: [
                  {
                    value: {
                      name: "Fajr",
                      id: "0",
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    });

    const response = await DeleteRoutinePrayerNameHandler.handle(handlerInput);

    // Verify Fajr was deleted
    const updatedPersistent = handlerInput._getPersistentAttributes();
    expect(updatedPersistent.routinePrayers).toEqual([
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ]);

    expect(spokenText(response)).toContain("deleted");
    expect(response.directives).toBeUndefined();
    expect(response.shouldEndSession).toBe(false);
  });
});

describe("DeleteRoutineTouchEventHandler", () => {
  it("deletes the routine immediately without confirmation when touch event selected a routine", async () => {
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ];
    // Touch event simulates Alexa.Presentation.APL.UserEvent with list item selected argument
    const handlerInput = buildInput({
      requestType: "Alexa.Presentation.APL.UserEvent",
      routinePrayers,
    });
    
    // Mock the APL user event request
    handlerInput.requestEnvelope.request.arguments = [
      "ListItemSelected",
      "Delete Routine List", // will match titleForDeleteRoutineList translation
      { name: "Fajr" }
    ];

    const response = await DeleteRoutineTouchEventHandler.handle(handlerInput);

    // Verify Fajr was deleted
    const updatedPersistent = handlerInput._getPersistentAttributes();
    expect(updatedPersistent.routinePrayers).toEqual([
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ]);

    expect(spokenText(response)).toContain("deleted");
    expect(response.directives).toBeUndefined();
    expect(response.shouldEndSession).toBe(false);
  });
});
