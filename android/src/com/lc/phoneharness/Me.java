package com.lc.phoneharness;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Shader;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;

/**
 * 抽屉底部那行「是谁在用这台电脑」。
 *
 * 身份来自电脑端 harness 登录的账号：GET /v1/me 回 id / name / avatarUrl，头像字节走
 * GET /v1/me/avatar（平台 CDN 的地址手机不一定连得上，由 host 代取）。拿不到就退回
 * 本机缓存的上一份，再拿不到就用 App 名 + 首字母头像，界面不空着。
 */
public final class Me {

    public interface Listener {
        void onMe(String id, String name, Bitmap avatar);
    }

    private static final String AVATAR_FILE = "me-avatar.bin";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static Bitmap cache;
    private static String cacheKey = "";
    private static boolean fetching;

    private Me() {
    }

    /** 显示名：账号昵称 → 账号 ID → App 名。 */
    public static String displayName(Prefs prefs) {
        String name = prefs.userName();
        if (name.length() > 0) return name;
        String id = prefs.userId();
        if (id.length() > 0) return id;
        return App.NAME;
    }

    /** 头像（34dp 那种小圆图）：只在内存里缓存一张，磁盘上按 avatarUrl 认新旧。 */
    public static Bitmap avatar(Context context, Prefs prefs) {
        String url = prefs.userAvatarUrl();
        if (url.length() == 0) return null;
        if (cache != null && url.equals(cacheKey)) return cache;
        File file = file(context);
        if (!file.exists()) return null;
        Bitmap decoded = decode(file);
        if (decoded == null) return null;
        cache = decoded;
        cacheKey = url;
        return decoded;
    }

    /**
     * 拉一次身份（失败静默），必要时把头像字节抓回本地。回调永远在主线程。
     * 抽屉每次 onResume 调一次就够：插件侧有 5 分钟缓存，这里也不记账。
     */
    public static void refresh(final Context context, final Prefs prefs, Api api, final Listener listener) {
        if (fetching) return;
        fetching = true;
        api.get("/v1/me", new Api.Callback() {
            @Override
            public void onOk(JSONObject body) {
                JSONObject user = body == null ? null : body.optJSONObject("user");
                if (user != null) {
                    String source = user.optString("source", "");
                    String id = user.optString("id", "");
                    String name = user.optString("name", "");
                    String url = user.optString("avatarUrl", "");
                    if (!"none".equals(source)) {
                        prefs.setUser(id, name, url, source);
                    }
                    if (url.length() > 0) fetchAvatar(context, prefs, api, url);
                }
                deliver(prefs, listener);
            }

            @Override
            public void onError(String message) {
                deliver(prefs, listener);
            }
        });
    }

    private static void fetchAvatar(Context context, Prefs prefs, Api api, String url) {
        File file = file(context);
        if (url.equals(prefs.avatarStamp()) && file.exists() && file.length() > 0) return;
        try {
            byte[] bytes = api.bytes("/v1/me/avatar");
            if (bytes == null || bytes.length == 0) return;
            File temp = new File(file.getAbsolutePath() + ".tmp");
            FileOutputStream output = new FileOutputStream(temp);
            try {
                output.write(bytes);
            } finally {
                output.close();
            }
            if (file.exists()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
            if (!temp.renameTo(file)) {
                //noinspection ResultOfMethodCallIgnored
                temp.delete();
                return;
            }
            prefs.setAvatarStamp(url);
            cache = null;
            cacheKey = "";
        } catch (Exception ignore) {
            // 没头像（404 no_avatar）或网络不通都不影响文字身份。
        }
    }

    private static void deliver(final Prefs prefs, final Listener listener) {
        fetching = false;
        if (listener == null) return;
        final String id = prefs.userId();
        final String name = displayName(prefs);
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                listener.onMe(id, name, cache);
            }
        });
    }

    /** 退出登录/换主机时清掉本机缓存的头像，避免把上一个人的头像留给下一个人。 */
    public static void clear(Context context) {
        cache = null;
        cacheKey = "";
        fetching = false;
        File file = file(context);
        if (file.exists()) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }

    private static File file(Context context) {
        return new File(context.getFilesDir(), AVATAR_FILE);
    }

    private static Bitmap decode(File file) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = bounds.outWidth > 256 ? 2 : 1;
            return BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        } catch (Throwable error) {
            return null;
        }
    }

    /** 圆形裁切：头像原图多是方图，直接贴上去会露角。 */
    public static Bitmap circle(Bitmap source, int size) {
        if (source == null || size <= 0) return null;
        try {
            Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            BitmapShader shader = new BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            // 等比放大到能盖满 size×size，再居中裁圆。
            float scale = Math.max((float) size / source.getWidth(), (float) size / source.getHeight());
            android.graphics.Matrix matrix = new android.graphics.Matrix();
            matrix.setScale(scale, scale);
            matrix.postTranslate((size - source.getWidth() * scale) / 2f,
                    (size - source.getHeight() * scale) / 2f);
            shader.setLocalMatrix(matrix);
            paint.setShader(shader);
            canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
            return out;
        } catch (Throwable error) {
            return null;
        }
    }
}