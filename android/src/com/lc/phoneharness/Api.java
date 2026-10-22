package com.lc.phoneharness;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 极简 HTTP 客户端。
 *
 * 刻意不引 OkHttp / Retrofit：这个工程是不带 Gradle 的手工构建，
 * 一个额外依赖都没有，只用 JDK + Android 自带的 org.json。
 */
public final class Api {

    public interface Callback {
        void onOk(JSONObject body);

        void onError(String message);
    }

    /** 带结构化错误码的回调：外接模型那几个接口要按 code 给中文原因。 */
    public interface Result {
        void onOk(JSONObject body);

        void onFail(String message, HttpError error);
    }

    /** 服务端返回的结构化错误。 */
    public static final class HttpError extends IOException {
        public final int status;
        public final String code;

        HttpError(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code == null ? "" : code;
        }
    }

    /** 条件请求的回调：unchanged=true 表示服务端回 304，body 为 null。 */
    public interface Conditional {
        void onOk(boolean unchanged, String etag, JSONObject body);

        void onError(String message);
    }

    /** 带 ETag 的一次 GET 结果。 */
    public static final class Fetched {
        public final boolean unchanged;
        public final String etag;
        public final JSONObject body;

        Fetched(boolean unchanged, String etag, JSONObject body) {
            this.unchanged = unchanged;
            this.etag = etag;
            this.body = body;
        }
    }

    private final Prefs prefs;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    public Api(Prefs prefs) {
        this.prefs = prefs;
    }

    public ExecutorService pool() {
        return pool;
    }

    public void get(final String path, final Callback callback) {
        run("GET", path, null, callback);
    }

    public void post(final String path, final JSONObject body, final Callback callback) {
        run("POST", path, body, callback);
    }

    public void postFor(final String path, final JSONObject body, final Result callback) {
        runFor("POST", path, body, callback);
    }

