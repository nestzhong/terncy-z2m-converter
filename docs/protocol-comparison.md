# 逆向协议与已验证转换器一致性比对

日期：2026-09-04

比对对象：

- 逆向资料：`z2m_converters/`（网关固件反汇编 + node-struct + `XYAN_PROTOCOL_MAP.md`）
- 已验证转换器：本仓库 `zigbee2mqtt/terncy-ws07-d3.mjs`、`zigbee2mqtt/terncy-sp01.mjs`
  及其配套实测文档（`docs/working-features-app-mapping.md`、`docs/action-events.md`、
  `docs/zigbee2mqtt-official-submission.md`）

## 结论

**完全一致。** 逆向资料与已验证转换器在所有重叠点上互相吻合，且双向互证。
唯一差异是一个从未被读写的属性类型声明（见第 3 节），不影响任何已验证行为。

## 1. 厂商基本参数

| 项目 | 逆向资料 | 已验证转换器 | 结论 |
| --- | --- | --- | --- |
| manufacturerName | `Xiaoyan`（Basic cluster attr 4 实测） | `"Xiaoyan"` | 一致 |
| 厂商代码 | `0x1228`（xyan_commands.json 中十进制 4648 = 0x1228） | `XIAOYAN_MANUFACTURER_CODE = 0x1228` | 一致 |
| 核心私有簇 | 0xFCCC（十进制 64716，XyanConfig） | `XIAOYAN_CLUSTER = 0xfccc` | 一致 |
| Profile | 0x0104 / 260 (HA) | node-struct 各设备 profile 260 | 一致 |

## 2. 0xFCCC 命令比对（转换器实际发送的命令）

| 转换器命令名 | 转换器 cmd ID | 逆向命令表 | 参数 | 结论 |
| --- | --- | --- | --- | --- |
| `enablePureInput` | 0x1d (29) | cmd 29 ConfigPureInput | ep,u8 ↔ `{value: u8}` | 一致 |
| `setButtonLedStatus` | 0x1f (31) | cmd 31 SetButtonLedStatus | ep,u8 ↔ `{value: u8}` | 一致 |
| `enableRelay` | 0x13 (19) | cmd 19 EnableButtonRelay | ep,u8 ↔ `{value: u8}` | 一致 |
| `configIndicatorLed` | 0x16 (22) | cmd 22 ConfigIndicatorLed | ep,bool ↔ `{value: bool}` | 一致 |
| `setInputMode` | 0x1c (28) | cmd 28 ConfigInputMode | ep,u8 ↔ `{value: u8}` | 一致 |
| `setSwitchPolarity` | 0x1e (30) | cmd 30 ConfigSwitchPolarity | ep,u8 ↔ `{value: u8}` | 一致 |

## 3. 0xFCCC 属性比对（转换器声明的属性）

| 转换器属性名 | 转换器 attr ID / 类型 | 逆向属性表 | 结论 |
| --- | --- | --- | --- |
| `cfgButtonLedPolarity` | 0x001f (31) / 0x20 u8 | attr 0x1F buttonLedPolarity u8 | 一致。转换器实测 `positive=0 / negative=1` 写入有效，与逆向命名含义吻合 |
| `cfgButtonLedStatus` | 0x0020 (32) / 0x20 u8 | attr 0x20 buttonLedStatus u8 | 一致 |
| `cfgDisabledRelayStatus` | 0x0021 (33) / 0x20 u8 | attr 0x21 disabledRelayStatus u8 | 一致（实测 Z2M 直写返回 FAILURE，逆向未涉及写权限，不矛盾） |
| `cfgLoopHasRelay` | 0x0026 (38) / 0x10 bool | attr 0x26 loopHasRelay u8 | 命名一致；类型声明不同（见下） |

### 唯一差异：attr 0x0026 的类型声明

