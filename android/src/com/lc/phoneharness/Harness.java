package com.lc.phoneharness;

import android.app.Activity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** 用户主机 harness 配置的读/写门面。所有网络调用都在调用线程阻塞执行，UI 侧必须放到后台线程。 */
public final class Harness {

    private static final String PATH = "/v1/harness";
    private static final String CONFIG_PATH = "/v1/harness/config";

    /** 进程内缓存：null 表示还没成功拿过。 */
    private static volatile State cached;

    private Harness() {
    }

    public static final class Preset {
        public final String id, title, description, reason;
        public final boolean current, usable, builtin;

        Preset(String id, String title, String description, String reason,
               boolean current, boolean usable, boolean builtin) {
            this.id = id;
            this.title = title;
            this.description = description;
            this.reason = reason;
            this.current = current;
            this.usable = usable;
            this.builtin = builtin;
        }
    }

    public static final class Space {
        public final String cwd, title;
        public final boolean current;

        Space(String cwd, String title, boolean current) {
            this.cwd = cwd;
            this.title = title;
            this.current = current;
        }
    }

    public static final class Dir {
        public final String name, path;
        public final boolean dir, hidden;

        Dir(String name, String path, boolean dir, boolean hidden) {
            this.name = name;
            this.path = path;
            this.dir = dir;
            this.hidden = hidden;
        }
    }

    public static final class State {
        public final List<Preset> presets;
        public final List<Space> spaces;
        public final String agentPreset, workspace, model, permission;
        public final boolean writeConfig, listDirs, configEditor;

        State(List<Preset> presets, List<Space> spaces, String agentPreset, String workspace,
              String model, String permission,
              boolean writeConfig, boolean listDirs, boolean configEditor) {
            this.presets = Collections.unmodifiableList(presets);
            this.spaces = Collections.unmodifiableList(spaces);
            this.agentPreset = agentPreset;
            this.workspace = workspace;
            this.model = model;
            this.permission = permission;
            this.writeConfig = writeConfig;
            this.listDirs = listDirs;
            this.configEditor = configEditor;
        }

        public String presetTitle(String id) {
            if (id == null || id.length() == 0) return "";
            Preset hit = preset(id);
            if (hit != null && hit.title != null && hit.title.length() > 0) return hit.title;
            return id;
        }

        public String presetDescription(String id) {
            Preset hit = preset(id);
            if (hit == null || hit.description == null) return "";
            return hit.description;
        }

        public Preset preset(String id) {
            if (id == null) return null;
            for (Preset item : presets) {
                if (id.equals(item.id)) return item;
            }
            return null;
        }

        public String workspaceTitle() {
            if (workspace == null || workspace.length() == 0) return "";
            for (Space item : spaces) {
                if (workspace.equals(item.cwd) && item.title != null && item.title.length() > 0) return item.title;
            }
            return workspace;
        }
    }

    public static final class Result {
        public final boolean ok;
        public final String message, code;
        public final boolean persisted;
        public final State state;

        Result(boolean ok, String message, String code, boolean persisted, State state) {
            this.ok = ok;
            this.message = message == null ? "" : message;
            this.code = code == null ? "" : code;
            this.persisted = persisted;
            this.state = state;
        }
    }

    /** 进程内缓存：null 表示还没成功拿过。 */
    public static State state() {
        return cached;
    }

    /** 最近一次后台刷新失败的原因（成功或没跑过 = null）。给面板显示，不进 Prefs。 */
    private static volatile String lastError;

    public static void clear() {
        cached = null;
        lastError = null;
    }

    /** 最近一次 refresh 的失败原因；成功或从未失败时为 null。 */
    public static String lastError() {
        return lastError;
    }

    /** 解析 /v1/harness（或 config 响应里的 harness 字段）并写入缓存。字段缺失不报错，一律退化成空列表 / 空串。 */
    public static State parse(JSONObject json) {
        List<Preset> presets = new ArrayList<Preset>();
        List<Space> spaces = new ArrayList<Space>();
        String agentPreset = "";
        String workspace = "";
        String model = "";
        String permission = "";
        boolean writeConfig = false;
        boolean listDirs = false;
        boolean configEditor = false;

        if (json != null) {
            JSONArray rawPresets = json.optJSONArray("presets");
            if (rawPresets != null) {
                for (int index = 0; index < rawPresets.length(); index++) {
                    JSONObject entry = rawPresets.optJSONObject(index);
                    if (entry == null) continue;
                    String id = text(entry, "id");
                    if (id.length() == 0) continue;
                    presets.add(new Preset(id, text(entry, "title"), text(entry, "description"),
                            optional(entry, "reason"), entry.optBoolean("current", false),
                            entry.optBoolean("usable", true), entry.optBoolean("builtin", false)));
                }
            }
            JSONArray rawSpaces = json.optJSONArray("workspaces");
            if (rawSpaces != null) {
                for (int index = 0; index < rawSpaces.length(); index++) {
                    JSONObject entry = rawSpaces.optJSONObject(index);
                    if (entry == null) continue;
                    String cwd = text(entry, "cwd");
                    if (cwd.length() == 0) continue;
                    spaces.add(new Space(cwd, text(entry, "title"), entry.optBoolean("current", false)));
                }
            }
            JSONObject defaults = json.optJSONObject("defaults");
            if (defaults != null) {
                model = text(defaults, "model");
                permission = text(defaults, "permission");
                agentPreset = text(defaults, "agentPreset");
            }
            JSONObject capabilities = json.optJSONObject("capabilities");
            if (capabilities != null) {
                writeConfig = capabilities.optBoolean("writeConfig", false);
                listDirs = capabilities.optBoolean("listDirs", false);
                configEditor = capabilities.optBoolean("configEditor", false);
            }
            // 当前生效项以 current=true 为准，取不到才退回家配置里的默认值。
            String marked = "";
            for (Preset item : presets) {
                if (item.current) {
                    marked = item.id;
                    break;
                }
            }
            if (marked.length() > 0) agentPreset = marked;
            String markedCwd = "";
            for (Space item : spaces) {
                if (item.current) {
                    markedCwd = item.cwd;
                    break;
                }
            }
            if (markedCwd.length() > 0) workspace = markedCwd;
        }

        State parsed = new State(presets, spaces, agentPreset, workspace, model, permission,
                writeConfig, listDirs, configEditor);
        cached = parsed;
        return parsed;
    }

