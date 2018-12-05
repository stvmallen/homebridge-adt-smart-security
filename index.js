let Service, Characteristic;
let nodeCache = require('node-cache');
let adt = require('./lib/adt').Adt;

const STATUS = 'status';

const smartSecurityAccessory = function (log, config) {
    this.log = log;
    this.name = config.name;
    this.username = config.username;
    this.password = config.password;
    this.cacheTTL = config.cacheTTL || 5;

    this.log.debug("Initialized with username=%s, password=%s, cacheTTL=%s", this.username, this.password, this.cacheTTL);

    this.accessoryInfo = new Service.AccessoryInformation();
    this.securityService = new Service.SecuritySystem(this.name);
    this.batteryService = new Service.BatteryService(this.name);

    this.adt = new adt(this.username, this.password, this.log);

    this.statusCache = new nodeCache({
        stdTTL: this.cacheTTL,
        checkperiod: 1,
        useClones: false
    });

    this.adt.login()
        .then(() => {
            this.setupAutoRefresh();
        })
        .catch((error) => {
            this.log.error("Error on login", error);
        });
};

smartSecurityAccessory.prototype = {
    getServices() {
        this.log.debug("Getting services");

        this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "ADT");
        this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, "See ADT Smart Security app");
        this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
        this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);

        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .on("get", this.getCurrentState.bind(this))
            .setProps({validValues: [0, 1, 3, 4]});

        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .on("set", this.setTargetState.bind(this))
            .on("get", this.getTargetState.bind(this))
            .setProps({validValues: [0, 1, 3]});

        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .on("get", this.getBatteryLevel.bind(this));

        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .on("get", this.getLowBatteryStatus.bind(this));

        return [this.accessoryInfo, this.securityService, this.batteryService];
    },

    identify(callback) {
        this.log("Identify requested. Not supported yet.");
        callback();
    },

    getBatteryLevel(callback) {
        this.log("Battery level requested");
        callback(null, this.getState().batteryLevel);
    },

    getLowBatteryStatus(callback) {
        this.log("Battery status requested");
        callback(null, this.getState().lowBatterStatus);
    },

    getCurrentState(callback) {
        this.log("Current state requested");
        callback(null, this.getState().armingState);
    },

    getTargetState(callback) {
        this.log("Target state requested");
        callback(null, this.getState().targetState);
    },


    getStateFromDevice() {
        this.log.debug("Getting state from device");
        return this.adt.getCurrentStatus();
    },

    async getState() {
        let cachedStatus = this.statusCache.get(STATUS);

        if (!cachedStatus) {
            let that = this;
            await setTimeout(() => that.log.debug("Waiting for status"), 1000);
            cachedStatus = this.statusCache.get(STATUS);
        }

        this.log.debug("Found status", JSON.stringify(cachedStatus));

        return cachedStatus;
    },

    setTargetState(status, callback) {
        this.log("Received target status", status);

        this.adt.targetState = status;

        let currentStatus = this.statusCache.get(STATUS);

        if (currentStatus && currentStatus.alarm.armingState === 3 && currentStatus.alarm.faultStatus === 1) {
            this.log.error("Can't arm system. System is not ready.");
            this.adt.targetState = undefined;
            callback(1);
        } else {
            this.log("Setting status to", status);

            this.adt.changeState(status)
                .then(() => {
                    this.log("Status set to", status);
                    callback(null);

                    setTimeout(() => {
                        this.adt.targetState = undefined;
                        this.log.debug("Target state reset");
                    }, 20000);
                })
                .catch((error) => {
                    this.log.error("Error while setting state to ", status, error);
                    this.adt.targetState = undefined;
                    callback(error);
                });
        }
    },

    setupAutoRefresh() {
        this.log("Enabling autoRefresh every %s seconds", this.statusCache.options.stdTTL);

        let that = this;
        this.statusCache.on('expired', (key, value) => {
            that.log.debug(key + " expired");

            that.getStateFromDevice()
                .then((state) => {
                    this.statusCache.set(STATUS, state);
                    this.updateCharacteristics(state);
                })
                .catch((error) => {
                    this.log.error("Failed refreshing status:", error);
                    this.initStatus();
                });
        });

        this.initStatus();
    },

    initStatus() {
        this.log.debug("Initializing status");

        this.getStateFromDevice()
            .then((state) => {
                this.statusCache.set(STATUS, state);
                this.updateCharacteristics(state);
                this.log.debug("Status initialized with", JSON.stringify(state));
            })
            .catch((error) => {
                this.log.error("Failed getting status:", error);
                this.initStatus();
            });
    },

    updateCharacteristics(status) {
        this.log.debug("Updating characteristics to", JSON.stringify(status));

        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .updateValue(status.alarm.armingState);
        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .updateValue(status.alarm.targetState);
        this.securityService
            .getCharacteristic(Characteristic.StatusFault)
            .updateValue(status.alarm.faultStatus);
        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .updateValue(status.alarm.batteryLevel);
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .updateValue(status.alarm.lowBatterStatus);
    }
};

module.exports = homebridge => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-adt-smart-security", "ADT", smartSecurityAccessory);
};
