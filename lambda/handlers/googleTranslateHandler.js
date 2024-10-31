const { Translate } = require("@google-cloud/translate").v2;

// Translate the text
module.exports.translate = async (text, targetLanguage = "en") => {
  try {
    const [translation] = await createTranslateInstance().translate(text, targetLanguage);
    console.log("Translated text: ", translation);
    return translation ? translation : text;
  } catch (error) {
    console.error("Error while translating text:", error);
    return text;
  }
};

module.exports.detectLanguage = async (text) => {
  const [detections] = await createTranslateInstance().detect(text);
  console.log("Detected language: ", detections);
  return detections && detections.language ? detections.language : "en";
};

const createTranslateInstance = () => {
  const GOOGLE_API_KEY = process.env.googleApiKey;
  return new Translate({ key: GOOGLE_API_KEY });
};
