package com.ecojust.music;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import java.util.ArrayList;
import java.util.List;

/** Bounded metadata collections in one small preference file; no audio or image disk cache. */
final class MusicStore {
    static final int QUEUE_LIMIT = 50, FAVOURITE_LIMIT = 100, HISTORY_LIMIT = 30;
    private final SharedPreferences prefs;
    MusicStore(Context context) { prefs = context.getSharedPreferences("music_library", Context.MODE_PRIVATE); }

    List<Track> read(String key, int limit) {
        List<Track> result = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs.getString(key, "[]"));
            for (int i = 0; i < array.length() && result.size() < limit; i++) {
                if (array.optJSONObject(i) == null) continue;
                Track track = Track.parse(array.getJSONObject(i));
                if (track != null && !contains(result, track.id)) result.add(track);
            }
        } catch (JSONException ignored) { }
        return result;
    }
    void write(String key, List<Track> tracks, int limit) {
        JSONArray array = new JSONArray();
        for (int i = 0; i < Math.min(tracks.size(), limit); i++) {
            try { array.put(tracks.get(i).json()); } catch (JSONException ignored) { }
        }
        prefs.edit().putString(key, array.toString()).apply();
    }
    List<Track> favourites() { return read("favourites", FAVOURITE_LIMIT); }
    List<Track> history() { return read("history", HISTORY_LIMIT); }
    List<Track> queue() { return read("queue", QUEUE_LIMIT); }
    void queue(List<Track> tracks) { write("queue", tracks, QUEUE_LIMIT); }
    boolean favourite(String id) { return contains(favourites(), id); }
    boolean toggle(Track track) {
        List<Track> tracks = favourites();
        for (int i = 0; i < tracks.size(); i++) {
            if (tracks.get(i).id.equals(track.id)) { tracks.remove(i); write("favourites", tracks, FAVOURITE_LIMIT); return false; }
        }
        tracks.add(0, track);
        write("favourites", tracks, FAVOURITE_LIMIT);
        return true;
    }
    void remember(Track track) {
        List<Track> tracks = history();
        tracks.removeIf(t -> t.id.equals(track.id));
        tracks.add(0, track);
        write("history", tracks, HISTORY_LIMIT);
    }
    static boolean contains(List<Track> tracks, String id) {
        for (Track track : tracks) if (track.id.equals(id)) return true;
        return false;
    }
}
