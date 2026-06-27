module.exports = {
  translation: {
    skillName: process.env.SKILL_NAME, //new
    welcomePrompt: `Salam Aleykoum! `,
    chooseMosquePrompt: `Which mosque would you like to choose? Here are the nearest mosques: %s. To choose one, say its number`,
    chooseMosqueByTouchPrompt:
      " or you can tap the mosque of your choice on the screen.",
    helpPrompt: `You can, for example, ask me when the third prayer of the day is, ask for a hadith, or change the adhan reciter. To see the full list of commands, check the skill description.`,
    stopPrompt: `Goodbye, and may Allah protect you!`,
    errorPrompt: `Sorry, an error occurred. Please try again later.`,
    noDataPrompt: `Sorry, I couldn't find any data for this request. Please try again.`,
    noCityPrompt: `Sorry, I couldn't find any mosques in this city. Please try again.`,
    requestForGeoLocationPrompt: `To find mosques near you, I need access to your location. Please open the Alexa app to grant permission.`,
    noAddressPrompt: `It looks like your address isn't set on Alexa. You can set it from the Alexa app so I can find mosques near you.`,
    errorPromptforMosqueList: `Sorry, I couldn't find any MAWAQIT mosques near you. Please check your device location. For now, the skill only works when a mosque is available nearby.`,
    logoUrl:
      "https://play-lh.googleusercontent.com/79-OHFiVzGLTSLg_tXcsS3VwxWd9ZAxL4eAt35IgIljERyMkYvAq92m-fgpDsZ-lNA",
    titleForMosqueList: `${process.env.SKILL_NAME} Mosques`,
    layoutDirection: "LTR",
    nextPrayerTimeErrorPrompt: `Sorry, I couldn't find the time for the next prayer. Please try again.`,
    nextPrayerTimePrompt: `At %s, the next prayer is %s, at %s, in %s. `,
    prayerNames: [
      "<sub alias='fajer'>Fajr</sub>",
      "<sub alias='dohr'>Dhuhr</sub>",
      "<sub alias='asser'>Asr</sub>",
      "<sub alias='magrib'>Maghrib</sub>",
      "<sub alias='eesha'>Isha</sub>",
      "<sub alias='joomua'>Jumma</sub>",
      "<sub alias='eed'>Eid</sub>",
      "<sub alias='shorook'>Shuruq</sub>",
    ],
    unableToFindMosquePrompt: `Sorry, I couldn't find the mosque you're looking for. Please choose a valid option.`,
    mosqueNotRegisteredPrompt: `You haven't registered a mosque yet. Please register one first. `,
    mosqueSearchWordPrompt: `In which city would you like to search for a mosque?`,
    noPrayerTimePrompt: `Sorry, there is no schedule for %s at this mosque.`,
    hoursAndMinutesPrompt: `%s hours and %s minutes`,
    minutesPrompt: `%s minutes`,
    nextPrayerTimeSpecificPrompt: `At %s, the %s prayer is at %s. Do you need anything else?`,
    shuruqPrompt: `At %s, <sub alias='shorook'>Shuruq</sub> is at %s. Do you need anything else?`,
    secondsPrompt: `%s seconds`,
    errorGeoConversionPrompt: `Sorry, I couldn't convert your address to geolocation. Please try again.`,
    nextIqamaTimePrompt: `The iqama for the next prayer, %s, is in %s.`,
    selectedMosquePrompt: `Perfect, %s is now your favorite mosque! `,
    nextPrayerWithoutMosquePrompt: `The next prayer is %s at %s, in %s.`,
    iqamaNotEnabledPrompt: `The times between the adhan and the iqama are not provided by your mosque.`,
    mosqueInfoPrompt: `Your mosque is %s, located at %s, about %s kilometers from you. `,
    mosqueInfoErrorPrompt: `Sorry, I couldn't find any information for your mosque. Please try again.`,
    nextPrayerTimeWithNamePrompt: `The %s prayer is at %s, in %s.`,
    allIqamaTimesPrompt: `For %s, iqama is at %s.`,
    deleteDataPrompt: `Your data has been successfully deleted. Restart the skill to use ${process.env.SKILL_NAME} again.`,
    okPrompt: `Okay. `,
    jummaTimePrompt: `Also, the Friday prayer, <sub alias='joomua'>Jumua</sub>, is at %s.`,
    noJummaTimePrompt: `There is no <sub alias='joomua'>Jumua</sub> prayer at this mosque.`,
    none: `None`,
    thankYouPrompt: `Thank you for using ${process.env.SKILL_NAME} for the prayer times of your mosque. `,
    globalErrorPrompt: `Sorry, I didn't quite catch that. Could you say it again, please?`,
    fallbackPrompt: `Sorry, I didn't quite catch that. Could you say it again, please?`,
    allPrayerTimesPrompt: `%s is at %s. `,
    doYouNeedAnythingElsePrompt: ` Do you need anything else?`,
    adhanReciterPrompt: `Which recitation would you like for the adhan? You can choose between %s. To choose one, say its number`,
    adhanReciterErrorPrompt: `Sorry, I couldn't find any recitations for the adhan. Please try again.`,
    adhanReciterSuccessPrompt: `Perfect, %s is now your favorite recitation for the adhan! `,
    titleForAdhaanReciterList: `Adhan Reciters`,
    chooseAdhaanByTouchPrompt:
      "or you can tap the recitation of your choice on the screen.",
    hadithErrorPrompt: `Sorry, I couldn't find any hadiths. Please try again.`,
    adhaanErrorPrompt: `Sorry, playing the adhan isn't available right now. Please try again later.`,
    selectMosquePrompt: `To register a mosque, say "choose my mosque". `,
    unableToResolvePrayerNamePrompt: `Sorry, I couldn't recognize the prayer name. Please try again.`,
    prayerNamePrompt:
      "Which prayer would you like to create a notification for? You can choose between %s. Say the number of the prayer",
    prayerNameTouchPrompt:
      "or you can tap the prayer of your choice on the screen.",
    routineCreatedPrompt: `Perfect, the notification has been created successfully! `,
    routineErrorPrompt:
      "Sorry, an error occurred while creating the notification. Please try again later.",
    routineRejected:
      "To create another notification, say 'create a notification'.",
    routineAlreadyEnabled:
      "This notification is already enabled. To create another one, say 'create a notification'.",
    titleForPrayerTimeList: `Prayer Times`,
    invalidPrayerIndexPrompt: `Sorry, the number you provided is invalid. Please choose between 1 and %s.`,
    timezoneErrorPrompt: `Sorry, I couldn't retrieve your timezone. Please check your location settings in the Alexa app and try again.`,
    requestRoutinePrompt: "Would you like to set up a notification for this prayer?",
    hadithWidgetTitle: "Hadith of the day",
    hadithWidgetDescription: "Loading...",
    widgetInstallationErrorPrompt:
      "Sorry, an error occurred while installing the widget. Please try again later.",
    nextPrayerWithoutMosqueAndTimePrompt: `The next prayer is %s at %s.`,
    linkAccountPrompt:
      "To enable the notification, please link your Amazon account in the Alexa app and try again.",
    refreshTokenMissing:
      "Your account linking seems incomplete. To fix this, disable and re-enable the skill in the Alexa app, link your Amazon account, then run device discovery.",
    titleForDeleteRoutineList: "Delete Notification",
    deleteRoutinePrompt: "Which notification would you like to delete? You can choose between %s. Say the number of the notification",
    deleteRoutineTouchPrompt:
      "or you can tap the notification of your choice on the screen.",
    deleteRoutineConfirmPrompt:
      "Are you sure you want to delete the notification for %s? ",
    routineDeletedPrompt: "The notification has been successfully deleted. ",
    noRoutinesPrompt:
      "You don't have any notifications enabled. Say 'create a notification' to get started. ",
    deleteRoutineErrorPrompt:
      "Sorry, an error occurred while deleting the notification. Please try again later.",
    allRoutinesEnabled: "All notifications are already enabled. To delete one, say 'delete a notification'.",
    allPrayers: "All Prayers"
  },
};