- 逆向表标注 `loopHasRelay` 为 u8；转换器声明为 `0x10`（bool）。
- 该属性在转换器中**从未被读或写**，仅存在于簇定义中，因此不影响任何行为。
- 实测文档恰好双向印证了逆向结论：早期对 0x0026 的写入返回 `READ_ONLY / 0x88`，
  反汇编后确认 0x0026 是 `loop-has-relay`（只读回路状态），而不是早期猜测的
  `cfg-button-led-polarity`（真正的属性是 0x001f）。
- 新写的转换器（WS04/WS10 系列）中已将此声明统一为 0x20 (u8)；已验证的
  `terncy-ws07-d3.mjs` 保持原样不动，避免触碰经过实机验证的文件。

## 4. 行为级交叉验证

1. **disableRelay 写值取反**：逆向指出 0xFCCC attr 0x17 (disableRelay) 写入时固件
   执行 `rsbs r1,r1,#1`（取反）。转换器实测文档中，cmd 0x13（对应
   `cfg-disable-relay` / attrId 0x0017）在 `genOnOff.on()` 之后追加会导致
   "继电器通电一次后立刻关闭"——与"写入语义取反"完全吻合。这也解释了为什么
   已验证转换器选择 `enablePureInput (0x1d)` 而不是 `0x13` 作为主控制路径。
2. **0x0026 只读**：见第 3 节，实测 `0x88 READ_ONLY` 与逆向"回路是否含继电器"
   的只读状态语义互证。
3. **多路开关 = 多 endpoint**：逆向结论"每个 endpoint 一个 OnOff server 簇 +
   各自 0xFCCC 配置"与 WS07-D3 实测（l1=1, l2=2, l3=3，各自独立配置）一致，
   也与 node-struct 中 WS04/WS10 各 endpoint 结构一致。

## 5. 互补部分（不冲突）

- 已验证转换器的无线按键上报（0xFCCC 上行的 cmd 0x00 多击、cmd 0x29 长按/释放）
  来自实机抓包；逆向命令表以下行（client→server）命令为主，上行响应只提取到
  cmd 3 (ReadLink) 和 cmd 4 (ReportLuminanceAndOccupancy)。两者互补，无冲突。
  新转换器沿用实机验证过的 0x00/0x29 帧布局。
- SP01 的 `haElectricalMeasurement` 标准簇处理（power/voltage ÷ 100、
  current 由 power/voltage 计算）属于标准簇范畴，逆向资料第 5 节"标准簇直接映射"
  与此不冲突。

## 6. 对新转换器的影响

基于"完全一致"的结论，新转换器（`terncy-ws04-d2/d3`、`terncy-ws10-d1/d3/d4`）
直接复用 WS07-D3 已验证的 0xFCCC 控制路径：

- `operation_mode` / `relay_enabled` / `relay_constant_power` → cmd 0x1d
- `wireless_led_status` → cmd 0x1f（仅无线模式有效，继电器模式返回 0x87）
- `led_feedback_mode` → attr 0x001f 写入（源 endpoint 110）
- 无线按键 action → 0x00 / 0x29 原始帧解析

VG01 的 0xFDDD 协议见 `terncy-vg01.mjs` 头注释：上行 0x09 报告帧按逆向布局解析，
下行控制（0x01 GeneralControl 子命令 0x31-0x34）因寻址字段与枚举值未经嗅探确认，
暂不发送。

## 7. 尚未具备指纹数据的设备

`XYAN_PROTOCOL_MAP.md` 第 6 节还列出以下设备，但本次逆向提取的
`node_struct_summary.json` 中没有它们的 endpoint 结构，无法可靠编写指纹，
待补充 node-struct 后再写转换器：

- DIM001 / DIM003 / DL002 / LB001 / MT001（CCT 灯，标准簇直出）
- ST01-CV（RGB+CCT 灯带）
- CM01 / CM07（窗帘电机，WindowCovering + 0xFCCC 校准命令 9/10/12/17/25/26/27/36/37/40）
- SL02（门锁，DoorLock + 0xFE03）
- RM02（场景遥控，仅 client 簇）
