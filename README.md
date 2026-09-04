# Terncy/Xiaoyan Zigbee2MQTT and Home Assistant Support

Community support files for selected Terncy/Xiaoyan devices.

## Included Files

```text
zigbee2mqtt/terncy-ws07-d3.mjs
  Zigbee2MQTT external converter for the TERNCY-WS07-D3 3-gang neutral wall switch.

zigbee2mqtt/terncy-sp01.mjs
  Zigbee2MQTT external converter for the TERNCY-SP01 smart plug.

zigbee2mqtt/terncy-ws04-d2.mjs
  Zigbee2MQTT external converter for the TERNCY-WS04-D2 2-gang wall switch.

zigbee2mqtt/terncy-ws04-d3.mjs
  Zigbee2MQTT external converter for the TERNCY-WS04-D3 3-gang wall switch.

zigbee2mqtt/terncy-ws10-d1.mjs
  Zigbee2MQTT external converter for the TERNCY-WS10-D1 1-gang wall switch.

zigbee2mqtt/terncy-ws10-d3.mjs
  Zigbee2MQTT external converter for the TERNCY-WS10-D3 3-gang wall switch.

zigbee2mqtt/terncy-ws10-d4.mjs
  Zigbee2MQTT external converter for the TERNCY-WS10-D4 4-gang wall switch.

zigbee2mqtt/terncy-vg01.mjs
  Zigbee2MQTT external converter for the TERNCY-VG01 VRV air conditioner
  gateway (report-only, see docs/protocol-comparison.md section 6).

zigbee2mqtt/terncy-dim001.mjs / terncy-dim003.mjs / terncy-dl002.mjs /
terncy-lb001.mjs / terncy-mt001.mjs
  Zigbee2MQTT external converters for the DIM001/DIM003/DL002/LB001/MT001
  tunable white (CCT) lights.

zigbee2mqtt/terncy-st01-cv.mjs
  Zigbee2MQTT external converter for the TERNCY-ST01-CV RGB+CCT LED strip
  controller.

zigbee2mqtt/terncy-cm01.mjs / terncy-cm07.mjs / terncy-rm02.mjs
  Zigbee2MQTT external converters for the TERNCY-CM01/CM07 curtain motors
  and the TERNCY-RM02 roller blind controller.

zigbee2mqtt/terncy-sl02.mjs
  Zigbee2MQTT external converter for the TERNCY-SL02 door lock.

homeassistant/blueprints/automation/terncy/ws07_d3_action_events.yaml
  Main Home Assistant blueprint for 1-7 clicks and long press automation.

homeassistant/blueprints/automation/terncy/ws07_d3_wireless_switch.deprecated.yaml
  Earlier state-change based blueprint. Kept for reference only.

homeassistant/packages/ws07_d3_helpers.yaml
  Optional Chinese Home Assistant helper package.

docs/
  Test notes, feature mapping, and the reverse-engineered protocol comparison.
```

## Verification Status

> **WARNING:** Only `terncy-ws07-d3.mjs` and `terncy-sp01.mjs` have been
> verified on physical devices. Every other converter in this repository is
> derived from gateway firmware reverse engineering (node-struct, disassembly,
> and App cross-validation) and has **NOT** been tested on real hardware.
> They may not work, or could misbehave (for example, inverted curtain
> positions or unconfirmed payload byte order). **Use them at your own
> risk**, and please report your findings so they can be corrected and marked
> as verified.

- `terncy-ws07-d3.mjs` and `terncy-sp01.mjs` are verified on physical devices.
- `terncy-ws04-d2/d3.mjs` and `terncy-ws10-d1/d3/d4.mjs` are derived from the
  gateway firmware node-struct (endpoint/cluster layout) plus the same private
  cluster protocol verified on the WS07-D3. They have not yet been re-verified
  on physical devices; see `docs/protocol-comparison.md` for the full
  reverse-engineering vs. verified-converter comparison.
- `terncy-vg01.mjs` parses indoor-unit report frames only; downlink AC control
  is not sent until the GeneralControl addressing fields are sniffed.
- `terncy-dim001/dim003/dl002/lb001/mt001.mjs`, `terncy-st01-cv.mjs`,
  `terncy-cm01/cm07/rm02.mjs`, and `terncy-sl02.mjs` are derived from the
  gateway firmware node-struct plus disassembly-confirmed command/attribute
  semantics (see `docs/fingerprints-missing-models.md`). **They have NOT been
  verified on physical devices — use with caution.** Curtain calibration
  commands that were not individually disassembled (SetDragging, trip
  positions, boundary, timeout, startMoving) are intentionally not exposed.

## Supported Features

### TERNCY-WS07-D3

