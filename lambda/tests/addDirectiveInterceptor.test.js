/**
 * A widget tap answers by voice only: AddDirectiveResponseInterceptor must not
 * add its full-screen APL document or card on top, or the tap replaces the
 * widget the user was looking at. The opt-out travels in request attributes
 * (helperFunctions.suppressScreenOutput) because a tap may arrive without a
 * session, and session attributes don't exist then.
 */
const { AddDirectiveResponseInterceptor } = require("../interceptors.js");
const { suppressScreenOutput } = require("../helperFunctions.js");
const { buildHandlerInput } = require("./support/handlerInput");

const spokenResponse = () => ({
  outputSpeech: { type: "SSML", ssml: "<speak>Fajr is at 5:30 AM.</speak>" },
});

describe("AddDirectiveResponseInterceptor — suppressed screen output", () => {
  it.each([true, false])(
    "adds no APL document when suppressed (inSession: %s)",
    async (inSession) => {
      const handlerInput = buildHandlerInput({
        inSession,
        supportedInterfaces: { "Alexa.Presentation.APL": {} },
      });
      suppressScreenOutput(handlerInput);
      const response = spokenResponse();

      await AddDirectiveResponseInterceptor.process(handlerInput, response);

      expect(response.directives).toBeUndefined();
      expect(response.card).toBeUndefined();
    },
  );

  it.each([true, false])(
    "adds no card on a screenless device when suppressed (inSession: %s)",
    async (inSession) => {
      const handlerInput = buildHandlerInput({ inSession });
      suppressScreenOutput(handlerInput);
      const response = spokenResponse();

      await AddDirectiveResponseInterceptor.process(handlerInput, response);

      expect(response.card).toBeUndefined();
    },
  );

  it("still adds the card when nothing suppressed it", async () => {
    // Control: proves the assertions above test the flag, not a card that is
    // never added anyway.
    const handlerInput = buildHandlerInput({});
    const response = spokenResponse();

    await AddDirectiveResponseInterceptor.process(handlerInput, response);

    expect(response.card).toMatchObject({ type: "Simple" });
  });
});
