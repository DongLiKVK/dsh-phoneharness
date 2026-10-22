package com.lc.phoneharness;

/** 版本号与文案常量。改版本时 build.sh 的 --version-name 也要一起改。 */
public final class App {
    /** 编译期兜底版本号；界面上一律用 versionName(ctx) 读安装包真值。 */
    public static final String VERSION_NAME = "0.5.6";
    public static final String NAME = "PhoneHarness";
    public static final String SLOGAN = "深水里，聊点真的";

    /**
     * 首页空会话名用的兜底标语：走资源，切到英文时跟着变。
     * 无 Context 的老调用点仍读 {@link #SLOGAN} 常量（中文逐字不变）。
     */
    public static String slogan(android.content.Context context) {
        return context == null ? SLOGAN : context.getString(R.string.misc_slogan);
    }

    /** 安装包的真实版本名（如 0.5.6）：编译期常量容易忘记跟着改，界面别信它。 */
    public static String versionName(android.content.Context ctx) {
        try {
            android.content.pm.PackageInfo info = ctx.getPackageManager()
                    .getPackageInfo(ctx.getPackageName(), 0);
            if (info.versionName != null && info.versionName.length() > 0) return info.versionName;
        } catch (Exception ignore) {
        }
        return VERSION_NAME;
    }

    /** 安装包的真实 versionCode：检查更新时跟宿主 /apk/meta 比大小。 */
    public static int versionCode(android.content.Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionCode;
        } catch (Exception ignore) {
            return 0;
        }
    }

    private App() {
    }
}