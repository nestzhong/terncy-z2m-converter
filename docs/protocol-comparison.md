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

## 7. 原缺失指纹设备 —— 已补齐（2026-09-04 更新）

此前 `node_struct_summary.json` 仅含 6 个型号（汇总脚本当时只跑了在网型号），
现已重新全量提取（94 型号），以下设备的 node-struct **全部存在**，指纹可写。
详见 `docs/fingerprints-missing-models.md`：

- DIM001 / DIM003 / DL002 / LB001 / MT001（CCT 灯，dev 0x010c，标准簇直出；
  色温范围来自 ColorCtrl 0x400B/0x400C，逐型号不同；colorCapabilities 为厂商占位值不可信）
- ST01-CV（RGB+CCT 灯带，dev 0x010d，colorMode=XY，纯标准簇无私有簇）
- CM01 / CM07 / RM02（窗帘，dev 0x0202；标准 WindowCovering cmd5 百分比/cmd7 tilt；
  0xFCCC 窗帘属性区 0x11–0x18 已反汇编定名：0x11 方向/0x12 状态/0x14 行程校准/0x15 电机类型/0x18 指示灯；
  校准走 0xFCCC cmd 9/10/12/17/25/26/27/36/37/40；CM07 支持 tilt）
- SL02（门锁，dev 0x000a，睡眠设备；DoorLock 标准 + 0xFE03=E19 密钥表，
  attr8=keyTableLength、attr9=tableState、cmd1=GetKeys）
- ~~RM02（场景遥控）~~ 更正：RM02 是窗帘控制器（备份实体为柔纱帘/香格里拉帘）；
  目录中的 `RDM002` 实为 Philips Hue Smart Button（第三方，z2m 已官方支持）

遗留待嗅探（不阻塞）：窗帘私有上报帧 cmd 号（**已解决：0xFCCC cmd 0x26，2026-09-05 抓包确认载荷
= [motorStatus(u8): 0=停/1=开中/2=关中, currentPosition(u8): 开%，未校准时=255]；同批抓包确认
App 用 WC cmd5 百分比（0=关 100=开）驱动、attr8 同为开%语义**）、0xFCCC attr 0x13/0x16 语义、
~~tilt u16 单位~~（已解决：App 滑杆 -90˚~90˚ 角度）、CM01 实机 manufacturerName。

## 8. App 交叉验证（第二轮）—— 全家族通过（2026-09-04）

blutter 反编译 Terncy APK（Dart 2.16.2），提取 146 个设备分类函数、1842 键×4 语言文案、
8533 函数字符串引用（`/Users/zhonglifeng/Agents/terncy/app_extract/`，
blutter 原始输出已持久化至 `app_extract/asm/xlive/` 112MB + `app_extract/blutter_meta/`）。

验证结论（明细见 `XYAN_PROTOCOL_MAP.md` §9 与 `fingerprints-missing-models.md` §7-8）：
- **窗帘**：第一轮已通过（类型/方向/行程/边界/百分比/tilt 逐项吻合）
- **灯具**：色温范围页↔0xFCCD cmd3、开灯曲线↔cmd5 bezier、额定电流↔cmd5 SetPowerGain、
  mA 校准↔cmd8+PowerCalibrationFinished、高精度亮度↔cmd39、渐变↔LevelCtrl attr18/19 —— 全部吻合
- **墙开**：禁用继电器/可编程按键/按键功能/互锁/指示灯 ↔ 0xFCCC attr0x17/0x1C/0x10/0x23/0x18 —— 吻合；
  命名规则确认（WS01/AU/US、D 有线/S 电池/TM 触摸、路数后缀、WS06/11 带 PIR）
- **传感器**：保持时间↔attr0x2B、灵敏度↔attr0x2E、PP02 双路方向↔attr0x32/33、
  PS01 感应距离↔0xFCD1 attr1 —— 吻合
- **门锁**：6 位授权码↔标准 DoorLock PIN 命令（固件符号确认 Set/Get/ClearPINCode）、
  自动上锁↔SL01/02/03、E19 钥匙表↔0xFE03 —— 吻合（SL03 新型号确认）
- **插座**：功率↔ElectricalMeasurement 0x0304、上电恢复↔attr0x19 —— 吻合
- **新发现家族**：HV01/HV02 地暖阀（0xFCCF，3 路）、AC01 温控面板（标准 Thermostat+0xFCCF）、
  TV01 影音、CFL001 风扇灯 —— 语义待嗅探，本轮不写转换器

对转换器的影响：原 §7 五款缺失灯 + 窗帘 + 门锁的转换器方案**无需修改**，仅追加可选
exposes（色温范围/曲线/电流/校准/断电记忆）；新增家族按 `XYAN_PROTOCOL_MAP.md` §6 扩展表实施。

## 9. RM02 抓包实锤与转换器对齐（2026-09-05 更新）

在 GW2 对 TERNCY-RM02（IEEE dc:8e:95:ff:fe:83:56:97，短地址 0xc026）完成 6 轮抓包：
开 / 关 / 停止 / 位置设定 / 窗帘方向 / 行程校准（完整 4 步：进校准 → 上键到全开并确认 →
下键到全关并确认 → 结束），与已实锤的 CM01 交叉核对：

- **正常控制与 CM01 完全一致**：开/关/定位 = 标准 WindowCovering `GoToLiftPercentage`
  (0x05) 单字节 **开% 载荷**（0=全关、100=全开，实测 0x00/0x64/0x51/0x45/0x5b 等）；
  停止 = 标准 `Stop`；运动/位置推送 = 私有 0xfccc cmd **0x26**（载荷
  `[motorStatus, currentPosition]`，0=停/1=开中/2=关中，开%，未校准=255），attr 8 同为开% 语义。
- **方向**：0xfccc cmd 0x0c `SetDirection`，载荷 0=正向/1=反向；设备回带 mfg Default Response，
  随后主动上报 attr 8 翻转（100↔0），与 CM01 一致。
- **行程校准与 CM01 不同（重要）**：
  - CM01 校准 = `DeleteAllTrip`(cmd 0x09) → WC DownClose → WC UpOpen；
  - RM02 校准**全程不用 cmd 0x09，也不用 WC UpOpen/DownClose**，而是私有点动限位流程：
    `ConfigBoundary`(cmd 0x24, 载荷 u8,u8，实测 0x0000→0x0001 开场、0x0100 上端确认、
    0x0101 下端确认/收尾) + `TimeoutControl`(cmd 0x25, 载荷 [方向 u8, 时长 u16LE]，
    实测开=0x008813/5000ms、关=0x018813/5000ms 及 800ms 微调) 反复点动，
    电机上行/下行期间持续上报 status 1/2 + pos 255；到位后 WC Stop；
    收尾 ConfigBoundary 0x0101 后设备推 attr 0x14 tripConfigured 0→1 并带最终位置。
  - 因该流程需人在卷帘旁目视限位，z2m 转换器**不暴露** 0x24/0x25；
    迁移 RM02 前先在 Terncy App 完成校准（或迁移后经 App 校准，再让 z2m 重新面试）。
- **转换器对齐**：`terncy-rm02.mjs` 已按 CM01 实锤方案重写 —— 本地 cover 转换器走开% 语义
  （`goToLiftPercentage` 直发 + attr8 原样 + cmd 0x26 MotorReport 解析），**不再依赖标准
  cover 与 `invert_cover`**（旧注释中的 invert_cover 指引已删除，因其会错误对调方向语义）。
  属性区/命令区（cmd 0x09/0x0a/0x0c/0x16 + attr 0x11/0x12/0x14/0x15/0x18）与 CM01 保持一致。
