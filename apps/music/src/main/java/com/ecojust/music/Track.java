package com.ecojust.music;

import org.json.JSONException;
import org.json.JSONObject;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Only metadata is stored; audio URLs are resolved afresh when a track starts. */
final class Track {
    private static final Pattern BV = Pattern.compile("BV[0-9A-Za-z]{10}");
    final String id, title, artist, cover, localUri;
    final long duration;

    Track(String id, String title, String artist, String cover, String localUri, long duration) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.cover = cover;
        this.localUri = localUri;
        this.duration = Math.max(0, duration);
    }

    boolean local() { return !localUri.isEmpty(); }
    static String extractBv(String text) {
        Matcher matcher = BV.matcher(text);
        return matcher.find() ? matcher.group() : null;
    }
    JSONObject json() throws JSONException {
        return new JSONObject().put("id", id).put("title", title).put("artist", artist)
                .put("cover", cover).put("uri", localUri).put("duration", duration);
    }
    static Track parse(JSONObject json) {
        String id = json.optString("id"), uri = json.optString("uri");
        if (id.isEmpty() || (!uri.isEmpty() && !uri.startsWith("content://"))) return null;
        if (uri.isEmpty() && !id.matches("BV[0-9A-Za-z]{10}")) return null;
        return new Track(id, json.optString("title", id), json.optString("artist"),
                json.optString("cover"), uri, json.optLong("duration"));
    }
    static long seconds(String text) {
        try {
            long total = 0;
            for (String part : text.trim().split(":")) total = Math.addExact(Math.multiplyExact(total, 60), Long.parseLong(part.trim()));
            return Math.max(0, total);
        } catch (RuntimeException e) { return 0; }
    }
}
