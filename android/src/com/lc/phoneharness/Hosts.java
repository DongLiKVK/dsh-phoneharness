package com.lc.phoneharness;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 多主机列表。
 *
 * 一台手机记着多台电脑上的 harness：每台一条记录（地址 + 令牌 + 名称 + 各自的工作区）。
 * 「当前主机」仍然是 Prefs 里的 address/token —— 其它代码一律读这两个值，
 * 所以切主机就是换这两个值，工作台、归纳箱、会话列表、模型面板全都跟着换。
 */
public final class Hosts {

    /** 离线 / 在线之类的运行时状态值。 */
    public static final int STATE_UNKNOWN = 0;
    public static final int STATE_PROBING = 1;
    public static final int STATE_ONLINE = 2;
    public static final int STATE_OFFLINE = 3;

    /** 一条主机记录。落盘的字段存进 prefs 的 hosts JSON 里，运行时状态只在内存。 */
    public static final class Entry {
        public String id = "";
        public String name = "";
        public String address = "";
        public String token = "";
        public String device = "";
        public String workspaceCwd = "";
        public String workspaceName = "";
        public long addedAt;

        /* ---- 运行时（不落盘） ---- */
        public int state = STATE_UNKNOWN;
        public String remoteName = "";
        public String version = "";
        public long latency;
        public String error = "";
    }

    private Hosts() {
    }

    /* ------------------------------------------------------------------ */
    /* 读写                                                               */
    /* ------------------------------------------------------------------ */

    public static List<Entry> load(Prefs prefs) {
        List<Entry> list = new ArrayList<Entry>();
        JSONArray array = parse(prefs.hostsJson());
        for (int index = 0; index < array.length(); index++) {
            JSONObject row = array.optJSONObject(index);
            if (row == null) continue;
            Entry entry = new Entry();
            entry.id = row.optString("id", "");
            entry.name = row.optString("name", "");
            entry.address = row.optString("address", "");
            entry.token = row.optString("token", "");
            entry.device = row.optString("device", "");
            entry.workspaceCwd = row.optString("workspaceCwd", "");
            entry.workspaceName = row.optString("workspaceName", "");
            entry.addedAt = row.optLong("addedAt", 0L);
            entry.remoteName = row.optString("remoteName", "");
            if (entry.address.length() == 0) continue;
            list.add(entry);
        }
        return list;
    }

    public static void store(Prefs prefs, List<Entry> list) {
        JSONArray array = new JSONArray();
        for (Entry entry : list) {
            JSONObject row = new JSONObject();
            try {
                row.put("id", entry.id);
                row.put("name", entry.name);
                row.put("address", entry.address);
                row.put("token", entry.token);
                row.put("device", entry.device);
                row.put("workspaceCwd", entry.workspaceCwd);
                row.put("workspaceName", entry.workspaceName);
                row.put("addedAt", entry.addedAt);
                row.put("remoteName", entry.remoteName == null ? "" : entry.remoteName);
            } catch (Exception ignore) {
                continue;
            }
            array.put(row);
        }
        prefs.setHostsJson(array.toString());
    }

