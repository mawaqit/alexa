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
        // Already localized by the handler (same string Alexa speaks), because
        // APL cannot run Intl.NumberFormat to pick the unit and separator.
        mosqueDistance: mosqueInfo.mosqueDistance || "",
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

/**
 * Data source for adhanPlayerApl.json.
 *
 * Deliberately separate from getMetadata: that function feeds the AudioPlayer
 * interface's metadata card (used only on audio-only devices as a fallback),
 * while this feeds the custom APL screen that plays the mp3 itself via a
 * Video component. Same underlying artwork/labels, different consumer.
 */
const getDataSourceForAdhanPlayer = (handlerInput, audioName, audioUrl) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const logoUrl = requestAttributes.t("logoUrl");
  return {
    data: {
      properties: {
        audioUrl: audioUrl,
        reciterName: audioName,
        // Not the skill name — that's already in the BrandHeader above the
        // reciter name; showing it twice would be redundant.
        subtitle: requestAttributes.t("adhanPlayerSubtitle"),
        albumArt: logoUrl,
        skillLogoUrl: logoUrl,
        skillName: process.env.SKILL_NAME,
        layoutDirection: requestAttributes.t("layoutDirection"),
      },
    },
  };
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
  return metadata;
};

module.exports = {
  getDataSourceforMosqueList,
  getDataSourceForPrayerTime,
  getDataSourceforMosqueInfo,
  adhaanRecitation,
  getDataSourceForAdhaanReciter,
  getDataSourceForAdhanPlayer,
  getMetadata,
  getDataSourceForRoutine,
  getDataSourceForDeleteRoutineList,
};