- Three relay outputs via `genOnOff`.
- Per-gang relay-control/wireless mode.
- Per-gang constant-power mode.
- Per-gang wireless-mode LED state.
- Per-gang relay-mode LED feedback mode.
- Wireless button actions:
  - `single_l1/l2/l3`
  - `double_l1/l2/l3`
  - `triple_l1/l2/l3`
  - `quadruple_l1/l2/l3`
  - `5_click_l1/l2/l3`
  - `6_click_l1/l2/l3`
  - `7_click_l1/l2/l3`
  - `hold_l1/l2/l3`
  - `release_l1/l2/l3`
  - `action_duration`

### TERNCY-SP01

- Standard on/off plug control via `genOnOff`.
- Power and voltage sensors.
- Computed current sensor.

SP01 exposes `state`, `power`, `voltage`, and `current`. Live testing showed
the device reports raw `activePower` and `rmsVoltage` values scaled by `/100`.
The device did not reliably report `rmsCurrent`, so current is calculated from
`power / voltage`.

The converter avoids active reads of `activePower` and `rmsCurrent` because
tested firmware can return `0` to those reads and pollute Zigbee2MQTT's cached
state. Xiaoyan private power calibration commands are intentionally not exposed.
For manual loading and troubleshooting, see
[`docs/sp01-zigbee2mqtt-manual-load-guide.md`](docs/sp01-zigbee2mqtt-manual-load-guide.md).

### TERNCY-WS04-D2 / TERNCY-WS04-D3

Same feature set as the WS07-D3, for 2-gang (endpoints 1-2) and 3-gang
(endpoints 1-3) wall switches:

- Per-gang relay on/off via `genOnOff`.
- Per-gang `operation_mode` / `relay_enabled` / `relay_constant_power`.
- Per-gang `wireless_led_status` and `led_feedback_mode`.
- Wireless button actions (`single`...`7_click`, `hold`, `release`,
  `action_duration`) per endpoint.

Endpoint layout comes from the gateway node-struct: every endpoint carries an
OnOff server cluster plus the private `0xfccc` cluster.

### TERNCY-WS10-D1 / D3 / D4

Same feature set as the WS07-D3. The node-struct shows the relay (OnOff
server) endpoints differ per model:

| Model | Relay endpoints | 0xfccc-only endpoints |
| --- | --- | --- |
| WS10-D1 | 4 | 1, 2, 3 |
| WS10-D3 | 1, 2, 4 | 3 |
| WS10-D4 | 1, 2, 3, 4 | — |

Switches and per-gang configuration are exposed only for relay endpoints;
action decoding covers all endpoints because wireless button frames can arrive
from any endpoint. The WS10 family also lists 0xfccc attrs 0x22
(`numberOfTimeoutControls`) and 0x28 (`turnOffDelayMs`); these stay unexposed
until their App-level meaning is verified.

### TERNCY-VG01

Report-only support for the VRV air conditioner gateway on private cluster
`0xfddd`:

- Parses uplink command `0x09` (UpdateZhhUnit) frames into per-unit state
  keys: `unit_<addr>_online`, `unit_<addr>_running`,
  `unit_<addr>_target_temperature`, `unit_<addr>_local_temperature`,
  `unit_<addr>_fan_speed`, `unit_<addr>_work_mode`, `unit_<addr>_error_code`.
  `<addr>` is the two-byte unit address (high byte = group, low byte = unit
  number) encoded as hex, e.g. `unit_0101_running`.
- Downlink control (command `0x01` GeneralControl, sub-commands `0x31`-`0x34`)
  is reconstructed from firmware but intentionally not sent yet: the unit
  addressing fields and the work-mode/fan-speed enums need one over-the-air
  sniff of a real AC operation first.

### DIM001 / DIM003 / DL002 / LB001 / MT001 (CCT lights)

Tunable white lights driven through the standard OnOff/LevelCtrl/ColorCtrl
clusters:

- Light on/off, brightness, and `color_temp` via the standard light state.
- Per-model mired ranges come from the node-struct ColorCtrl attributes
  0x400B/0x400C: DIM001 100–500, DIM003 142–625, DL002 151–500,
  LB001 142–625, MT001 142–625.
- The device-reported `colorCapabilities` is a manufacturer placeholder
  missing the color-temperature bit, so capability detection is bypassed and
  `color_temp` is exposed explicitly.
- Private light tuning (color-temp range page, light curve, mA calibration,
  power-off memory via `0xfccc` attr 0x19) is not exposed yet.

### TERNCY-ST01-CV (RGB+CCT strip)

Extended color light on standard clusters only (no private clusters):

- Light on/off, brightness, `color_xy`, `color_hs`, and `color_temp`
  (150–500 mireds).

### TERNCY-CM01 / TERNCY-CM07 / TERNCY-RM02 (curtains)

Curtain motors on the standard WindowCovering cluster plus private `0xfccc`
configuration:

