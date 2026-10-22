package com.lc.phoneharness;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 手写 SSE 客户端（Android 上没有内置 EventSource）。
 *
 * 协议很浅：逐行读，event:/data: 累积，空行派发。断线后指数退避重连。
 * 所有派发都走主线程，调用方可以直接改 View。
 */
public final class Sse {

    public interface Listener {
        void onEvent(String event, JSONObject data);

        void onState(String state);
    }

    private final Prefs prefs;
    private volatile boolean stopped;
    private volatile HttpURLConnection connection;
    private Thread thread;

    public Sse(Prefs prefs) {
        this.prefs = prefs;
    }

    public void start(final String path, final Listener listener) {
        stopped = false;
        thread = new Thread(new Runnable() {
            @Override
            public void run() {
                long backoff = 1000L;
                while (!stopped) {
                    try {
                        listener.onState("connecting");
                        consume(path, listener);
                        backoff = 1000L;
                    } catch (Exception error) {
                        if (stopped) return;
                        listener.onState("offline");
                        try {
                            Thread.sleep(backoff);
                        } catch (InterruptedException stop) {
                            return;
                        }
                        backoff = Math.min(backoff * 2L, 15000L);
                    }
                }
            }
        }, "phone-sse");
        thread.setDaemon(true);
        thread.start();
    }

    public void stop() {
        stopped = true;
        HttpURLConnection current = connection;
        if (current != null) {
            try {
                current.disconnect();
            } catch (Exception ignore) {
            }
        }
        if (thread != null) thread.interrupt();
        thread = null;
    }

    private void consume(String path, Listener listener) throws Exception {
        String base = prefs.base();
        if (base.length() == 0) throw new Exception("no address");
        HttpURLConnection conn = (HttpURLConnection) new URL(base + path).openConnection();
        connection = conn;
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(0);
        conn.setRequestProperty("Accept", "text/event-stream");
        conn.setRequestProperty("Cache-Control", "no-cache");
        String token = prefs.token();
        if (token != null && token.length() > 0) {
            conn.setRequestProperty("Authorization", "Bearer " + token);
        }
        int status = conn.getResponseCode();
        if (status >= 400) {
            InputStream error = conn.getErrorStream();
            String detail = error == null ? ("HTTP " + status) : Api.readAll(error);
            conn.disconnect();
            throw new Exception(detail);
        }
        listener.onState("live");
        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
        try {
            String event = null;
            StringBuilder data = new StringBuilder();
            String line;
            while (!stopped && (line = reader.readLine()) != null) {
                if (line.length() == 0) {
                    if (data.length() > 0) {
                        dispatch(event, data.toString(), listener);
                        data.setLength(0);
                    }
                    event = null;
                    continue;
                }
                if (line.startsWith(":")) continue;
                int colon = line.indexOf(':');
                String field = colon < 0 ? line : line.substring(0, colon);
                String value = colon < 0 ? "" : line.substring(colon + 1);
                if (value.startsWith(" ")) value = value.substring(1);
                if ("event".equals(field)) {
                    event = value;
                } else if ("data".equals(field)) {
                    if (data.length() > 0) data.append('\n');
                    data.append(value);
                }
            }
        } finally {
            try {
                reader.close();
            } catch (Exception ignore) {
            }
            conn.disconnect();
            connection = null;
        }
        if (!stopped) throw new Exception("stream closed");
    }

    private void dispatch(String event, String raw, Listener listener) {
        JSONObject parsed;
        try {
            parsed = new JSONObject(raw);
        } catch (Exception ignore) {
            return;
        }
        listener.onEvent(event == null ? "message" : event, parsed);
    }
}
