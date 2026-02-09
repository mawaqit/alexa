const axios = require("axios");
const AMAZON_BASE_URL = "https://api.amazon.com";
const qs = require('qs');

async function getRefreshToken(authCode) {
    console.log("Auth Code: ", authCode);
    if (!authCode) {
        throw new Error("Auth code is required");
    }
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
    console.log("Access Token: ", accessToken);
    if (!accessToken) {
        throw new Error("Access token is required");
    }
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

async function getAccessTokenFromRefreshToken(refreshToken) {
    console.log("Getting access token from refresh token");
    if (!refreshToken) {
        throw new Error("Refresh token is required");
    }

    let data = qs.stringify({
        'client_id': process.env.clientId,
        'client_secret': process.env.clientSecret,
        'grant_type': 'refresh_token',
        'refresh_token': refreshToken
    });

    let config = {
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
        console.log("Response in getAccessTokenFromRefreshToken: ", JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.log("Error in getAccessTokenFromRefreshToken: ", error?.response?.data || error.message);
        throw error;
    }
}

module.exports = {
    getUserInfo,
    getRefreshToken,
    getAccessTokenFromRefreshToken
}