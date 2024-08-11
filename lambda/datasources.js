const Alexa = require("ask-sdk-core");

const getDataSourceforMosqueList = (handlerInput, mosqueList) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const backgroundImage = requestAttributes.t("backgroundImageUrl");
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

const getDataSourceForPrayerTime = (handlerInput, text) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const backgroundImage = requestAttributes.t("backgroundImageUrl");
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

module.exports = {
  getDataSourceforMosqueList,
  getDataSourceForPrayerTime,
};
