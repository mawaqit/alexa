const Alexa = require('ask-sdk-core');

const getDataSourceforMosqueList = (handlerInput, mosqueList) => {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const backgroundImage = requestAttributes.t('backgroundImageUrl');
    const logoUrl = requestAttributes.t('logoUrl');
    const title = requestAttributes.t('titleForMosqueList');
    const locale = Alexa.getLocale(handlerInput.requestEnvelope)
    return {
        "imageListData": {
          "type": "AlexaTextList",
          "objectId": "imageListSample",
          "backgroundImage": {
            "smallSourceUrl": backgroundImage,
            "largeSourceUrl": backgroundImage,
            "sources": backgroundImage
          },
          "title": title,
          "listItems": mosqueList,
          "headerBackButton": false,
          "logoUrl": logoUrl,
          "locale": locale,
          "layoutDirection": requestAttributes.t('layoutDirection')
        }
      }
}

module.exports = {
    getDataSourceforMosqueList
} 