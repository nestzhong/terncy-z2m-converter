# 缺失型号指纹提取报告（protocol-comparison.md §7 补齐）

日期：2026-09-04

数据来源：
- `fw_extract/live/xlive/zbs/structs/ota-version-signed/1228/`（node-struct，全部 94 型号已汇总进 `z2m_converters/node_struct_summary.json`）
- `backups/gw1_full_dump.json` / `gw2_full_dump.json`（实机实体，ground truth）
- `libZigbeeService.so` / `libEzspEngine.so` 反汇编（`tools/wc_e19_disasm.py`、`tools/endpoint_cfg_disasm.py`）

结论：§7 列出的 10 个型号 **node-struct 全部存在**（之前缺失只是 6 型号汇总遗漏），
指纹已可编写。另有两项更正：
- `TERNCY-RM02` 不是"场景遥控"，实为**窗帘控制器**（备份实体为柔纱帘/香格里拉帘，profile 5）。
- `RDM002`（struct 目录里同存的）是 **Philips Hue Smart Button**（Signify），第三方设备，z2m 已有官方支持，不属于本项目。

---

## 1. CCT 灯：DIM001 / DIM003 / DL002 / LB001 / MT001

### 指纹（5 款结构完全一致，仅色温参数不同）
```js
{ modelID: 'DIM001', manufacturerName: 'Xiaoyan' }   // 同理 DIM003/DL002/LB001/MT001
```
- 单 endpoint：EP1，profile 0x0104，deviceId **0x010c**（Color Temperature Light）
- nodeType=2（路由），mfgCode 0x1228
- 备份实体（profile 17）：`on` + `brightness` + `colorTemperature`（单位=mired，实测 334）

### 端点结构
| 簇 | 类型 | 关键属性 |
|---|---|---|
| Basic 0x0000 | server | attr4=Xiaoyan, attr5=型号 |
| OnOff 0x0006 | server | attr0（needRead） |
| LevelCtrl 0x0008 | server | attr0 当前亮度（DIM001=0xfe）；attr18/19 最小级 20 |
| ColorCtrl 0x0300 | server | attr8 colorMode=**0x02（色温）**；attr7 capabilities=厂商占位值（不可信，见下）；0x400B/0x400C 见下表 |
| Illuminance 0x1000 | server | 仅 0xfffd（占位，无照度属性） |
| XyanConfig 0xFCCC | server | attr0 状态字；attr25 keepOnOff；attr48(u32)/49(u16 xyanProfile=0x11) |
| XyanSceneEffect 0xFCCD | server | 灯光特效（cmd 0/3/5） |
| XyanSceneMgmt 0xFCCE | server | 场景序列（cmd 0/1/3/4/5） |
| OTA 0x0019 | client | 标准 OTA |

### 色温范围（来自 node-struct ColorCtrl 0x400B/0x400C，ZCL8 CoupleMin/StartUp）
| 型号 | 0x400B (mireds) | 0x400C (mireds) | 建议 exposes 范围 |
|---|---|---|---|
| DIM001 | 100 | 500 | 100–500 |
| DIM003 | 142 | 625 | 142–625 |
| DL002 | 151 | 500 | 151–500 |
| LB001 | 142 | 625 | 142–625 |
| MT001 | 142 | 625 | 142–625 |

### 注意
- **colorCapabilities（attr7）不可信**：DIM001=0x0064、其余=0x008e，均缺标准 0x10（色温）位，
  与实机能力矛盾——是固件占位值。转换器必须显式 expose `color_temp`，不要依赖 z2m 通用灯的自动探测。
- **colorTempPhysicalMin/Max（attr3/4）= 24939/24701**：五款完全相同的垃圾常量，禁止用于范围。
- z2m exposes：`e.light_brightness_colortemp(<min>,<max>)` + 可选场景/特效（0xFCCD/0xFCCE 暂不接）。

---

## 2. RGB+CCT 灯带：TERNCY-ST01-CV

### 指纹
```js
{ modelID: 'TERNCY-ST01-CV', manufacturerName: 'Xiaoyan' }
```
- 单 endpoint：EP1，profile 0x0104，deviceId **0x010d**（Extended Color Light）
- 备份实体（profile 27）：`on/brightness/hue/saturation/colorTemperature` —— **xy + hs + 色温全支持**

