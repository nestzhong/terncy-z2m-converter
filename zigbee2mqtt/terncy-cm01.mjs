// Upstream candidate definition for Zigbee2MQTT:
// Terncy/Xiaoyan TERNCY-CM01 curtain motor.
//
// Derived from gateway firmware reverse engineering (node-struct + disassembly),
// cross-validated against live on-air captures (GW2, network-key decrypted):
//   modelID: TERNCY-CM01
//   manufacturerName: Xiaoyan (the node-struct Basic cluster lacks attr4;
//     the physical device is still expected to report Xiaoyan, and the
//     zigbeeModel fallback keeps pairing working if it does not)
//   manufacturerCode: 0x1228
//   endpoint 1: profile 0x0104, deviceId 0x0202 (Window Covering)
//   clusters: Basic, WindowCovering 0x0102, 0xfccc, OTA
//
// Verified over the air (captures/GW2/TERNCY-CM01, 2026-09-05):
//   * The app drives position with the standard WindowCovering command
//     GoToLiftPercentage (zigbee-herdsman ID 0x05), one-byte payload,
//     where 0 = fully closed and 100 = fully open ("percent open").
//     Normal open/close are GoToLiftPercentage(100)/(0); UpOpen/DownClose
//     are only used by the app during trip calibration.
//   * This device therefore uses the INVERTED convention versus the ZCL
//     spec (spec: 0=open, 100=closed) for BOTH the command payload and the
//     CurrentPositionLiftPercentage attribute (attr 8 flips 100<->0 when the
//     motor direction is reversed without moving, consistent with percent
//     open). z2m's stock cover converters assume the spec convention and
//     their invert_cover/coverInverted options would additionally swap the
//     UpOpen/DownClose commands (which are correct as-is on this device),
//     so position/state are handled by local converters below instead.
//   * Movement/position updates are pushed via the private cluster 0xfccc,
//     manufacturer code 0x1228, cluster-specific command 0x26 (server to
//     client), payload: [motorStatus(u8), currentPosition(u8)] where
//     motorStatus 0=stopped, 1=opening, 2=closing and currentPosition is
//     percent open (255 while trip positions are not configured).
//   * Stop is the standard WindowCovering Stop command.
//   * Trip calibration flow used by the app: DeleteAllTrip (0xfccc cmd 9)
//     -> DownClose -> UpOpen; during it the device reports tripConfigured
//     (0xfccc attr 0x14) 0 then 1, and position reads 255 until done.
//   * SetDirection is 0xfccc cmd 12 (payload u8: 0=normal, 1=reversed);
//     the device answers with a manufacturer Default Response, and the
//     stored position flips (re-anchored to the new open end).
//
// Private 0xfccc curtain attribute block (disassembly-confirmed):
//   0x11 motorDirection, 0x12 motorStatus, 0x14 tripConfigured (report
//   verified), 0x15 motorType, 0x18 ledIndicator (read verified). Attrs
//   0x13/0x16 are unknown and stay unexposed.
// Private curtain commands (mfg code 0x1228 unless noted):
//   9 DeleteAllTrip (verified), 10 FactoryRecovery, 12 SetDirection
//   (verified; clears trip positions, same behavior as the Terncy app),
//   22 ConfigIndicatorLed (no manufacturer code). Not exposed yet:
//   17 SetDragging, 25/27 trip positions, 36 boundary, 37 timeout control,
//   40 startMoving.

import * as fz from "zigbee-herdsman-converters/converters/fromZigbee";
import * as tz from "zigbee-herdsman-converters/converters/toZigbee";
import * as exposes from "zigbee-herdsman-converters/lib/exposes";
import * as m from "zigbee-herdsman-converters/lib/modernExtend";
import * as reporting from "zigbee-herdsman-converters/lib/reporting";

const e = exposes.presets;
const ea = exposes.access;

const XIAOYAN_CLUSTER = 0xfccc;
const XIAOYAN_MANUFACTURER_CODE = 0x1228;

const READABLE_ATTRIBUTES = {
    motor_status: "curtainMotorStatus",
    trip_configured: "curtainTripConfigured",
    motor_type: "curtainMotorType",
};

const MOTOR_STATE_LOOKUP = {0: "stopped", 1: "opening", 2: "closing"};

