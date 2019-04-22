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

        await cameraAccessory.updateFeed([camera]);

        return cameraAccessory;
    }

    static async with(camera, adt, log, hap, platformAccessory) {
        log.debug("Building new camera with name=%s", camera.name);
        let cameraAccessory = new Camera(camera, log, adt, hap, new platformAccessory(camera.name, hap.uuid.generate(camera.name), hap.Accessory.Categories.CAMERA));

        await cameraAccessory.updateFeed([camera]);

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
        this.ffmpeg;

        platformAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.cameraName)
            .setCharacteristic(Characteristic.Manufacturer, "ADT")
            .setCharacteristic(Characteristic.SerialNumber, this.cameraId);
    }

    getAccessory() {
        return this.platformAccessory;
    }

    updateFeed(state) {
        let cameraState = state.find(camera => camera.id === this.cameraId);

        if (cameraState) {
            this.log.debug('Updating camera feed', cameraState);

            this.adt.getCameraInfo(this.cameraId)
                .then(cameraInfo => {
                    this.log.debug(cameraInfo.session);
                    this.ffmpeg = new FFMPEG(this.hap, this.cameraName, cameraInfo.session.streamRtspUrl, this.log);

                    if (!this.platformAccessory.cameraSource) {
                        this.platformAccessory.configureCameraSource(this.ffmpeg);
                    } else {
                        this.platformAccessory.cameraSource = this.ffmpeg;
                    }
                });
        } else {
            this.log.warn('Camera not found');
        }
    }
}

module.exports = {
    Camera
};
