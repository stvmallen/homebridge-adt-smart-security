let Characteristic, Service;

class ContactSensor {
    static from(cachedAccessory, log, hap) {
        log.debug("Building contact sensor from cachedAccessory=%s", cachedAccessory.displayName);

        Characteristic = hap.Characteristic;
        Service = hap.Service;

        return new ContactSensor(cachedAccessory.displayName, undefined, log, cachedAccessory);
    }

    static with(sensorInfo, log, hap, platformAccessory) {
        log.debug("Building new contact sensor with name=%s", sensorInfo.name);

        Characteristic = hap.Characteristic;
        Service = hap.Service;

        return new ContactSensor(sensorInfo.name, sensorInfo.status, log, new platformAccessory(sensorInfo.name, hap.uuid.generate(sensorInfo.name), hap.Accessory.Categories.SENSOR));
    }

    constructor(name, status, log, platformAccessory) {
        this.name = name;
        this.log = log;
        this.platformAccessory = platformAccessory;
        this.contactSensorService = this.platformAccessory.getService(Service.ContactSensor) || this.platformAccessory.addService(Service.ContactSensor, this.name);

        this.log.debug("Initializing characteristics for", this.name);

        this.platformAccessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'ADT')
            .setCharacteristic(Characteristic.SerialNumber, 'See ADT Smart Security app');

        this.contactSensorService
            .getCharacteristic(Characteristic.ContactSensorState)
            .on('get', this.getState.bind(this));

        this.state = status;
    }

    getAccessory() {
        return this.platformAccessory;
    }

    getState(callback) {
        callback(null, this.state);
    }

    updateCharacteristics(newState) {
        let contactSensorStatus = this.getStatusFromSystemState(newState);

        this.log.debug('Updating %s contact sensor characteristics to', this.name, JSON.stringify(contactSensorStatus));

        this.state = contactSensorStatus ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

        this.contactSensorService
            .getCharacteristic(Characteristic.ContactSensorState)
            .updateValue(this.state);
    }

    getStatusFromSystemState(systemState) {
        let contactSensor;

        if (systemState) {
            contactSensor = systemState.contactSensors
                .find(contactSensor => contactSensor.name === this.name);
        }

        return contactSensor ? contactSensor.status : null;
    }
}

module.exports = {
    ContactSensor
};
