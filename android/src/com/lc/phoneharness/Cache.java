package com.lc.phoneharness;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * 磁盘缓存：把服务端的 JSON 原样落在应用私有目录里。
 *
 * 为什么要它：一个真实会话在电脑上是 2.7MB / 3400+ 条，每次点开都全量下载 +
 * 重新解析，用户体感就是「转圈两三秒」。有了这一层，第二次打开先把上次的内容
 * 铺出来（几十毫秒），再在后台问电脑要增量。
 *
 * 只缓存 JSON 文本，不做结构映射：调用方自己决定存什么、按什么 key 存。
 */
final class Cache {

    /** 缓存目录总量上限；超了从最旧的开始删。 */
    private static final long MAX_BYTES = 24L * 1024L * 1024L;

    private Cache() {
    }

    static File dir(Context ctx) {
        File dir = new File(ctx.getFilesDir(), "cache");
        if (!dir.isDirectory()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    /** key 里可能有 /、:、空格，落盘前统一换掉，避免生成子目录或非法文件名。 */
    static String safe(String key) {
        StringBuilder out = new StringBuilder();
        String raw = key == null ? "" : key;
        for (int index = 0; index < raw.length(); index++) {
            char ch = raw.charAt(index);
            boolean ok = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
                    || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.';
            out.append(ok ? ch : '_');
        }
        return out.length() == 0 ? "cache" : out.toString();
    }

    static File file(Context ctx, String key) {
        return new File(dir(ctx), safe(key) + ".json");
    }

    static JSONObject readJson(Context ctx, String key) {
        String text = readText(ctx, key);
        if (text == null || text.length() == 0) return null;
        try {
            return new JSONObject(text);
        } catch (Exception error) {
            return null;
        }
    }

    static String readText(Context ctx, String key) {
        File file = file(ctx, key);
        if (!file.isFile()) return null;
        InputStream input = null;
        try {
            input = new FileInputStream(file);
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = input.read(chunk)) > 0) buffer.write(chunk, 0, read);
            return new String(buffer.toByteArray(), "UTF-8");
        } catch (Exception error) {
            return null;
        } finally {
            if (input != null) {
                try {
                    input.close();
                } catch (Exception ignore) {
                }
            }
        }
    }

    static void writeJson(Context ctx, String key, JSONObject json) {
        writeText(ctx, key, json == null ? "" : json.toString());
    }

    /**
     * 原子写：先写 .tmp 再改名。中途被杀也不会留下半个 JSON 把下次读取毒掉。
     */
    static void writeText(Context ctx, String key, String text) {
        File target = file(ctx, key);
        File tmp = new File(target.getParentFile(), target.getName() + ".tmp");
        FileOutputStream output = null;
        try {
            output = new FileOutputStream(tmp);
            output.write(text == null ? new byte[0] : text.getBytes("UTF-8"));
            output.flush();
            output.close();
            output = null;
            //noinspection ResultOfMethodCallIgnored
            tmp.renameTo(target);
            target.setLastModified(System.currentTimeMillis());
            trim(ctx);
        } catch (Exception error) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        } finally {
            if (output != null) {
                try {
                    output.close();
                } catch (Exception ignore) {
                }
            }
        }
    }

    /** 超出总量上限就从最旧的文件开始删（.tmp 残留也一起清）。 */
    static void trim(Context ctx) {
        File[] all = dir(ctx).listFiles();
        if (all == null || all.length == 0) return;
        List<File> files = new ArrayList<File>();
        long total = 0;
        for (File one : all) {
            if (one.isFile()) {
                files.add(one);
                total += one.length();
            }
        }
        if (total <= MAX_BYTES) return;
        Collections.sort(files, new Comparator<File>() {
            @Override
            public int compare(File left, File right) {
                long a = left.lastModified();
                long b = right.lastModified();
                if (a == b) return left.getName().compareTo(right.getName());
                return a < b ? -1 : 1;
            }
        });
        for (File one : files) {
            if (total <= MAX_BYTES) break;
            long size = one.length();
            if (one.delete()) total -= size;
        }
    }
}