    /**
     * 条件 GET：带上上次的 ETag，服务端没变就回 304。
     *
     * 手机开一个大会话是 2.7MB，重开一次全量重下太浪费；304 时 body 为 null，
     * 调用方直接用本地缓存即可。
     */
    public void getConditional(final String path, final String etag, final Conditional callback) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Fetched got = fetchConditional(prefs.base(), prefs.token(), path, etag);
                    callback.onOk(got.unchanged, got.etag, got.body);
                } catch (Exception error) {
                    callback.onError(message(error));
                }
            }
        });
    }

    /** DELETE（删外接模型用）。 */
    public void delete(final String path, final Result callback) {
        runFor("DELETE", path, null, callback);
    }

    private void runFor(final String method, final String path, final JSONObject body, final Result callback) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    callback.onOk(request(method, path, body));
                } catch (HttpError error) {
                    callback.onFail(error.getMessage(), error);
                } catch (Exception error) {
                    callback.onFail(message(error), null);
                }
            }
        });
    }

    private void run(final String method, final String path, final JSONObject body, final Callback callback) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    callback.onOk(request(method, path, body));
                } catch (Exception error) {
                    callback.onError(message(error));
                }
            }
        });
    }

    public JSONObject request(String method, String path, JSONObject body) throws IOException {
        return call(prefs.base(), prefs.token(), method, path, body);
    }

    /**
     * 打一台指定的主机（多主机页要用：列表里每台电脑地址和令牌都不一样，
     * 不能借当前主机的 prefs 去请求）。地址随便填，这里统一归一。
     */
    public static JSONObject call(String address, String token, String method, String path,
                                  JSONObject body) throws IOException {
        String base = Prefs.normalize(address);
        if (base.length() == 0) throw new IOException(Langs.str(R.string.misc_err_no_host, "还没填电脑地址"));
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(base + path).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "dsh-phone-harness/0.2.0 (android)");
            if (token != null && token.length() > 0) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
            }
            if (body != null) {
                byte[] payload = body.toString().getBytes("UTF-8");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setFixedLengthStreamingMode(payload.length);
                OutputStream output = connection.getOutputStream();
                try {
                    output.write(payload);
                } finally {
                    output.close();
                }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = stream == null ? "" : readAll(stream);
            JSONObject parsed = null;
            if (text != null && text.length() > 0) {
                try {
                    parsed = new JSONObject(text);
                } catch (Exception ignore) {
                    parsed = null;
                }
            }
            if (status >= 400) {
                // 错误体有两种形状：{code,message} 和 {error:{code,message}}，都认。
                JSONObject nested = parsed == null ? null : parsed.optJSONObject("error");
                String code = parsed == null ? "" : parsed.optString("code", "");
                String detail = parsed == null ? "" : parsed.optString("message", "");
                if (nested != null) {
                    if (code.length() == 0) code = nested.optString("code", "");
                    if (detail.length() == 0) detail = nested.optString("message", "");
                }
                if (detail.length() == 0) detail = text;
                if (detail == null || detail.length() == 0) detail = "HTTP " + status;
                throw new HttpError(status, code, detail);
            }
            if (parsed == null) throw new IOException(Langs.str(R.string.misc_err_not_json, "服务端返回的不是 JSON"));
            return parsed;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** 条件 GET 的实体版本：多一层 304 与响应头读取。 */
    public static Fetched fetchConditional(String address, String token, String path, String etag)
            throws IOException {
        String base = Prefs.normalize(address);
        if (base.length() == 0) throw new IOException(Langs.str(R.string.misc_err_no_host, "还没填电脑地址"));
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(base + path).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "dsh-phone-harness/0.2.0 (android)");
            if (token != null && token.length() > 0) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
            }
            if (etag != null && etag.length() > 0) {
                connection.setRequestProperty("If-None-Match", etag);
            }
            int status = connection.getResponseCode();
            String fresh = connection.getHeaderField("ETag");
            if (status == 304) return new Fetched(true, fresh == null ? etag : fresh, null);
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = stream == null ? "" : readAll(stream);
            JSONObject parsed = null;
            if (text != null && text.length() > 0) {
                try {
                    parsed = new JSONObject(text);
                } catch (Exception ignore) {
                    parsed = null;
                }
            }
            if (status >= 400) {
                JSONObject nested = parsed == null ? null : parsed.optJSONObject("error");
                String code = parsed == null ? "" : parsed.optString("code", "");
                String detail = parsed == null ? "" : parsed.optString("message", "");
                if (nested != null) {
                    if (code.length() == 0) code = nested.optString("code", "");
                    if (detail.length() == 0) detail = nested.optString("message", "");
                }
                if (detail.length() == 0) detail = text;
                if (detail == null || detail.length() == 0) detail = "HTTP " + status;
                throw new HttpError(status, code, detail);
            }
            if (parsed == null) throw new IOException(Langs.str(R.string.misc_err_not_json, "服务端返回的不是 JSON"));
            return new Fetched(false, fresh == null ? "" : fresh, parsed);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /**
     * 取原始字节（图片之类）。
     *
     * 「重发」要把历史消息里那几张图重新发一遍，而图片在 host 侧是 attachment 对象，
     * 手机会话里只有 attachmentId —— 只能照原路 GET 回来再 base64。
     */
    public byte[] bytes(String path) throws IOException {
        String base = prefs.base();
        if (base.length() == 0) throw new IOException(Langs.str(R.string.misc_err_no_host, "还没填电脑地址"));
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(base + path).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(60000);
            connection.setRequestProperty("User-Agent", "dsh-phone-harness/0.2.0 (android)");
            String token = prefs.token();
            if (token != null && token.length() > 0) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) throw new IOException("HTTP " + status);
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int read;
            try {
                while ((read = stream.read(chunk)) > 0) buffer.write(chunk, 0, read);
            } finally {
                stream.close();
            }
            if (status >= 400) throw new HttpError(status, "", Langs.str(R.string.misc_err_fetch_http, "取文件失败 HTTP " + status, status));
            return buffer.toByteArray();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    public static String message(Throwable error) {
        if (error == null) return Langs.str(R.string.misc_err_unknown, "未知错误");
        String text = error.getMessage();
        if (text == null || text.length() == 0) text = error.getClass().getSimpleName();
        return text;
    }

    static String readAll(InputStream stream) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        try {
            while ((read = stream.read(chunk)) > 0) buffer.write(chunk, 0, read);
        } finally {
            stream.close();
        }
        return new String(buffer.toByteArray(), "UTF-8");
    }

    public static String enc(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (Exception error) {
            return "";
        }
    }
}
