package com.lc.phoneharness;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 会话里的图片：带令牌下载、内存缓存、按目标宽度下采样。
 *
 * 为什么不直接把 base64 塞进时间线 JSON：一张图 base64 后体积 ×1.33，
 * 每次 renderAll() 都要把所有历史图片重新传一遍，手机流量和内存都受不了。
 * 这里让图片走独立的 GET /v1/sessions/{id}/image/{attachmentId}，字节流直出。
 */
public final class Img {

    public interface Callback {
        void onOk(Bitmap bitmap);

        void onError(String message);
    }

    /** 12MB 的位图缓存，够翻一屏截图。 */
    private static final LruCache<String, Bitmap> CACHE = new LruCache<String, Bitmap>(12 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap value) {
            return value.getByteCount();
        }
    };

    private static final ExecutorService POOL = Executors.newFixedThreadPool(2);

    private Img() {
    }

    public static String path(String sessionId, String attachmentId) {
        return "/v1/sessions/" + Api.enc(sessionId) + "/image/" + Api.enc(attachmentId);
    }

    public static Bitmap cached(String attachmentId, int targetWidth) {
        return CACHE.get(key(attachmentId, targetWidth));
    }

    private static String key(String attachmentId, int targetWidth) {
        return attachmentId + "@" + targetWidth;
    }

    public static void load(final Prefs prefs, final String sessionId, final String attachmentId,
                            final int targetWidth, final Callback callback) {
        load(null, prefs, sessionId, attachmentId, targetWidth, callback);
    }

    /** 同上，多带一个 Context：失败文案走资源，切到英文时跟着变。 */
    public static void load(final Context context, final Prefs prefs, final String sessionId,
                            final String attachmentId, final int targetWidth, final Callback callback) {
        final Bitmap hit = cached(attachmentId, targetWidth);
        if (hit != null) {
            callback.onOk(hit);
            return;
        }
        POOL.execute(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection connection = null;
                try {
                    String base = prefs.base();
                    if (base.length() == 0) throw new Exception(localeText(context, R.string.misc_err_no_host, "还没填电脑地址"));
                    connection = (HttpURLConnection) new URL(base + path(sessionId, attachmentId)).openConnection();
                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(8000);
                    connection.setReadTimeout(20000);
                    connection.setRequestProperty("Accept", "image/*");
                    String token = prefs.token();
                    if (token != null && token.length() > 0) {
                        connection.setRequestProperty("Authorization", "Bearer " + token);
                    }
                    int status = connection.getResponseCode();
                    if (status >= 400) {
                        InputStream error = connection.getErrorStream();
                        String detail = error == null ? ("HTTP " + status) : Api.readAll(error);
                        throw new Exception(detail);
                    }
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    InputStream input = connection.getInputStream();
                    try {
                        byte[] chunk = new byte[16384];
                        int read;
                        while ((read = input.read(chunk)) > 0) buffer.write(chunk, 0, read);
                    } finally {
                        input.close();
                    }
                    byte[] bytes = buffer.toByteArray();
                    if (bytes.length == 0) throw new Exception(localeText(context, R.string.misc_img_empty, "这张图是空的"));
                    Bitmap bitmap = decode(bytes, targetWidth);
                    if (bitmap == null) throw new Exception(localeText(context, R.string.misc_img_decode_failed, "这张图解不开"));
                    CACHE.put(key(attachmentId, targetWidth), bitmap);
                    callback.onOk(bitmap);
                } catch (Exception error) {
                    callback.onError(Api.message(error));
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }
        });
    }

    /** 没 Context 的老调用点回落到原文常量，中文逐字不变；传了 Context 就走资源。 */
    private static String localeText(Context context, int id, String fallback) {
        return context == null ? fallback : context.getString(id);
    }

    /** 先读尺寸算 inSampleSize，再真解——不然 4000px 的原图一解就 OOM。 */
    static Bitmap decode(byte[] bytes, int targetWidth) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        int width = bounds.outWidth <= 0 ? targetWidth : bounds.outWidth;
        int sample = 1;
        int limit = Math.max(targetWidth, 320);
        while (width / sample > limit * 2) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        options.inPreferredConfig = Bitmap.Config.RGB_565;
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (bitmap == null) {
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        }
        return bitmap;
    }
}
