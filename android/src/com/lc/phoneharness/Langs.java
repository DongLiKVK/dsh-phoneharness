package com.lc.phoneharness;

import android.content.Context;
import android.content.res.Configuration;
import android.os.Build;

import java.util.Locale;

/**
 * 应用内语言：zh（基准语言，全部文案的原文）| en。
 *
 * <p>与主题一样由 app 自己持有，不跟系统 Locale —— 参考客户端同样是 app 内自持语言。
 * 生效方式：每个 Activity 在 {@link android.app.Activity#attachBaseContext} 里把 base
 * 换成带目标 Locale 的 configuration context，之后 getString(...) 会自动命中
 * res/values-en/ 那一套资源；界面建好之后语言被改过，则在 onResume 里 recreate（与主题
 * 的 darkAtBuild 完全同一套做法）。
 */
public final class Langs {

    public static final String ZH = "zh";
    public static final String EN = "en";

    /** 语言自身的写法：固定不译（切到英文时仍显示「中文（简体中文）」）。 */
    public static final String ZH_LABEL = "中文（简体中文）";
    public static final String EN_LABEL = "English";

    /** prefs 键：语言。与 Prefs 共用同一个 SharedPreferences 文件。 */
    private static final String KEY = "lang";

    private Langs() {
    }

    /** 当前语言：zh（默认）| en。 */
    public static String current(Context context) {
        String value = context.getSharedPreferences(Prefs.FILE, Context.MODE_PRIVATE)
                .getString(KEY, ZH);
        return EN.equals(value) ? EN : ZH;
    }

    public static void set(Context context, String lang) {
        context.getSharedPreferences(Prefs.FILE, Context.MODE_PRIVATE)
                .edit().putString(KEY, EN.equals(lang) ? EN : ZH).apply();
    }

    /**
     * 语言行的右侧值：用各语言**自己的写法**，不随当前语言翻译。
     * 这是系统语言选择器的通行做法（切到英文时仍显示「中文（简体中文）」而不是 Chinese）。
     */
    public static String label(Context context) {
        return EN.equals(current(context)) ? EN_LABEL : ZH_LABEL;
    }

    public static Locale locale(String lang) {
        return EN.equals(lang) ? Locale.ENGLISH : Locale.SIMPLIFIED_CHINESE;
    }

    /** 各 Activity 的 attachBaseContext 调用：把 base 包成目标语言的资源上下文。 */
    public static Context wrap(Context base) {
        Configuration config = new Configuration(base.getResources().getConfiguration());
        Locale locale = locale(current(base));
        config.setLocale(locale);
        if (Build.VERSION.SDK_INT >= 17) {
            config.setLayoutDirection(locale);
        }
        Context wrapped = base.createConfigurationContext(config);
        app = wrapped;
        return wrapped;
    }

    /**
     * 最近一次 {@link #wrap} 出来的语言上下文：只给**没有 Context 的静态工具**取文案
     * （Api.message / Api.call 这类协议层错误串）。存的是 createConfigurationContext 出来的
     * ContextImpl，不持有 Activity；语言是全局单值，后来者覆盖前者即可。
     */
    private static Context app;

    /**
     * 静态工具取文案：能取到资源就用资源（命中当前语言），取不到（还没 wrap 过）就回退中文原文。
     * 回退串必须与 values/ 里的中文逐字相同，保证 zh 输出与改版前一字不差。
     */
    public static String str(int resId, String zhFallback, Object... args) {
        Context context = app;
        if (context == null) return zhFallback;
        try {
            return context.getString(resId, args);
        } catch (Exception error) {
            return zhFallback;
        }
    }

    /** 界面建好之后语言被改过 → 需要重建。atBuild 为 attach 阶段记下的值。 */
    public static boolean changed(Context context, String atBuild) {
        return atBuild != null && !atBuild.equals(current(context));
    }
}
