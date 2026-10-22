package com.lc.phoneharness;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 选图 + 压缩 + base64。
 *
 * 为什么要在这里压：host 侧一张图的硬上限是 20MB（原图）、归一化后 4MB，
 * 而手机相册里随便一张 4000×3000 的 JPEG 就 5~8MB，base64 之后还要 ×1.33。
 * 直接在手机上压到长边 1600、JPEG q85，既够 DSH 读清楚字，又不至于发一条消息几十秒。
 */
public final class Pick {

    /** 待发送的一张图（已编码好，发送时只做拼接）。 */
    public static final class Pending {
        public final String mediaType;
        public final String data;
        public final String name;
        public final int width;
        public final int height;
        public final long bytes;

        Pending(String mediaType, String data, String name, int width, int height, long bytes) {
            this.mediaType = mediaType;
            this.data = data;
            this.name = name;
            this.width = width;
            this.height = height;
            this.bytes = bytes;
        }

        /** 「重发」用：把已经取回来的原始字节重新包一个 Pending。 */
        static Pending of(byte[] raw, String mediaType, String name, int width, int height) {
            String encoded = android.util.Base64.encodeToString(raw, android.util.Base64.NO_WRAP);
            String type = mediaType == null || mediaType.length() == 0 ? "image/jpeg" : mediaType;
            return new Pending(type, encoded, name == null ? "" : name, width, height, raw.length);
        }

        public String caption() {
            String size = bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)) + "MB" : Math.max(1, bytes / 1024) + "KB";
            return width + "×" + height + " · " + size;
        }
    }

    public interface Callback {
        void onOk(Pending pending);

        void onError(String message);
    }

    /**
     * 原图小于这个字节数就直接发原字节。
     *
     * PNG 截图里全是小字，重压成 JPEG 会把字缘糊掉，DSH 读图时会看不清；
     * 2.5MB 的截图 base64 之后约 3.3MB，手机流量还扛得住，就原样发。
     */
    private static final long KEEP_ORIGINAL = 2500L * 1024L;
    private static final int MAX_SIDE = 1600;
    private static final int MAX_MESSAGE_IMAGES = 6;

    private static final ExecutorService POOL = Executors.newFixedThreadPool(2);

    private Pick() {
    }

    static int maxImages() {
        return MAX_MESSAGE_IMAGES;
    }

    public static void read(final Context context, final Uri uri, final Callback callback) {
        POOL.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    callback.onOk(readNow(context, uri));
                } catch (Throwable error) {
                    callback.onError(Api.message(error));
                }
            }
        });
    }

    private static Pending readNow(Context context, Uri uri) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        byte[] raw;
        InputStream input = resolver.openInputStream(uri);
        if (input == null) throw new Exception(context.getString(R.string.misc_pick_unreadable));
        try {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int read;
            while ((read = input.read(chunk)) > 0) buffer.write(chunk, 0, read);
            raw = buffer.toByteArray();
        } finally {
            input.close();
        }
        if (raw.length == 0) throw new Exception(context.getString(R.string.misc_img_empty));
        String name = displayName(resolver, uri);

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
        int sourceWidth = bounds.outWidth;
        int sourceHeight = bounds.outHeight;
        if (sourceWidth <= 0 || sourceHeight <= 0) throw new Exception(context.getString(R.string.misc_pick_unknown_format));

        String declared = sniff(raw);
        if (declared.length() > 0 && raw.length <= KEEP_ORIGINAL) {
            return new Pending(declared, Base64.encodeToString(raw, Base64.NO_WRAP), name,
                    sourceWidth, sourceHeight, raw.length);
        }

        Bitmap bitmap = decodeSampled(raw, MAX_SIDE);
        if (bitmap == null) throw new Exception(context.getString(R.string.misc_img_decode_failed));
        bitmap = rotate(context, resolver, uri, bitmap);
        bitmap = shrink(bitmap, MAX_SIDE);

        byte[] encoded = compress(bitmap, 85, 5_500_000);
        String type = "image/jpeg";
        if (encoded == null) {
            // JPEG 压不下来（极少见的大面积噪点图），退一步：更小尺寸 + 更低质量。
            bitmap = shrink(bitmap, 1024);
            encoded = compress(bitmap, 72, 9_000_000);
        }
        if (encoded == null) throw new Exception(context.getString(R.string.misc_pick_too_large));
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        if (!bitmap.isRecycled()) bitmap.recycle();
        return new Pending(type, Base64.encodeToString(encoded, Base64.NO_WRAP), name, width, height, encoded.length);
    }

    private static byte[] compress(Bitmap bitmap, int quality, long limit) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)) return null;
        byte[] bytes = out.toByteArray();
        return limit > 0 && bytes.length > limit ? null : bytes;
    }

    private static Bitmap decodeSampled(byte[] raw, int maxSide) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
        int longest = Math.max(bounds.outWidth, bounds.outHeight);
        int sample = 1;
        while (longest / sample > maxSide * 2) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        return BitmapFactory.decodeByteArray(raw, 0, raw.length, options);
    }

    private static Bitmap shrink(Bitmap bitmap, int maxSide) {
        int longest = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (longest <= maxSide) return bitmap;
        float scale = (float) maxSide / (float) longest;
        int width = Math.max(1, Math.round(bitmap.getWidth() * scale));
        int height = Math.max(1, Math.round(bitmap.getHeight() * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(bitmap, width, height, true);
        if (scaled != bitmap) bitmap.recycle();
        return scaled;
    }

    /** 相机拍的照片方向信息在 EXIF 里，BitmapFactory 不管，得自己转。 */
    private static Bitmap rotate(Context context, ContentResolver resolver, Uri uri, Bitmap bitmap) {
        if (Build.VERSION.SDK_INT < 24) return bitmap;
        InputStream input = null;
        try {
            input = resolver.openInputStream(uri);
            if (input == null) return bitmap;
            android.media.ExifInterface exif = new android.media.ExifInterface(input);
            int orientation = exif.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION,
                    android.media.ExifInterface.ORIENTATION_NORMAL);
            int degrees;
            if (orientation == android.media.ExifInterface.ORIENTATION_ROTATE_90) degrees = 90;
            else if (orientation == android.media.ExifInterface.ORIENTATION_ROTATE_180) degrees = 180;
            else if (orientation == android.media.ExifInterface.ORIENTATION_ROTATE_270) degrees = 270;
            else return bitmap;
            Matrix matrix = new Matrix();
            matrix.postRotate(degrees);
            Bitmap turned = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (turned != bitmap) bitmap.recycle();
            return turned;
        } catch (Throwable ignore) {
            return bitmap;
        } finally {
            if (input != null) {
                try {
                    input.close();
                } catch (Exception ignore) {
                }
            }
        }
    }

    /** 用 magic bytes 判类型：host 会核对声明类型与实际字节，声错了直接 400。 */
    static String sniff(byte[] bytes) {
        if (bytes.length >= 8 && (bytes[0] & 0xFF) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G') {
            return "image/png";
        }
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8) return "image/jpeg";
        if (bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return "image/webp";
        }
        if (bytes.length >= 6 && bytes[0] == 'G' && bytes[1] == 'I' && bytes[2] == 'F') return "image/gif";
        return "";
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        Cursor cursor = null;
        try {
            cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                String value = cursor.getString(0);
                if (value != null && value.length() > 0) return value;
            }
        } catch (Exception ignore) {
        } finally {
            if (cursor != null) {
                try {
                    cursor.close();
                } catch (Exception ignore) {
                }
            }
        }
        String last = uri.getLastPathSegment();
        return last == null || last.length() == 0 ? "image" : last;
    }
}
