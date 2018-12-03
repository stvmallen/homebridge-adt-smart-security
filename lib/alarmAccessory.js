let Characteristic, Service, UUIDGen;

class Alarm {
    constructor(name, alarm, platform, hap) {
        Characteristic = hap.Characteristic;
        Service = hap.Service;
        UUIDGen = hap.uuid;

        this.platform = platform;
        this.log = platform.log;
        this.name = name;
        this.state = {};

        this.alarmAccessory = new hap.Accessory(this.name, UUIDGen.generate(this.name), hap.Accessory.Categories.ALARM_SYSTEM);

        this.accessoryInfo = this.alarmAccessory.getService(Service.AccessoryInformation);
        this.securityService = this.alarmAccessory.addService(Service.SecuritySystem);
        this.batteryService = this.alarmAccessory.addService(Service.BatteryService);

        this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "ADT");
        this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, "See ADT Smart Security app");
        this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
        this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);

        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .on("get", this.getCurrentState.bind(this))
            .setProps({validValues: [0, 1, 3]});

        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .on("set", this.setTargetState.bind(this))
            .setProps({validValues: [0, 1, 3]});

        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .on("get", this.getBatteryLevel.bind(this));

        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .on("get", this.getLowBatteryStatus.bind(this));
    }

    getBatteryLevel(callback) {
        this.log("Battery level requested");
        callback(null, this.getState().batteryLevel);
    }

    getLowBatteryStatus(callback) {
        this.log("Battery status requested");
        callback(null, this.getState().lowBatterStatus);
    }

    getCurrentState(callback) {
        this.log("Current state requested");
        callback(null, this.getState().armingState);
    }

    setTargetState(status, callback) {
        this.log("Target state set to %s", status);

        if (status !== 3 && this.getState().faultStatus) {
            callback("Can't arm system. System is not ready.");
        } else {
            this.platform.setState(statius, callback);
        }
    }

    getState() {
        return this.state;
    }

    setState(newState) {
        this.state = newState;
        this.updateCharacteristics(this.state);
    }

    updateCharacteristics(state) {
        this.log.debug("Updating characteristics to", JSON.stringify(state));

        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .updateValue(state.armingState);
        this.securityService
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .updateValue(state.targetState);
        this.securityService
            .getCharacteristic(Characteristic.StatusFault)
            .updateValue(state.faultStatus);
        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .updateValue(state.batteryLevel);
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .updateValue(state.lowBatterStatus);
    }
}

module.exports = {
    Alarm
};
