let Service, Characteristic;
let adt = require('./lib/adt').Adt;

const smartSecurityAccessory = function (log, config) {
    this.log = log;
    this.name = config.name;

    this.accessoryInfo = new Service.AccessoryInformation();
    this.securityService = new Service.SecuritySystem(this.name);
    this.batteryService = new Service.BatteryService(this.name);

    this.adt = new adt(config, this.log);

    this.adt.on('state', (state) => {
        this.updateCharacteristics(state);
    })
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
        this.adt.getState()
            .then((state) => callback(null, state.alarm.batteryLevel))
            .catch((error) => {
                this.log.error(error);
                return callback(error);
            });
    },

    getLowBatteryStatus(callback) {
        this.log("Battery status requested");
        this.adt.getState()
            .then((state) => callback(null, state.alarm.lowBatteryStatus))
            .catch((error) => {
                this.log.error(error);
                return callback(error);
            });
    },

    getCurrentState(callback) {
        this.log("Current state requested");
        this.adt.getState()
            .then((state) => callback(null, state.alarm.armingState))
            .catch((error) => {
                this.log.error(error);
                return callback(error);
            });
    },

    getTargetState(callback) {
        this.log("Target state requested");
        this.adt.getState()
            .then((state) => callback(null, state.alarm.targetState))
            .catch((error) => {
                this.log.error(error);
                return callback(error);
            });
    },

    setTargetState(status, callback) {
        this.log("Received target status", status);
        callback(this.adt.setState(status));
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
            .updateValue(status.alarm.lowBatteryStatus);
    }
};

module.exports = homebridge => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-adt-smart-security", "ADT", smartSecurityAccessory);
};
