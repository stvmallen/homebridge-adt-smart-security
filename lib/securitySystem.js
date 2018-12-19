let Characteristic, Service;

class SecuritySystem {
    static from(cachedAccessory, adt, log, hap) {
        log.debug("Building security system from cachedAccessory=%s", cachedAccessory.displayName);

        Characteristic = hap.Characteristic;
        Service = hap.Service;

        return new SecuritySystem(cachedAccessory.displayName, log, adt, cachedAccessory);
    }

    static with(name, adt, log, hap, platformAccessory) {
        log.debug("Building new security system with name=%s", name);

        Characteristic = hap.Characteristic;
        Service = hap.Service;

        return new SecuritySystem(name, log, adt, new platformAccessory(name, hap.uuid.generate(name), hap.Accessory.Categories.SECURITY_SYSTEM));
    }

    constructor(name, log, adt, platformAccessory) {
        this.name = name;
        this.log = log;
        this.adt = adt;
        this.platformAccessory = platformAccessory;
        this.securityService = this.platformAccessory.getService(Service.SecuritySystem) || this.platformAccessory.addService(Service.SecuritySystem, this.name);
        this.batteryService = this.platformAccessory.getService(Service.BatteryService) || this.platformAccessory.addService(Service.BatteryService, this.name);

        this.log.debug("Initializing characteristics for", this.name);

        this.platformAccessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'ADT')
            .setCharacteristic(Characteristic.SerialNumber, 'See ADT Smart Security app');

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
    }

    getAccessory() {
        return this.platformAccessory;
    }

    getBatteryLevel(callback) {
        this.log('Battery level requested');
        let state = this.adt.getState();
        callback(null, state && state.alarm ? state.alarm.batteryLevel : state);
    }

    getLowBatteryStatus(callback) {
        this.log('Battery status requested');
        let state = this.adt.getState();
        callback(null, state && state.alarm ? state.alarm.lowBatteryStatus : state);
    }

    getCurrentState(callback) {
        this.log('Current state requested');
        let state = this.adt.getState();
        callback(null, state && state.alarm ? state.alarm.armingState : state);
    }

    getTargetState(callback) {
        this.log('Target state requested');
        let state = this.adt.getState();
        callback(null, state && state.alarm ? state.alarm.targetState : state);
    }

    setTargetState(status, callback) {
        this.log('Received target status', status);
        callback(this.adt.setState(status));
    }

    updateCharacteristics(newState) {
        let alarmStatus = newState.alarm;
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
}

module.exports = {
    SecuritySystem
};