### 端点结构（与 CCT 灯的差异）
- ColorCtrl：attr0 currentHue、attr1 currentSaturation（needRead）；attr8 colorMode=**0x01（XY）**；
  attr7 capabilities=0x0116（含标准 0x10 色温位 + 厂商 0x100 位）
- 色温：0x400C startup=500 mireds；0x400A=25（厂商私有，含义不明）
- **无私有簇**（无 0xFCCC/FCCD/FCCE）——纯标准簇设备
- LevelCtrl：attr17 minLevel=0xff、0x4000=0xff（厂商私有）

### 注意
- z2m exposes：`e.light_brightness_colorxy_colortemp(150, 500)`；hs 也可 expose（固件有 currentHue/Saturation）。
- 同样禁止信任 colorCapabilities 自动探测。

---

## 3. 窗帘电机：TERNCY-CM01 / TERNCY-CM07 / TERNCY-RM02

### 指纹
```js
{ modelID: 'TERNCY-CM01', manufacturerName: 'Xiaoyan' }  // ⚠ 见下
{ modelID: 'TERNCY-CM07', manufacturerName: 'Xiaoyan' }
{ modelID: 'TERNCY-RM02', manufacturerName: 'Xiaoyan' }
```
- 单 endpoint：EP1，profile 0x0104，deviceId **0x0202**（Window Covering）
- 备份实体（profile 5）：`curtainMotorStatus` + `curtainPercent` + `tiltAngle`
- ⚠ **CM01 的 node-struct Basic 簇没有 attr4（manufacturerName）**，只有 attr5=TERNCY-CM01。
  实机大概率仍报 "Xiaoyan"，但配对失败时应放宽为仅 modelID 匹配。

### 端点结构
| 簇 | 关键属性 |
|---|---|
| WindowCovering 0x0102 | attr0 type=0；attr7 ConfigStatus=0x03；**attr8 CurrentPositionLiftPercentage（needRead）**；CM07 另有 attr16-19 行程限位、attr23=0x14（含 tilt 位） |
| XyanConfig 0xFCCC | 窗帘私有属性区 0x11–0x18（下表） |
| OTA 0x0019 client | 标准 |

### 0xFCCC 窗帘属性（反汇编确认）
| attr | 名称 | 确认方式 | 说明 |
|---|---|---|---|
| 0x11 (17) | motorDirection | `set/getWindowCoveringMotorDirection` 直接读写 | 0/1 方向；对应 cmd 12 CurtainSetDirection |
| 0x12 (18) | motorStatus | `getWindowCoveringMotorStatus` | 只读 → 备份 `curtainMotorStatus` |
| 0x13 (19) | （未知） | 无 getter/setter | CM01/CM07 默认 0xff，疑似运行时量，待嗅探 |
| 0x14 (20) | tripConfigured | `getWindowCoveringMotorTripConfigured` | 行程校准完成标志 |
| 0x15 (21) | motorType | `getWindowCoveringMotorType` | 电机类型 |
| 0x16 (22) | （未知） | 无 | 待嗅探 |
| 0x18 (24) | ledIndicator | `setConfigLedIndicator`（与开关共用） | 指示灯 |

### 控制命令（全部标准/已还原）
| 方向 | 簇 | cmd | 语义 |
|---|---|---|---|
| 下行 | 0x0102 | 0/1/2 | Up-Open / Down-Close / Stop（标准） |
| 下行 | 0x0102 | **5** | GoToLiftPercentage（u8，`EzspZclWindowCoveringSetPercentRequest` 反汇编确认） |
| 下行 | 0x0102 | **7** | GoToTiltValue（u16，`EzspZclWindowCoveringSetTiltAngleRequest`；仅 CM07 支持） |
| 下行 | 0xFCCC | 9/10/12/17/25/26/27/36/37/40 | 校准类（DeleteAllTrip / FactoryRecovery / SetDirection / SetDragging / Set·RunTo·DeleteTripPosition / ConfigBoundary / TimeoutControl / StartMoving） |
| 上行 | 0xFCCC | ？ | `EzspZclXyanReportMotorStatusAndPercent`（构造函数未导出，cmd 号需嗅探） |

### tilt 支持
- CM07：WindowCovering attr23=0x14 → **支持 tilt**（备份 tiltAngle=-85 有效值）
- CM01 / RM02：tiltAngle=-190855846（无效哨兵）→ 不支持 tilt

