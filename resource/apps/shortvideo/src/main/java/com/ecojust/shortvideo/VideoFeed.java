package com.ecojust.shortvideo;

import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;

/** Small public JSON requests only. No credentials, video downloads or on-disk cache. */
final class VideoFeed implements FeedController.Loader {
    enum Source {
        KULEU("酷乐随机", "https://api.kuleu.com/api/MP4_xiaojiejie?type=json"),
        DWO("小渡随机", "https://openapi.dwo.cc/api/4qb_sp");
        final String label, endpoint;
        Source(String label, String endpoint) { this.label = label; this.endpoint = endpoint; }
        static Source from(String name) {
            try { return valueOf(name); } catch (IllegalArgumentException | NullPointerException e) { return KULEU; }
        }
    }
    static final class Clip {
        final String url;
        final Source source;
        Clip(String url, Source source) throws IOException {
            this.url = safeUrl(url); this.source = source;
        }
        String key() {
            // The configured providers identify the MP4 by its CDN host/path, not cache query parameters.
            URI uri = URI.create(url); return uri.getHost() + uri.getRawPath();
        }
    }
    interface Connections { HttpURLConnection open(String url) throws IOException; }
    private final Connections connections;
    private volatile HttpURLConnection connection;
    VideoFeed() { this(address -> (HttpURLConnection) new URL(address).openConnection()); }
    VideoFeed(Connections connections) { this.connections = connections; }

    @Override public Clip fetch(Source source) throws IOException {
        try { return parse(source, request(source.endpoint)); }
        catch (JSONException e) { throw new IOException("视频源没有返回有效 JSON", e); }
    }
    static Clip parse(Source source, JSONObject response) throws IOException {
        if (response.optInt("code") != 200) throw new IOException("视频源返回错误，请稍后重试");
        String url;
        if (source == Source.KULEU) url = response.optString("mp4_video");
        else {
            JSONObject data = response.optJSONObject("data");
            JSONObject video = data == null ? null : data.optJSONObject("video");
            url = video == null ? "" : video.optString("url");
        }
        return new Clip(url, source);
    }
    static String safeUrl(String value) throws IOException {
        if (value == null || value.isEmpty() || value.length() > 8192) throw new IOException("视频源未返回有效视频地址");
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null)
                throw new IOException("视频源未返回安全的 HTTPS 地址");
            return uri.toASCIIString();
        } catch (URISyntaxException e) { throw new IOException("视频地址格式无效", e); }
    }
    private JSONObject request(String address) throws IOException, JSONException {
        for (int redirects = 0; redirects <= 3; redirects++) {
            checkCancelled();
            HttpURLConnection current = connections.open(safeUrl(address));
            connection = current;
            current.setConnectTimeout(8000); current.setReadTimeout(8000); current.setInstanceFollowRedirects(false);
            current.setRequestProperty("User-Agent", "ShortVideoTV/0.1.0 (Android)");
            current.setRequestProperty("Accept", "application/json"); current.setRequestProperty("Cache-Control", "no-cache");
            long deadline = System.nanoTime() + 16_000_000_000L;
            try {
                checkCancelled(); int status = current.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = current.getHeaderField("Location");
                    if (location == null) throw new IOException("视频源重定向无效");
                    address = new URL(current.getURL(), location).toString(); continue;
                }
                if (status != 200) throw new IOException(status == 429 ? "视频源请求过快，请稍后重试" : "视频源请求失败（HTTP " + status + "）");
                if (current.getContentLengthLong() > 65536) throw new IOException("视频源响应过大");
                try (InputStream input = current.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        checkCancelled();
                        if (System.nanoTime() > deadline) throw new IOException("视频源请求超时");
                        if (output.size() + count > 65536) throw new IOException("视频源响应过大");
                        output.write(buffer, 0, count);
                    }
                    return new JSONObject(output.toString("UTF-8"));
                }
            } finally { if (connection == current) connection = null; current.disconnect(); }
        }
        throw new IOException("视频源重定向次数过多");
    }
    private static void checkCancelled() throws IOException {
        if (Thread.currentThread().isInterrupted()) throw new IOException("请求已取消");
    }
    @Override public void cancel() { HttpURLConnection current = connection; if (current != null) current.disconnect(); }
}
