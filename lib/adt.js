const request = require('request-promise').defaults({jar: true});
const cheerio = require('cheerio');

const DEFAULT_SERVICE_URL = 'https://smartsecurity.adt.com.ar';
const LOGIN_PATH = '/selfcare/j_spring_security_check';
const DASHBOARD_PATH = '/selfcare/dashboard.xhtml';

class Adt {
    constructor(username, password, log) {
        this.username = username;
        this.password = password;
        this.log = log;

        this.loginCookie;
        this.loginCSRFToken;
        this.serverCookie;
        this.csrf_token;
        this.targetState;

        this.viewState;
        this.homeAction;
        this.awayAction;
        this.disarmAction;
    }

    async login() {
        let options = {
            uri: DEFAULT_SERVICE_URL,
            resolveWithFullResponse: true,
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
                "Accept-Encoding": "br, gzip, deflate",
                "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Host": "smartsecurity.adt.com.ar",
                "Upgrade-Insecure-Requests": "1",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36"
            }
        };

        await request(options)
            .then((response) => {
                this.loginCookie = response.headers['set-cookie'].filter(cookie => cookie.startsWith('JSESSION'))[0];
                this.loginCookie = this.loginCookie.substring(0, this.loginCookie.indexOf(';'));
                this.serverCookie = response.headers['set-cookie'].filter(cookie => cookie.startsWith('BIGipServerTYCO'))[0];
                this.serverCookie = this.serverCookie.substring(0, this.serverCookie.indexOf(';'));
                this.loginCSRFToken = cheerio.load(response.body)('input[name=_csrf]').val();
            });

        this.log.debug("Using username", this.username);
        this.log.debug("Using password", this.password);
        this.log.debug("Obtained login cookie", this.loginCookie);
        this.log.debug("Obtained CSRF login token", this.loginCSRFToken);
        this.log.debug("Obtained server cookie", this.serverCookie);

        options = {
            method: 'POST',
            uri: DEFAULT_SERVICE_URL + LOGIN_PATH,
            resolveWithFullResponse: true,
            followAllRedirects: true,
            form: {
                "j_username": this.username,
                "j_password": this.password,
                "loginButton": "Ir",
                "_csrf": this.loginCSRFToken
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Content-Length": "110",
                "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
                "Accept-Encoding": "br, gzip, deflate",
                "Connection": "keep-alive",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36",
                "Upgrade-Insecure-Requests": "1",
                "Origin": "https://smartsecurity.adt.com.ar",
                "Referer": "https://smartsecurity.adt.com.ar/selfcare/frontpage.xhtml",
                "Cache-Control": "max-age=0",
                "Host": "smartsecurity.adt.com.ar",
                "Cookie": this.loginCookie + "; " + this.serverCookie
            }
        };

        await request(options)
            .then((response) => {
                this.csrf_token = cheerio.load(response.body)('input[name=_csrf]').val();
                this.log.debug("Got CSRF Token", this.csrf_token);
            });

        this.log("Logged in as", this.username);
    }

    async getCurrentStatus() {
        let state = {
            alarm : {
                armingState: 0,
                targetState: this.targetState,
                lowBatterStatus: 0,
                batteryLevel: 100,
                faultStatus: 0
            },
            contactSensors: []
        };

        let options = {
            uri: DEFAULT_SERVICE_URL + DASHBOARD_PATH,
            headers: {
                "X-CSRF-TOKEN": this.csrf_token,
                "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
                "Expires": -1,
                "Pragma": "no-cache",
                "Accept": "application/json",
                "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
                "Accept-Encoding": "br, gzip, deflate",
                "Connection": "keep-alive",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36",
                "Origin": "https://smartsecurity.adt.com.ar",
                "Referer": "https://smartsecurity.adt.com.ar/selfcare/dashboard.xhtml",
                "Host": "smartsecurity.adt.com.ar"
            }
        };

        await request(options)
            .then((response) => {
                let $ = cheerio.load(response);

                //Alarm

                let activeButton = $('#activationButtons .active');
                let notReady = $('#activationButtons .OFF_NOT_READY');
                let batteryLevel = $('#j_idt135\\3A batteryLevelPanel');

                if (activeButton.hasClass('left')) {
                    state.alarm.armingState = 3;
                } else if (activeButton.hasClass('right')) {
                    state.alarm.armingState = 1;
                } else if (notReady.hasClass('left')) {
                    state.alarm.armingState = 3;
                    state.alarm.faultStatus = 1;
                }

                if (state.alarm.armingState !== 3 && state.alarm.faultStatus === 1) {
                    state.alarm.armingState = 4;
                }

                state.alarm.targetState = this.targetState;

                if (batteryLevel.hasClass('lev1')) {
                    state.alarm.batteryLevel = 10;
                    state.alarm.lowBatterStatus = 1;
                } else if (batteryLevel.hasClass('lev2')) {
                    state.alarm.batteryLevel = 50;
                }

                // Contact sensors

                $('.openDoorDash').each((index, element) => {
                    let contactSensor = {
                        name: element.parent.attribs.title,
                        status: element.attribs.class.endsWith("off")
                    };

                    state.contactSensors.push(contactSensor);
                });

                // Actions

                this.viewState = $('input[type=hidden][name=javax\\.faces\\.ViewState]').val();
                this.homeAction = $('#activationButtons li.center a[title]').attr('id');
                this.awayAction = $('#activationButtons li.right a[title]').attr('id');
                this.disarmAction = $('#activationButtons li.left a[title]').attr('id');
            });

        return state;
    }

    async changeState(mode) {
        this.targetState = mode;

        let action;

        switch (mode) {
            case 0:
                action = this.homeAction;
                break;
            case 1:
                action = this.awayAction;
                break;
            case 3:
                action = this.disarmAction;
                break;
            default:
                this.log.error("Mode not supported", mode);
                return;
        }

        this.log.debug("Setting mode to", action);

        let options = {
            method: 'POST',
            uri: DEFAULT_SERVICE_URL + DASHBOARD_PATH,
            form: {
                "selfCareForm": "selfCareForm",
                "dummy": "",
                "_csrf": this.csrf_token,
                "javax.faces.ViewState": this.viewState,
                "javax.faces.source": action,
                "javax.faces.partial.event": "click",
                "javax.faces.partial.execute": action + " " + action,
                "javax.faces.behavior.event": "action",
                "javax.faces.partial.ajax": true
            },
            headers: {
                "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
                "Expires": -1,
                "Pragma": "no-cache",
                "Faces-Request": "partial/ajax",
                "Accept": "*/*",
                "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
                "Accept-Encoding": "br, gzip, deflate",
                "Connection": "keep-alive",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36",
                "Origin": "https://smartsecurity.adt.com.ar",
                "Referer": "https://smartsecurity.adt.com.ar/selfcare/dashboard.xhtml",
                "Host": "smartsecurity.adt.com.ar",
                "Content-Type": "application/x-www-form-urlencoded",
            }
        };

        await request(options);

        this.log.debug("State changed to", mode);
    }
}

module.exports = {
    Adt
};
