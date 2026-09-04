// Upstream candidate definition for Zigbee2MQTT:
// Terncy/Xiaoyan TERNCY-SL02 door lock.
//
// Derived from gateway firmware reverse engineering (node-struct + disassembly):
//   modelID: TERNCY-SL02
//   manufacturerName: Xiaoyan
//   endpoint 1: profile 0x0104, deviceId 0x000a (Door Lock)
//   nodeType: sleeping end device (PollCtrl server, checkin interval 0x3840)
//   clusters: Basic, PowerCfg, DoorLock 0x0101, 0xfe03 (E19 key table),
//             PollCtrl
//
// Standard DoorLock control is used: Lock/Unlock commands 0/1, lockState
// attr 0, doorState attr 3, autoRelockTime attr 35, soundVolume attr 36.
// Battery comes from PowerCfg batteryPercentageRemaining (attr 33), which
// the standard battery converter halves to a percentage.
//
// This is a sleeping end device, so no reporting bindings are configured;
// state arrives via check-in polling handled by Zigbee2MQTT.
//
// The private 0xfe03 E19 key/keycard table and DoorLock PIN-code management
// (SetPinCode/GetPinCode/ClearPinCode) are intentionally not exposed in this
// version: they need dedicated card/user management UX and more verification.
// OperationEventNotification (0x20) / ProgrammingEventNotification (0x21)
// action mapping is a future enhancement.

import * as fz from "zigbee-herdsman-converters/converters/fromZigbee";
import * as tz from "zigbee-herdsman-converters/converters/toZigbee";
import * as exposes from "zigbee-herdsman-converters/lib/exposes";

const e = exposes.presets;

export default {
    zigbeeModel: ["TERNCY-SL02"],
    fingerprint: [{modelID: "TERNCY-SL02", manufacturerName: "Xiaoyan"}],
    model: "TERNCY-SL02",
    vendor: "Terncy",
    description: "Door lock",
    fromZigbee: [fz.lock, fz.battery],
    toZigbee: [tz.lock, tz.lock_auto_relock_time, tz.lock_sound_volume],
    exposes: [
        e.lock(),
        e.battery(),
        e.door_state(),
        e.auto_relock_time(),
        e.sound_volume(),
    ],
};
