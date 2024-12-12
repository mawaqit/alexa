const axios = require("axios");
const { lang } = require("moment");
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
      if (!response || !response.data || !response.data.length) {
        throw "Received Empty Response";
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

const getPrayerTimings = async (mosqueUuid) => {
  const config = getConfig("get", `/mosque/${mosqueUuid}/times`);
  console.log("Config: ", JSON.stringify(config, null, 2).replace(/Bearer \w+/g, "Bearer ****"));
  return await axios
    .request(config)
    .then((response) => {
      console.log("Mosque Timings: ", JSON.stringify(response.data));
      if (!response || !response.data || !response.data.times) {
        throw "Received Empty Response";
      }

      return response.data;
    })
    .catch((error) => {
      console.log("Error while fetching mosque Timings: ", error);
      if (error.response && error.response.status === 404) {
        console.log("Mosque not found: ", error.response.status);
        throw "Mosque not found";
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
      if (!response || !response.data || !response.data.text) {
        throw "Received Empty Response";
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

module.exports = {
  getMosqueList,
  getPrayerTimings,
  getRandomHadith
};
