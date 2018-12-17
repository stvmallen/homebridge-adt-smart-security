let Accessory = require("hap-nodejs").Accessory;
let PlatformAccessory, Characteristic, Service, UUIDGen;

class ContactSensor {
    constructor(name, adt, log, hap, platformAccessory) {
        PlatformAccessory = platformAccessory;
        Characteristic = hap.Characteristic;
        Service = hap.Service;
        UUIDGen = hap.uuid;

        this.log = log;
        this.name = name;
        this.adt = adt;

        this.platformAccessory = new PlatformAccessory(name, UUIDGen.generate(name), Accessory.Categories.SENSOR);

        this.platformAccessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'ADT')
            .setCharacteristic(Characteristic.SerialNumber, 'See ADT Smart Security app');

        this.contactSensorService = this.platformAccessory.addService(Service.ContactSensor, this.name);

        this.contactSensorService.getCharacteristic(Characteristic.ContactSensorState)
            .on('get', this.getState.bind(this));
    }

    getAccessory() {
        return this.platformAccessory;
    }

    getState(callback) {
        this.adt.getState()
            .then((state) => {
                let status = state ? this.getStatusFromSystemState(state) : state;

                callback(null, status);
            })
            .catch((error) => {
                this.log.error(error);
                callback(error);
            });
    }

    updateCharacteristics(newState) {
        let contactSensorStatus = this.getStatusFromSystemState(newState);

        this.log.debug('Updating %s contact sensor characteristics to', this.name, JSON.stringify(contactSensorStatus));

        this.contactSensorService
            .getCharacteristic(Characteristic.ContactSensorState)
            .updateValue(contactSensorStatus);
    }

    getStatusFromSystemState(systemState) {
        let contactSensor = systemState.contactSensors
            .find(contactSensor => contactSensor.name === this.name);

        return contactSensor ? contactSensor.status : null;
    }
}

module.exports = {
    ContactSensor
};
