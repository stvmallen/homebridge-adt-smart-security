let Service, Characteristic;
let adt = require('./lib/adt').Adt;

const smartSecurityAccessory = function (log, config) {
    this.log = log;
    this.name = config.name;

    this.accessoryInfo = new Service.AccessoryInformation();
    this.securityService = new Service.SecuritySystem(this.name);
    this.batteryService = new Service.BatteryService(this.name);

    this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "ADT");
    this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, "See ADT Smart Security app");
    this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
    this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);

    this.securityService
        .getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .on('get', this.getCurrentState.bind(this))
        .setProps({validValues: [0, 1, 3, 4]});

    this.securityService
        .getCharacteristic(Characteristic.SecuritySystemTargetState)
        .on('set', this.setTargetState.bind(this))
        .on('get', this.getTargetState.bind(this))
        .setProps({validValues: [0, 1, 3]});

    this.batteryService
        .getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.getBatteryLevel.bind(this));

    this.batteryService
        .getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getLowBatteryStatus.bind(this));

    this.adt = new adt(config, this.log);

    this.adt.on('state', (state) => {
        this.updateCharacteristics(state.alarm);
    })
};

smartSecurityAccessory.prototype = {
    getServices() {
        this.log.debug('Getting services');
        return [this.accessoryInfo, this.securityService, this.batteryService];
    },

    identify(callback) {
        this.log('Identify requested. Not supported yet.');
        callback();
    },

    getBatteryLevel(callback) {
        this.log('Battery level requested');
        this.adt.getState()
            .then((state) => callback(null, state ? state.alarm.batteryLevel : state))
            .catch((error) => {
                this.log.error(error);
                callback(error);
            });
    },

    getLowBatteryStatus(callback) {
        this.log('Battery status requested');
        this.adt.getState()
            .then((state) => callback(null, state ? state.alarm.lowBatteryStatus : state))
            .catch((error) => {
                this.log.error(error);
                callback(error);
            });
    },

    getCurrentState(callback) {
        this.log('Current state requested');
        this.adt.getState()
            .then((state) => callback(null, state ? state.alarm.armingState : state))
            .catch((error) => {
                this.log.error(error);
                callback(error);
            });
    },

    getTargetState(callback) {
        this.log('Target state requested');
        this.adt.getState()
            .then((state) => callback(null, state ? state.alarm.targetState : state))
            .catch((error) => {
                this.log.error(error);
                callback(error);
            });
    },

    setTargetState(status, callback) {
        this.log('Received target status', status);
        callback(this.adt.setState(status));
    },

    updateCharacteristics(alarmStatus) {
        this.log.debug('Updating alarm characteristics to', JSON.stringify(alarmStatus));

        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .updateValue(alarmStatus.armingState);
        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .updateValue(alarmStatus.targetState);
        this.securityService
            .getCharacteristic(Characteristic.StatusFault)
            .updateValue(alarmStatus.faultStatus);
        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .updateValue(alarmStatus.batteryLevel);
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .updateValue(alarmStatus.lowBatteryStatus);
    }
};

module.exports = homebridge => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-adt-smart-security', 'ADT', smartSecurityAccessory);
};
