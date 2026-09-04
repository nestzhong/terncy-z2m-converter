// Upstream candidate definition for Zigbee2MQTT:
// Terncy/Xiaoyan TERNCY-WS04-D3, 3-gang wall switch.
//
// Derived from gateway firmware reverse engineering (node-struct):
//   modelID: TERNCY-WS04-D3
//   manufacturerName: Xiaoyan
//   manufacturerCode: 0x1228
//   private cluster: 0xfccc
//   endpoint 1: Basic, Identify, OnOff, 0xfccc (attrs 0x17-0x19, 0x1c, 0x1f-0x21, 0x23-0x26)
//   endpoint 2: OnOff, 0xfccc
//   endpoint 3: OnOff, 0xfccc
//
// Relay control and all 0xfccc command usage follow the device-verified
// TERNCY-WS07-D3 converter (enablePureInput 0x1d, setButtonLedStatus 0x1f,
// cfgButtonLedPolarity attr 0x001f write from source endpoint 110).
// This model has not yet been re-verified on a physical WS04-D3.

import * as fz from "zigbee-herdsman-converters/converters/fromZigbee";
import * as tz from "zigbee-herdsman-converters/converters/toZigbee";
import * as exposes from "zigbee-herdsman-converters/lib/exposes";
import * as m from "zigbee-herdsman-converters/lib/modernExtend";
import * as reporting from "zigbee-herdsman-converters/lib/reporting";

const e = exposes.presets;
const ea = exposes.access;

const XIAOYAN_CLUSTER = 0xfccc;
const XIAOYAN_MANUFACTURER_CODE = 0x1228;
const ENDPOINTS = {l1: 1, l2: 2, l3: 3};

const SWITCH_CONFIG_COMMAND = {
    enablePureInput: "enablePureInput",
    setButtonLedStatus: "setButtonLedStatus",
};

const WIRELESS_LED_STATUS = {
    off: 0,
    on: 1,
};

const LED_FEEDBACK_MODE = {
    positive: 0,
    negative: 1,
};

const CLICK_ACTIONS = {
    1: "single",
    2: "double",
    3: "triple",
    4: "quadruple",
    5: "5_click",
    6: "6_click",
    7: "7_click",
};

function endpointName(msg) {
    return Object.entries(ENDPOINTS).find(([, ID]) => ID === msg.endpoint.ID)?.[0];
}

function endpointActions() {
    const baseActions = [...Object.values(CLICK_ACTIONS), "hold", "release"];
    return Object.keys(ENDPOINTS).flatMap((ep) => baseActions.map((action) => `${action}_${ep}`));
}

function perEndpointConfig(name, values, description) {
    return Object.keys(ENDPOINTS).map((ep) =>
        exposes.enum(name, ea.STATE_SET, values).withEndpoint(ep)
            .withDescription(description).withCategory("config"),
    );
}

function perEndpointBinary(name, description) {
    return Object.keys(ENDPOINTS).map((ep) =>
        exposes.binary(name, ea.STATE_SET, "ON", "OFF").withEndpoint(ep)
            .withDescription(description).withCategory("config"),
    );
}

async function sendSwitchConfig(endpoint, commandID, value) {
    await endpoint.command(
        XIAOYAN_CLUSTER,
        commandID,
        {value},
        {
            manufacturerCode: XIAOYAN_MANUFACTURER_CODE,
            disableDefaultResponse: false,
        },
    );
}

const fzLocal = {
    terncyWallSwitchAction: {
        cluster: "manuSpecificClusterAduroSmart",
        type: "raw",
        convert: (model, msg, publish, options, meta) => {
            const data = [...msg.data];
            const ep = endpointName(msg);

            if (!ep || data[0] !== 0x0d || data[1] !== 0x28 || data[2] !== 0x12) {
                return;
            }

            // Manufacturer-specific frame, command 0x00: payload byte 2 is click count.
            // Frame layout verified on the WS07-D3 wireless mode for 1-7 clicks.
            if (data[4] === 0x00) {
                const clickAction = CLICK_ACTIONS[data[6]];
                if (clickAction) {
                    return {action: `${clickAction}_${ep}`};
                }
            }

            // Manufacturer-specific frame, command 0x29:
            // payload[0] 0x02 = hold tick, 0x08 = release; payload[2..3] = seconds.
            if (data[4] === 0x29 && (data[5] === 0x02 || data[5] === 0x08)) {
                const duration = data[7] + (data[8] << 8);
                return {
                    action: `${data[5] === 0x02 ? "hold" : "release"}_${ep}`,
                    action_duration: duration,
                };
            }
        },
    },
};

