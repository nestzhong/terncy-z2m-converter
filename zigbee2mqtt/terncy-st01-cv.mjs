// Upstream candidate definition for Zigbee2MQTT:
// Terncy/Xiaoyan TERNCY-ST01-CV, RGB+CCT LED strip controller.
//
// Derived from gateway firmware reverse engineering (node-struct):
//   modelID: TERNCY-ST01-CV
//   manufacturerName: Xiaoyan
//   endpoint 1: profile 0x0104, deviceId 0x010d (Extended Color Light)
//   clusters: Basic, OnOff, LevelCtrl, ColorCtrl, OTA (no private clusters)
//
// Gateway backup entity confirms on/brightness/hue/saturation/colorTemperature,
// i.e. xy + hs + color temperature. ColorCtrl attr8 colorMode = 0x01 (XY);
// colorCapabilities (attr 7 = 0x0116) carries the standard color-temperature
// bit here, but detection is still done via the explicit range below rather
// than generic probing. 0x400C startup color temperature = 500 mireds.

import * as m from "zigbee-herdsman-converters/lib/modernExtend";
import * as reporting from "zigbee-herdsman-converters/lib/reporting";

export default {
    zigbeeModel: ["TERNCY-ST01-CV"],
    fingerprint: [{modelID: "TERNCY-ST01-CV", manufacturerName: "Xiaoyan"}],
    model: "TERNCY-ST01-CV",
    vendor: "Terncy",
    description: "RGB+CCT LED strip controller",
    extend: [
        m.light({
            colorTemp: {range: [150, 500]},
            color: {modes: ["xy", "hs"]},
            effect: false,
            powerOnBehavior: false,
        }),
    ],
    configure: async (device, coordinatorEndpoint) => {
        const endpoint = device.getEndpoint(1);
        if (!endpoint) {
            return;
        }

        try {
            await reporting.bind(endpoint, coordinatorEndpoint, ["genOnOff", "genLevelCtrl", "genColorCtrl"]);
            await reporting.onOff(endpoint);
            await reporting.brightness(endpoint);
            await reporting.colorTemperature(endpoint);
        } catch (error) {
            console.warn(`TERNCY-ST01-CV: skipped reporting setup: ${error.message}`);
        }
    },
};
