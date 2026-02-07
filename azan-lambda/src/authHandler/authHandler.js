const axios = require("axios");
const AMAZON_BASE_URL = "https://api.amazon.com";

async function getRefreshToken(authCode) {
    const data = new URLSearchParams({
        'client_id': process.env.clientId,
        'client_secret': process.env.clientSecret,
        'grant_type': 'authorization_code',
        'code': authCode
    });

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: AMAZON_BASE_URL + '/auth/o2/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        data: data
    };

    try {
        const response = await axios.request(config);
        console.log("Response in getRefreshToken: ", JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.log("Error in getRefreshToken: ", error?.response?.data);
        throw error;
    }
}

async function getUserInfo(accessToken) {
    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: AMAZON_BASE_URL + '/user/profile',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    };

    try {
        const response = await axios.request(config);
        console.log("Response in getUserInfo: ", JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.log("Error in getUserInfo: ", error?.response?.data);
        throw error;
    }
}

module.exports = {
    getUserInfo,
    getRefreshToken
}