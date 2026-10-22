package com.lc.phoneharness;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** 时间线里的一条。字段与 host 插件 lib/projection.js 的 item 一一对应。 */
public final class Item {

    /** 一张图的引用信息（不含字节）。真图另走 GET /v1/sessions/{id}/image/{attachmentId}。 */
    public static final class ImageRef {
        public final String attachmentId;
        public final String mediaType;
        public final String name;
        public final int width;
        public final int height;
        public final long bytes;

        private ImageRef(JSONObject json) {
            this.attachmentId = json.optString("attachmentId", "");
            this.mediaType = json.optString("mediaType", "image/jpeg");
            this.name = json.optString("name", "");
            this.width = json.optInt("width", 0);
            this.height = json.optInt("height", 0);
            this.bytes = json.optLong("bytes", 0L);
        }

        static ImageRef parse(JSONObject json) {
            if (json == null) return null;
            ImageRef ref = new ImageRef(json);
            return ref.attachmentId.length() == 0 ? null : ref;
        }

        public String caption() {
            StringBuilder sb = new StringBuilder();
            if (width > 0 && height > 0) sb.append(width).append("×").append(height);
            if (bytes > 0) {
                if (sb.length() > 0) sb.append(" · ");
                sb.append(bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)) + "MB" : Math.max(1, bytes / 1024) + "KB");
            }
            if (name.length() > 0) {
                if (sb.length() > 0) sb.append(" · ");
                sb.append(name);
            }
            return sb.toString();
        }
    }

    public final String id;
    public final long seq;
    public final long ts;
    public final String role;
    public final String kind;
    public final String status;
    public final String text;
    public final String title;
    public final String toolName;
    public final String toolPreview;
    public final String toolResult;
    /** kind=="image" 时的图。 */
    public final ImageRef image;
    /** 文本消息里附带的图（可能多张）。 */
    public final List<ImageRef> images;
    /** 原始 JSON：写本地缓存时直接原样存回去，不必再逆向拼一遍。 */
    public final JSONObject raw;

    private Item(JSONObject json) {
        this.raw = json;
        this.id = json.optString("id", "");
        this.seq = json.optLong("seq", 0L);
        this.ts = json.optLong("ts", 0L);
        this.role = json.optString("role", "system");
        this.kind = json.optString("kind", "text");
        this.status = json.optString("status", "");
        this.text = json.optString("text", "");
        this.title = json.optString("title", "");
        JSONObject tool = json.optJSONObject("tool");
        if (tool != null) {
            this.toolName = tool.optString("name", "");
            this.toolPreview = tool.optString("preview", "");
            this.toolResult = tool.optString("resultPreview", "");
        } else {
            this.toolName = "";
            this.toolPreview = "";
            this.toolResult = "";
        }
        this.image = ImageRef.parse(json.optJSONObject("image"));
        List<ImageRef> parsed = new ArrayList<ImageRef>();
        JSONArray list = json.optJSONArray("images");
        if (list != null) {
            for (int index = 0; index < list.length(); index++) {
                ImageRef ref = ImageRef.parse(list.optJSONObject(index));
                if (ref != null) parsed.add(ref);
            }
        }
        this.images = parsed;
    }

    public static Item parse(JSONObject json) {
        return json == null ? null : new Item(json);
    }

    public boolean isUser() {
        return "user".equals(role);
    }

    public boolean isTool() {
        return "tool".equals(role) || "tool".equals(kind);
    }

    public boolean isPermission() {
        return "permission".equals(kind);
    }

    /** 这条要在时间线上显示的图（自身是图，或文本消息附带的图）。 */
    public List<ImageRef> pictures() {
        List<ImageRef> result = new ArrayList<ImageRef>();
        if (image != null) result.add(image);
        result.addAll(images);
        return result;
    }

    /** 手机上直接显示的一行正文（无 Context 的老调用点：工具行兜底文案回落中文常量）。 */
    public String body() {
        return body(null);
    }

    /** 同上，但工具行兜底文案走资源：切到英文时跟着变。 */
    public String body(Context context) {
        if (isTool()) {
            StringBuilder sb = new StringBuilder();
            if (toolName.length() > 0) sb.append(toolName);
            if (toolPreview.length() > 0) {
                if (sb.length() > 0) sb.append(" · ");
                sb.append(toolPreview);
            }
            if (toolResult.length() > 0) {
                if (sb.length() > 0) sb.append("\n");
                sb.append(toolResult);
            }
            if (sb.length() == 0) sb.append(localeText(context, R.string.misc_item_tool_call, "（工具调用）"));
            return sb.toString();
        }
        return text;
    }

    /** 状态字（无 Context 的老调用点：回落中文常量）。 */
    public String badge() {
        return badge(null);
    }

    /** 同上，但状态字走资源：切到英文时跟着变。 */
    public String badge(Context context) {
        if (isPermission()) return localeText(context, R.string.misc_item_needs_approval, "需要批准");
        if (isTool()) {
            return "failed".equals(status)
                    ? localeText(context, R.string.misc_item_tool_failed, "工具失败")
                    : localeText(context, R.string.misc_item_tool, "工具");
        }
        if ("running".equals(status)) return localeText(context, R.string.misc_item_running, "进行中");
        return "";
    }

    /** 没 Context 的老调用点回落到原文常量，中文逐字不变；传了 Context 就走资源。 */
    private static String localeText(Context context, int id, String fallback) {
        return context == null ? fallback : context.getString(id);
    }
}
