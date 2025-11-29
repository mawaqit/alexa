const axios = require("axios");
const mawaqitBaseUrl = process.env.baseUrl;

const getMosqueList = async (
  searchWord,
  latitudeInDegrees,
  longitudeInDegrees
) => {
  let url = `/mosque/search?`;
  if (searchWord) {
    url += `word=${searchWord}`;
  } else {
    url += `lat=${latitudeInDegrees}&lon=${longitudeInDegrees}`;
  }
  // url += `word=India`; //TODO: testing purposes remove later
  // url += `lat=10.9543588&lon=79.7294113`;
  // url += `lat=48.9451554&lon=2.4522338`;
  const config = getConfig("get", url, "2.0");
  console.log("Config: ", JSON.stringify(config, null, 2).replace(/Bearer \w+/g, "Bearer ****"));
  return await axios
    .request(config)
    .then((response) => {
      console.log("Mosque List: ", JSON.stringify(response.data));
      if (!response?.data?.length) {
        throw new Error("Received Empty Response");
      }

      return response.data
        .map(
          ({ name, uuid, proximity, localisation, jumua, jumua2, jumua3, image }) => ({
            primaryText: name,
            uuid,
            proximity,
            localisation,
            jumua,
            jumua2,
            jumua3,
            image
          })
        )
        .slice(0, 5);
    })
    .catch((error) => {
      console.log("Error while fetching mosque list: ", error);
      throw error;
    });
};

const getPrayerTimings = async (mosqueUuid, isIqamaCalendarRequired = false, isPrayerCalendarRequired = false) => {
  const config = getConfig("get", `/mosque/${mosqueUuid}/times`);
  console.log("Config: ", JSON.stringify(config, null, 2).replace(/Bearer \w+/g, "Bearer ****"));
  return await axios
    .request(config)
    .then((response) => {
      console.log("Mosque Timings: ", JSON.stringify(response.data));
      if (!response?.data?.times) {
        throw new Error("Received Empty Response");
      }
      if (!isIqamaCalendarRequired && response?.data?.iqamaCalendar) {
        delete response.data.iqamaCalendar;
      }
      if (!isPrayerCalendarRequired && response?.data?.calendar) {
        delete response.data.calendar;
      }

      return response.data;
    })
    .catch((error) => {
      console.log("Error while fetching mosque Timings: ", error);
      if (error?.response?.status === 404) {
        console.log("Mosque not found: ", error.response.status);
        throw new Error("Mosque not found");
      }
      throw error;
    });
};

const getRandomHadith = async (lang = "ar") => {
  const config = getConfig("get", `/hadith/random?lang=${lang}`, "2.0");
  console.log("Config: ", JSON.stringify(config, null, 2).replace(/Bearer \w+/g, "Bearer ****"));
  return await axios
    .request(config)
    .then((response) => {
      console.log("Hadith: ", JSON.stringify(response.data));
      if (!response?.data?.text) {
        throw new Error("No hadith text found in response");
      }

      return response.data.text;
    })
    .catch((error) => {
      console.log("Error while fetching Hadith: ", error);
      throw error;
    });
}

const getConfig = (httpMethod, url, apiVersion = "3.0") => {
  const apiKey = "Bearer " + process.env.mawaqitApiKey;
  const headers = {
    accept: "application/json",
    Authorization: apiKey,
  };
  return {
    method: httpMethod,
    url: mawaqitBaseUrl + apiVersion + url,
    headers: headers,
  };
};

/* *
 * Helper function to generate an access token with the scope alexa::datastore. 
 * AlexaClientID and AlexaClientSecret are fetched from the Permissions page
 * */
const getAccessToken = async () => {
  let config = {
    method: "post",
    url: "https://api.amazon.com/auth/o2/token",
    timeout: 3000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      charset: "utf-8",
    },
    params: {
      grant_type: "client_credentials",
      client_id: process.env.AlexaClientID,
      client_secret: process.env.AlexaClientSecret,
      scope: "alexa::datastore"
    }
  };

  return await axios(config)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      console.log("Error while fetching access token: ", error);
      throw error;
    });
}

const updateDatastore = async (token, commands, target, apiEndpoint = "https://api.eu.amazonalexa.com") => {
  const config = {
    method: "post",
    url: `${apiEndpoint}/v1/datastore/commands`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `${token.token_type} ${token.access_token}`
    },
    data: {
      commands: commands,
      target: target
    }
  };
  console.log("Datastore Config: ", JSON.stringify(config, null, 2).replace(/Bearer \w+/g, "Bearer ****"));

  return await axios(config)
    .then(function (response) {
      console.log("Datastore Response: ", JSON.stringify(response.data));
      return response.data;
    })
    .catch(function (error) {
      console.log("Error while updating Datastore: ", error);
      throw error;
    });
}

module.exports = {
  getMosqueList,
  getPrayerTimings,
  getRandomHadith,
  updateDatastore,
  getAccessToken
};
