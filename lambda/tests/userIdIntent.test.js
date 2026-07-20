jest.mock("../handlers/dynamoDbHandler.js");

const dbHandler = require("../handlers/dynamoDbHandler.js");
const { UserIdIntentHandler } = require("../handlers/intentHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");

describe("UserIdIntentHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should generate and save a unique mawaqit_id if none exists", async () => {
    // Mock dbHandler.GetUserByMawaqitId to return null (meaning code is unique)
    dbHandler.GetUserByMawaqitId.mockResolvedValue(null);

    const handlerInput = buildHandlerInput({
      intentName: "UserIdIntent",
      persistentAttributes: {},
    });

    const response = await UserIdIntentHandler.handle(handlerInput);

    // Verify GetUserByMawaqitId was called
    expect(dbHandler.GetUserByMawaqitId).toHaveBeenCalled();

    // Verify it was saved to persistent attributes
    const savedAttributes = handlerInput._getPersistentAttributes();
    expect(savedAttributes.mawaqit_id).toBeDefined();
    expect(savedAttributes.mawaqit_id).toMatch(/^\d{3}-\d{3}$/);
    expect(handlerInput._savePersistentAttributes).toHaveBeenCalled();

    // Verify spoken output contains the formatted code
    const text = spokenText(response);
    expect(text).toContain("Your support code is");
    expect(response.outputSpeech.ssml).toContain(
      '<say-as interpret-as="digits">',
    );
  });

  it("should reuse the existing mawaqit_id if already saved in persistence", async () => {
    const existingCode = "123-456";
    const handlerInput = buildHandlerInput({
      intentName: "UserIdIntent",
      persistentAttributes: {
        mawaqit_id: existingCode,
      },
    });

    const response = await UserIdIntentHandler.handle(handlerInput);

    // Verify dbHandler.GetUserByMawaqitId was NOT called (reused)
    expect(dbHandler.GetUserByMawaqitId).not.toHaveBeenCalled();

    // Verify persistent attributes remain unchanged and not resaved unnecessarily
    const savedAttributes = handlerInput._getPersistentAttributes();
    expect(savedAttributes.mawaqit_id).toBe(existingCode);

    // Verify response speaks the correct code
    const text = spokenText(response);
    expect(text).toContain("Your support code is 123456");
    expect(response.outputSpeech.ssml).toContain(
      '<say-as interpret-as="digits">123</say-as><break time="200ms"/><say-as interpret-as="digits">456</say-as>',
    );
  });

  it("should handle collisions by retrying until a unique mawaqit_id is found", async () => {
    // Mock the first query to return a collision (a different user)
    // and the second query to return null (success)
    dbHandler.GetUserByMawaqitId.mockResolvedValueOnce({
      id: "another-user-id",
    }) // collision
      .mockResolvedValueOnce(null); // unique

    const handlerInput = buildHandlerInput({
      intentName: "UserIdIntent",
      persistentAttributes: {},
    });

    // Make sure our mock handlerInput has user-1 as userId
    expect(handlerInput.requestEnvelope.context.System.user.userId).toBe(
      "user-1",
    );

    await UserIdIntentHandler.handle(handlerInput);

    // GetUserByMawaqitId should have been called twice
    expect(dbHandler.GetUserByMawaqitId).toHaveBeenCalledTimes(2);

    const savedAttributes = handlerInput._getPersistentAttributes();
    expect(savedAttributes.mawaqit_id).toBeDefined();
    expect(savedAttributes.mawaqit_id).toMatch(/^\d{3}-\d{3}$/);
    expect(handlerInput._savePersistentAttributes).toHaveBeenCalled();
  });

  it("should handle self-matching collision (user already has this code in DB)", async () => {
    // Mock query to return an item belonging to the SAME user (user-1)
    dbHandler.GetUserByMawaqitId.mockResolvedValue({ id: "user-1" });

    const handlerInput = buildHandlerInput({
      intentName: "UserIdIntent",
      persistentAttributes: {},
    });

    await UserIdIntentHandler.handle(handlerInput);

    // GetUserByMawaqitId should have been called once and accepted the code
    expect(dbHandler.GetUserByMawaqitId).toHaveBeenCalledTimes(1);

    const savedAttributes = handlerInput._getPersistentAttributes();
    expect(savedAttributes.mawaqit_id).toBeDefined();
    expect(handlerInput._savePersistentAttributes).toHaveBeenCalled();
  });
});
