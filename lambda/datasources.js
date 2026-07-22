const Alexa = require("ask-sdk-core");
const backgroundImage =
  "https://cdn.mawaqit.net/images/background-arabic-calligraphy.png";
const adhaanRecitation = [
  {
    primaryText: "Afassy",
    fajrUrl: "https://mawaqit.net/static/mp3/adhan-afassy-fajr.mp3",
    otherUrl: "https://mawaqit.net/static/mp3/adhan-afassy.mp3",
  },
  {
    primaryText: "Algeria",
    fajrUrl: "https://mawaqit.net/static/mp3/adhan-algeria-fajr.mp3",
    otherUrl: "https://mawaqit.net/static/mp3/adhan-algeria.mp3",
  },
  {
    primaryText: "Egypt",
    fajrUrl: "https://mawaqit.net/static/mp3/adhan-egypt-fajr.mp3",
    otherUrl: "https://mawaqit.net/static/mp3/adhan-egypt.mp3",
  },
  {
    primaryText: "Madina",
    fajrUrl: "https://mawaqit.net/static/mp3/adhan-madina-fajr.mp3",
    otherUrl: "https://mawaqit.net/static/mp3/adhan-madina.mp3",
  },
  {
    primaryText: "Maquah",
    fajrUrl: "https://mawaqit.net/static/mp3/adhan-maquah-fajr.mp3",
    otherUrl: "https://mawaqit.net/static/mp3/adhan-maquah.mp3",
  },
  {
    primaryText: "Quds",
    fajrUrl: "https://mawaqit.net/static/mp3/adhan-quds-fajr.mp3",
    otherUrl: "https://mawaqit.net/static/mp3/adhan-quds.mp3",
  },
];

const getDataSourceforMosqueList = async (
  handlerInput,
  listItems,
  title = "titleForMosqueList",
) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const logoUrl = requestAttributes.t("logoUrl");
  const aplTitle = requestAttributes.t(title);
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
      title: aplTitle,
      listItems: listItems,
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
        logoUrl: logoUrl,
      },
    },
  };
};

/**
 * Data source for mosqueInfoApl.json.
 *
 * `prayers` is the id-keyed board from helperFunctions.buildPrayerBoard, so the
 * APL document addresses each prayer by name (`prayers.fajr`, `prayers.jumua`…)
 * instead of by index. `nextPrayer` is a convenience alias to the entry flagged
 * as upcoming, used by the compact layouts that only show one prayer.
 */
const getDataSourceforMosqueInfo = async (
  handlerInput,
  prayers,
  mosqueInfo,
) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const logoUrl = requestAttributes.t("logoUrl");
  return {
    data: {
      properties: {
        prayers: prayers,
        nextPrayer:
          Object.values(prayers).find((prayer) => prayer && prayer.isNext) ||
          null,
        mosqueTitle: mosqueInfo.mosqueName,
        mosqueDescription: mosqueInfo.mosqueDescription
          ? mosqueInfo.mosqueDescription
          : "",
        mosquePicture: mosqueInfo.mosqueImage || null,
        nextLabel: requestAttributes.t("nextPrayerLabel"),
        skillName: process.env.SKILL_NAME,
        skillLogoUrl: logoUrl,
        layoutDirection: requestAttributes.t("layoutDirection"),
      },
    },
  };
};

const getDataSourceForAdhaanReciter = async (
  handlerInput,
  adhaanRecitation,
) => {
  return getDataSourceforMosqueList(
    handlerInput,
    adhaanRecitation,
    "titleForAdhaanReciterList",
  );
};

const getDataSourceForRoutine = async (handlerInput, prayerNameAndTime) => {
  return getDataSourceforMosqueList(
    handlerInput,
    prayerNameAndTime,
    "titleForPrayerTimeList",
  );
};

const getDataSourceForDeleteRoutineList = async (
  handlerInput,
  prayerNameAndTime,
) => {
  return getDataSourceforMosqueList(
    handlerInput,
    prayerNameAndTime,
    "titleForDeleteRoutineList",
  );
};

const getMetadata = (handlerInput, title) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  let albumArtImage = requestAttributes.t("logoUrl");
  let metadata = {
    title: title,
    subtitle: requestAttributes.t("skillName"),
    art: {
      sources: [
        {
          url: albumArtImage,
        },
      ],
    },
    backgroundImage: {
      sources: [
        {
          url: backgroundImage,
        },
      ],
    },
  };
  console.log("Metadata: ", JSON.stringify(metadata));
  return metadata;
};

module.exports = {
  getDataSourceforMosqueList,
  getDataSourceForPrayerTime,
  getDataSourceforMosqueInfo,
  adhaanRecitation,
  getDataSourceForAdhaanReciter,
  getMetadata,
  getDataSourceForRoutine,
  getDataSourceForDeleteRoutineList,
};
