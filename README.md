# homebridge-adt-smart-security
homebridge-plugin for ADT Smart Security (https://smartsecurity.adt.com.ar/)

[![npm version](https://badge.fury.io/js/homebridge-adt-smart-security.svg)](https://badge.fury.io/js/homebridge-adt-smart-security)
[![dependencies Status](https://david-dm.org/esteban-mallen/homebridge-adt-smart-security/status.svg)](https://david-dm.org/esteban-mallen/homebridge-adt-smart-security)

### Features:

- Get and set security system status (Home, Away, Off)
- View battery level (with low battery warning)
- Support for contact sensors

## Installation:

### 1. Install homebridge and ADT Smart Security plugin.
- 1.1 `npm install -g homebridge`
- 1.2 `npm install -g homebridge-adt-smart-security`

### 2. Update homebridge configuration file.
```
{
    "platform": "ADT",
    "name": "ADT",
    "username": "user",
    "password": "pass",
    "cacheTTL": 3, //OPTIONAL
    "domain": "smartsecurity.adt.com.ar"
}
```
