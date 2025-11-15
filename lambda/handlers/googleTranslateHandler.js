const { Translate } = require("@google-cloud/translate").v2;
let translateInstance = null;

// Translate the text
module.exports.translate = async (text, targetLanguage = "en") => {
  try {
    const [translation] = await createTranslateInstance().translate(text, targetLanguage);
    // console.log("Translated text: ", translation);
    return translation ? translation : text;
  } catch (error) {
    console.error("Error while translating %s: %s", text, error);
    return text;
  }
};

module.exports.detectLanguage = async (text) => {
  try {
    const [detections] = await createTranslateInstance().detect(text);
    // console.log("Detected language: ", detections);
    return detections?.language || "en";
  } catch (error) {
    console.error("Error while detecting language for %s: %s", text, error);
    return "en";
  }
};

const createTranslateInstance = () => {
  if (!translateInstance) {
    const GOOGLE_API_KEY = process.env.googleApiKey;
    if (!GOOGLE_API_KEY) {
      throw new Error("Missing required environment variable: googleApiKey");
    }
    translateInstance = new Translate({ key: GOOGLE_API_KEY });
  }
  return translateInstance;
};