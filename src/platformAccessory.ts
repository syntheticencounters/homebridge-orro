import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { OrroPlatform } from './platform';
import { client as WebSocketClient } from 'websocket';

/**
* Platform Accessory
* An instance of this class is created for each accessory your platform registers
* Each accessory may expose multiple services of different service types.
*/
export class Switch {
    private service: Service;

    /**
    * These are just used to create a working example
    * You should implement your own code to track the state of your accessory
    */
    private state = {
        On: false,
        Brightness: 100
    };

    private connection: WebSocketClient;

    constructor(
        private readonly platform: OrroPlatform,
        private readonly accessory: PlatformAccessory,
    ) {

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Orro')
            .setCharacteristic(this.platform.Characteristic.Model, 'Switch')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.serialNumber);

        // get the LightBulb service if it exists, otherwise create a new LightBulb service
        // you can create multiple services for each accessory
        this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/Lightbulb

        // register handlers for the On/Off Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
            .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

        // register handlers for the Brightness Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.Brightness)
            .onSet(this.setBrightness.bind(this));       // SET - bind to the 'setBrightness` method below

        this.connect();
    }

    connect = async () => {

        const client = new WebSocketClient();
        client.connect(`ws://${this.accessory.context.device.ipAddress}:8080/edison/${this.platform.config.homeID}`, null, null, [{ 'offline-access-token': this.platform.config.accessToken }]);
        client.on('connect', connection => {

            // listen for system events
            connection.on('message', response => {
                try {
                    const { data } = JSON.parse(response.utf8Data);
                    const { dimmerLevel, onOff } = data || {};

                    // update on/off state if changed externally
                    if(typeof(onOff) === 'boolean' && onOff !== this.state.On) {
                        this.platform.log.debug(`Updated on to ${onOff ? 'true' : 'false'} from system event`);
                        this.state.On = onOff;
                        this.service.updateCharacteristic(this.platform.Characteristic.On, onOff);
                    }
                    // update dimmer level if changed externally
                    if(dimmerLevel >= 0 && dimmerLevel !== this.state.Brightness) {
                        this.platform.log.debug(`Updated brightness to ${dimmerLevel} from system event`);
                        this.state.Brightness = dimmerLevel;
                        this.service.updateCharacteristic(this.platform.Characteristic.Brightness, dimmerLevel);
                    }

                } catch(e) {
                    this.platform.log.error('Websocket api response error:', e.message);
                }
            });
            this.connection = connection;
        });
        client.on('error', error => {
            this.connection = null;
            this.platform.log.error('Websocket api error:', error.message);
        });
    }

    /**
    * Handle "SET" requests from HomeKit
    * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
    */
    async setOn(value: CharacteristicValue) {
        try {
            const payload = JSON.stringify({
                targetId: this.accessory.context.device.switchID,
                clientId: 'homebridge-orro',
                type: 'RemoteCommand',
                timestamp: Date.now(),
                data: {
                    command: value ? 'on' : 'off'
                }
            });
            this.connection.sendUTF(payload);
            this.state.On = value as boolean;
            this.platform.log.debug('Set Characteristic On ->', value);

        } catch(e) {
            this.platform.log.error('Set Characteristic On Error -> ', e.message);
        }
    }

    /**
    * Handle the "GET" requests from HomeKit
    * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
    *
    * GET requests should return as fast as possbile. A long delay here will result in
    * HomeKit being unresponsive and a bad user experience in general.
    *
    * If your device takes time to respond you should update the status of your device
    * asynchronously instead using the `updateCharacteristic` method instead.

    * @example
    * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
    */
    async getOn(): Promise<CharacteristicValue> {
        const isOn = this.state.On;
        this.platform.log.debug('Get Characteristic On ->', isOn);
        return isOn;
    }

    /**
    * Handle "SET" requests from HomeKit
    * These are sent when the user changes the state of an accessory, for example, changing the Brightness
    */
    async setBrightness(value: CharacteristicValue) {
        try {
            const payload = JSON.stringify({
                targetId: this.accessory.context.device.switchID,
                clientId: 'homebridge-orro',
                type: 'RemoteCommand',
                timestamp: Date.now(),
                data: {
                    command: 'dimmer_set',
                    value: value
                }
            });
            this.connection.sendUTF(payload);
            this.state.Brightness = value as number;
            this.platform.log.debug('Set Characteristic Brightness -> ', value);

        } catch(e) {
            this.platform.log.error('Set Characteristic Brightness Error -> ', e.message);
        }
    }
}
