package com.ecojust.cleanyourtv;
import android.content.Context;
import android.content.pm.ProviderInfo;
import android.os.Bundle;
import android.util.Base64;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,qualifiers="zh-rCN-w960dp-h540dp-land-xhdpi")
public class LauncherLayoutTest {
    private Context context(){return RuntimeEnvironment.getApplication();}
    @After public void clear(){LauncherLayout.reset(context());}
    @Test public void validLayoutChangesActualGridAndInvalidChangesPreserveIt() throws Exception {
        JSONObject draft=LauncherLayout.defaults(context()).json;
        draft.put("columns",3).put("home",new JSONArray().put(new JSONObject().put("packageName","com.ecojust.cleanyourtv").put("label","我的入口").put("icon","settings").put("color","#112233")).put(new JSONObject().put("action","music")));
        LauncherLayout.apply(context(),draft);
        assertEquals(3,LauncherLayout.override(context()).columns);
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).setup()) {
            RecyclerView grid=controller.get().findViewById(R.id.grid);
            assertEquals(3,((GridLayoutManager)grid.getLayoutManager()).getSpanCount());assertEquals(2,grid.getAdapter().getItemCount());
            AppAdapter.Entry entry=LauncherLayout.override(context()).entries(context(),"home").get(0);
            assertEquals("我的入口",entry.title(context()));assertEquals(R.drawable.ic_settings,entry.icon);assertEquals(AppAdapter.CUSTOM_APP,entry.action);
            JSONObject bad=new JSONObject(draft.toString()).put("columns",9);
            try {LauncherLayout.apply(context(),bad);fail("Invalid layout must fail");} catch(IllegalArgumentException expected) { }
            assertEquals(3,LauncherLayout.override(context()).columns);
            LauncherLayout.reset(context());org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();assertNull(LauncherLayout.override(context()));
            assertEquals(4,grid.getAdapter().getItemCount());
        }
    }
    @Test public void providerIsShellProtectedAndReturnsReadBackConfiguration() throws Exception {
        ProviderInfo info=context().getPackageManager().resolveContentProvider("com.ecojust.cleanyourtv.layout",0);
        assertNotNull(info);assertTrue(info.exported);assertEquals("android.permission.DUMP",info.readPermission);assertEquals("android.permission.DUMP",info.writePermission);
        LauncherLayoutProvider provider=Robolectric.buildContentProvider(LauncherLayoutProvider.class).create().get();
        JSONObject draft=LauncherLayout.defaults(context()).json;draft.put("columns",2);
        Bundle returned=provider.call("apply",Base64.encodeToString(draft.toString().getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP),null);
        JSONObject value=new JSONObject(new String(Base64.decode(returned.getString("result"),Base64.NO_WRAP),StandardCharsets.UTF_8));
        assertTrue(value.getBoolean("supported"));assertEquals(2,value.getJSONObject("layout").getInt("columns"));assertTrue(value.getBoolean("custom"));
        Bundle reset=provider.call("reset",null,null);JSONObject defaults=new JSONObject(new String(Base64.decode(reset.getString("result"),Base64.NO_WRAP),StandardCharsets.UTF_8));assertFalse(defaults.getBoolean("custom"));
    }
    @Test public void rejectsCommandsUnknownIconsDuplicatesAndMalformedArrays() throws Exception {
        for(String fields:new String[]{"{\"packageName\":\"com.example;reboot\"}","{\"packageName\":\"com.example.app\",\"command\":\"reboot\"}","{\"packageName\":\"com.example.app\",\"icon\":\"https://bad/icon\"}"}) {
            JSONObject bad=LauncherLayout.defaults(context()).json;bad.put("home",new JSONArray().put(new JSONObject(fields)));
            try{new LauncherLayout(bad);fail("Bad fields must fail");}catch(IllegalArgumentException expected) { }
        }
        JSONObject duplicate=LauncherLayout.defaults(context()).json;duplicate.put("home",new JSONArray().put(new JSONObject().put("action","music")).put(new JSONObject().put("action","music")));
        try{new LauncherLayout(duplicate);fail("Duplicates must fail");}catch(IllegalArgumentException expected) { }
    }
}
