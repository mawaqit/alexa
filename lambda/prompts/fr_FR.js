module.exports = {
  translation: {
    skillName: process.env.SKILL_NAME, //new
    welcomePrompt: `Salam Aleykoum ! `,
    chooseMosquePrompt: `Quelle mosquée souhaitez-vous choisir ? Voici les mosquées les plus proches : %s. Pour en choisir une, dites son numéro`,
    chooseMosqueByTouchPrompt:
      " ou touchez directement la mosquée de votre choix sur l'écran.",
    helpPrompt: `Voici quelques exemples de ce que vous pouvez me demander. Quand est la prochaine prière ? Quand est la prière de l'<sub alias='asser'>asr</sub> ? Combien de temps avant l'iqama ? Donne-moi tous les iqamas. Donne-moi les horaires de prière du jour. Lance l'appel à la prière. Lance l'appel à la prière du <sub alias='fadjr'>fajr</sub>. Donne-moi des informations sur ma mosquée. Change ma mosquée favorite. Choisis mon récitant d'adhan. Donne-moi un hadith. Vous pouvez aussi utiliser ces commandes dans vos routines Alexa. D'autres fonctionnalités arrivent bientôt inch'Allah.`,
    stopPrompt: `Au revoir, et qu'Allah vous préserve !`,
    errorPrompt: `Désolé, une erreur est survenue. Veuillez réessayer plus tard.`,
    noDataPrompt: `Désolé, je n'ai trouvé aucune donnée pour cette requête. Veuillez réessayer.`,
    noCityPrompt: `Désolé, je n'ai trouvé aucune mosquée dans cette ville. Veuillez réessayer.`,
    requestForGeoLocationPrompt: `Pour trouver les mosquées proches de vous, j'ai besoin d'accéder à votre localisation. Ouvrez l'application Alexa pour m'y autoriser.`,
    noAddressPrompt:
      "Votre adresse ne semble pas être définie sur Alexa. Vous pouvez la renseigner dans l'application Alexa pour que je puisse trouver les mosquées proches de vous.",
    errorPromptforMosqueList: `Désolé, je n'ai trouvé aucune mosquée MAWAQIT près de vous.`,
    logoUrl:
      "https://play-lh.googleusercontent.com/79-OHFiVzGLTSLg_tXcsS3VwxWd9ZAxL4eAt35IgIljERyMkYvAq92m-fgpDsZ-lNA",
    titleForMosqueList: `Mosquées ${process.env.SKILL_NAME}`,
    layoutDirection: "LTR",
    nextPrayerTimeErrorPrompt: `Désolé, je n'ai pas pu trouver l'heure de la prochaine prière. Veuillez réessayer.`,
    nextPrayerTimePrompt: "À %s, la prochaine prière est %s, à %s, dans %s. ",
    prayerNames: [
      "<sub alias='fadjr'>Fajr</sub>",
      "<sub alias='dohr'>Dohr</sub>",
      "<sub alias='asser'>Asr</sub>",
      "<sub alias='magrib'>Maghrib</sub>",
      "<sub alias='icha'>Isha</sub>",
      "<sub alias='joumoua'>Jumma</sub>",
      "<sub alias='aïd'>Eid</sub>",
      "<sub alias='chourouk'>Shuruq</sub>",
    ],
    unableToFindMosquePrompt: `Désolé, je n'ai pas trouvé la mosquée demandée. Veuillez choisir une option valide.`,
    mosqueNotRegisteredPrompt: `Vous n'avez pas encore enregistré de mosquée. Veuillez en choisir une d'abord. `,
    mosqueSearchWordPrompt: `Dans quelle ville cherchez-vous une mosquée ?`,
    noPrayerTimePrompt: `Désolé, il n'y a pas d'horaire pour %s dans cette mosquée.`,
    hoursAndMinutesPrompt: "%s heures et %s minutes",
    minutesPrompt: "%s minutes",
    nextPrayerTimeSpecificPrompt: `À %s, la prière de %s est à %s. Souhaitez-vous savoir autre chose ?`,
    shuruqPrompt: `À %s, le <sub alias='chourouk'>shourouk</sub> est à %s. Souhaitez-vous savoir autre chose ?`,
    secondsPrompt: "%s secondes",
    errorGeoConversionPrompt: `Désolé, je n'ai pas pu convertir votre adresse en géolocalisation. Veuillez réessayer.`,
    nextIqamaTimePrompt: `L'iqama pour la prochaine prière, %s, est dans %s.`,
    selectedMosquePrompt: `Parfait, %s est désormais votre mosquée favorite ! `,
    nextPrayerWithoutMosquePrompt: `La prochaine prière est %s à %s, dans %s.`,
    iqamaNotEnabledPrompt:
      "Les délais entre l'adhan et l'iqama ne sont pas fournis par votre mosquée.",
    mosqueInfoPrompt:
      "Votre mosquée est %s, située à %s, à environ %s kilomètres de chez vous. ",
    mosqueInfoErrorPrompt:
      "Désolé, je n'ai pas trouvé d'information sur votre mosquée. Veuillez réessayer.",
    nextPrayerTimeWithNamePrompt: `La prière de %s est à %s, dans %s. `,
    allIqamaTimesPrompt: "Pour %s, l'iqama est à %s. ",
    deleteDataPrompt: `Vos données ont bien été supprimées. Relancez la skill pour réutiliser ${process.env.SKILL_NAME}.`,
    okPrompt: "Ok. ",
    jummaTimePrompt:
      "De plus, la prière du vendredi, le <sub alias='joumoua'>jumua</sub>, est à %s.",
    noJummaTimePrompt:
      "Il n'y a pas de prière du <sub alias='joumoua'>jumua</sub> dans cette mosquée.",
    none: "None",
    thankYouPrompt: `Merci d'utiliser ${process.env.SKILL_NAME} pour connaître les horaires exacts de prière de votre mosquée favorite. `,
    globalErrorPrompt:
      "Désolé, je n'ai pas bien compris. Pouvez-vous répéter, s'il vous plaît ?",
    fallbackPrompt:
      "Désolé, je n'ai pas bien compris. Pouvez-vous répéter, s'il vous plaît ?",
    allPrayerTimesPrompt: "%s est à %s. ",
    doYouNeedAnythingElsePrompt: " Souhaitez-vous autre chose ?",
    adhanReciterPrompt: `Quelle récitation souhaitez-vous pour l'adhan ? Vous avez le choix entre %s. Pour en choisir une, dites son numéro`,
    adhanReciterErrorPrompt: `Désolé, je n'ai trouvé aucune récitation d'adhan. Veuillez réessayer.`,
    adhanReciterSuccessPrompt: `Parfait, %s est maintenant votre récitation favorite pour l'adhan ! `,
    titleForAdhaanReciterList: `Récitateurs d'Adhan`,
    chooseAdhaanByTouchPrompt:
      "ou touchez la récitation de votre choix sur l'écran.",
    hadithErrorPrompt: `Désolé, je n'ai trouvé aucun hadith. Veuillez réessayer.`,
    adhaanErrorPrompt: `Désolé, la lecture de l'adhan n'est pas disponible pour le moment. Veuillez réessayer plus tard.`,
    selectMosquePrompt: `Pour enregistrer une mosquée, dites « sélectionne ma mosquée » ou « choisis ma mosquée ». `,
    unableToResolvePrayerNamePrompt: `Désolé, je n'ai pas pu reconnaître le nom de la prière. Veuillez réessayer.`,
    prayerNamePrompt:
      "Pour quelle prière souhaitez-vous créer une notification ? Vous avez le choix entre %s. Dites le numéro de la prière",
    prayerNameTouchPrompt: "ou touchez la prière de votre choix sur l'écran.",
    routineCreatedPrompt: `Parfait, la notification a été créée avec succès ! `,
    routineErrorPrompt:
      "Désolé, une erreur est survenue lors de la création de la notification. Veuillez réessayer plus tard.",
    routineRejected:
      "Pour créer une autre notification, dites « créer une notification ».",
    routineAlreadyEnabled:
      "Cette notification est déjà activée. Pour en créer une autre, dites « créer une notification ».",
    titleForPrayerTimeList: `Heures de prière`,
    invalidPrayerIndexPrompt: `Désolé, le numéro indiqué n'est pas valide. Veuillez choisir entre 1 et %s.`,
    timezoneErrorPrompt: `Désolé, je n'ai pas pu récupérer votre fuseau horaire. Vérifiez vos paramètres de localisation dans l'application Alexa, puis réessayez.`,
    requestRoutinePrompt:
      "Souhaitez-vous configurer une notification pour cette prière ?",
    hadithWidgetTitle: "Hadith du jour",
    hadithWidgetDescription: "Chargement...",
    widgetInstallationErrorPrompt:
      "Désolé, une erreur est survenue lors de l'installation du widget. Veuillez réessayer plus tard.",
    nextPrayerWithoutMosqueAndTimePrompt: "La prochaine prière est %s à %s.",
    linkAccountPrompt:
      "Pour activer la notification, veuillez connecter votre compte Amazon dans l'application Alexa, puis réessayez.",
    refreshTokenMissing:
      "Votre connexion au compte semble incomplète. Pour corriger cela, désactivez puis réactivez la skill dans l'application Alexa, connectez votre compte Amazon, puis lancez la découverte des appareils.",
    titleForDeleteRoutineList: "Supprimer la notification",
    deleteRoutineConfirmPrompt:
      "Êtes-vous sûr de vouloir supprimer la notification pour %s ? ",
    routineDeletedPrompt: "La notification a été supprimée avec succès. ",
    noRoutinesPrompt:
      "Vous n'avez aucune notification activée. Dites « créer une notification » pour commencer. ",
    deleteRoutinePrompt:
      "Quelle notification souhaitez-vous supprimer ? Vous avez le choix entre %s. Dites le numéro de la notification",
    deleteRoutineTouchPrompt:
      "ou touchez la notification de votre choix sur l'écran.",
    deleteRoutineErrorPrompt:
      "Désolé, une erreur est survenue lors de la suppression de la notification. Veuillez réessayer plus tard.",
    allRoutinesEnabled:
      "Toutes les notifications sont déjà activées. Pour en supprimer une, dites « supprimer une notification ».",
    allPrayers: "Toutes les prières",
  },
};
