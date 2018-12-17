let Accessory, hap;
let adt = require('./lib/adt').Adt;
let contactSensor = require('./lib/contactSensor').ContactSensor;
let securitySystem = require('./lib/securitySystem').SecuritySystem;

const smartSecurityPlatform = function (log, config, api) {
    this.log = log;
    this.name = config.name;
    this.platformAccessories = [];
    this.cachedAccessories = [];
    this.api = api;

    this.adt = new adt(config, this.log)
        .on('init', (state) => this.initialize(state));
};

smartSecurityPlatform.prototype.configureAccessory = function (accessory) {
    this.log.debug("Cached %s accessory", accessory.displayName);
    this.cachedAccessories.push(accessory.displayName);
};

smartSecurityPlatform.prototype.initialize = function (state) {
    this.platformAccessories.push(new securitySystem(this.name, this.adt, this.log, hap, Accessory));
    state.contactSensors.forEach(sensor => this.platformAccessories.push(new contactSensor(sensor.name, this.adt, this.log, hap, Accessory)));

    this.log("Initializing platform with %s accessories", this.platformAccessories.length);

    let newAccessories = this.platformAccessories
        .map(accessory => accessory.getAccessory())
        .filter(accessory => !this.cachedAccessories.includes(accessory.displayName));

    this.log("Found %s new platform accessories", newAccessories.length);

    this.api.registerPlatformAccessories("homebridge-adt-smart-security", "ADT", newAccessories);
    this.adt.on('state', (state) => this.updateState(state));
};

smartSecurityPlatform.prototype.updateState = function (state) {
    this.log.debug("Updating platform accessories with", JSON.stringify(state));
    this.platformAccessories.forEach(accessory => accessory.updateCharacteristics(state));
};

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    hap = homebridge.hap;
    homebridge.registerPlatform("homebridge-adt-smart-security", "ADT", smartSecurityPlatform, true);
};