    /** 后台 GET /v1/harness；完成后在主线程回调 done（无论成败都回调）。 */
    public static void refresh(final Activity host, final Prefs prefs, final Runnable done) {
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject json = Api.call(prefs.base(), prefs.token(), "GET", PATH, null);
                    lastError = null;
                    writeCache(prefs, parse(json));
                } catch (Throwable error) {
                    // 拿不到就拿不到：chip 继续用 Prefs 缓存渲染；但把原因留下来，面板能显示并重试。
                    setLastError(reasonOf(error));
                }
                if (done == null) return;
                if (host == null) {
                    done.run();
                    return;
                }
                host.runOnUiThread(done);
            }
        }, "harness-refresh");
        worker.setDaemon(true);
        worker.start();
    }

    /** 解析 dirs 响应。 */
    public static List<Dir> dirs(JSONObject json) {
        List<Dir> entries = new ArrayList<Dir>();
        if (json == null) return entries;
        JSONArray raw = json.optJSONArray("entries");
        if (raw == null) return entries;
        for (int index = 0; index < raw.length(); index++) {
            JSONObject entry = raw.optJSONObject(index);
            if (entry == null) continue;
            String path = text(entry, "path");
            String name = text(entry, "name");
            if (path.length() == 0 && name.length() == 0) continue;
            entries.add(new Dir(name, path, entry.optBoolean("dir", true), entry.optBoolean("hidden", false)));
        }
        return entries;
    }

    public static String dirsCwd(JSONObject json) {
        return json == null ? "" : text(json, "cwd");
    }

    public static String dirsParent(JSONObject json) {
        return json == null ? "" : text(json, "parent");
    }

    /** 同步 POST /v1/harness/config；失败一律走 Result（传输层失败也不抛）。 */
    public static Result set(Prefs prefs, JSONObject body) throws IOException {
        try {
            JSONObject json = Api.call(prefs.base(), prefs.token(), "POST", CONFIG_PATH, body);
            JSONObject raw = json.optJSONObject("harness");
            State fresh = raw == null ? null : parse(raw);
            if (fresh != null) writeCache(prefs, fresh);
            return new Result(json.optBoolean("ok", true), text(json, "message"), "",
                    json.optBoolean("persisted", false), fresh);
        } catch (Api.HttpError error) {
            // 主机给的中文 detail 优先，拿不到才回退通用文案。
            String message = error.getMessage();
            if (message == null || message.length() == 0) message = Api.message(error);
            return new Result(false, message, error.code, false, null);
        } catch (IOException error) {
            return new Result(false, Api.message(error), "", false, null);
        }
    }

    /** 便捷构造请求体。 */
    public static JSONObject body(String key, Object value) {
        JSONObject json = new JSONObject();
        if (key == null || key.length() == 0 || value == null) return json;
        try {
            json.put(key, value);
        } catch (Exception ignore) {
        }
        return json;
    }

    /** chip 图标资源。 */
    public static int presetIcon() {
        return R.drawable.ic_preset;
    }

    public static int workspaceIcon() {
        return R.drawable.ic_folder;
    }

    /** 缓存键（契约冻结的 4 个），供离线时 chip 首帧就有文案。 */
    private static void writeCache(Prefs prefs, State state) {
        if (prefs == null || state == null) return;
        String presetId = state.agentPreset == null ? "" : state.agentPreset;
        prefs.setHarnessPreset(presetId);
        prefs.setHarnessPresetTitle(state.presetTitle(presetId));
        prefs.setHarnessWorkspace(state.workspace == null ? "" : state.workspace);
        prefs.setHarnessWorkspaceTitle(state.workspaceTitle());
    }

    /** 把异常整理成一行中文（<=200 字）：HttpError 优先 status/code/detail，其余用 类名：message。 */
    private static String reasonOf(Throwable error) {
        if (error == null) return "";
        if (error instanceof Api.HttpError) {
            Api.HttpError http = (Api.HttpError) error;
            String detail = http.getMessage();
            StringBuilder one = new StringBuilder();
            one.append("HTTP ").append(http.status);
            if (http.code != null && http.code.length() > 0) one.append(" ").append(http.code);
            if (detail != null && detail.length() > 0) one.append("：").append(detail);
            return clip(one.toString());
        }
        String name = error.getClass().getSimpleName();
        String message = error.getMessage();
        return clip(message == null || message.length() == 0 ? name : name + "：" + message);
    }

    private static String clip(String raw) {
        if (raw == null) return "";
        return raw.length() <= 200 ? raw : raw.substring(0, 200);
    }

    private static void setLastError(String reason) {
        lastError = reason == null || reason.length() == 0 ? null : reason;
    }

    private static String text(JSONObject json, String key) {
        String value = json.optString(key, "");
        return value == null ? "" : value;
    }

    private static String optional(JSONObject json, String key) {
        if (json.isNull(key)) return null;
        String value = json.optString(key, "");
        return value == null || value.length() == 0 ? null : value;
    }
}