const fzLocal = {
    // Device reports CurrentPositionLiftPercentage as percent OPEN
    // (100 = open), unlike the ZCL spec; no inversion here.
    terncyCoverPosition: {
        cluster: "closuresWindowCovering",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const value = msg.data.currentPositionLiftPercentage;
            if (value === undefined || value > 100) {
                return;
            }
            return {position: value, state: value > 0 ? "OPEN" : "CLOSE"};
        },
    },
    // Private motor report: 0xfccc cmd 0x26, payload [status, position(open%)].
    terncyMotorReport: {
        cluster: "manuSpecificClusterAduroSmart",
        type: ["commandMotorReport"],
        convert: (model, msg, publish, options, meta) => {
            const result = {};
            const {motorstatus, currentposition} = msg.data;
            if (motorstatus !== undefined && MOTOR_STATE_LOOKUP[motorstatus] !== undefined) {
                result.motor_state = MOTOR_STATE_LOOKUP[motorstatus];
            }
            if (currentposition !== undefined && currentposition <= 100) {
                result.position = currentposition;
                result.state = currentposition > 0 ? "OPEN" : "CLOSE";
            }
            return result;
        },
    },
    terncyCurtainAttributes: {
        cluster: "manuSpecificClusterAduroSmart",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result = {};

            if (msg.data.curtainMotorDirection !== undefined) {
                result.motor_direction = msg.data.curtainMotorDirection;
            }

            if (msg.data.curtainMotorStatus !== undefined) {
                result.motor_status = msg.data.curtainMotorStatus;
            }

            if (msg.data.curtainTripConfigured !== undefined) {
                result.trip_configured = msg.data.curtainTripConfigured;
            }

            if (msg.data.curtainMotorType !== undefined) {
                result.motor_type = msg.data.curtainMotorType;
            }

            return result;
        },
    },
};

const tzLocal = {
    // Position/state use percent OPEN directly (0 = closed, 100 = open),
    // mirroring the Terncy app; no invert_cover involved.
    terncyCoverSet: {
        key: ["state", "position"],
        convertSet: async (entity, key, value, meta) => {
            if (key === "position") {
                const position = Number(value);
                await entity.command(
                    "closuresWindowCovering",
                    "goToLiftPercentage",
                    {percentageliftvalue: position},
                    {disableDefaultResponse: false},
                );
                return {state: {position, state: position > 0 ? "OPEN" : "CLOSE"}};
            }

            const state = String(value).toLowerCase();
            if (state === "stop") {
                await entity.command("closuresWindowCovering", "stop", {}, {disableDefaultResponse: false});
                return;
            }

            const position = state === "open" ? 100 : 0;
            await entity.command(
                "closuresWindowCovering",
                "goToLiftPercentage",
                {percentageliftvalue: position},
                {disableDefaultResponse: false},
            );
            return {state: {position, state: position > 0 ? "OPEN" : "CLOSE"}};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read("closuresWindowCovering", ["currentPositionLiftPercentage"]);
        },
    },
    terncyCurtainMotorDirection: {
        key: ["motor_direction"],
        convertSet: async (entity, key, value, meta) => {
            const direction = Number(value);
            await entity.command(
                "manuSpecificClusterAduroSmart",
                "setDirection",
                {direction},
                {manufacturerCode: XIAOYAN_MANUFACTURER_CODE, disableDefaultResponse: false},
            );
            return {state: {[key]: direction}};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read(
                "manuSpecificClusterAduroSmart",
                ["curtainMotorDirection"],
                {manufacturerCode: XIAOYAN_MANUFACTURER_CODE},
            );
        },
    },
    terncyCurtainReadableAttributes: {
        key: Object.keys(READABLE_ATTRIBUTES),
        convertGet: async (entity, key, meta) => {
            await entity.read(
                "manuSpecificClusterAduroSmart",
                [READABLE_ATTRIBUTES[key]],
                {manufacturerCode: XIAOYAN_MANUFACTURER_CODE},
            );
        },
    },
    terncyCurtainDeleteAllTrip: {
        key: ["delete_all_trip"],
        convertSet: async (entity, key, value, meta) => {
            await entity.command(
                "manuSpecificClusterAduroSmart",
                "deleteAllTrip",
                {},
                {manufacturerCode: XIAOYAN_MANUFACTURER_CODE, disableDefaultResponse: false},
            );
        },
    },
    terncyCurtainFactoryRecovery: {
        key: ["factory_recovery"],
        convertSet: async (entity, key, value, meta) => {
            await entity.command(
                "manuSpecificClusterAduroSmart",
                "factoryRecovery",
                {},
                {manufacturerCode: XIAOYAN_MANUFACTURER_CODE, disableDefaultResponse: false},
            );
        },
    },
    terncyCurtainIndicatorLed: {
        key: ["indicator_led"],
        convertSet: async (entity, key, value, meta) => {
            await entity.command(
                "manuSpecificClusterAduroSmart",
                "configIndicatorLed",
                {enabled: value === "on" ? 1 : 0},
                {disableDefaultResponse: false},
            );
            return {state: {[key]: value}};
        },
    },
};