- `state` OPEN/CLOSE/STOP and `position` (standard commands 0/1/2 and
  GoToLiftPercentage command 0x05; position reporting via standard
  CurrentPositionLiftPercentage).
- `motor_status`, `trip_configured`, `motor_type` (read-only `0xfccc`
  attrs 0x12/0x14/0x15) and `motor_direction` (`0xfccc` attr 0x11, set via
  SetDirection command 0x0c which clears saved trip positions, same as the
  Terncy app).
- `indicator_led` via ConfigIndicatorLed command 0x16.
- `delete_all_trip` and `factory_recovery` calibration triggers (commands
  0x09/0x0a).
- TERNCY-CM07 additionally exposes `tilt_angle` (-90..90 degrees, sent via
  GoToTiltValue command 0x07; set-only until a tilt report is sniffed).
- TERNCY-RM02 is a roller blind controller (earlier notes mislabeled it as
  a scene remote).
- If the position direction is wrong on your unit, set the device option
  `invert_cover: true`.

### TERNCY-SL02 (door lock)

Sleeping end device on the standard DoorLock cluster:

- `state` LOCK/UNLOCK via standard DoorLock commands 1/0.
- `battery` (PowerCfg batteryPercentageRemaining), `door_state`,
  `auto_relock_time`, and `sound_volume`.
- The private `0xfe03` E19 key/keycard table and PIN-code management are not
  exposed yet.

## Install Zigbee2MQTT External Converter

Replace `<RAW_BASE_URL>` with this repository's GitHub raw URL.

Example raw base URL format:

```text
https://raw.githubusercontent.com/<owner>/<repo>/main
```

On Home Assistant OS / add-on host:

```sh
mkdir -p /config/zigbee2mqtt/external_converters
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-ws07-d3.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-ws07-d3.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-sp01.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-sp01.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-ws04-d2.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-ws04-d2.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-ws04-d3.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-ws04-d3.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-ws10-d1.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-ws10-d1.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-ws10-d3.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-ws10-d3.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-ws10-d4.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-ws10-d4.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-vg01.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-vg01.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-dim001.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-dim001.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-dim003.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-dim003.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-dl002.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-dl002.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-lb001.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-lb001.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-mt001.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-mt001.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-st01-cv.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-st01-cv.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-cm01.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-cm01.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-cm07.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-cm07.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-rm02.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-rm02.mjs
curl -L \
  <RAW_BASE_URL>/zigbee2mqtt/terncy-sl02.mjs \
  -o /config/zigbee2mqtt/external_converters/terncy-sl02.mjs
```

Then add this to Zigbee2MQTT `configuration.yaml` (keep only the converters
for devices you actually own):

```yaml
external_converters:
  - terncy-ws07-d3.mjs
  - terncy-sp01.mjs
  - terncy-ws04-d2.mjs
  - terncy-ws04-d3.mjs
  - terncy-ws10-d1.mjs
  - terncy-ws10-d3.mjs
  - terncy-ws10-d4.mjs
  - terncy-vg01.mjs
  - terncy-dim001.mjs
  - terncy-dim003.mjs
  - terncy-dl002.mjs
  - terncy-lb001.mjs
  - terncy-mt001.mjs
  - terncy-st01-cv.mjs
  - terncy-cm01.mjs
  - terncy-cm07.mjs
  - terncy-rm02.mjs
  - terncy-sl02.mjs
```

Restart Zigbee2MQTT.

## Install Home Assistant Blueprint

```sh
mkdir -p /config/blueprints/automation/terncy
curl -L \
  <RAW_BASE_URL>/homeassistant/blueprints/automation/terncy/ws07_d3_action_events.yaml \
  -o /config/blueprints/automation/terncy/ws07_d3_action_events.yaml
```

In Home Assistant, create an automation from:

```text
小燕/Terncy WS07-D3 多擊與長按自動化
```

Default MQTT topic:

```text
zigbee2mqtt/0x04e3e5fffea1fbb0
```

If you renamed the device in Zigbee2MQTT, change the blueprint topic to:

```text
zigbee2mqtt/<friendly_name>
```

## Usage Model

Configure device behavior in Zigbee2MQTT:

- `operation_mode = control_relay`: physical button controls the relay directly. Home Assistant sees the gang as a normal switch entity.
- `operation_mode = wireless`: physical button is detached from the relay and can trigger automations.
- `relay_constant_power = ON`: turns relay on, then detaches the button so smart bulbs or downstream loads stay powered.

Use the Home Assistant blueprint for wireless actions and long press automations.

## Notes

The deprecated blueprint watches switch `on/off` state transitions. It was useful before real `action` decoding was implemented, but the action blueprint should be preferred.

The optional helper package exposes Chinese template entities for easier manual setup inside Home Assistant. It is not required for the converter or blueprint.
