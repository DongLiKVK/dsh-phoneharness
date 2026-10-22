# 对话页操作条：覆盖范围与判定规则

对应需求：**「这几个按钮的功能对所有会话生成的文本都要有效果」**。
版本：APK 0.6.26（code 42）/ 插件 0.5.19。

## 问题

六个动作（复制 / 赞 / 踩 / 朗读 / 分享 / 重新生成）原本只挂在「有正文的消息」上。
但本项目的会话大量是 agent 型轮次：一轮里 66 次工具调用、55 条思考标记，正文只有 1–2 条，
甚至整轮没有正文。这类轮次里 **操作条根本不出现**，用户看到的就是「按钮对生成内容没作用」。

以设备上的真实会话 `session-24c7d3a7…` 为例（191 条）：

| 类型 | 条数 |
| --- | --- |
| assistant / tool | 66 |
| tool / tool | 66 |
| assistant / marker（思考） | 55 |
| assistant / text | 2 |
| user / text | 1 |
| system / marker（处理完成） | 1 |

## 规则

1. 每条正文消息（user / assistant text）照旧带自己的操作条。
2. 一轮里连续的「思考标记 + 工具调用」仍聚成一块 `thinkGroup`；**只有当这一轮没有任何正文**时，
   这一块才承担操作条 —— 复制/朗读/分享拿到的是这一块里全部可读文字（工具 preview、思考正文），
   赞/踩与重新生成按这一块定位。
3. 「本轮最后一块」的判定要跳过末尾的系统标记（「处理完成」那种小胶囊），否则 agent 轮次永远
   算不上 tail，操作条仍然不出现。
4. 同一轮不出现两条操作条：有正文时正文带、无正文时聚合块带，二选一。

## 代码落点（`android/src/com/lc/phoneharness/ChatActivity.java`）

- `BarTarget`：操作条的作用对象（id / 正文 / 图片 / seq / 原 Item）。一条消息或一整块聚合区都能包成它，
  六个动作只认这个对象 —— 这是「所有生成文本都能用」的抽象来源。
- `groupTarget(List<Item>)`：把聚合块成员的工具正文与思考文字用空行拼成一段可复制/可朗读的文本。
- `contentAfter(sorted, from)`：判断这一块后面还有没有真的助手内容（跳过 role=system 的标记）。
- `roundHasText(sorted, index)`：从当前块往回找到轮首、往后扫到轮尾，看这一轮有没有正文。
- `regenerate(BarTarget)`：重发**这条操作条所在那一轮**的用户消息；找不到（例如只加载了后半段）
  才退回「最后一条用户消息」，与原实现一致。无参 `regenerate()` 委托 `regenerate(null)`。
- 长按菜单（`showMessageMenu`）同样走 `BarTarget`，与操作条行为一致。

## 夹具与复现

`tools/fixtures/round-tool-only.json` 是一段「纯工具轮次」的会话缓存（user → 思考 → 4 次工具 → 处理完成），
推到设备上就能在没有服务端的情况下复现这一形态：

```
adb push tools/fixtures/round-tool-only.json /data/local/tmp/fixture.json
adb shell "cp /data/local/tmp/fixture.json /data/data/com.lc.phoneharness/files/cache/session-session-fixture-0001.json"
adb shell am force-stop com.lc.phoneharness
adb shell am start -n com.lc.phoneharness/.ChatActivity \
  --es sessionId session-fixture-0001 --es title "纯工具轮次"
```

## 实测（0.6.26）

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 纯工具轮次出现操作条 | 思考块下方 6 图标 | `shots/lead/v13/k-fixture2.png` |
| 复制 | toast「已复制」 | `shots/lead/v13/l-copy.png` |
| 赞 | 图标转主题蓝 + toast「已点赞」 | `shots/lead/v13/m-like.png` |
| 朗读 | toast「本机没有可用的朗读引擎」（模拟器无 TTS 包） | `shots/lead/v13/n-speak.png` |
| 重新生成 | toast「正在重发…」+ 输入框回填上一条提问 | `shots/lead/v13/q-regen.png` |
| 赞的持久化 | `am force-stop` 重启后仍为蓝 | `shots/lead/v13/r-persist.png` |
| 正文消息的操作条未被破坏 | 复制仍出「已复制」 | `shots/lead/v13/s-text-copy.png` |
| 回归 | PASS=34 FAIL=0 未验证=6 | `shots/harness/verify-report.json` |
