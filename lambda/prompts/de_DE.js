module.exports = {
    translation: {
      skillName: process.env.skillName, //new
      welcomePrompt: `Salam Aleykum! `,
      chooseMosquePrompt: `Welche Moschee möchten Sie auswählen? Die nächstgelegenen Moscheen sind: %s. Sie können eine auswählen, indem Sie die zugehörige Nummer sagen.`,
      chooseMosqueByTouchPrompt: "oder Sie können auch auf die Moschee Ihrer Wahl auf Ihrem Bildschirm klicken.",
      helpPrompt: `Hier sind die Befehle, die Sie verwenden können:\n- Wann ist das nächste Gebet?\n- Sie können auch die Zeit eines bestimmten Gebets erfragen, indem Sie z.B. fragen: "Wann ist das vierte Gebet?" für Maghrib\n- Wie lange dauert es bis zur Iqama?\n- Geben Sie mir Informationen über meine Moschee.\n- Ändern Sie meine Lieblingsmoschee.\n- Geben Sie mir die Gebetszeiten für den Tag.\n- Spielen Sie den Gebetsruf ab.\n- Spielen Sie den Gebetsruf für Fajr ab.\nDiese Befehle können auch in Ihren Alexa-Routinen verwendet werden. Weitere Befehle folgen inshaAllah bald.`,
      stopPrompt: `Auf Wiedersehen und möge Allah Sie schützen!`,
      errorPrompt: `Entschuldigung, ich habe nicht verstanden, was Sie gesagt haben. Bitte wiederholen Sie es.`,
      noDataPrompt: `Entschuldigung, ich konnte keine Daten für diese Anfrage finden. Bitte versuchen Sie es erneut.`,
      noCityPrompt: `Entschuldigung, ich konnte keine Moschee in dieser Stadt finden. Bitte versuchen Sie es erneut.`,
      requestForGeoLocationPrompt: `Um die Anwendung zu verwenden, müssen Sie mir erlauben, auf Ihren Standort zuzugreifen, damit ich die nächstgelegenen Moscheen finden kann. Bitte öffnen Sie die Alexa-App auf Ihrem Telefon, um dies zu genehmigen.`,
      noAddressPrompt: `Es scheint, dass Sie keine Adresse in Alexa festgelegt haben. Sie können dies in der Alexa-App tun, damit ich die nächstgelegenen Moscheen für Sie finden kann.`,
      errorPromptforMosqueList: `Entschuldigung, ich konnte keine MAWAQIT-Moschee in Ihrer Nähe finden.`,
      logoUrl: "https://play-lh.googleusercontent.com/79-OHFiVzGLTSLg_tXcsS3VwxWd9ZAxL4eAt35IgIljERyMkYvAq92m-fgpDsZ-lNA",
      titleForMosqueList: `Moscheen ${process.env.skillName}`,
      layoutDirection: "LTR",
      nextPrayerTimeErrorPrompt: `Entschuldigung, ich konnte die Zeit für das nächste Gebet in Ihrer Moschee nicht finden. Bitte versuchen Sie es erneut.`,
      nextPrayerTimePrompt: "Um %s ist das nächste Gebet %s um %s in %s. Möchten Sie noch etwas wissen?",
      prayerNames: ["<phoneme alphabet=\"ipa\" ph=\"fadʒr\">Fajr</phoneme>", " <phoneme alphabet=\"ipa\" ph=\"duhr\">Duhr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʕa.sˤr\">Asr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"maɣ.rɪb\">Maghrib</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʔɪʃaːʔ\">Isha</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"dʒumʕa\">Jumma</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʕiːd\">Eid</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʃu.ruːq\">Shuruq</phoneme>"],
      unableToFindMosquePrompt: `Entschuldigung, ich konnte die Moschee, die Sie suchen, nicht finden. Bitte wählen Sie eine gültige Option.`,
      mosqueNotRegisteredPrompt: `Sie haben keine Moschee registriert, um diese Anfrage zu stellen. Bitte registrieren Sie zuerst eine Moschee.`,
      mosqueSearchWordPrompt: `Für welchen Ort möchten Sie eine Moschee suchen? Sie können den Namen der Stadt sagen.`,
      noPrayerTimePrompt: `Entschuldigung, es gibt keine Gebetszeiten für %s in dieser Moschee.`,
      hoursAndMinutesPrompt: "%s Stunden und %s Minuten",
      minutesPrompt: "%s Minuten",
      nextPrayerTimeSpecificPrompt: `Um %s ist das Gebet %s um %s. Möchten Sie noch etwas wissen?`,
      shuruqPrompt: `Um %s ist Shuruq um %s. Möchten Sie noch etwas wissen?`,
      secondsPrompt: "%s Sekunden",
      errorGeoConversionPrompt: `Entschuldigung, ich konnte Ihre Adresse nicht in Geolokalisierung umwandeln. Bitte versuchen Sie es erneut.`,
      nextIqamaTimePrompt: `Die Iqama für das nächste Gebet %s ist in %s.`,
      selectedMosquePrompt: `Perfekt, %s ist jetzt Ihre Lieblingsmoschee!`,
      nextPrayerWithoutMosquePrompt: `Das nächste Gebet ist %s um %s in %s.`,
      iqamaNotEnabledPrompt: "Die Zeiten zwischen den Adhans und den Iqamas werden von Ihrer Moschee nicht bereitgestellt.",
      mosqueInfoPrompt: "Ihre Moschee ist %s. Sie befindet sich in %s, etwa %s Kilometer von Ihrem Standort entfernt. ",    
      mosqueInfoErrorPrompt: "Entschuldigung, ich konnte keine Informationen für Ihre Moschee finden. Bitte versuchen Sie es erneut.",
      nextPrayerTimeWithNamePrompt: `Das Gebet %s ist um %s in %s. `,
      allIqamaTimesPrompt: "Für %s ist die Iqama um %s.", 
      deleteDataPrompt: `Ihre Daten wurden erfolgreich gelöscht. Starten Sie die Anwendung neu, um ${process.env.skillName} erneut zu verwenden.`,
      okPrompt: "Ok. ",
      jummaTimePrompt: "Außerdem ist das Jumua, das Freitagsgebet, um %s.",
      noJummaTimePrompt: "Es gibt kein Jumua-Gebet in dieser Moschee.",
      none: "Keine",
      thankYouPrompt: `Danke, dass Sie ${process.env.skillName} verwenden, um die genauen Gebetszeiten Ihrer Lieblingsmoschee zu erhalten.`,
      globalErrorPrompt: "Entschuldigung, ich habe nicht verstanden, was Sie gesagt haben. Bitte wiederholen Sie es.",
      fallbackPrompt: "Entschuldigung, ich habe nicht verstanden, was Sie gesagt haben. Bitte wiederholen Sie es.",
      allPrayerTimesPrompt: "%s ist um %s. ",
      doYouNeedAnythingElsePrompt: ` Brauchen Sie noch etwas?`,
      adhanReciterPrompt: `Welche Rezitation möchten Sie als Favorit für den Adhan festlegen? Sie können zwischen %s wählen. Sie können wählen, indem Sie die zugehörige Nummer sagen `,
      adhanReciterErrorPrompt: `Entschuldigung, ich konnte keine Rezitationen für den Adhan finden. Bitte versuchen Sie es erneut.`,
      adhanReciterSuccessPrompt: `Perfekt, %s ist jetzt Ihre Lieblingsrezitation für den Adhan! `,
      titleForAdhaanReciterList: `Adhan-Rezitatoren`,
      chooseAdhaanByTouchPrompt: "oder Sie können auch auf die Rezitation Ihrer Wahl auf Ihrem Bildschirm klicken.",
    },
  };