package com.ecojust.music;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** At most 1 MiB cached artwork, one decoder, eight pending thumbnails; no disk cache. */
final class CoverLoader {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap bitmap) { return bitmap.getAllocationByteCount(); }
    };
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(8), new ThreadPoolExecutor.DiscardOldestPolicy());
    private volatile boolean closed;
    private volatile int epoch;
    { worker.allowCoreThreadTimeOut(true); }

    void load(String raw, ImageView view) {
        String url = raw.startsWith("http://") ? "https://" + raw.substring(7) : raw;
        view.setTag(url); view.setImageResource(R.drawable.ic_music);
        if (!url.startsWith("https://") || closed) return;
        Bitmap ready = cache.get(url);
        if (ready != null) { view.setImageBitmap(ready); return; }
        int ticket = epoch;
        WeakReference<ImageView> target = new WeakReference<>(view);
        worker.execute(() -> {
            Bitmap bitmap = fetch(url);
            if (bitmap == null || closed) return;
            synchronized (cache) { if (ticket != epoch || closed) return; cache.put(url, bitmap); }
            main.post(() -> {
                ImageView current = target.get();
                if (!closed && ticket == epoch && current != null && url.equals(current.getTag())) current.setImageBitmap(bitmap);
            });
        });
    }
    private Bitmap fetch(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
            if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > 512 * 1024) return null;
            byte[] bytes;
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (closed || output.size() + count > 512 * 1024) return null;
                    output.write(buffer, 0, count);
                }
                bytes = output.toByteArray();
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (options.outWidth <= 0 || options.outHeight <= 0) return null;
            options.inSampleSize = 1;
            while (options.outWidth / options.inSampleSize > 160 || options.outHeight / options.inSampleSize > 160) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            options.inPreferredConfig = Bitmap.Config.RGB_565;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } catch (Exception | OutOfMemoryError ignored) { return null; }
        finally { if (connection != null) connection.disconnect(); }
    }
    void trim() { synchronized (cache) { epoch++; cache.evictAll(); } worker.getQueue().clear(); main.removeCallbacksAndMessages(null); }
    void close() { closed = true; worker.shutdownNow(); main.removeCallbacksAndMessages(null); cache.evictAll(); }
}
