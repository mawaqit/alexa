/**
 * Tapping the Hadith widget reads the hadith on screen aloud. The tap may
 * arrive without a session, and the SDK throws on any session-attribute
 * access then — so the handler must not touch them, or the tap fails with an
 * unhandled error instead of reading the hadith.
 */
jest.mock("../handlers/apiHandler.js");

const {
  ReadHadithAPLEventHandler,
} = require("../handlers/hadithWidgetHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");

const buildTap = ({ inSession }) => {
  const handlerInput = buildHandlerInput({
    requestType: "Alexa.Presentation.APL.UserEvent",
    inSession,
  });
  handlerInput.requestEnvelope.request.arguments = [
    "READ_HADITH",
    "The best of you are those who learn the Quran and teach it.",
  ];
  return handlerInput;
};

describe("ReadHadithAPLEventHandler — tapping the widget", () => {
  it.each([true, false])(
    "reads the on-screen hadith aloud (inSession: %s)",
    (inSession) => {
      const handlerInput = buildTap({ inSession });

      const response = ReadHadithAPLEventHandler.handle(handlerInput);

      expect(spokenText(response)).toContain(
        "The best of you are those who learn the Quran",
      );
      expect(response.shouldEndSession).toBe(true);
      // The tap must not re-render a full-screen document over the widget.
      expect(
        handlerInput.attributesManager.getRequestAttributes(),
      ).toMatchObject({ skipAplDirective: true, skipCardDirective: true });
    },
  );
});