### z2m exposes 建议
- `e.cover_position()`（标准 fz/tz cover；注意 0=关 100=开与 App 方向一致性需实测）
- `motor_status`：0xFCCC attr 0x12 读取（ea.STATE_GET）
- `trip_configured`：attr 0x14；`motor_direction`：attr 0x11 或 cmd 12
- CM07 追加 `tilt`（cmd 7；**单位已由 App 侧确认为角度 -90˚~90˚**，见 `app_extract/README.md` 交叉验证）
- 校准动作（factory_recovery / delete_all_trip / set_direction）做成 `e.enum`/button expose
- 位置上报优先依赖标准 0x0102 attr8 reporting；私有上报帧作为嗅探后的增强

---

## 4. 门锁：TERNCY-SL02

### 指纹
```js
{ modelID: 'TERNCY-SL02', manufacturerName: 'Xiaoyan' }
```
- 单 endpoint：EP1，profile 0x0104，deviceId **0x000a**（Door Lock）
- **nodeType=4（睡眠终端）**，PollCtrl 在服；z2m 需注意电池设备的轮询节奏
- 备份实体（profile 11）：`lockState` + `battery`（80）

### 端点结构
| 簇 | 关键属性/命令 |
|---|---|
| PowerCfg 0x0001 | attr33=0x21 BatteryPercentageRemaining（needRead）→ `battery = val/2` |
| DoorLock 0x0101 | attr0 LockState（needRead，1=已锁）；attr1 LockType=0；attr2 ActuatorEnabled=1；attr3 DoorState=4；attr33=0x21 Language="zh"；attr35=0x23 AutoRelockTime=0；attr36=0x24 SoundVolume=3 |
| XyanDoorLockExt 0xFE03 | E19 钥匙/密钥表（下表） |
| PollCtrl 0x0020 | checkin 间隔 0x3840 |

### 0xFE03（E19）属性（反汇编确认）
| attr | 名称 | 确认方式 |
|---|---|---|
| 8 (0x08) | keyTableLength (u16) | `setE19LockKeyTableLength` 写 attr8 |
| 9 (0x09) | tableState (u8) | `getE19LockTableState` / `allocE19GetUserRequest` 读 attr9 |
| 3–7 | E19 钥匙记录 | `E19LockKeyTable` / `updateLockKeyRecord` |

- 下行命令：0xFE03 cmd **1** GetKeys（mfg 0x1228，`EzspZclE19GetKeysRequest(ep,u8,u8)` 反汇编确认）
- 锁控命令：标准 DoorLock cmd 0/1（Lock/Unlock，`EzspZclDoorLockLock/UnlockRequest(ep)`）；
  另支持 SetPinCode/GetPinCode/ClearPinCode（标准 cmd）
- 事件：DoorLock OperationEventNotification（cmd 0x20）/ ProgrammingEventNotification（cmd 0x21）
  网关有完整处理（`onZclDoorLockOperationEventNotification`）→ z2m 可映射为 `action`
  （如 `unlock_keypad` / `lock_keypad`，含 source 字段）

### z2m exposes 建议
- `e.lock()`（fz.lock + tz.lock，标准）
- `e.battery()`（fz.battery）
- `door_state`（attr3）、`auto_relock_time`、`sound_volume`
- E19 密钥表可不 expose（配对/卡片管理功能，z2m 场景用不上）；如需：`key_table_length` + `key_table_state`
- 操作事件 → `action`（可选增强）

---

## 5. 汇总：各型号转换器指纹一览

| 型号 | fingerprint (modelID) | deviceId | exposes 要点 |
|---|---|---|---|
| DIM001 | DIM001 | 0x010c | light + brightness + color_temp 100–500 |
| DIM003 | DIM003 | 0x010c | light + brightness + color_temp 142–625 |
| DL002 | DL002 | 0x010c | light + brightness + color_temp 151–500 |
| LB001 | LB001 | 0x010c | light + brightness + color_temp 142–625 |
| MT001 | MT001 | 0x010c | light + brightness + color_temp 142–625 |
| TERNCY-ST01-CV | TERNCY-ST01-CV | 0x010d | light + brightness + color_xy(+hs) + color_temp |
| TERNCY-CM01 | TERNCY-CM01 | 0x0202 | cover_position + motor_status + 校准 |
| TERNCY-CM07 | TERNCY-CM07 | 0x0202 | 同 CM01 + tilt |
| TERNCY-RM02 | TERNCY-RM02 | 0x0202 | 同 CM01（窗帘控制器，非遥控） |
| TERNCY-SL02 | TERNCY-SL02 | 0x000a | lock + battery + door_state（睡眠设备） |

