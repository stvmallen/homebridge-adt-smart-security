let Characteristic, Service, UUIDGen;

class ContactSensor {
    constructor(sensor, log, hap) {
        Characteristic = hap.Characteristic;
        Service = hap.Service;
        UUIDGen = hap.uuid;

        this.log = log;
        this.name = name;

        this.state = {};

        this.alarmAccessory = new hap.Accessory(this.name, UUIDGen.generate(this.name), hap.Accessory.Categories.SENSOR);

        this.accessoryInfo = this.alarmAccessory.getService(Service.AccessoryInformation);
        this.contactSensorService = this.alarmAccessory.addService(Service.ContactSensor);

        this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "ADT");
        this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, "See ADT Smart Security app");
        this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
        this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);

        this.contactSensorService.getCharacteristic(Characteristic.ContactSensorState)
            .on("get", this.getState.bind(this));
    }

    getState(callback) {
        this.log.info("Status requested");
        callback(null, this.state.status);
    }

    updateState(state) {
        this.log.debug("Updating characteristics to", JSON.stringify(state));

        this.state = state;
        this.contactSensorService.getCharacteristic(Characteristic.ContactSensorState)
            .updateValue(state.status);
    }
}

module.exports = {
    ContactSensor
};
