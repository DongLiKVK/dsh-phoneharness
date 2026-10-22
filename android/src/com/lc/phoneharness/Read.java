package com.lc.phoneharness;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * 「这个会话最新一轮的完成结果，我看过了没有」—— 本机唯一的一份已读记账。
 *
 * 主机不给已读状态（GET /v1/sessions 的行里只有 status / itemCount / updatedAt 这些），
 * 所以「绿点 = 已完成且未读」只能由手机自己记：键 readN:<sessionId> 存「读到了第几条」。
 *
 * 判据用 itemCount 而不是时间戳：两端读的是同一份 projection 算出来的条数，单调递增，
 * 也不会被手机与电脑的时钟差影响（updatedAt 是主机的钟）。
 */
public final class Read {
    private static final String PREFIX = "readN:";

    private Read() {
    }

    private static SharedPreferences sp(Context context) {
        return context.getSharedPreferences(Prefs.FILE, Context.MODE_PRIVATE);
    }

    /** 这个会话读到过第几条（0 = 从没读过）。 */
    public static int seen(Context context, String id) {
        if (id == null || id.length() == 0) return 0;
        return sp(context).getInt(PREFIX + id, 0);
    }

    /** 已完成且未读：跑过至少一轮（itemCount > 0），且最新一轮的条数比读到的多。 */
    public static boolean unread(Context context, String id, int itemCount) {
        return itemCount > 0 && itemCount > seen(context, id);
    }

    /** 直接拿列表行判：running / failed 不画绿点（环与红点各管一态）。 */
    public static boolean unread(Context context, JSONObject row) {
        if (row == null) return false;
        String status = row.optString("status", "idle");
        if ("running".equals(status) || "failed".equals(status)) return false;
        return unread(context, row.optString("id", ""), row.optInt("itemCount", 0));
    }

    /** 记账：只往前推、不回退（页面里后到的全量详情可能暂时比列表行少几条）。 */
    public static void markRead(Context context, String id, int itemCount) {
        if (id == null || id.length() == 0 || itemCount <= 0) return;
        if (itemCount <= seen(context, id)) return;
        sp(context).edit().putInt(PREFIX + id, itemCount).apply();
    }

    public static void markRead(Context context, JSONObject row) {
        if (row == null) return;
        markRead(context, row.optString("id", ""), row.optInt("itemCount", 0));
    }
}
