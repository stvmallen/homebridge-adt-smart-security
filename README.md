# homebridge-nubicam
homebridge-plugin for Nubicam (www.nubicam.com.ar)

[![npm version](https://badge.fury.io/js/homebridge-adt-smart-security.svg)](https://badge.fury.io/js/homebridge-adt-smart-security)
[![dependencies Status](https://david-dm.org/esteban-mallen/homebridge-adt-smart-security/status.svg)](https://david-dm.org/esteban-mallen/homebridge-adt-smart-security)

### Features:

- Get and set security system status (Home, Away, Off)
- View battery level

## Installation:

### 1. Install homebridge and Nubicam plugin.
- 1.1 `npm install -g homebridge`
- 1.2 `npm install -g homebridge-adt-smart-security`

### 2. Update homebridge configuration file.
```
{
    "accessory": "ADT",
    "name": "ADT",
    "username": "user",
    "password": "pass",
    "cacheTTL": 3, //OPTIONAL
    "domain": "smartsecurity.adt.com.ar"
}
```
