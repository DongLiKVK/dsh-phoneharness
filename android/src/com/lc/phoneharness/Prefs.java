package com.lc.phoneharness;

import android.content.Context;
import android.content.SharedPreferences;

/** 令牌与本机设置。手机端只存自己需要的东西：地址、令牌、设备名、主题。 */
public final class Prefs {
    /** 包内可见：Langs 复用同一个文件存语言（避免两处各写一个文件名常量）。 */
    static final String FILE = "phone-harness";
    private final SharedPreferences sp;
    /** 构造时那个 Context：只给需要 getString 的调用方用（Api 的错误串）。 */
    private final Context context;

    public Prefs(Context context) {
        this.context = context;
        this.sp = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** 取文案用（命中 Activity 当前的 Locale）。 */
    public Context context() {
        return context;
    }

    public String address() {
        String value = sp.getString("address", "");
        return value == null ? "" : value;
    }

    public void setAddress(String value) {
        sp.edit().putString("address", value).apply();
    }

    public String token() {
        String value = sp.getString("token", "");
        return value == null ? "" : value;
    }

    public void setToken(String value) {
        sp.edit().putString("token", value).apply();
    }

    public void clearToken() {
        sp.edit().remove("token").apply();
    }

    public String device() {
        String value = sp.getString("device", "");
        return value == null ? "" : value;
    }

    public void setDevice(String value) {
        sp.edit().putString("device", value).apply();
    }

    /**
     * 当前选中的工作区（对齐本机 harness 的工作区，比如 WhaleRealm / PhoneHarness）。
     * 空字符串表示「跟随电脑端给的第一条」，也就是还没手动选过。
     */
    public String workspaceCwd() {
        String value = sp.getString("workspaceCwd", "");
        return value == null ? "" : value;
    }

    /**
     * 历史存储值：老版本把「跟随电脑端」这个界面标签当名字存了进来。
     * 现在跟随电脑端存空串（与语言无关），读到老值按空串处理，界面自己出本地化的标签。
     * 这只是陈旧数据的比对键，不是界面文案。
     */
    private static final String LEGACY_FOLLOW = "跟随电脑端";

    public String workspaceName() {
        String value = sp.getString("workspaceName", "");
        if (LEGACY_FOLLOW.equals(value)) return "";
        return value == null ? "" : value;
    }

    public void setWorkspace(String cwd, String name) {
        sp.edit()
                .putString("workspaceCwd", cwd == null ? "" : cwd)
                .putString("workspaceName", name == null ? "" : name)
                .apply();
    }

    public String lastName() {
        String value = sp.getString("lastModelName", "");
        return value == null ? "" : value;
    }

    public void setLastName(String value) {
        sp.edit().putString("lastModelName", value).apply();
    }

    /** 主题：auto | day | dark，默认 auto（跟随系统）。 */
    public String theme() {
        String value = sp.getString("theme", "auto");
        return value == null ? "auto" : value;
    }

    public void setTheme(String value) {
        sp.edit().putString("theme", value == null ? "auto" : value).apply();
    }

    /** 字体大小缩放系数：1.0 = 标准，范围 0.80 ~ 1.20（1.0 落在滑轨正中，对齐官方「字体大小」页）。 */
    public static float fontScale(Context context) {
        float value = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getFloat("fontScale", 1.0f);
        if (value < 0.80f) value = 0.80f;
        if (value > 1.20f) value = 1.20f;
        return value;
    }

    public void setFontScale(float value) {
        sp.edit().putFloat("fontScale", value).apply();
    }

    /** 是否跟随系统字号（跟随系统时忽略滑块）。 */
    public static boolean fontFollowSystem(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean("fontFollowSystem", true);
    }

    public void setFontFollowSystem(boolean value) {
        sp.edit().putBoolean("fontFollowSystem", value).apply();
    }

    /** 当前是否深色。auto 时跟随系统。 */
    public static boolean darkMode(Context context) {
        String mode = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("theme", "auto");
        if ("dark".equals(mode)) return true;
        if ("day".equals(mode)) return false;
        int night = context.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
        return night == android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }

    /**
     * 桌面版 composer 上的「模型」座位。存的是 catalog 的完整 id（provider/model），
     * 空表示跟随电脑端 default（defaults.model）。
     */
    public String modelId() {
        String value = sp.getString("modelId", "");
        return value == null ? "" : value;
    }

    /** 上一次选中的模型显示名，用于 catalog 还没拉回来时先把 chip 画出正确文案。 */
    public String modelTitle() {
        String value = sp.getString("modelTitle", "");
        return value == null ? "" : value;
    }

    public void setModel(String id, String title) {
        sp.edit()
                .putString("modelId", id == null ? "" : id)
                .putString("modelTitle", title == null ? "" : title)
                .apply();
    }

    /** 权限座位：read-only | workspace-write | danger-full-access，空表示跟随电脑端 default。 */
    public String permission() {
        String value = sp.getString("permission", "");
        return value == null ? "" : value;
    }

    public void setPermission(String value) {
        sp.edit().putString("permission", value == null ? "" : value).apply();
    }

    /** 推理等级 id（比如 high / max），空表示 Default（不传 reasoningEffort）。 */
    public String reasoning() {
        String value = sp.getString("reasoning", "");
        return value == null ? "" : value;
    }

    public void setReasoning(String value) {
        sp.edit().putString("reasoning", value == null ? "" : value).apply();
    }

    /** 智能搜索开关：on 表示开（界面上与官方一致；宿主没有联网检索能力，见 README）。 */
    public boolean search() {
        return "on".equals(sp.getString("search", "on"));
    }

    public void setSearch(boolean on) {
        sp.edit().putString("search", on ? "on" : "").apply();
    }

    /** 模型模式：flash = 快速模式，pro = 专家模式。 */
    public String mode() {
        String value = sp.getString("mode", "flash");
        return value == null || value.length() == 0 ? "flash" : value;
    }

    public void setMode(String value) {
        sp.edit().putString("mode", value == null ? "flash" : value).apply();
    }

    /**
     * 调试读值：模拟器的虚拟屏注入不进文字（input text / keyevent 都无效），
     * 所以用 adb 往 prefs 里写 debug.xxx 来预填搜索框与表单字段，跑自动化对照。
     */
    public String debug(String key) {
        String value = sp.getString("debug." + key, "");
        return value == null ? "" : value;
    }

    /**
     * 某条消息的赞/踩状态（"like" / "dislike" / 空）。
     *
     * 会话 id + 消息 id 拼成键：同一条消息重进会话还在，换条消息互不影响。
     */
    public String messageFeedback(String sessionId, String messageId) {
        if (sessionId == null || messageId == null) return "";
        String value = sp.getString("fb." + sessionId + "." + messageId, "");
        return value == null ? "" : value;
    }

    public void setMessageFeedback(String sessionId, String messageId, String value) {
        if (sessionId == null || messageId == null) return;
        String key = "fb." + sessionId + "." + messageId;
        if (value == null || value.length() == 0) sp.edit().remove(key).apply();
        else sp.edit().putString(key, value).apply();
    }

    /** 归一成一个 http 基地址：允许用户只填 IP，也允许带 http:// 与结尾斜杠。 */
    public String base() {
        return normalize(address());
    }

    /** 地址归一：多主机列表比对地址时也用同一套规则，否则 "主机:端口" 与 "http://主机:端口" 会被当成两台。 */
    public static String normalize(String raw) {
        if (raw == null) return "";
        String value = raw.trim();
        if (value.length() == 0) return "";
        if (!value.startsWith("http://") && !value.startsWith("https://")) value = "http://" + value;
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    /** 多主机列表（JSON 数组字符串），见 Hosts。 */
    public String hostsJson() {
        String value = sp.getString("hosts", "");
        return value == null ? "" : value;
    }

    public void setHostsJson(String value) {
        sp.edit().putString("hosts", value == null ? "" : value).apply();
    }

    /* ------------------------------------------------------------ */
    /* 电脑端登录的账号（抽屉底部账号栏用，见 Me）                      */
    /* ------------------------------------------------------------ */

    public String userId() {
        String value = sp.getString("userId", "");
        return value == null ? "" : value;
    }

    public String userName() {
        String value = sp.getString("userName", "");
        return value == null ? "" : value;
    }

    public String userAvatarUrl() {
        String value = sp.getString("userAvatarUrl", "");
        return value == null ? "" : value;
    }

    public String userSource() {
        String value = sp.getString("userSource", "");
        return value == null ? "" : value;
    }

    public void setUser(String id, String name, String avatarUrl, String source) {
        sp.edit()
                .putString("userId", id == null ? "" : id)
                .putString("userName", name == null ? "" : name)
                .putString("userAvatarUrl", avatarUrl == null ? "" : avatarUrl)
                .putString("userSource", source == null ? "" : source)
                .apply();
    }

    /** 本地已缓存的头像对应的地址：换账号/换头像时靠它判断要不要重新拷一份。 */
    public String avatarStamp() {
        String value = sp.getString("avatarStamp", "");
        return value == null ? "" : value;
    }

    public void setAvatarStamp(String value) {
        sp.edit().putString("avatarStamp", value == null ? "" : value).apply();
    }

    public void clearUser() {
        sp.edit()
                .remove("userId")
                .remove("userName")
                .remove("userAvatarUrl")
                .remove("userSource")
                .remove("avatarStamp")
                .apply();
    }

    /* ------------------------------------------------------------ */
    /* 用户主机 harness 的展示缓存                                    */
    /* 真相在电脑端（GET /v1/harness），这里只存一份快照，让 chip 首帧  */
    /* 就有文案、离线也能显示上次选中的值。配置写入只走 /v1/harness/config。 */
    /* ------------------------------------------------------------ */

    /** 当前生效的 Agent 预设 id。 */
    public String harnessPreset() {
        String value = sp.getString("harnessPreset", "");
        return value == null ? "" : value;
    }

    public void setHarnessPreset(String value) {
        sp.edit().putString("harnessPreset", value == null ? "" : value).apply();
    }

    /** 当前预设的显示名（电脑端给的中文名，比如「PTC 模式」）。 */
    public String harnessPresetTitle() {
        String value = sp.getString("harnessPresetTitle", "");
        return value == null ? "" : value;
    }

    public void setHarnessPresetTitle(String value) {
        sp.edit().putString("harnessPresetTitle", value == null ? "" : value).apply();
    }

    /** 当前工作区路径。 */
    public String harnessWorkspace() {
        String value = sp.getString("harnessWorkspace", "");
        return value == null ? "" : value;
    }

    public void setHarnessWorkspace(String value) {
        sp.edit().putString("harnessWorkspace", value == null ? "" : value).apply();
    }

    /** 当前工作区的短名，chip 上显示的就是它。 */
    public String harnessWorkspaceTitle() {
        String value = sp.getString("harnessWorkspaceTitle", "");
        return value == null ? "" : value;
    }

    public void setHarnessWorkspaceTitle(String value) {
        sp.edit().putString("harnessWorkspaceTitle", value == null ? "" : value).apply();
    }
}