遗留待嗅探项（不阻塞转换器编写）：
1. ~~0xFCCC 窗帘私有上报帧的 cmd 号与负载布局~~ **已解决**：0xFCCC cmd 0x26（`onZclClusterCommand` 分发表反汇编确认），motorStatus/percent 字段在帧内 0x19-0x1c 区域（字节序待嗅探最终确认）
2. 0xFCCC attr 0x13 / 0x16 语义
3. ~~GoToTiltValue 的 u16 单位~~ 已解决：App 侧滑杆为 -90˚~90˚（角度），见 `app_extract/`
4. CM01 实机 manufacturerName 实际值

## 6. App 侧交叉验证（2026-09-04）

用 blutter 反编译小燕之家 APK（Dart 2.16.2），App 的窗帘设置卡片与固件逆向**逐项吻合**：
类型(左/右/双开)↔attr0x15、方向↔attr0x11/cmd12（改方向清行程）、行程校准↔cmd25/26/27、
边界↔cmd36、百分比↔cmd5、调光角度↔cmd7（仅 CM04/CM07，与 App `supportCurtainAngle` 白名单一致）、
停止↔cmd2；CM07=梦幻帘、RM02=卷帘（App `isRollerCurtain`）。
全部产物（1842 键×4 语言文案、146 个设备分类函数、8533 函数字符串引用）见
`/Users/zhonglifeng/Agents/terncy/app_extract/`（含 README 交叉验证表）。

## 7. 灯具家族交叉验证（第二轮，2026-09-04）

App 详情卡功能 ↔ 固件落点（全部有双向证据，详见 `XYAN_PROTOCOL_MAP.md` §9）：

| App 功能 | 固件落点 | 覆盖型号（App 白名单） |
|---|---|---|
| 色温范围设置（2700–6500K 选择页） | 0xFCCD cmd 3 SetColorTempRange(u16,u16) | DIM001/2/3/4、MT001/3、TWJH1/2 |
| 开灯曲线（缓启/匀速/快启） | 0xFCCD cmd 5 SetBezier(u8,u16×6) | DIM002/3/4、TWJH1/2 |
| 额定最大电流（mA） | 0xFCCC cmd 5 SetPowerGain(ep,u16) | 调光器（DIM 系） |
| 灯具校准（mA，完成事件回传） | 0xFCCC cmd 8 PowerCalibration + PowerCalibrationFinished | DIM002/3/4、DL002、TWJH1/2 |
| 高精度亮度 | cmd 39 XyanMoveToLevel(ep,u32,u32) | 深度：DIM001=1/1000；DIM002/3/4/CL003/4/ING/LB001/ML001/TWJH=1/10000 |
| 开/关渐变时间 | LevelCtrl attr 0x12/0x13（node-struct 18/19） | CL/DIM/DL/HK-MT-CCT/ING/LB/ML/TWJH |
| 断电记忆 | 0xFCCC attr 0x19（灯 node-struct 均含） | 全部 CCT 灯 |

**z2m exposes 追加建议**（在 §1 五款灯基础上）：
- `color_temp_range`（numeric，写入 → 0xFCCD cmd3）
- `power_on_behavior`/`keep_status`（attr 0x19）
- DIM001/003：`max_current`（mA）、`light_calibration`、`light_curve`（enum slow/average/quick → cmd5 预设贝塞尔）

## 8. 开关/传感器/门锁/插座家族交叉验证（第二轮，2026-09-04）

### 8.1 墙开/无线开关（App 分类 146 函数确认命名规则）
- 系列：WS01(国标)/AU(澳标)/US(美标)、WS02、WS03(120 型)、WS04/07/09/10（1-4 路）、LF01-D1..4（灯显墙开）、WS05-D4/WS06-D4/WS11-D4（键盘开关，WS06/11 带 PIR）
- `-D*` 有线 / `-S*` 电池无线（nodeType 4）/ `-TM-` 触摸
- 已验证功能：禁用继电器（attr0x17 取反）、可编程按键/解耦（attr0x1C+cmd29）、按键功能（attr0x10+cmd16）、互锁（attr0x23/24，BS01 默认 500ms）、指示灯（attr0x18）
- z2m：多路 `state_l*` + 上述配置 exposes；S 版电池设备经 PollCtrl，勿高频下发

