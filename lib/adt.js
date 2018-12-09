const events = require('events');
const cheerio = require('cheerio');
const request = require('request-promise').defaults({jar: true});
const nodeCache = require('node-cache');
const pEvent = require('p-event');
const HTTPS = 'https://';
const LOGIN_PATH = '/selfcare/j_spring_security_check';
const DASHBOARD_PATH = '/selfcare/dashboard.xhtml';
const FRONTPAGE_PATH = '/selfcare/frontpage.xhtml';
const STATUS = 'status';

class Adt extends events.EventEmitter {
    constructor(config, log) {
        super();

        this.log = log;
        this.name = config.name;
        this.username = config.username;
        this.password = config.password;
        this.envDomain = config.domain;
        this.cacheTTL = config.cacheTTL || 5;

        if (!this.username || !this.password || !this.envDomain) {
            throw new Error("Missing parameter. Please check configuration.");
        }

        this.loginCookie;
        this.loginCSRFToken;
        this.serverCookie;
        this.csrf_token;
        this.targetState;

        this.viewState;
        this.homeAction;
        this.awayAction;
        this.disarmAction;

        this.log.debug("Initializing with username=%s, password=%s, cacheTTL=%s, domain=%s", this.username, this.password, this.cacheTTL, this.envDomain);

        this.statusCache = new nodeCache({
            stdTTL: this.cacheTTL,
            checkperiod: 1,
            useClones: false
        });

        this.on('error', () => {
            this.attemptToRecoverFromFailure();
        });

        this.init();
    }

    async init() {
        try {
            this.log("Initializing status...");
            this.setupAutoRefresh();

            await this.login();
            let state = await this.getCurrentStatus();

            this.statusCache.set(STATUS, state);

            this.log("Status initialized");
            this.log.debug("Status initialized", JSON.stringify(state));
        } catch (error) {
            this.log.error("Initialization failed", error);
        }
    }

    setupAutoRefresh() {
        this.log.debug("Enabling autoRefresh every %s seconds", this.statusCache.options.stdTTL);

        let that = this;
        this.statusCache.on('expired', (key, value) => {
            that.log.debug(key + " expired");

            that.getCurrentStatus()
                .then((state) => {
                    this.statusCache.set(STATUS, state);
                })
                .catch((error) => {
                    this.log.error("Failed refreshing status. Waiting for recovery.", error);
                });
        });

        this.statusCache.on('set', (key, value) => {
            if (key === STATUS) {
                this.emit('state', value);
            }
        })
    }

    async getState() {
        let cachedStatus = this.statusCache.get(STATUS);

        if (!cachedStatus) {
            this.log.debug("Waiting for status");
            cachedStatus = await pEvent(this.statusCache, 'set', {multiArgs: true})[1];
        }

        this.log.debug("Found status", JSON.stringify(cachedStatus));

        return cachedStatus;
    }

    setState(status) {
        this.targetState = status;

        let currentStatus = this.statusCache.get(STATUS);

        if (currentStatus && currentStatus.alarm.armingState === 3 && currentStatus.alarm.faultStatus === 1) {
            this.log.error("Can't arm system. System is not ready.");
            this.targetState = undefined;

            return new Error("Can't arm system. System is not ready.");
        } else {
            this.log("Setting status to", status);
            this.changeState(status);

            return null;
        }
    }

    async login() {
        let options = {
            uri: HTTPS + this.envDomain,
            resolveWithFullResponse: true,
            headers: {
                "Host": this.envDomain,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
                "User-Agent": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36',
                "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
                "Accept-Encoding": "br, gzip, deflate",
                "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
                "Expires": -1,
                "Pragma": "no-cache",
                "Upgrade-Insecure-Requests": "1",
                "Connection": "keep-alive"
            }
        };

        await request(options)
            .then((response) => {
                if (response.headers['set-cookie']) {
                    this.loginCookie = response.headers['set-cookie'].filter(cookie => cookie.startsWith('JSESSION'))[0];
                    this.loginCookie = this.loginCookie.substring(0, this.loginCookie.indexOf(';'));
                    this.serverCookie = response.headers['set-cookie'].filter(cookie => cookie.startsWith('BIGipServerTYCO'))[0];
                    this.serverCookie = this.serverCookie.substring(0, this.serverCookie.indexOf(';'));
                    this.loginCSRFToken = cheerio.load(response.body)('input[name=_csrf]').val();
                }
            });

        this.log.debug("Using username", this.username);
        this.log.debug("Using password", this.password);
        this.log.debug("Obtained login cookie", this.loginCookie);
        this.log.debug("Obtained CSRF login token", this.loginCSRFToken);
        this.log.debug("Obtained server cookie", this.serverCookie);

        options = {
            method: 'POST',
            uri: HTTPS + this.envDomain + LOGIN_PATH,
            resolveWithFullResponse: true,
            followAllRedirects: true,
            form: {
                "j_username": this.username,
                "j_password": this.password,
                "loginButton": "Ir",
                "_csrf": this.loginCSRFToken
            },
            headers: {
                "Origin": HTTPS + this.envDomain,
                "Referer": HTTPS + this.envDomain + FRONTPAGE_PATH,
                "Host": this.envDomain,
                "Cookie": this.loginCookie + "; " + this.serverCookie,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "User-Agent": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36',
                "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
                "Accept-Encoding": "br, gzip, deflate",
                "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
                "Expires": -1,
                "Pragma": "no-cache",
                "Upgrade-Insecure-Requests": "1",
                "Connection": "keep-alive"
            }
        };

        let response = await request(options);

        this.csrf_token = cheerio.load(response.body)('input[name=_csrf]').val();
        this.log.debug("Got CSRF Token", this.csrf_token);

        if (this.csrf_token === this.loginCSRFToken) {
            throw new Error("Login failed. Please check supplied credentials");
        }

        this.log("Logged in as", this.username);
    }

