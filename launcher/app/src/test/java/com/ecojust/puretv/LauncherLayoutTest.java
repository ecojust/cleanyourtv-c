package com.ecojust.puretv;
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
        draft.getJSONObject("home").put("columns",3).put("items",new JSONArray().put(new JSONObject().put("action","files").put("label","我的入口").put("icon","settings").put("color","#112233")).put(new JSONObject().put("action","music")));
        LauncherLayout.apply(context(),draft);
        assertEquals(3,LauncherLayout.override(context()).columns("home"));
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).setup()) {
            RecyclerView grid=controller.get().findViewById(R.id.grid);
            assertEquals(3,((GridLayoutManager)grid.getLayoutManager()).getSpanCount());assertEquals(2,grid.getAdapter().getItemCount());
            AppAdapter.Entry entry=LauncherLayout.override(context()).entries(context(),"home").get(0);
            assertEquals("我的入口",entry.title(context()));assertEquals(R.drawable.ic_settings,entry.icon);assertEquals(AppAdapter.FILES,entry.action);
            JSONObject bad=new JSONObject(draft.toString());bad.getJSONObject("home").put("columns",9);
            try {LauncherLayout.apply(context(),bad);fail("Invalid layout must fail");} catch(IllegalArgumentException expected) { }
            assertEquals(3,LauncherLayout.override(context()).columns("home"));
            LauncherLayout.reset(context());org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();assertNull(LauncherLayout.override(context()));
            assertEquals(4,grid.getAdapter().getItemCount());
        }
    }
    @Test public void providerIsShellProtectedAndReturnsReadBackConfiguration() throws Exception {
        ProviderInfo info=context().getPackageManager().resolveContentProvider("com.ecojust.puretv.layout",0);
        assertNotNull(info);assertTrue(info.exported);assertEquals("android.permission.DUMP",info.readPermission);assertEquals("android.permission.DUMP",info.writePermission);
        LauncherLayoutProvider provider=Robolectric.buildContentProvider(LauncherLayoutProvider.class).create().get();
        JSONObject draft=LauncherLayout.defaults(context()).json;draft.getJSONObject("home").put("columns",2);
        Bundle returned=provider.call("apply",Base64.encodeToString(draft.toString().getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP),null);
        JSONObject value=new JSONObject(new String(Base64.decode(returned.getString("result"),Base64.NO_WRAP),StandardCharsets.UTF_8));
        assertTrue(value.getBoolean("supported"));assertEquals(2,value.getJSONObject("layout").getJSONObject("home").getInt("columns"));assertTrue(value.getBoolean("custom"));
        Bundle reset=provider.call("reset",null,null);JSONObject defaults=new JSONObject(new String(Base64.decode(reset.getString("result"),Base64.NO_WRAP),StandardCharsets.UTF_8));assertFalse(defaults.getBoolean("custom"));
    }
    @Test public void rejectsCommandsUnknownIconsDuplicatesAndMalformedArrays() throws Exception {
        for(String fields:new String[]{"{\"packageName\":\"com.example;reboot\"}","{\"packageName\":\"com.example.app\",\"command\":\"reboot\"}","{\"packageName\":\"com.example.app\",\"icon\":\"https://bad/icon\"}"}) {
            JSONObject bad=LauncherLayout.defaults(context()).json;bad.getJSONObject("home").put("items",new JSONArray().put(new JSONObject(fields)));
            try{new LauncherLayout(bad);fail("Bad fields must fail");}catch(IllegalArgumentException expected) { }
        }
        JSONObject duplicate=LauncherLayout.defaults(context()).json;duplicate.getJSONObject("home").put("items",new JSONArray().put(new JSONObject().put("action","music")).put(new JSONObject().put("action","music")));
        try{new LauncherLayout(duplicate);fail("Duplicates must fail");}catch(IllegalArgumentException expected) { }
    }
    private void install(String pkg,boolean system) {
        android.content.pm.PackageInfo info=new android.content.pm.PackageInfo();info.packageName=pkg;
        info.applicationInfo=new android.content.pm.ApplicationInfo();info.applicationInfo.packageName=pkg;info.applicationInfo.enabled=true;
        info.applicationInfo.flags=android.content.pm.ApplicationInfo.FLAG_INSTALLED | (system?android.content.pm.ApplicationInfo.FLAG_SYSTEM:0);
        org.robolectric.Shadows.shadowOf(context().getPackageManager()).installPackage(info);
        android.content.pm.ResolveInfo resolve=new android.content.pm.ResolveInfo();resolve.activityInfo=new android.content.pm.ActivityInfo();resolve.activityInfo.packageName=pkg;resolve.activityInfo.name=pkg+".Main";resolve.activityInfo.applicationInfo=info.applicationInfo;resolve.activityInfo.enabled=true;resolve.activityInfo.exported=true;
        for(String category:new String[]{android.content.Intent.CATEGORY_LAUNCHER,android.content.Intent.CATEGORY_LEANBACK_LAUNCHER}) {
            android.content.Intent query=new android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(category);
            org.robolectric.Shadows.shadowOf(context().getPackageManager()).addResolveInfoForIntent(query,resolve);
            org.robolectric.Shadows.shadowOf(context().getPackageManager()).addResolveInfoForIntent(new android.content.Intent(query).setPackage(pkg),resolve);
        }
    }
    @Test public void onlyInstalledLaunchableUserAppsCanBeAdded() throws Exception {
        install("com.example.user",false);install("com.example.system",true);
        assertTrue(LauncherLayout.isUserApp(context(),"com.example.user"));assertFalse(LauncherLayout.isUserApp(context(),"com.example.system"));
        JSONObject draft=LauncherLayout.defaults(context()).json;
        draft.getJSONObject("home").put("items",new JSONArray().put(new JSONObject().put("packageName","com.example.user")));
        LauncherLayout.apply(context(),draft);assertEquals("com.example.user",LauncherLayout.override(context()).json.getJSONObject("home").getJSONArray("items").getJSONObject(0).getString("packageName"));
        for(String pkg:new String[]{"com.example.system","com.example.missing"}) {
            draft.getJSONObject("home").put("items",new JSONArray().put(new JSONObject().put("packageName",pkg)));
            try{LauncherLayout.apply(context(),draft);fail("Invalid user app must be rejected");}catch(IllegalArgumentException expected){}
        }
        assertFalse(LauncherLayout.installedApps(context()).toString().contains("com.example.system"));
    }
    @Test public void layoutJsonPagesAreIndependentAndOldAppsJsonIsIgnored() throws Exception {
        JSONObject draft=LauncherLayout.defaults(context()).json;draft.getJSONObject("home").put("columns",2);draft.getJSONObject("apps").put("columns",5);
        java.io.File old=new java.io.File(context().getFilesDir(),"apps.json");java.nio.file.Files.write(old.toPath(),draft.toString().getBytes(StandardCharsets.UTF_8));
        assertNull(LauncherLayout.override(context()));old.delete();LauncherLayout.apply(context(),draft);
        assertEquals(2,LauncherLayout.override(context()).columns("home"));assertEquals(5,LauncherLayout.override(context()).columns("apps"));
        try(ActivityController<AppsActivity> controller=Robolectric.buildActivity(AppsActivity.class).setup()) {
            RecyclerView grid=controller.get().findViewById(R.id.appsGrid);assertEquals(5,((GridLayoutManager)grid.getLayoutManager()).getSpanCount());
        }
    }

    @Test public void defaultTelevisionPagesUseTheLayoutJsonTemplate() throws Exception {
        assertNull(LauncherLayout.override(context()));LauncherLayout template=LauncherLayout.defaults(context());
        try(ActivityController<MainActivity> home=Robolectric.buildActivity(MainActivity.class).setup();
            ActivityController<AppsActivity> apps=Robolectric.buildActivity(AppsActivity.class).setup()) {
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
            RecyclerView homeGrid=home.get().findViewById(R.id.grid), appsGrid=apps.get().findViewById(R.id.appsGrid);
            assertEquals(template.columns("home"),((GridLayoutManager)homeGrid.getLayoutManager()).getSpanCount());
            assertEquals(template.columns("apps"),((GridLayoutManager)appsGrid.getLayoutManager()).getSpanCount());
            assertEquals(template.json.getJSONObject("home").getJSONArray("items").length(),homeGrid.getAdapter().getItemCount());
            assertTrue(((AppAdapter)homeGrid.getAdapter()).keyAt(0).startsWith("layout-"));
        }
    }

    @Test public void applyingAndResettingLayoutRefreshesAlreadyOpenAppsPage() throws Exception {
        try(ActivityController<AppsActivity> controller=Robolectric.buildActivity(AppsActivity.class).setup()) {
            RecyclerView grid=controller.get().findViewById(R.id.appsGrid);
            JSONObject draft=LauncherLayout.defaults(context()).json;
            draft.getJSONObject("apps").put("columns",2).put("items",new JSONArray().put(new JSONObject().put("action","music")));
            LauncherLayout.apply(context(),draft);org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
            assertEquals(2,((GridLayoutManager)grid.getLayoutManager()).getSpanCount());assertEquals(1,grid.getAdapter().getItemCount());
            LauncherLayout.reset(context());org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
            assertEquals(4,((GridLayoutManager)grid.getLayoutManager()).getSpanCount());assertEquals(8,grid.getAdapter().getItemCount());
        }
    }

    @Test @Config(qualifiers="en-rUS-w960dp-h540dp-land")
    public void defaultPlaceholdersUseTheTelevisionLanguage() throws Exception {
        AppAdapter.Entry placeholder=LauncherLayout.defaults(context()).entries(context(),"apps").get(3);
        assertEquals(context().getString(R.string.placeholder_app,4),placeholder.title(context()));
    }

}