### 8.2 传感器家族
| 型号 | 类型 | 标准簇 | 私有配置 |
|---|---|---|---|
| PP01 | 存在感应（电池，双路左右） | Occupancy+Temp+Illum+PollCtrl | attr 0x0A=15lux、0x2B/0x2C=5000ms |
| PP02 | 存在感应（有线，双路方向检测） | Occupancy+Illum | attr 0x2B/2C=5000、0x2E/2F=60、0x32/33 双路使能 |
| PP03 | 移动感应（PIR） | Occupancy+Temp+PollCtrl | attr 0x2B=17000ms、0x2E=45、0x32=1 |
| PS01 | 存在感应面板 | Illum+0xFCD1 | 0xFCD1: attr1=距离(u32=30000)、attr2=灵敏度(=100%)；0xFCCC attr0x18 指示灯 |
| DC01 | 门磁 | BinaryInput(attr85)+Temp | 0xFCCC attr0x09 未定名 |
| SD01/SK01 | 智能旋钮 | —（client 簇） | 0xFCCC attr 0x1A/0x1B |
| BS01-G1/G2/G3 | 场景按钮 | — | 3 ep，attr 24/28/32/34-37 |

App 侧对应：保持时间=attr0x2B、灵敏度=attr0x2E、左右/方向=PP02 attr0x32/33（`OccupancySensingPackedReport` 上报，cmd 号待嗅探）、感应距离仅 PS01。

### 8.3 门锁（SL01/SL02/SL03）
- DoorLock attrs：0=LockState、1=LockType、2=ActuatorEnabled、3=DoorState、33=charstr 语言"zh"、35/36 疑似自动上锁时间/模式（待嗅探）
- 固件符号确认：Set/Get/ClearPINCode（cmd5/6/7）+ Operation/Programming Event 上报
- App "控制授权码"（6 位数字密码）= PIN 码；"开锁后自动上锁" = SL01/02/03 均支持
- 0xFE03 = E19 密钥表（App 有 lock_key_list/detail 管理页）
- z2m：`lock`+`battery`+`door_state`+可选 `pin_code`（z2m 已有 door_lock pin 支持）；睡眠终端勿轮询

### 8.4 插座（SP01/SP02/XP01/HK-PLUG-A）
- SP01 node-struct：OnOff + ElectricalMeasurement（attr 772=0x0304 功率、1285=0x0505 电压、1288=0x0508 电流）+ 0xFCCC attrs 5/6/8/24/25/34
- 上电恢复（App recoverRelay）：XP01/HK-PLUG-A/HK-LN-SOCKET-A → attr 0x19 + cmd 24
- 中心指示灯：XP01/SP01/HK-PLUG-A → attr 0x18
- z2m：`state`+`power`+`voltage`+`current`(+`power_on_behavior`)

### 8.5 暖通（新发现家族）
- HV01/HV02 地暖阀：3 endpoint × 0xFCCF（attr3/4=i16 温度=26、attr7=0x0f、attr9/10）；App 需关联空调/温度传感器
- AC01 温控面板：标准 Thermostat+FanCtrl+PumpConfig(0x200/203) + 0xFCCF（attr3/4=0x4e21）；App 归类 ZHH VRV 家族
- 语义均待嗅探，暂不写转换器

### 8.6 遗留待嗅探项（第二轮新增 → 第三轮已大部分解决，详见 `XYAN_PROTOCOL_MAP.md` §9.3）
1. 0xFCCF：已确认=温控标识簇；HV01 attr4=目标温度(默认 26°C)，其余低优先级
2. DoorLock attr 35/36：已推断为自动上锁秒数/音量（ZCL8 -0x10 偏移），`_autoLocked` '6'=默认秒数
3. OccupancySensingPackedReport：已确认 0x0406 cmd 1（1 字节打包位）；照度+占用=0xFCCC cmd 4
4. 旋钮已确认：0x1A=lastDialUsedMs、0x1B=lastDialAngle，事件=0xFCCC cmd 0x15
5. 仍未知（低优先级）：DC01 attr 0x09、SP01 attr 6
