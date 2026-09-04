// Terncy/Xiaoyan TERNCY-VG01 VRV air conditioner gateway.
//
// Derived from gateway firmware reverse engineering (node-struct + Zhh/VRV
// protocol reconstruction in XYAN_PROTOCOL_MAP.md section 8):
//   modelID: TERNCY-VG01
//   manufacturerName: Xiaoyan
//   manufacturerCode: 0x1228
//   endpoint 1: profile 260, deviceID 0x01f3
//     server clusters: Basic, Identify, Groups, Scenes, 0xfccc, 0xfddd
//     client clusters: OTA
//
// The VG01 is not an IR blaster: it is a VRV central-AC gateway. Multiple
// indoor units ("ZhhUnit", up to 5 in the gateway backup sample) hang off one
// VG01. All HVAC traffic uses private cluster 0xfddd:
//
//   downlink (coordinator -> VG01):
//     cmd 0x01 VrvZhhGeneralControl [a, b, len, data...]
//       sub-command 0x31 = zhh-running (on/off)
//       sub-command 0x32 = ac-target-temp
//       sub-command 0x33 = ac-work-mode
//       sub-command 0x34 = ac-fan-speed
//     cmd 0x07 VrvGetZhhUnits [u8, u8]
//
//   uplink (VG01 -> coordinator):
//     cmd 0x09 UpdateZhhUnit
//       payload: [0]=addr_hi [1]=addr_lo [2]=online [3]=running
//                [4]=targetTemp [5]=currentTemp [6]=fanSpeed
//                [7]=workMode [8]=errorCode
//     cmd 0x0A GetZhhUnitsResponse (unit list, 70 bytes per entry)
//
// Current status: REPORT-ONLY.
//   - fromZigbee parses command 0x09 frames and publishes per-unit state keys
//     such as unit_0101_running / unit_0101_local_temperature, where 0101 is
//     the unit address (high byte = group, low byte = unit number).
//   - Downlink control frames are NOT sent yet: the GeneralControl a/b
//     addressing fields and the work-mode/fan-speed enum values still need an
//     over-the-air sniff of one real AC operation before they can be trusted.
//     The manufacturer code that will be needed is 0x1228.
//   - 0x0A unit-list responses are not parsed yet (layout only partially
//     reconstructed).

import * as m from "zigbee-herdsman-converters/lib/modernExtend";

const VRV_CLUSTER = 0xfddd;

const UPDATE_ZHH_UNIT_CMD = 0x09;

function toHexByte(value) {
    return value.toString(16).padStart(2, "0");
}

const fzLocal = {
    terncyVg01UnitReport: {
        cluster: "terncyVrvAirConditioner",
        type: "raw",
        convert: (model, msg, publish, options, meta) => {
            const data = [...msg.data];
            if (data.length < 5) {
                return;
            }

            // Two possible ZCL layouts have been observed for Xiaoyan
            // manufacturer traffic; handle both defensively because the VG01
            // report path has not been sniffed directly yet.
            let cmd;
            let payload;

            if (data[0] & 0x04 && data[1] === 0x28 && data[2] === 0x12) {
                // Manufacturer-specific frame: [fc, mfg le16, seq, cmd, payload...]
                cmd = data[4];
                payload = data.slice(5);
            } else {
                // Plain cluster-specific frame: [fc, seq, cmd, payload...]
                cmd = data[2];
                payload = data.slice(3);
            }

            if (cmd !== UPDATE_ZHH_UNIT_CMD || payload.length < 9) {
                return;
            }

            const addr = `${toHexByte(payload[0])}${toHexByte(payload[1])}`;
            const prefix = `unit_${addr}`;

            return {
                [`${prefix}_online`]: payload[2] === 1,
                [`${prefix}_running`]: payload[3] === 1,
                [`${prefix}_target_temperature`]: payload[4],
                [`${prefix}_local_temperature`]: payload[5],
                [`${prefix}_fan_speed`]: payload[6],
                [`${prefix}_work_mode`]: payload[7],
                [`${prefix}_error_code`]: payload[8],
            };
        },
    },
};

export default {
    zigbeeModel: ["TERNCY-VG01"],
    fingerprint: [{modelID: "TERNCY-VG01", manufacturerName: "Xiaoyan"}],
    model: "TERNCY-VG01",
    vendor: "Terncy",
    description: "VRV air conditioner gateway (report-only)",
    extend: [
        m.deviceAddCustomCluster("terncyVrvAirConditioner", {
            name: "terncyVrvAirConditioner",
            ID: VRV_CLUSTER,
            attributes: {
                state: {name: "state", ID: 0x0000, type: 0x20},
                zhhQueryState: {name: "zhhQueryState", ID: 0x0001, type: 0x20},
            },
            commands: {
                // Reconstructed from firmware; not sent by this converter yet.
                generalControl: {
                    name: "generalControl",
                    ID: 0x01,
                    parameters: [
                        {name: "a", type: 0x20},
                        {name: "b", type: 0x20},
                        {name: "len", type: 0x20},
                        {name: "data", type: 0x41},
                    ],
                },
                getZhhUnits: {
                    name: "getZhhUnits",
                    ID: 0x07,
                    parameters: [
                        {name: "a", type: 0x20},
                        {name: "b", type: 0x20},
                    ],
                },
            },
            commandsResponse: {},
        }),
    ],
    fromZigbee: [fzLocal.terncyVg01UnitReport],
    toZigbee: [],
    exposes: [],
    meta: {},
    configure: async (device, coordinatorEndpoint) => {
        // The gateway firmware polls VG01 periodically (cmd 0x07 / 0x09);
        // nothing is configured here until the control path is sniffed.
    },
};
