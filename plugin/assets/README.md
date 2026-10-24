# plugin/assets

`dsh-phone.apk` 与旁车 `dsh-phone.apk.json` 是**发版时注入**的构建产物，不进 git（`.gitignore` 已排除）：
APK 46 MB、插件包 17 MB，提交进仓库会让克隆和推送都变慢。

## 发版时

```bash
cp ../../android/bin/dsh-phone.apk      ./
cp ../../android/bin/dsh-phone.apk.json ./
npm pack --silent                        # 得到内含 APK 的 dsh-phoneharness-<version>.tgz
```

## 只想要 APK

从 [Releases](https://github.com/DongLiKVK/dsh-phoneharness/releases/latest) 下 `dsh-phone-<versionName>.apk`，
不用从源码构建。

## 没有 APK 时

`npm run verify` 的打包清单会跳过 APK 两项检查并打一行 `warn`，其余检查照常；插件装上后 `GET /apk` 与
`/apk/meta` 返回 `404 no_apk`（面板会提示包里没带 APK）。