    async getCurrentStatus() {
        let state = {
            alarm: {},
            contactSensors: []
        };

        let options = {
            uri: HTTPS + this.envDomain + DASHBOARD_PATH,
            headers: {
                "X-CSRF-TOKEN": this.csrf_token,
                "Origin": HTTPS + this.envDomain,
                "Referer": HTTPS + this.envDomain + DASHBOARD_PATH,
                "Host": this.envDomain,
                "Accept": "application/json",
                "User-Agent": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36',
                "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
                "Accept-Encoding": "br, gzip, deflate",
                "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
                "Expires": -1,
                "Pragma": "no-cache",
                "Upgrade-Insecure-Requests": "1",
                "Connection": "keep-alive"
            }
        };

        this.log.debug("Fetching status...");

        await request(options)
            .then((response) => {
                let $ = cheerio.load(response);

                //Alarm

                let activeButton = $('#activationButtons .active');
                let notReady = $('#activationButtons .OFF_NOT_READY');
                let batteryLevel = $('#j_idt135\\3A batteryLevelPanel');

                if (activeButton.hasClass('left')) {
                    state.alarm.armingState = 3; // DISARMED
                } else if (activeButton.hasClass('center')) {
                    state.alarm.armingState = 0; // HOME
                } else if (activeButton.hasClass('right')) {
                    state.alarm.armingState = 1; // AWAY
                } else if (notReady.hasClass('left')) {
                    state.alarm.armingState = 3; // DISARMED
                    state.alarm.faultStatus = 1;  // NOT READY
                }

                state.alarm.lowBatteryStatus = 0;

                if (batteryLevel.hasClass('lev1')) {
                    state.alarm.batteryLevel = 10;
                    state.alarm.lowBatteryStatus = 1;
                } else if (batteryLevel.hasClass('lev2')) {
                    state.alarm.batteryLevel = 50;
                } else {
                    state.alarm.batteryLevel = 100;
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

                if (state.alarm.armingState === undefined) {
                    this.log.debug(response);
                    this.emit('error');
                    throw new Error("Unexpected status response.");
                }
            });

        state.alarm.targetState = this.targetState !== undefined ? this.targetState : state.alarm.armingState;

        return state;
    }

    async attemptToRecoverFromFailure() {
        try {
            await this.login();
            let newState = await this.getCurrentStatus();
            this.statusCache.set(STATUS, newState);

            this.log("Recovered from error");
        } catch (error) {
            this.log.error("Still with errors, waiting 3 seconds...");
            this.log.debug(error);
            setTimeout(() => this.emit('error'), 3000);
        }
    }

    async changeState(mode) {
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
                return Promise.reject("Mode not supported");
        }

        this.targetState = mode;

        this.execute(action)
            .then((result) => {
                this.log("Status set to", this.targetState);
            })
            .catch((error) => {
                this.log.error("Error while setting state to", status, error);
                this.targetState = undefined;
            })
            .finally(() => {
                setTimeout(() => {
                    if (this.targetState === mode) {
                        this.targetState = undefined;
                        this.log.debug("Target state reset");
                    }
                }, 20000);
            });
    }

    execute(action) {
        this.log.debug("Executing", action);

        let options = {
            method: 'POST',
            uri: HTTPS + this.envDomain + DASHBOARD_PATH,
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
                "Accept": "*/*",
                "Origin": HTTPS + this.envDomain,
                "Referer": HTTPS + this.envDomain + DASHBOARD_PATH,
                "Host": this.envDomain,
                "Faces-Request": "partial/ajax",
                "User-Agent": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36',
                "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
                "Accept-Encoding": "br, gzip, deflate",
                "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
                "Expires": -1,
                "Pragma": "no-cache",
                "Upgrade-Insecure-Requests": "1",
                "Connection": "keep-alive"
            }
        };

        return request(options);
    }
}

module.exports = {
    Adt
};
