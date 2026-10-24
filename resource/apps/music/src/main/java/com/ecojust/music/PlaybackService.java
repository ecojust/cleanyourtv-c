package com.ecojust.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Binder;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** One native decoder, bounded resolving work, native audio focus and foreground media controls. */
public class PlaybackService extends Service {
    private static final String CHANNEL = "music_playback", START = "start", TOGGLE = "toggle", NEXT = "next", PREVIOUS = "previous", STOP = "stop";
    private static final int NOTIFICATION = 11;
    final class LocalBinder extends Binder { PlaybackService player() { return PlaybackService.this; } }
    private final LocalBinder binder = new LocalBinder();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor resolver = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(2), new ThreadPoolExecutor.DiscardOldestPolicy());
    private final List<Track> queue = new ArrayList<>();
    private MusicStore store;
    private MediaPlayer player;
    private MediaSession session;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private Future<?> pending;
    private int index = -1, generation;
    private boolean prepared, loading, destroyed, resumeAfterFocus;
    private String error = "";
    private Runnable listener, prepareTimeout;

    @Override public void onCreate() {
        super.onCreate();
        store = new MusicStore(this); queue.addAll(store.queue());
        if (!queue.isEmpty()) index = 0;
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener(change -> {
                    if (change == AudioManager.AUDIOFOCUS_LOSS) pause(false);
                    else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) { resumeAfterFocus = playing(); pause(true); }
                    else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK && player != null) player.setVolume(.2f, .2f);
                    else if (change == AudioManager.AUDIOFOCUS_GAIN) {
                        if (player != null) player.setVolume(1f, 1f);
                        if (resumeAfterFocus && prepared) { resumeAfterFocus = false; resume(); }
                    }
                }, main).build();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(
                new NotificationChannel(CHANNEL, getString(R.string.playback_channel), NotificationManager.IMPORTANCE_LOW));
        session = new MediaSession(this, "MusicTV");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(false); }
            @Override public void onSkipToNext() { next(); }
            @Override public void onSkipToPrevious() { previous(); }
            @Override public void onSeekTo(long position) { seek(position); }
            @Override public void onStop() { stopPlayback(); }
        });
        session.setActive(true);
        updateState();
    }
    @Override public IBinder onBind(Intent intent) { return binder; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? START : intent.getAction();
        if (TOGGLE.equals(action)) toggle();
        else if (NEXT.equals(action)) next();
        else if (PREVIOUS.equals(action)) previous();
        else if (STOP.equals(action)) stopPlayback();
        else if (loading || playing()) startForeground(NOTIFICATION, notification());
        else stopSelf();
        return START_NOT_STICKY;
    }
    void listen(Runnable callback) { listener = callback; }
    List<Track> queue() { return new ArrayList<>(queue); }
    Track current() { return index >= 0 && index < queue.size() ? queue.get(index) : null; }
    int currentIndex() { return index; }
    boolean loading() { return loading; }
    String error() { return error; }
    boolean playing() { return player != null && prepared && player.isPlaying(); }
    long position() { return player != null && prepared ? player.getCurrentPosition() : 0; }
    long duration() { return player != null && prepared ? Math.max(0, player.getDuration()) : 0; }

    boolean add(Track track, boolean playNow) {
        int found = -1;
        for (int i = 0; i < queue.size(); i++) if (queue.get(i).id.equals(track.id)) { found = i; break; }
        if (found < 0) {
            if (queue.size() >= MusicStore.QUEUE_LIMIT) return false;
            queue.add(track); found = queue.size() - 1; store.queue(queue);
        }
        if (playNow) play(found); else changed();
        return true;
    }
    void play(int position) {
        if (position < 0 || position >= queue.size() || destroyed) return;
        cancelResolve(); releasePlayer();
        index = position; error = ""; loading = true; resumeAfterFocus = false;
        Track track = current();
        startForegroundService(new Intent(this, PlaybackService.class).setAction(START));
        startForeground(NOTIFICATION, notification());
        changed();
        int ticket = generation;
        pending = resolver.submit(() -> {
            try {
                String source = track.local() ? track.localUri : BiliApi.get().audio(track);
                main.post(() -> { if (!destroyed && ticket == generation) prepare(source, ticket); });
            } catch (Exception e) {
                String message = e.getMessage() == null ? getString(R.string.playback_failed) : e.getMessage();
                main.post(() -> { if (!destroyed && ticket == generation) fail(message); });
            }
        });
    }
    private void prepare(String source, int ticket) {
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            HashMap<String, String> headers = new HashMap<>();
            if (!current().local()) {
                headers.put("Referer", "https://www.bilibili.com/");
                headers.put("User-Agent", "Mozilla/5.0 (Linux; Android 9)");
            }
            player.setDataSource(this, Uri.parse(source), headers);
            player.setOnPreparedListener(value -> {
                if (destroyed || ticket != generation || value != player) return;
                prepared = true; loading = false;
                if (prepareTimeout != null) main.removeCallbacks(prepareTimeout);
                resume();
            });
            player.setOnCompletionListener(value -> {
                if (ticket != generation || value != player) return;
                if (index + 1 < queue.size()) play(index + 1);
                else { pause(false); seek(0); }
            });
            player.setOnErrorListener((value, what, extra) -> {
                if (ticket == generation && value == player) fail(getString(R.string.decoder_error, what, extra));
                return true;
            });
            player.prepareAsync();
            prepareTimeout = () -> { if (ticket == generation && loading) fail("音频加载超时，请重试或使用本地音频"); };
            main.postDelayed(prepareTimeout, 30000);
        } catch (Exception e) { fail(getString(R.string.playback_failed) + "：" + e.getMessage()); }
    }
    void toggle() {
        if (loading) pause(false);
        else if (playing()) pause(false);
        else resume();
    }
    void resume() {
        if (!prepared || player == null) { if (index >= 0) play(index); return; }
        if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { fail(getString(R.string.focus_denied)); return; }
        startForegroundService(new Intent(this, PlaybackService.class).setAction(START));
        player.start(); store.remember(current()); resumeAfterFocus = false;
        startForeground(NOTIFICATION, notification()); changed();
    }
    void pause(boolean transientLoss) {
        if (loading) { cancelResolve(); releasePlayer(); loading = false; }
        if (playing()) player.pause();
        if (!transientLoss) {
            resumeAfterFocus = false; audio.abandonAudioFocusRequest(focus);
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
        } else updateNotification();
        changed();
    }
    void next() { if (!queue.isEmpty()) play((index + 1) % queue.size()); }
    void previous() {
        if (position() > 3000) seek(0);
        else if (!queue.isEmpty()) play((index - 1 + queue.size()) % queue.size());
    }
    void seek(long position) {
        if (player != null && prepared) {
            player.seekTo(Math.min(Math.max(0, position), duration()), MediaPlayer.SEEK_CLOSEST);
            updateState();
        }
    }
    void clearQueue() {
        stopPlayback(); queue.clear(); index = -1; store.queue(queue); changed();
    }
    private void fail(String message) { error = message; loading = false; cancelResolve(); releasePlayer(); audio.abandonAudioFocusRequest(focus); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); changed(); }
    private void stopPlayback() {
        cancelResolve(); loading = false; releasePlayer(); resumeAfterFocus = false;
        audio.abandonAudioFocusRequest(focus); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); changed();
    }
    private void cancelResolve() { generation++; if (pending != null) pending.cancel(true); pending = null; resolver.purge(); }
    private void releasePlayer() { if (prepareTimeout != null) main.removeCallbacks(prepareTimeout); prepareTimeout = null; prepared = false; if (player != null) { player.release(); player = null; } }
    private void changed() { updateState(); if (listener != null) listener.run(); }
    private void updateState() {
        int state = loading ? PlaybackState.STATE_BUFFERING : playing() ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        session.setPlaybackState(new PlaybackState.Builder().setState(state, position(), playing() ? 1f : 0f)
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP).build());
        Track track = current();
        if (track != null) session.setMetadata(new android.media.MediaMetadata.Builder()
                .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, track.title)
                .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, track.artist)
                .putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, duration()).build());
    }
    private PendingIntent command(String action, int request) {
        return PendingIntent.getService(this, request, new Intent(this, PlaybackService.class).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification notification() {
        Track track = current();
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_music)
                .setContentTitle(track == null ? getString(R.string.app_name) : track.title)
                .setContentText(loading ? getString(R.string.loading_audio) : track == null ? "" : track.artist)
                .setContentIntent(open).setOnlyAlertOnce(true).setOngoing(playing() || loading)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, getString(R.string.previous), command(PREVIOUS, 1)).build())
                .addAction(new Notification.Action.Builder(playing() ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        getString(playing() ? R.string.pause : R.string.play), command(TOGGLE, 2)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, getString(R.string.next), command(NEXT, 3)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, getString(R.string.stop), command(STOP, 4)).build())
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2)).build();
    }
    private void updateNotification() { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION, notification()); }
    @Override public void onTaskRemoved(Intent rootIntent) { stopPlayback(); super.onTaskRemoved(rootIntent); }
    @Override public void onDestroy() {
        destroyed = true; listener = null; cancelResolve(); resolver.shutdownNow(); main.removeCallbacksAndMessages(null);
        releasePlayer(); if (audio != null) audio.abandonAudioFocusRequest(focus);
        if (session != null) { session.setActive(false); session.release(); }
        super.onDestroy();
    }
}
