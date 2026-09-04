#!/bin/sh
set -eu

RAW_BASE_URL="${1:-}"

if [ -z "$RAW_BASE_URL" ]; then
    echo "Usage: $0 https://raw.githubusercontent.com/<owner>/<repo>/main" >&2
    exit 1
fi

mkdir -p /config/zigbee2mqtt/external_converters
mkdir -p /config/blueprints/automation/terncy

CONVERTERS="terncy-ws07-d3 terncy-sp01 terncy-ws04-d2 terncy-ws04-d3 terncy-ws10-d1 terncy-ws10-d3 terncy-ws10-d4 terncy-vg01"

for NAME in $CONVERTERS; do
    curl -L \
        "$RAW_BASE_URL/zigbee2mqtt/$NAME.mjs" \
        -o "/config/zigbee2mqtt/external_converters/$NAME.mjs"
done

curl -L \
    "$RAW_BASE_URL/homeassistant/blueprints/automation/terncy/ws07_d3_action_events.yaml" \
    -o /config/blueprints/automation/terncy/ws07_d3_action_events.yaml

echo "Installed converter and blueprint."
echo "Make sure Zigbee2MQTT configuration.yaml contains (keep only the"
echo "converters for devices you actually own):"
echo "external_converters:"
for NAME in $CONVERTERS; do
    echo "  - $NAME.mjs"
done
echo "Then restart Zigbee2MQTT."
