let Service, Characteristic;

const nodeCache = require("node-cache");
const DEFAULT_SERVICE_URL = 'https://smartsecurity.adt.com.ar';
const REFRESHING = 'refreshing';

const smartSecurityAccessory = function (log, config) {
    this.log = log;
    this.name = config.name;
    this.username = config.username;
    this.password = config.password;
    this.pollingInterval = config.pollingInterval || 30;

    this.log.debug("Initialized with username=%s, password=%s, pollingInterval=%s", this.username, this.password, this.pollingInterval);

    this.accessoryInfo = new Service.AccessoryInformation();
    this.securityService = new Service.SecuritySystem(this.name);
    this.batteryService = new Service.BatteryService(this.name);

    this.state = this.getStateFromDevice();
};

smartSecurityAccessory.prototype = {
    getServices() {
        this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "ADT");
        this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, "See ADT Smart Security app");
        this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
        this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);
        this.accessoryInfo.setCharacteristic(Characteristic.Model, "model");
        this.accessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, "fw");

        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .on("get", this.getCurrentState.bind(this))
            .setProps({validValues: [0, 1, 3]});

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

    setTargetState(status, callback) {
        this.log("Target state set to %s", status);

        this.state.targetState = status;

        callback();

        this.state.armingState = status;

        this.updateCharacteristics(this.state);
    },

    updateCharacteristics(status) {
        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .updateValue(status.armingState);
        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .updateValue(status.targetState);
        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .updateValue(status.batteryLevel);
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .updateValue(status.lowBatterStatus);
    },

    getState() {
        return this.getStateFromDevice(false);
    },

    getStateFromDevice(silent) {
        if (!silent) {
            this.log("Getting state from device");
        }

        let state = {
            armingState: Characteristic.SecuritySystemCurrentState.DISARMED,
            targetState: Characteristic.SecuritySystemCurrentState.DISARMED,
            lowBatterStatus: Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
            batteryLevel: 100
        };

        return state;
    }
};

module.exports = homebridge => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-adt-smart-security", "ADT", smartSecurityAccessory);
};