    private static JSONArray parse(String text) {
        if (text == null || text.length() == 0) return new JSONArray();
        try {
            JSONArray array = new JSONArray(text);
            return array == null ? new JSONArray() : array;
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    /* ------------------------------------------------------------------ */
    /* 当前主机                                                           */
    /* ------------------------------------------------------------------ */

    /** 当前主机的记录：按归一后的地址比对；老版本只有单主机的用户会被 adopt 补进来。 */
    public static Entry active(Prefs prefs) {
        List<Entry> list = load(prefs);
        String base = Prefs.normalize(prefs.address());
        for (Entry entry : list) {
            if (base.length() > 0 && base.equalsIgnoreCase(Prefs.normalize(entry.address))) return entry;
        }
        return null;
    }

    public static String activeId(Prefs prefs) {
        Entry entry = active(prefs);
        return entry == null ? "" : entry.id;
    }

    /** 把当前 Prefs 里的令牌/设备/工作区写回列表里的这条记录（切走之前调用）。 */
    public static void captureActive(Prefs prefs) {
        List<Entry> list = load(prefs);
        String base = Prefs.normalize(prefs.address());
        if (base.length() == 0) return;
        boolean touched = false;
        for (Entry entry : list) {
            if (!base.equalsIgnoreCase(Prefs.normalize(entry.address))) continue;
            entry.token = prefs.token();
            entry.device = prefs.device();
            entry.workspaceCwd = prefs.workspaceCwd();
            entry.workspaceName = prefs.workspaceName();
            touched = true;
            break;
        }
        if (touched) store(prefs, list);
    }

    /** 老版本升级上来：把唯一那台主机补进列表，用户第一次打开「在线主机」就能看到它。 */
    public static void adopt(Prefs prefs) {
        String base = Prefs.normalize(prefs.address());
        if (base.length() == 0) return;
        List<Entry> list = load(prefs);
        for (Entry entry : list) {
            if (base.equalsIgnoreCase(Prefs.normalize(entry.address))) {
                captureActive(prefs);
                return;
            }
        }
        Entry entry = new Entry();
        entry.id = "host-" + System.currentTimeMillis();
        // 名称留空：设备名是这台手机的型号，拿它当主机名会让人以为在选手机。
        // 真名等 /v1/ping 回来用电脑自己的名字（HOST-PC）兜底。
        entry.name = "";
        entry.address = prefs.address();
        entry.token = prefs.token();
        entry.device = prefs.device();
        entry.workspaceCwd = prefs.workspaceCwd();
        entry.workspaceName = prefs.workspaceName();
        entry.addedAt = System.currentTimeMillis();
        list.add(0, entry);
        store(prefs, list);
    }

    /** 切到某台主机：先保存当前主机的即时状态，再把目标主机的地址/令牌/工作区写进 Prefs。 */
    public static boolean activate(Prefs prefs, String id) {
        List<Entry> list = load(prefs);
        captureActive(prefs);
        list = load(prefs);
        for (Entry entry : list) {
            if (!entry.id.equals(id)) continue;
            prefs.setAddress(entry.address);
            prefs.setToken(entry.token);
            prefs.setDevice(entry.device);
            // 工作区按主机各自记：换主机不能沿用上一台主机的目录过滤。
            prefs.setWorkspace(entry.workspaceCwd, entry.workspaceName);
            return true;
        }
        return false;
    }

    /* ------------------------------------------------------------------ */
    /* 增删改                                                             */
    /* ------------------------------------------------------------------ */

    /** 添加（或更新同一地址的）主机，返回这条记录。 */
    public static Entry add(Prefs prefs, String name, String address, String token, String device) {
        List<Entry> list = load(prefs);
        String base = Prefs.normalize(address);
        for (Entry entry : list) {
            if (!base.equalsIgnoreCase(Prefs.normalize(entry.address))) continue;
            if (name != null && name.length() > 0) entry.name = name;
            entry.address = address;
            if (token != null && token.length() > 0) entry.token = token;
            if (device != null && device.length() > 0) entry.device = device;
            store(prefs, list);
            return entry;
        }
        Entry entry = new Entry();
        entry.id = "host-" + System.currentTimeMillis();
        entry.name = name == null ? "" : name;
        entry.address = address;
        entry.token = token == null ? "" : token;
        entry.device = device == null ? "" : device;
        entry.addedAt = System.currentTimeMillis();
        list.add(entry);
        store(prefs, list);
        return entry;
    }

    public static void rename(Prefs prefs, String id, String name) {
        List<Entry> list = load(prefs);
        for (Entry entry : list) {
            if (!entry.id.equals(id)) continue;
            entry.name = name == null ? "" : name;
        }
        store(prefs, list);
    }

    /** 删除一条；删的是当前主机时把 Prefs 清空（调用方负责跳回连接页）。 */
    public static void remove(Prefs prefs, String id) {
        List<Entry> list = load(prefs);
        Entry active = active(prefs);
        boolean wasActive = active != null && active.id.equals(id);
        List<Entry> kept = new ArrayList<Entry>();
        for (Entry entry : list) {
            if (entry.id.equals(id)) continue;
            kept.add(entry);
        }
        store(prefs, kept);
        if (!wasActive) return;
        if (kept.size() > 0) {
            activate(prefs, kept.get(0).id);
        } else {
            prefs.setAddress("");
            prefs.clearToken();
            prefs.setDevice("");
            prefs.setWorkspace("", "");
        }
    }

    /** 列表里显示的名字：自定义名称 → 地址（设备名是这台手机的型号，不能当主机名用）。 */
    public static String title(Entry entry) {
        if (entry.name != null && entry.name.length() > 0 && !isAddressName(entry)) return entry.name;
        if (entry.remoteName != null && entry.remoteName.length() > 0) return entry.remoteName;
        return shortOf(entry.address);
    }

    /** 老版本把地址写进 name 字段，显示时要能识别出这种「假名字」。 */
    static boolean isAddressName(Entry entry) {
        if (entry.name == null || entry.address == null) return false;
        String name = entry.name.trim();
        String address = entry.address.trim();
        return name.equalsIgnoreCase(address)
                || name.equalsIgnoreCase(Prefs.normalize(address))
                || name.equalsIgnoreCase(shortOf(address));
    }

    static String shortOf(String address) {
        String value = Prefs.normalize(address);
        if (value.startsWith("http://")) value = value.substring(7);
        if (value.startsWith("https://")) value = value.substring(8);
        return value;
    }
}
