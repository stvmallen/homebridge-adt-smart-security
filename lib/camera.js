let Characteristic, Service;
let FFMPEG = require('./FFMPEG').FFMPEG;

class Camera {
    static async from(cachedAccessory, adt, log, hap) {
        log.debug("Building camera from cachedAccessory=%s", cachedAccessory.displayName);
        let cameraName = cachedAccessory.getService(Service.AccessoryInformation)
            .getCharacteristic(Characteristic.Name);
        let cameraId = cachedAccessory.getService(Service.AccessoryInformation)
            .getCharacteristic(Characteristic.SerialNumber);

        let camera = {
            cameraName: cameraName,
            cameraId: cameraId
        };

        let cameraAccessory = new Camera(camera, log, adt, hap, cachedAccessory);

        await cameraAccessory.configureCameraSource();

        return cameraAccessory;
    }

    static async with(camera, adt, log, hap, platformAccessory) {
        log.debug("Building new camera with name=%s", camera.name);
        let cameraAccessory = new Camera(camera, log, adt, hap, new platformAccessory(camera.name, hap.uuid.generate(camera.name), hap.Accessory.Categories.CAMERA));

        await cameraAccessory.configureCameraSource();

        return cameraAccessory;
    }

    constructor(camera, log, adt, hap, platformAccessory) {
        Characteristic = hap.Characteristic;
        Service = hap.Service;

        this.platformAccessory = platformAccessory;
        this.log = log;
        this.adt = adt;
        this.cameraName = camera.name;
        this.cameraId = camera.id;
        this.hap = hap;

        platformAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.cameraName)
            .setCharacteristic(Characteristic.Manufacturer, "ADT")
            .setCharacteristic(Characteristic.SerialNumber, this.cameraId);
    }

    getAccessory() {
        return this.platformAccessory;
    }

    configureCameraSource() {
        this.platformAccessory.configureCameraSource(new FFMPEG(this.hap, this.cameraName, this.getStartFeedSupplier.bind(this),
            this.getStopFeedSupplier.bind(this), this.getImage.bind(this), this.getCachedImage.bind(this), this.log));
    }

    async getStartFeedSupplier() {
        this.log.debug('Supplying camera feed');
        return await this.adt.startFeed(this.cameraId);
    }

    async getStopFeedSupplier() {
        this.log.debug('Stopping camera feed');
        return await this.adt.stopFeed(this.cameraId);
    }

    async getImage() {
        this.log('Getting still image');
        return await this.adt.getImage(this.cameraId);
    }

    async getCachedImage() {
        this.log.warn('Getting cached image');
        return await this.adt.getExistingImage(this.cameraId);
    }
}

module.exports = {
    Camera
};
