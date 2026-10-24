package com.ecojust.puretv;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

/** Companion app shortcuts followed by a small set of placeholders. */
public class AppsActivity extends Activity implements AppAdapter.TileListener {
    private RecyclerView grid;
    private AppAdapter adapter;
    private int columns;
    private int focusedPosition;
    private String layoutSignature="";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_apps);
        LauncherLayout layout=LauncherLayout.override(this);
        layoutSignature=layout==null?"":layout.json.toString();
        columns = layout==null?(getResources().getConfiguration().screenWidthDp >= 800 ? 4 : 3):layout.columns;
        grid = findViewById(R.id.appsGrid);
        grid.setLayoutManager(new GridLayoutManager(this, columns));
        grid.setHasFixedSize(true);
        grid.setItemAnimator(null);
        AppAdapter.setReducedMotion(getSharedPreferences("layout", MODE_PRIVATE)
                .getBoolean("reduced_motion", false));
        adapter = new AppAdapter(this, this, columns, layout==null?AppAdapter.applicationEntries():layout.entries(this,"apps"));
        grid.setAdapter(adapter);
        findViewById(R.id.backHome).setOnClickListener(v -> finish());
        findViewById(R.id.backHome).setOnKeyListener((v, key, event) -> {
            if (event.getAction() != KeyEvent.ACTION_DOWN) return false;
            if (key == KeyEvent.KEYCODE_DPAD_DOWN) {
                CardFocus.request(grid, focusedPosition);
                return true;
            }
            return key == KeyEvent.KEYCODE_DPAD_UP;
        });
        if (state != null) focusedPosition = state.getInt("focusedPosition", 0);
        CardFocus.request(grid, focusedPosition);
    }

    @Override protected void onResume() {
        super.onResume();
        LauncherLayout layout=LauncherLayout.override(this);String signature=layout==null?"":layout.json.toString();
        if(!signature.equals(layoutSignature)) {
            layoutSignature=signature;columns=layout==null?(getResources().getConfiguration().screenWidthDp>=800?4:3):layout.columns;
            adapter.clear();adapter=new AppAdapter(this,this,columns,layout==null?AppAdapter.applicationEntries():layout.entries(this,"apps"));
            grid.setLayoutManager(new GridLayoutManager(this,columns));grid.setAdapter(adapter);CardFocus.request(grid,focusedPosition);
        }
    }

    @Override public void onTileFocused(int position, View card) { focusedPosition = position; }

    @Override public boolean onTileVerticalKey(int position, int key) {
        if (key == KeyEvent.KEYCODE_DPAD_UP && position < columns) {
            findViewById(R.id.backHome).requestFocus();
            return true;
        }
        int target = key == KeyEvent.KEYCODE_DPAD_UP ? position - columns : position + columns;
        if (target >= adapter.getItemCount()) {
            // Preserve the column where possible, including the last incomplete row.
            int lastRow = ((adapter.getItemCount() - 1) / columns) * columns;
            if (position >= lastRow) return true;
            target = adapter.getItemCount() - 1;
        }
        CardFocus.request(grid, target);
        return true;
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putInt("focusedPosition", focusedPosition);
        super.onSaveInstanceState(state);
    }
}
