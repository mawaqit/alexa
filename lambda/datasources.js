const Alexa = require("ask-sdk-core");
const s3 = require("./handlers/s3Handler");

const getDataSourceforMosqueList = async (handlerInput, mosqueList) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const backgroundImage = await s3.getS3PreSignedUrl("background.png");
  const logoUrl = requestAttributes.t("logoUrl");
  const title = requestAttributes.t("titleForMosqueList");
  const locale = Alexa.getLocale(handlerInput.requestEnvelope);
  return {
    imageListData: {
      type: "AlexaTextList",
      objectId: "imageListSample",
      backgroundImage: {
        smallSourceUrl: backgroundImage,
        largeSourceUrl: backgroundImage,
        sources: backgroundImage,
      },
      title: title,
      listItems: mosqueList,
      headerBackButton: false,
      logoUrl: logoUrl,
      locale: locale,
      layoutDirection: requestAttributes.t("layoutDirection"),
    },
  };
};

const getDataSourceForPrayerTime = async (handlerInput, text) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const backgroundImage = await s3.getS3PreSignedUrl("background.png");
  const logoUrl = requestAttributes.t("logoUrl");
  return {
    longTextTemplateData: {
      type: "object",
      objectId: "longTextSample",
      properties: {
        backgroundImage: {
          sources: [
            {
              url: backgroundImage,
              size: "large",
            },
          ],
        },
        title: requestAttributes.t("skillName"),
        textContent: {
          primaryText: {
            type: "PlainText",
            text: text,
          },
        },
        logoUrl:logoUrl,
      },
    },
  };
};

const getDataSourceforMosqueInfo = async (handlerInput, prayerTimes, mosqueInfo) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const backgroundImage = await s3.getS3PreSignedUrl("background.png");
  const logoUrl = requestAttributes.t("logoUrl");
  return {
    "data": {
        "properties": {
            "prayerTimes": prayerTimes,
            "mosqueTitle": mosqueInfo.mosqueName,
            "mosqueDescription": mosqueInfo.mosqueDescription ? mosqueInfo.mosqueDescription : "",
            "mosqueImage": mosqueInfo.mosqueImage ? mosqueInfo.mosqueImage : "https://cdn.mawaqit.net/images/backend/mosque_default_picture.png",
            "skillName": process.env.skillName,
            "skillLogoUrl": logoUrl,
            "backgroundImageUrl": backgroundImage,
        }
    }
}
}

module.exports = {
  getDataSourceforMosqueList,
  getDataSourceForPrayerTime,
  getDataSourceforMosqueInfo
};
