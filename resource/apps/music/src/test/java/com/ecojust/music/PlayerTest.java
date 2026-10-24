package com.ecojust.music;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.ServiceController;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=28)
public class PlayerTest {
    @Test public void localPlaybackPauseResumeSeekAndCancelUseOneDecoder() throws Exception {
        RuntimeEnvironment.getApplication().getSharedPreferences("music_library",0).edit().clear().commit();
        org.robolectric.shadows.ShadowMediaPlayer.setMediaInfoProvider(source -> new org.robolectric.shadows.ShadowMediaPlayer.MediaInfo(60000,1));
        ServiceController<PlaybackService> controller = Robolectric.buildService(PlaybackService.class).create();
        try {
            PlaybackService player = controller.get();
            Track local = new Track("content://music/1","Local","Artist","","content://music/1",60);
            assertTrue(player.add(local,true));
            java.lang.reflect.Field pending = PlaybackService.class.getDeclaredField("pending"); pending.setAccessible(true);
            ((java.util.concurrent.Future<?>)pending.get(player)).get(1,java.util.concurrent.TimeUnit.SECONDS);
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(10));
            assertTrue(player.playing()); assertEquals(60000,player.duration());
            player.pause(false); assertFalse(player.playing()); player.resume(); assertTrue(player.playing());
            player.seek(10000); org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(10));
            assertTrue(player.position()>=10000); assertEquals(local.id,new MusicStore(player).history().get(0).id);
            player.play(0); java.util.concurrent.Future<?> work=(java.util.concurrent.Future<?>)pending.get(player);
            work.get(1,java.util.concurrent.TimeUnit.SECONDS); player.clearQueue();
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
            assertFalse(player.playing()); assertFalse(player.loading()); assertNull(player.current());
        } finally { controller.destroy(); }
    }
    @Test public void queueIsBoundedDeduplicatedAndRestoredWithoutAutoplay() {
        RuntimeEnvironment.getApplication().getSharedPreferences("music_library",0).edit().clear().commit();
        ServiceController<PlaybackService> controller = Robolectric.buildService(PlaybackService.class).create();
        try {
            PlaybackService player = controller.get();
            for (int i=0;i<50;i++) assertTrue(player.add(LibraryTest.track(i),false));
            assertFalse(player.add(LibraryTest.track(50),false)); assertTrue(player.add(LibraryTest.track(0),false));
            assertEquals(50,player.queue().size()); assertFalse(player.playing());
            player.queue().clear(); assertEquals(50,player.queue().size());
        } finally { controller.destroy(); }
        controller = Robolectric.buildService(PlaybackService.class).create();
        try {
            PlaybackService player = controller.get(); assertEquals(50,player.queue().size()); assertFalse(player.playing()); assertFalse(player.loading());
            player.clearQueue(); assertTrue(player.queue().isEmpty()); assertNull(player.current());
        } finally { controller.destroy(); }
        assertTrue(new MusicStore(RuntimeEnvironment.getApplication()).queue().isEmpty());
    }
}
