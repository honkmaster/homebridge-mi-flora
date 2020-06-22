var MiFlora = require('node-mi-flora-classic-updated');

var Service, Characteristic, HomebridgeAPI, FakeGatoHistoryService;
var inherits = require('util').inherits;
var os = require("os");
var hostname = os.hostname();

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;
    FakeGatoHistoryService = require("fakegato-history")(homebridge);

    homebridge.registerAccessory("homebridge-mi-flower-care", "mi-flower-care", MiFlowerCarePlugin);
};

function MiFlowerCarePlugin(log, config) {
    var that = this;
    this.log = log;
    this.name = config.name;
    this.displayName = this.name;
    this.deviceId = config.deviceId;
    this.interval = Math.min(Math.max(config.interval, 1), 600);

    this.config = config;

    this.storedData = {};

    if (config.humidityAlertLevel != null) {
        this.humidityAlert = true;
        this.humidityAlertLevel = config.humidityAlertLevel;
    } else {
        this.humidityAlert = false;
    }

    if (config.lowLightAlertLevel != null) {
        this.lowLightAlert = true;
        this.lowLightAlertLevel = config.lowLightAlertLevel;
    } else {
        this.lowLightAlert = false;
    }

    if (config.lowBatteryWarningLevel != null && typeof config.lowBatteryWarningLevel === "number") {
        this.lowBatteryWarningLevel = config.lowBatteryWarningLevel;
    } else {
        this.lowBatteryWarningLevel = 10;
    }

    // Setup services
    this.setUpServices();

    // Setup MiFlora
    this.flora = new MiFlora(this.deviceId);

    this.flora.on('data', function (data) {
        if (data.deviceId = that.deviceId) {
            that.log("Lux: %s, Temperature: %s, Moisture: %s, Fertility: %s", data.lux, data.temperature, data.moisture, data.fertility);
            that.storedData.data = data;

            that.fakeGatoHistoryService.addEntry({
                time: new Date().getTime() / 1000,
                temp: data.temperature,
                humidity: data.moisture
            });

            that.lightService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .updateValue(data.lux);
            that.lightService.getCharacteristic(Characteristic.StatusActive)
                .updateValue(true);

            that.tempService.getCharacteristic(Characteristic.CurrentTemperature)
                .updateValue(data.temperature);
            that.tempService.getCharacteristic(Characteristic.StatusActive)
                .updateValue(true);

            that.humidityService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                .updateValue(data.moisture);
            that.humidityService.getCharacteristic(Characteristic.StatusActive)
                .updateValue(true);

            if (that.humidityAlert) {
                that.humidityAlertService.getCharacteristic(Characteristic.ContactSensorState)
                    .updateValue(data.moisture <= that.humidityAlertLevel ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
                that.humidityAlertService.getCharacteristic(Characteristic.StatusActive)
                    .updateValue(true);
            }

            if (that.lowLightAlert) {
                that.lowLightAlertService.getCharacteristic(Characteristic.ContactSensorState)
                    .updateValue(data.lux <= that.lowLightAlertLevel ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
                that.lowLightAlertService.getCharacteristic(Characteristic.StatusActive)
                    .updateValue(true);
            }
        }
    });

    this.flora.on('firmware', function (data) {
        if (data.deviceId = that.deviceId) {
            that.log("Firmware: %s, Battery level: %s", data.firmwareVersion, data.batteryLevel);
            that.storedData.firmware = data;

            // Update values
            that.informationService.getCharacteristic(Characteristic.FirmwareRevision)
                .updateValue(data.firmwareVersion);

            that.batteryService.getCharacteristic(Characteristic.BatteryLevel)
                .updateValue(data.batteryLevel);
            that.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
                .updateValue(data.batteryLevel <= that.lowBatteryWarningLevel ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);

            that.lightService.getCharacteristic(Characteristic.StatusLowBattery)
                .updateValue(data.batteryLevel <= that.lowBatteryWarningLevel ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);

            that.tempService.getCharacteristic(Characteristic.StatusLowBattery)
                .updateValue(data.batteryLevel <= that.lowBatteryWarningLevel ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);

            that.humidityService.getCharacteristic(Characteristic.StatusLowBattery)
                .updateValue(data.batteryLevel <= that.lowBatteryWarningLevel ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);

            if (that.humidityAlert) {
                that.humidityAlertService.getCharacteristic(Characteristic.StatusLowBattery)
                    .updateValue(data.batteryLevel <= that.lowBatteryWarningLevel ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
            }

            if (that.lowLightAlert) {
                that.lowLightAlertService.getCharacteristic(Characteristic.StatusLowBattery)
                    .updateValue(data.batteryLevel <= that.lowBatteryWarningLevel ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
            }
        }
    });

    setInterval(function () {
        // Start scanning for updates, these will arrive in the corresponding callbacks
        that.flora.startScanning();

        // Stop scanning 100ms before we start a new scan
        setTimeout(function () {
            that.flora.stopScanning();
        }, (that.interval - 0.1) * 1000)
    }, this.interval * 1000);
}

MiFlowerCarePlugin.prototype.getFirmwareRevision = function (callback) {
    callback(null, this.storedData.firmware ? this.storedData.firmware.firmwareVersion : '0.0.0');
};

MiFlowerCarePlugin.prototype.getBatteryLevel = function (callback) {
    callback(null, this.storedData.firmware ? this.storedData.firmware.batteryLevel : 0);
};

MiFlowerCarePlugin.prototype.getStatusActive = function (callback) {
    callback(null, this.storedData.data ? true : false);
};

MiFlowerCarePlugin.prototype.getStatusLowBattery = function (callback) {
    if (this.storedData.firmware) {
        callback(null, this.storedData.firmware.batteryLevel <= 20 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    } else {
        callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    }
};

MiFlowerCarePlugin.prototype.getStatusLowMoisture = function (callback) {
    if (this.storedData.data) {
        callback(null, this.storedData.data.moisture <= this.humidityAlertLevel ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
    } else {
        callback(null, Characteristic.ContactSensorState.CONTACT_DETECTED);
    }
};

MiFlowerCarePlugin.prototype.getStatusLowLight = function (callback) {
    if (this.storedData.data) {
        callback(null, this.storedData.data.lux <= this.lowLightAlertLevel ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
    } else {
        callback(null, Characteristic.ContactSensorState.CONTACT_DETECTED);
    }
};

MiFlowerCarePlugin.prototype.getCurrentAmbientLightLevel = function (callback) {
    callback(null, this.storedData.data ? this.storedData.data.lux : 0);
};

MiFlowerCarePlugin.prototype.getCurrentTemperature = function (callback) {
    callback(null, this.storedData.data ? this.storedData.data.temperature : 0);
};

MiFlowerCarePlugin.prototype.getCurrentMoisture = function (callback) {
    callback(null, this.storedData.data ? this.storedData.data.moisture : 0);
};

MiFlowerCarePlugin.prototype.getCurrentFertility = function (callback) {
    callback(null, this.storedData.data ? this.storedData.data.fertility : 0);
};


MiFlowerCarePlugin.prototype.setUpServices = function () {
    // info service
    this.informationService = new Service.AccessoryInformation();

    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, this.config.manufacturer || "Xiaomi")
        .setCharacteristic(Characteristic.Model, this.config.model || "Flower Care")
        .setCharacteristic(Characteristic.SerialNumber, this.config.serial || hostname + "-" + this.name);
    this.informationService.getCharacteristic(Characteristic.FirmwareRevision)
        .on('get', this.getFirmwareRevision.bind(this));

    this.batteryService = new Service.BatteryService(this.name);
    this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.getBatteryLevel.bind(this));
    this.batteryService.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));

    this.lightService = new Service.LightSensor(this.name);
    this.lightService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .on('get', this.getCurrentAmbientLightLevel.bind(this));
    this.lightService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));
    this.lightService.getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this));

    this.tempService = new Service.TemperatureSensor(this.name);
    this.tempService.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getCurrentTemperature.bind(this));
    this.tempService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));
    this.tempService.getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this));

    this.humidityService = new Service.HumiditySensor(this.name);
    this.humidityService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.getCurrentMoisture.bind(this));
    this.humidityService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));
    this.humidityService.getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this));

    if (this.humidityAlert) {
        this.humidityAlertService = new Service.ContactSensor(this.name + " Low Humidity", "humidity");
        this.humidityAlertService.getCharacteristic(Characteristic.ContactSensorState)
            .on('get', this.getStatusLowMoisture.bind(this));
        this.humidityAlertService.getCharacteristic(Characteristic.StatusLowBattery)
            .on('get', this.getStatusLowBattery.bind(this));
        this.humidityAlertService.getCharacteristic(Characteristic.StatusActive)
            .on('get', this.getStatusActive.bind(this));
    }

    if (this.lowLightAlert) {
        this.lowLightAlertService = new Service.ContactSensor(this.name + " Low Light", "light");
        this.lowLightAlertService.getCharacteristic(Characteristic.ContactSensorState)
            .on('get', this.getStatusLowLight.bind(this));
        this.lowLightAlertService.getCharacteristic(Characteristic.StatusLowBattery)
            .on('get', this.getStatusLowBattery.bind(this));
        this.lowLightAlertService.getCharacteristic(Characteristic.StatusActive)
            .on('get', this.getStatusActive.bind(this));
    }

    this.fakeGatoHistoryService = new FakeGatoHistoryService("room", this, { storage: 'fs' });

    /*
        own characteristics and services
    */

    // moisture characteristic
    SoilMoisture = function () {
        Characteristic.call(this, 'Soil Moisture', 'C160D589-9510-4432-BAA6-5D9D77957138');
        this.setProps({
            format: Characteristic.Formats.UINT8,
            unit: Characteristic.Units.PERCENTAGE,
            maxValue: 100,
            minValue: 0,
            minStep: 0.1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };

    inherits(SoilMoisture, Characteristic);

    SoilMoisture.UUID = 'C160D589-9510-4432-BAA6-5D9D77957138';


    // fertility characteristic
    SoilFertility = function () {
        Characteristic.call(this, 'Soil Fertility', '0029260E-B09C-4FD7-9E60-2C60F1250618');
        this.setProps({
            format: Characteristic.Formats.UINT8,
            maxValue: 10000,
            minValue: 0,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };

    inherits(SoilFertility, Characteristic);

    SoilFertility.UUID = '0029260E-B09C-4FD7-9E60-2C60F1250618';


    // moisture sensor
    PlantSensor = function (displayName, subtype) {
        Service.call(this, displayName, '3C233958-B5C4-4218-A0CD-60B8B971AA0A', subtype);

        // Required Characteristics
        this.addCharacteristic(SoilMoisture);

        // Optional Characteristics
        this.addOptionalCharacteristic(Characteristic.CurrentTemperature);
        this.addOptionalCharacteristic(SoilFertility);
    };

    inherits(PlantSensor, Service);

    PlantSensor.UUID = '3C233958-B5C4-4218-A0CD-60B8B971AA0A';

    this.plantSensorService = new PlantSensor(this.name);
    this.plantSensorService.getCharacteristic(SoilMoisture)
        .on('get', this.getCurrentMoisture.bind(this));
    this.plantSensorService.getCharacteristic(SoilFertility)
        .on('get', this.getCurrentFertility.bind(this));
};

MiFlowerCarePlugin.prototype.getServices = function () {
    var services = [this.informationService, this.batteryService, this.lightService, this.tempService, this.humidityService, this.plantSensorService, this.fakeGatoHistoryService];
    if (this.humidityAlert) {
        services[services.length] = this.humidityAlertService;
    }
    if (this.lowLightAlert) {
        services[services.length] = this.lowLightAlertService;
    }
    return services;
};