export default {
    zigbeeModel: ["TERNCY-CM01"],
    fingerprint: [{modelID: "TERNCY-CM01", manufacturerName: "Xiaoyan"}],
    model: "TERNCY-CM01",
    vendor: "Terncy",
    description: "Curtain motor",
    extend: [
        m.deviceAddCustomCluster("manuSpecificClusterAduroSmart", {
            name: "manuSpecificClusterAduroSmart",
            ID: XIAOYAN_CLUSTER,
            attributes: {
                curtainMotorDirection: {name: "curtainMotorDirection", ID: 0x0011, type: 0x20},
                curtainMotorStatus: {name: "curtainMotorStatus", ID: 0x0012, type: 0x20},
                curtainTripConfigured: {name: "curtainTripConfigured", ID: 0x0014, type: 0x20},
                curtainMotorType: {name: "curtainMotorType", ID: 0x0015, type: 0x20},
                curtainLedIndicator: {name: "curtainLedIndicator", ID: 0x0018, type: 0x20},
            },
            commands: {
                deleteAllTrip: {name: "deleteAllTrip", ID: 0x09, parameters: []},
                factoryRecovery: {name: "factoryRecovery", ID: 0x0a, parameters: []},
                setDirection: {name: "setDirection", ID: 0x0c, parameters: [{name: "direction", type: 0x20}]},
                configIndicatorLed: {name: "configIndicatorLed", ID: 0x16, parameters: [{name: "enabled", type: 0x10}]},
            },
            commandsResponse: {
                // Motor status/position push report (verified on air):
                // motorStatus 0=stopped 1=opening 2=closing,
                // currentPosition percent open (255 = trip not configured).
                motorReport: {
                    name: "motorReport",
                    ID: 0x26,
                    parameters: [
                        {name: "motorstatus", type: 0x20},
                        {name: "currentposition", type: 0x20},
                    ],
                },
            },
        }),
    ],
    fromZigbee: [fzLocal.terncyCoverPosition, fzLocal.terncyMotorReport, fzLocal.terncyCurtainAttributes],
    toZigbee: [
        tzLocal.terncyCoverSet,
        tzLocal.terncyCurtainMotorDirection,
        tzLocal.terncyCurtainReadableAttributes,
        tzLocal.terncyCurtainDeleteAllTrip,
        tzLocal.terncyCurtainFactoryRecovery,
        tzLocal.terncyCurtainIndicatorLed,
    ],
    exposes: [
        e.cover_position(),
        exposes.enum("motor_state", ea.STATE, ["stopped", "opening", "closing"])
            .withDescription("Current motor movement state reported by the device"),
        exposes.numeric("motor_direction", ea.STATE_SET)
            .withValueMin(0).withValueMax(1)
            .withDescription("Motor direction (0=normal, 1=reversed); setting it re-anchors the stored " +
                "position to the new open end and clears saved trip positions, same as the Terncy app")
            .withCategory("config"),
        exposes.numeric("motor_status", ea.STATE_GET)
            .withDescription("Motor status attribute reported by the device (raw value)"),
        exposes.numeric("trip_configured", ea.STATE_GET)
            .withDescription("Trip calibration complete flag (raw value)"),
        exposes.numeric("motor_type", ea.STATE_GET)
            .withDescription("Motor type as configured in the Terncy app (raw value)"),
        exposes.binary("delete_all_trip", ea.SET, "ON", "OFF")
            .withDescription("Delete all saved trip positions").withCategory("config"),
        exposes.binary("factory_recovery", ea.SET, "ON", "OFF")
            .withDescription("Factory-recover the curtain controller").withCategory("config"),
        exposes.enum("indicator_led", ea.STATE_SET, ["off", "on"])
            .withDescription("Indicator LED state").withCategory("config"),
    ],
    configure: async (device, coordinatorEndpoint) => {
        const endpoint = device.getEndpoint(1);
        if (!endpoint) {
            return;
        }

        try {
            await reporting.bind(endpoint, coordinatorEndpoint, ["closuresWindowCovering", "manuSpecificClusterAduroSmart"]);
            await reporting.currentPositionLiftPercentage(endpoint);
        } catch (error) {
            console.warn(`TERNCY-CM01: skipped reporting setup: ${error.message}`);
        }
    },
};
