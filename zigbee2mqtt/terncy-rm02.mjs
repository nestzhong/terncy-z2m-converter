// Upstream candidate definition for Zigbee2MQTT:
// Terncy/Xiaoyan TERNCY-RM02 roller blind controller.
//
// Note: earlier protocol notes mislabeled this model as a scene remote; the
// gateway backup entity (zebra/shangri-la blind, profile 5) and the App
// classification (isRollerCurtain) confirm it is a curtain controller with
// the same structure as the CM01.
//
// Derived from gateway firmware reverse engineering (node-struct + disassembly),
// cross-validated against live on-air captures (GW2, network-key decrypted):
//   modelID: TERNCY-RM02
//   manufacturerName: Xiaoyan
//   manufacturerCode: 0x1228
//   endpoint 1: profile 0x0104, deviceId 0x0202 (Window Covering)
//   clusters: Basic, WindowCovering 0x0102, 0xfccc, OTA
//
// Verified over the air (captures/GW2/TERNCY-RM02, 2026-09-05):
//   * Normal open/close/position are driven exactly like the CM01: the app
//     sends the standard WindowCovering command GoToLiftPercentage
//     (zigbee-herdsman ID 0x05), one-byte payload, percent-OPEN convention
//     (0 = fully closed, 100 = fully open). UpOpen/DownClose are NOT used by
//     the app for normal operation.
//   * The device therefore uses the INVERTED convention versus the ZCL spec
//     (spec: 0=open, 100=closed) for BOTH the command payload and the
//     CurrentPositionLiftPercentage attribute (attr 8 flips 100<->0 when the
//     motor direction is reversed, consistent with percent open). z2m's stock
//     cover converters assume the spec convention and their
//     invert_cover/coverInverted options would additionally swap the
//     UpOpen/DownClose commands (which are unused here anyway), so
//     position/state are handled by local converters below instead.
//   * Movement/position updates are pushed via the private cluster 0xfccc,
//     manufacturer code 0x1228, cluster-specific command 0x26 (server to
//     client), payload: [motorStatus(u8), currentPosition(u8)] where
//     motorStatus 0=stopped, 1=opening, 2=closing and currentPosition is
//     percent open (255 while trip positions are not configured).
//   * Stop is the standard WindowCovering Stop command; a mid-move Stop is
//     followed by a MotorReport with the current position.
//   * SetDirection is 0xfccc cmd 12 (payload u8: 0=normal, 1=reversed);
//     the device answers with a manufacturer Default Response, then pushes
//     attr 8 re-anchored to the new open end (100 <-> 0 flip on-air).
//
// Trip calibration DIFFERS FROM THE CM01 (important):
//   * CM01: app sends DeleteAllTrip (0xfccc cmd 9), then WindowCovering
//     DownClose and UpOpen to re-learn the end stops.
//   * RM02: app never sends DeleteAllTrip nor WC UpOpen/DownClose. Instead the
//     whole calibration session (start -> jog to open limit -> jog to close
//     limit -> done) runs on the private 0xfccc commands:
//       - cmd 36 ConfigBoundary   payload [u8,u8]: 0x0000 on session start,
//         0x0001 after, 0x0100 after the open end is confirmed, 0x0101 after
//         the close end is confirmed (last one marks the session complete).
//       - cmd 37 TimeoutControl   payload [dir(u8), durationMs(u16 LE)]:
//         dir 0 = open (motor reports status 1), dir 1 = close (status 2).
//         Duration seen on air: 5000 ms (coarse jog), 800 ms (fine jog).
//         Re-sent every ~4.4 s while the user holds the jog; the device
//         reports status 1/2 until a WindowCovering Stop arrives.
//       - Done is signalled by the device pushing attr 0x14 (tripConfigured)
//         0 -> 1 together with a MotorReport carrying the final position
//         (0 = closed when the close end was confirmed last).
//   * Because this jog-with-confirm flow needs physical eyes on the blind, it
//     is not exposed here; calibrate RM02 units BEFORE migrating them to z2m
//     (or factory-reset to the app) — see the readme migration notes.
//   * delete_all_trip (cmd 9) is still exposed for parity with the CM01: it
//     clears the stored trip so the controller must be re-calibrated.
//
// Private 0xfccc curtain attribute block (disassembly-confirmed):
//   0x11 motorDirection, 0x12 motorStatus, 0x14 tripConfigured (report
//   verified), 0x15 motorType, 0x18 ledIndicator. Attrs 0x13/0x16 are unknown
//   and stay unexposed.
// Private curtain commands (mfg code 0x1228 unless noted):
//   9 DeleteAllTrip, 10 FactoryRecovery, 12 SetDirection (verified; clears
//   trip positions, same behavior as the Terncy app), 22 ConfigIndicatorLed
//   (no manufacturer code). Calibration session commands above (36/37) and
//   17 SetDragging, 25/26/27 trip positions, 40 startMoving stay unexposed.

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
    zigbeeModel: ["TERNCY-RM02"],
    fingerprint: [{modelID: "TERNCY-RM02", manufacturerName: "Xiaoyan"}],
    model: "TERNCY-RM02",
    vendor: "Terncy",
    description: "Roller blind controller",
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
            console.warn(`TERNCY-RM02: skipped reporting setup: ${error.message}`);
        }
    },
};
