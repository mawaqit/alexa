const apisauce = require("apisauce") 
const moment = require('moment-timezone');
moment.tz.setDefault('Europe/Paris');

const DEFAULT_API_CONFIG = {
    url: process.env.API_URL || "http://mawaqit.net/api/2.0",
    timeout: 10000,
}
/**
 * Manages all requests to the API.
 */

module.exports = class Api {

    constructor(config = DEFAULT_API_CONFIG) {
        this.config = config
        this.apisauce = apisauce.create({
            baseURL: this.config.url,
            timeout: this.config.timeout,
            headers: {
                "Accept": "application/json",
                "api-access-token":process.env.AUTHORIZATION
            }
        })
    }
    async getPrayerTimesByMosque(uuid){
        try {
            let tomorrow  = moment().add(1,'days');
            const month= tomorrow.month();
            const day= tomorrow.date();
            const response = await this.apisauce.get(`/mosque/${uuid}/prayer-times`,{'calendar':true});
            const salatList= ["fajr","dhuhr","asr","maghrib","isha"];
            if(response.ok){
                let toDayTimes = response.data.times.reduce((acc,current,i)=>{
                    acc[salatList[i]] = current;
                    return acc;
                },{});
                toDayTimes.jumua=response.data.jumua;
                toDayTimes.shuruq=response.data.shuruq;
                toDayTimes.fajrNextDay =response.data.calendar[month][day][0];
                const tomorrowTimes = {
                    "fajr":response.data.calendar[month][day][0],
                    "dhuhr":response.data.calendar[month][day][2],
                    "asr":response.data.calendar[month][day][3],
                    "maghrib":response.data.calendar[month][day][4],
                    "isha":response.data.calendar[month][day][5]
                }
                return {toDayTimes,tomorrowTimes};
            }
        } catch (error) {
            return false;
        }
    }
    async searchMosque(word){
        try {
            const response = await this.apisauce.get(`/mosque/search`,{'word':word});
            console.log("****heared as "+word);
            if(response.ok){
                return response.data;
            }else{
                return false;
            }
        } catch (error) {
            return false;
        }
    }
}
