let Accessory, hap;
let adt = require('./lib/adt').Adt;
let contactSensor = require('./lib/contactSensor').ContactSensor;
let securitySystem = require('./lib/securitySystem').SecuritySystem;
let camera = require('./lib/camera').Camera;

const smartSecurityPlatform = function (log, config, api) {
    this.log = log;
    this.name = config.name;
    this.platformAccessories = [];
    this.cachedAccessories = [];
    this.cachedCameraAccessories = [];
    this.cameraAccesories = [];
    this.api = api;

    this.adt = new adt(config, this.log)
        .on('init', (state) => this.initialize(state));
};

smartSecurityPlatform.prototype.configureAccessory = function (accessory) {
    this.log.debug("Refreshing cached accessory", accessory.displayName);
    let platformAccessory;

    if (accessory.category === hap.Accessory.Categories.SECURITY_SYSTEM) {
        platformAccessory = securitySystem.from(accessory, this.adt, this.log, hap);
    } else if (accessory.category === hap.Accessory.Categories.SENSOR) {
        platformAccessory = contactSensor.from(accessory, this.log, hap);
    } else if (accessory.category === hap.Accessory.Categories.CAMERA) {
        this.cachedCameraAccessories.push(camera.from(accessory, this.adt, this.log, hap));
    } else {
        throw new Error("Cannot refresh cached accessory with category " + accessory.category);
    }

    this.cachedAccessories.push(platformAccessory);
};

smartSecurityPlatform.prototype.initialize = function (state) {
    this.platformAccessories = this.cachedAccessories;

    let newAccessories = [];

    if (!this.platformAccessories.some(cached => cached.name === this.name)) {
        let newSecuritySystem = securitySystem.with(this.name, this.adt, this.log, hap, Accessory);
        this.platformAccessories.push(newSecuritySystem);
        newAccessories.push(newSecuritySystem);
    }

    state.contactSensors
        .filter(sensor => !this.platformAccessories.some(cached => cached.name === sensor.name))
        .forEach(sensor => {
            let newContactSensor = contactSensor.with(sensor, this.log, hap, Accessory);

            this.platformAccessories.push(newContactSensor);
            newAccessories.push(newContactSensor);
        });

    this.log("Initializing platform with %s accessories", this.platformAccessories.length);
    this.log("Found %s new platform accessories", newAccessories.length);

    this.api.registerPlatformAccessories("homebridge-adt-smart-security", "ADT", newAccessories.map(accessory => accessory.getAccessory()));

    this.setupCameras(state.cameras);

    this.adt.on('state', (state) => this.updateState(state));
};

smartSecurityPlatform.prototype.setupCameras = async function (cameras) {
    this.cameraAccesories = this.cachedCameraAccessories;

    cameras
        .filter(cam => !this.cachedCameraAccessories.some(cached => cached.name === cam.name))
        .forEach(cam => {
            let newCamera = camera.with(cam, this.adt, this.log, hap, Accessory);

            this.cameraAccesories.push(newCamera);
        });

    Promise.all(this.cameraAccesories)
        .then((cameras) => {
            this.log('Publishing %s cameras (%s cached)', this.cameraAccesories.length, this.cachedCameraAccessories.length);

            this.cameraAccesories = cameras;

            this.api.publishCameraAccessories("homebridge-adt-smart-security", this.cameraAccesories.map(camera => camera.getAccessory()));
        });
};

smartSecurityPlatform.prototype.updateState = function (state) {
    this.log.debug("Updating platform accessories with", JSON.stringify(state));
    this.platformAccessories.forEach(accessory => accessory.updateCharacteristics(state));
    this.cameraAccesories.forEach(camera => camera.updateFeed(state.cameras));
};

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    hap = homebridge.hap;
    homebridge.registerPlatform("homebridge-adt-smart-security", "ADT", smartSecurityPlatform, true);
};