const tzLocal = {
    terncyWallSwitchOperationMode: {
        key: ["operation_mode"],
        convertSet: async (entity, key, value, meta) => {
            await sendSwitchConfig(entity, SWITCH_CONFIG_COMMAND.enablePureInput, value === "wireless" ? 1 : 0);
            return {state: {[key]: value}};
        },
    },
    terncyWallSwitchRelayEnabled: {
        key: ["relay_enabled"],
        convertSet: async (entity, key, value, meta) => {
            const enabled = value === true || value === "ON";
            await sendSwitchConfig(entity, SWITCH_CONFIG_COMMAND.enablePureInput, enabled ? 0 : 1);
            return {state: {operation_mode: enabled ? "control_relay" : "wireless", [key]: enabled ? "ON" : "OFF"}};
        },
    },
    terncyWallSwitchRelayConstantPower: {
        key: ["relay_constant_power"],
        convertSet: async (entity, key, value, meta) => {
            const enabled = value === true || value === "ON";

            if (enabled) {
                await entity.command("genOnOff", "on", {}, {disableDefaultResponse: false});
                await sendSwitchConfig(entity, SWITCH_CONFIG_COMMAND.enablePureInput, 1);
                return {state: {operation_mode: "wireless", relay_enabled: "OFF", [key]: "ON"}};
            }

            await sendSwitchConfig(entity, SWITCH_CONFIG_COMMAND.enablePureInput, 0);
            return {state: {operation_mode: "control_relay", relay_enabled: "ON", [key]: "OFF"}};
        },
    },
    terncyWallSwitchWirelessLedStatus: {
        key: ["wireless_led_status"],
        convertSet: async (entity, key, value, meta) => {
            await sendSwitchConfig(entity, SWITCH_CONFIG_COMMAND.setButtonLedStatus, WIRELESS_LED_STATUS[value]);
            return {state: {[key]: value}};
        },
    },
    terncyWallSwitchLedFeedbackMode: {
        key: ["led_feedback_mode"],
        convertSet: async (entity, key, value, meta) => {
            await entity.write(
                "manuSpecificClusterAduroSmart",
                {cfgButtonLedPolarity: LED_FEEDBACK_MODE[value]},
                {manufacturerCode: XIAOYAN_MANUFACTURER_CODE, disableDefaultResponse: false, srcEndpoint: 110},
            );
            return {state: {[key]: value}};
        },
    },
};

export default {
    zigbeeModel: ["TERNCY-WS04-D3"],
    fingerprint: [{modelID: "TERNCY-WS04-D3", manufacturerName: "Xiaoyan"}],
    model: "TERNCY-WS04-D3",
    vendor: "Terncy",
    description: "3-gang wall switch",
    extend: [
        m.deviceAddCustomCluster("manuSpecificClusterAduroSmart", {
            name: "manuSpecificClusterAduroSmart",
            ID: XIAOYAN_CLUSTER,
            attributes: {
                cfgButtonLedPolarity: {name: "cfgButtonLedPolarity", ID: 0x001f, type: 0x20},
                cfgButtonLedStatus: {name: "cfgButtonLedStatus", ID: 0x0020, type: 0x20},
                cfgDisabledRelayStatus: {name: "cfgDisabledRelayStatus", ID: 0x0021, type: 0x20},
                cfgLoopHasRelay: {name: "cfgLoopHasRelay", ID: 0x0026, type: 0x20},
            },
            commands: {
                enableRelay: {name: "enableRelay", ID: 0x13, parameters: [{name: "value", type: 0x20}]},
                configIndicatorLed: {name: "configIndicatorLed", ID: 0x16, parameters: [{name: "value", type: 0x10}]},
                setInputMode: {name: "setInputMode", ID: 0x1c, parameters: [{name: "value", type: 0x20}]},
                enablePureInput: {name: "enablePureInput", ID: 0x1d, parameters: [{name: "value", type: 0x20}]},
                setSwitchPolarity: {name: "setSwitchPolarity", ID: 0x1e, parameters: [{name: "value", type: 0x20}]},
                setButtonLedStatus: {name: "setButtonLedStatus", ID: 0x1f, parameters: [{name: "value", type: 0x20}]},
            },
            commandsResponse: {},
        }),
    ],
    fromZigbee: [fz.on_off, fzLocal.terncyWallSwitchAction],
    toZigbee: [
        tz.on_off,
        tzLocal.terncyWallSwitchOperationMode,
        tzLocal.terncyWallSwitchRelayEnabled,
        tzLocal.terncyWallSwitchRelayConstantPower,
        tzLocal.terncyWallSwitchWirelessLedStatus,
        tzLocal.terncyWallSwitchLedFeedbackMode,
    ],
    exposes: [
        e.switch().withEndpoint("l1"),
        e.switch().withEndpoint("l2"),
        e.switch().withEndpoint("l3"),
        ...perEndpointConfig("operation_mode", ["control_relay", "wireless"], "Control relay or act as wireless switch"),
        ...perEndpointBinary("relay_enabled", "Enable or disable relay while in wireless switch mode"),
        ...perEndpointBinary("relay_constant_power", "Turn relay on, then decouple input for constant power"),
        ...perEndpointConfig("wireless_led_status", Object.keys(WIRELESS_LED_STATUS), "LED state while in wireless switch mode"),
        ...perEndpointConfig("led_feedback_mode", Object.keys(LED_FEEDBACK_MODE), "Relay-mode LED feedback relation"),
        e.action(endpointActions()),
        e.action_duration(),
    ],
    endpoint: () => ENDPOINTS,
    meta: {multiEndpoint: true},
    configure: async (device, coordinatorEndpoint) => {
        for (const ID of Object.values(ENDPOINTS)) {
            const endpoint = device.getEndpoint(ID);
            if (!endpoint) {
                continue;
            }

            try {
                await reporting.bind(endpoint, coordinatorEndpoint, ["genOnOff"]);
                await reporting.onOff(endpoint);
            } catch (error) {
                // Some devices may already have full binding tables; manual control still works.
                console.warn(`TERNCY-WS04-D3: skipped reporting setup for endpoint ${ID}: ${error.message}`);
            }
        }
    },
};
