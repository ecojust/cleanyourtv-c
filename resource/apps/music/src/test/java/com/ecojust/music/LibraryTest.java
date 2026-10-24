package com.ecojust.music;

import android.content.Context;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=28)
public class LibraryTest {
    private MusicStore store;
    static Track track(int n) { return new Track(String.format(java.util.Locale.ROOT, "BV%010d", n), "Track " + n, "Artist", "", "", 60); }
    @Before public void setup() {
        Context context = RuntimeEnvironment.getApplication(); context.getSharedPreferences("music_library", 0).edit().clear().commit(); store = new MusicStore(context);
    }
    @Test public void favouriteLimitAndTogglePersist() {
        for (int i=0; i<120; i++) store.toggle(track(i));
        assertEquals(100, new MusicStore(RuntimeEnvironment.getApplication()).favourites().size());
        assertFalse(store.favourite(track(0).id)); assertTrue(store.favourite(track(119).id));
        assertFalse(store.toggle(track(119))); assertEquals(99, store.favourites().size());
    }
    @Test public void historyDeduplicatesAndKeepsRecentThirty() {
        for (int i=0;i<40;i++) store.remember(track(i)); store.remember(track(20));
        assertEquals(30, store.history().size()); assertEquals(track(20).id, store.history().get(0).id);
        assertFalse(MusicStore.contains(store.history(),track(0).id));
    }
    @Test public void skipsInvalidAndDuplicateMetadata() throws Exception {
        JSONArray array = new JSONArray().put(new JSONObject().put("id", "bad"))
            .put(track(1).json()).put(track(1).json()).put("broken").put(track(2).json());
        RuntimeEnvironment.getApplication().getSharedPreferences("music_library",0).edit().putString("queue",array.toString()).commit();
        assertEquals(2, store.queue().size());
    }
    @Test public void localDocumentsSurviveRestartButArbitraryUrlsDoNot() throws Exception {
        Track local = new Track("content://audio/1","Song","Local","","content://audio/1",0);
        assertTrue(Track.parse(local.json()).local());
        assertNull(Track.parse(new JSONObject().put("id","evil").put("uri","https://example.com/audio")));
    }
    @Test public void bvLinksAndDurationAreParsed() {
        assertEquals("BV1234567890",Track.extractBv("https://www.bilibili.com/video/BV1234567890/?x=1"));
        assertNull(Track.extractBv("invalid")); assertEquals(3723,Track.seconds("1:02:03"));
        assertEquals(0,Track.seconds("broken")); assertEquals(0,Track.seconds("999999999999999999:99"));
    }
}
