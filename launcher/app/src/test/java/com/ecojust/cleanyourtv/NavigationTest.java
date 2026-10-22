package com.ecojust.cleanyourtv;

import android.content.Intent;
import android.view.KeyEvent;
import android.view.View;
import androidx.recyclerview.widget.RecyclerView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowToast;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, qualifiers = "w960dp-h540dp-land")
public class NavigationTest {
    private void layout(android.app.Activity activity) {
        View decor = activity.getWindow().getDecorView();
        decor.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
        decor.layout(0, 0, 1920, 1080);
        shadowOf(android.os.Looper.getMainLooper()).idle();
    }

    @Test public void applicationsCardOpensStoreWebsiteWhenNoStoreIsInstalled() {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity home = controller.get();
            layout(home);
            RecyclerView grid = home.findViewById(R.id.grid);
            assertEquals(4, grid.getAdapter().getItemCount());
            RecyclerView.ViewHolder apps = grid.findViewHolderForAdapterPosition(3);
            assertNotNull(apps);
            apps.itemView.findViewById(R.id.card).performClick();
            Intent intent = shadowOf(home).getNextStartedActivity();
            assertEquals(Intent.ACTION_VIEW, intent.getAction());
            assertEquals("https://www.dangbei.com/", intent.getDataString());
        }
    }

    @Test public void musicCardOpensFreeMusicWebsiteInBrowser() {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity home = controller.get();
            layout(home);
            RecyclerView grid = home.findViewById(R.id.grid);
            grid.findViewHolderForAdapterPosition(0).itemView.findViewById(R.id.card).performClick();
            Intent intent = shadowOf(home).getNextStartedActivity();
            assertEquals(Intent.ACTION_VIEW, intent.getAction());
            assertEquals("https://somafm.com/player/", intent.getDataString());
            assertTrue(intent.hasCategory(Intent.CATEGORY_BROWSABLE));
        }
    }

    @Test public void musicCardExplainsMissingBrowser() {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity home = controller.get();
            android.content.Context noBrowser = new android.content.ContextWrapper(home) {
                @Override public void startActivity(Intent intent) {
                    throw new android.content.ActivityNotFoundException("No browser installed");
                }
            };
            RecyclerView grid = home.findViewById(R.id.grid);
            grid.setAdapter(new AppAdapter(noBrowser, home, 4, AppAdapter.homeEntries()));
            layout(home);
            grid.findViewHolderForAdapterPosition(0).itemView.findViewById(R.id.card).performClick();
            assertEquals(home.getString(R.string.music_browser_unavailable), ShadowToast.getTextOfLatestToast());
            assertNull(shadowOf(home).getNextStartedActivity());
        }
    }

    @Test public void applicationPageShowsPlaceholdersAndBackFinishes() {
        try (ActivityController<AppsActivity> controller = Robolectric.buildActivity(AppsActivity.class).setup()) {
            AppsActivity page = controller.get();
            layout(page);
            RecyclerView grid = page.findViewById(R.id.appsGrid);
            assertEquals(8, grid.getAdapter().getItemCount());
            grid.findViewHolderForAdapterPosition(0).itemView.findViewById(R.id.card).performClick();
            assertNotNull(ShadowToast.getTextOfLatestToast());
            assertNull(shadowOf(page).getNextStartedActivity());
            page.findViewById(R.id.backHome).performClick();
            assertTrue(page.isFinishing());
        }
    }

    @Test public void remoteDownOpensAppsAndUpReachesNavigation() {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity home = controller.get();
            layout(home);
            home.onTileVerticalKey(0, KeyEvent.KEYCODE_DPAD_UP);
            assertTrue(home.findViewById(R.id.btnWallpaper).hasFocus());
            home.onTileVerticalKey(0, KeyEvent.KEYCODE_DPAD_DOWN);
            assertEquals(AppsActivity.class.getName(), shadowOf(home).getNextStartedActivity()
                    .getComponent().getClassName());
        }
    }

    @Test public void remoteOnAppsPageCanReachBackAndLastRow() {
        try (ActivityController<AppsActivity> controller = Robolectric.buildActivity(AppsActivity.class).setup()) {
            AppsActivity page = controller.get();
            layout(page);
            page.onTileVerticalKey(0, KeyEvent.KEYCODE_DPAD_UP);
            assertTrue(page.findViewById(R.id.backHome).hasFocus());
            assertTrue(page.onTileVerticalKey(7, KeyEvent.KEYCODE_DPAD_DOWN));
            assertFalse(page.isFinishing());
        }
    }
}
