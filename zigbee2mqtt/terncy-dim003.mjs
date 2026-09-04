// Upstream candidate definition for Zigbee2MQTT:
// Terncy/Xiaoyan DIM003, tunable white (CCT) dimmer module.
//
// Derived from gateway firmware reverse engineering (node-struct):
//   modelID: DIM003
//   manufacturerName: Xiaoyan
//   manufacturerCode: 0x1228
//   endpoint 1: profile 0x0104, deviceId 0x010c (Color Temperature Light)
//   clusters: Basic, OnOff, LevelCtrl, ColorCtrl, Illuminance (placeholder),
//             0xfccc, 0xfccd, 0xfcce, OTA
//
// Color temperature range comes from node-struct ColorCtrl attributes
// 0x400B/0x400C (142/625 mireds). The reported colorCapabilities (attr 7 =
// 0x008e) is a manufacturer placeholder missing the color-temperature bit,
// and colorTempPhysicalMin/Max (attrs 3/4 = 24939/24701) are garbage
// constants, so color_temp is exposed explicitly instead of relying on
// generic light capability detection.

import * as m from "zigbee-herdsman-converters/lib/modernExtend";
import * as reporting from "zigbee-herdsman-converters/lib/reporting";

export default {
    zigbeeModel: ["DIM003"],
    fingerprint: [{modelID: "DIM003", manufacturerName: "Xiaoyan"}],
    model: "DIM003",
    vendor: "Terncy",
    description: "Tunable white (CCT) dimmer module",
    extend: [m.light({colorTemp: {range: [142, 625]}, effect: false, powerOnBehavior: false})],
    configure: async (device, coordinatorEndpoint) => {
        const endpoint = device.getEndpoint(1);
        if (!endpoint) {
            return;
        }

        try {
            await reporting.bind(endpoint, coordinatorEndpoint, ["genOnOff", "genLevelCtrl"]);
            await reporting.onOff(endpoint);
            await reporting.brightness(endpoint);
        } catch (error) {
            console.warn(`DIM003: skipped reporting setup: ${error.message}`);
        }
    },
};
