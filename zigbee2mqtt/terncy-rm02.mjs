// Upstream candidate definition for Zigbee2MQTT:
// Terncy/Xiaoyan TERNCY-RM02 roller blind controller.
//
// Note: earlier protocol notes mislabeled this model as a scene remote; the
// gateway backup entity (zebra/shangri-la blind, profile 5) and the App
// classification (isRollerCurtain) confirm it is a curtain controller with
// the same structure as the CM01.
//
// Derived from gateway firmware reverse engineering (node-struct + disassembly):
//   modelID: TERNCY-RM02
//   manufacturerName: Xiaoyan
//   manufacturerCode: 0x1228
//   endpoint 1: profile 0x0104, deviceId 0x0202 (Window Covering)
//   clusters: Basic, WindowCovering 0x0102, 0xfccc, OTA
//
// Standard WindowCovering control is used as-is: UpOpen/DownClose/Stop and
// GoToLiftPercentage. zigbee-herdsman already numbers goToLiftPercentage as
// command 0x05, matching the gateway disassembly. Position reporting relies
// on the standard CurrentPositionLiftPercentage (attr 8); the private motor
// report frame (0xfccc cmd 0x26) is not parsed until its payload byte order
// is confirmed by sniffing. If the position direction is wrong on your unit,
// set the device option invert_cover: true.
//
// Private 0xfccc curtain attribute block (disassembly-confirmed):
//   0x11 motorDirection, 0x12 motorStatus, 0x14 tripConfigured,
//   0x15 motorType, 0x18 ledIndicator. Attrs 0x13/0x16 are unknown and
//   stay unexposed.
// Private curtain commands (mfg code 0x1228 unless noted):
//   9 DeleteAllTrip, 10 FactoryRecovery, 12 SetDirection (clears trip
//   positions, same behavior as the Terncy app), 22 ConfigIndicatorLed
//   (no manufacturer code). Not exposed yet: 17 SetDragging, 25/26/27 trip
//   positions, 36 boundary, 37 timeout control, 40 startMoving.

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

const fzLocal = {
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
            commandsResponse: {},
        }),
        m.windowCovering({controls: ["lift"]}),
    ],
    fromZigbee: [fz.cover_position_tilt, fzLocal.terncyCurtainAttributes],
    toZigbee: [
        tz.cover_state,
        tz.cover_position_tilt,
        tzLocal.terncyCurtainMotorDirection,
        tzLocal.terncyCurtainReadableAttributes,
        tzLocal.terncyCurtainDeleteAllTrip,
        tzLocal.terncyCurtainFactoryRecovery,
        tzLocal.terncyCurtainIndicatorLed,
    ],
    exposes: [
        e.cover_position(),
        exposes.numeric("motor_direction", ea.STATE_SET)
            .withValueMin(0).withValueMax(1)
            .withDescription("Motor direction (0/1); setting it clears saved trip positions, same as the Terncy app")
            .withCategory("config"),
        exposes.numeric("motor_status", ea.STATE_GET)
            .withDescription("Motor status reported by the device (raw value)"),
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
            await reporting.bind(endpoint, coordinatorEndpoint, ["closuresWindowCovering"]);
            await reporting.currentPositionLiftPercentage(endpoint);
        } catch (error) {
            console.warn(`TERNCY-RM02: skipped reporting setup: ${error.message}`);
        }
    },
};
