package com.ecojust.puretv;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;

/** Data-only layout.json override. It never accepts shell commands, intents or remote executable code. */
final class LauncherLayout {
    static final int LIMIT = 48 * 1024;
    final JSONObject json;
    int columns(String section) { return json.optJSONObject(section).optInt("columns",4); }
    LauncherLayout(JSONObject source) throws Exception {
        keys(source, "version", "home", "apps");
        if (!(source.opt("version") instanceof Integer) || source.getInt("version") != 2)
            throw new IllegalArgumentException("Unsupported layout.json version");
        for (String section : Arrays.asList("home","apps")) {
            JSONObject page=source.getJSONObject(section); keys(page,"columns","items");
            if (!(page.opt("columns") instanceof Integer) || page.getInt("columns")<1 || page.getInt("columns")>6)
                throw new IllegalArgumentException("Invalid page columns");
            validateEntries(page.getJSONArray("items"),0,section.equals("home")?24:100);
        }
        if (source.toString().getBytes(StandardCharsets.UTF_8).length > LIMIT) throw new IllegalArgumentException("layout.json is too large");
        json = new JSONObject(source.toString());
    }
    private static void keys(JSONObject value, String... allowed) {
        Set<String> names = new HashSet<>(Arrays.asList(allowed));
        java.util.Iterator<String> iterator = value.keys();
        while (iterator.hasNext()) if (!names.contains(iterator.next())) throw new IllegalArgumentException("Unknown layout.json field");
    }
    static boolean validPackage(String value) { return value.length() <= 255 && value.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+"); }
    private static void validateEntries(JSONArray list, int min, int max) throws Exception {
        if (list.length() < min || list.length() > max) throw new IllegalArgumentException("Invalid number of apps");
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < list.length(); i++) {
            JSONObject entry = list.getJSONObject(i); keys(entry, "action", "packageName", "label", "icon", "color");
            String action = entry.optString("action", "app");
            if (!Arrays.asList("app", "music", "bilibili", "files", "apps", "shortvideo", "webtv", "placeholder").contains(action)) throw new IllegalArgumentException("Unsupported action");
            if (action.equals("app") && !validPackage(entry.getString("packageName"))) throw new IllegalArgumentException("Invalid package name");
            if (!action.equals("app") && entry.has("packageName")) throw new IllegalArgumentException("Builtin actions do not accept package names");
            if (entry.has("label") && (!(entry.get("label") instanceof String) || entry.getString("label").length() > 100)) throw new IllegalArgumentException("Invalid label");
            if (!Arrays.asList("app", "music", "video", "files", "apps", "picture", "settings", "input").contains(entry.optString("icon", "app"))) throw new IllegalArgumentException("Invalid icon");
            if (!entry.optString("color", "#374959").matches("#[0-9a-fA-F]{6}")) throw new IllegalArgumentException("Invalid color");
            String key = action.equals("app") ? entry.getString("packageName") : action;
            if (!action.equals("placeholder") && !seen.add(key)) throw new IllegalArgumentException("Duplicate app");
        }
    }
    private static byte[] read(InputStream input) throws Exception {
        try (InputStream stream = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] bytes = new byte[4096]; int count;
            while ((count = stream.read(bytes)) != -1) { if (out.size() + count > LIMIT) throw new IllegalArgumentException("layout.json is too large"); out.write(bytes,0,count); }
            return out.toByteArray();
        }
    }
    private static File file(Context ctx) { return new File(ctx.getFilesDir(), "layout.json"); }
    static LauncherLayout override(Context ctx) {
        try {
            File privateFile = file(ctx);
            if (privateFile.exists() || new File(privateFile + ".bak").exists())
                return new LauncherLayout(new JSONObject(new String(read(new AtomicFile(privateFile).openRead()), StandardCharsets.UTF_8)));
            File external=ctx.getExternalFilesDir(null);File imported=external==null?null:new File(external,"layout.json");
            if(imported!=null && imported.isFile())return new LauncherLayout(new JSONObject(new String(read(new java.io.FileInputStream(imported)),StandardCharsets.UTF_8)));
        } catch (Exception ignored) { /* An invalid override never breaks Home. */ }
        return null;
    }
    static LauncherLayout effective(Context ctx) {
        LauncherLayout layout=override(ctx);
        if(layout!=null)return layout;
        try{return defaults(ctx);}catch(Exception ignored){return null;}
    }
    static LauncherLayout defaults(Context ctx) throws Exception {
        return new LauncherLayout(new JSONObject(new String(read(ctx.getAssets().open("layout.json")), StandardCharsets.UTF_8)));
    }
    static void apply(Context ctx, JSONObject json) throws Exception {
        LauncherLayout layout = new LauncherLayout(json);
        for(String section:Arrays.asList("home","apps")) {
            JSONArray items=layout.json.getJSONObject(section).getJSONArray("items");
            for(int i=0;i<items.length();i++) {
                JSONObject item=items.getJSONObject(i);
                if(item.has("packageName") && !isUserApp(ctx,item.getString("packageName")))
                    throw new IllegalArgumentException("Only installed user applications may be added");
            }
        }
        AtomicFile target = new AtomicFile(file(ctx)); FileOutputStream output = target.startWrite();
        try { output.write(layout.json.toString().getBytes(StandardCharsets.UTF_8)); target.finishWrite(output); }
        catch (Exception error) { target.failWrite(output); throw error; }
        MainActivity.reloadLayoutFromManager();
    }
    static void reset(Context ctx) {
        new AtomicFile(file(ctx)).delete();
        File directory=ctx.getExternalFilesDir(null);
        if(directory!=null) for(String name:Arrays.asList("layout.json")) {
            File external=new File(directory,name);
            if(external.exists() && !external.delete()) throw new IllegalStateException("Cannot remove external layout");
        }
        MainActivity.reloadLayoutFromManager();
    }
    List<AppAdapter.Entry> entries(Context ctx, String section) {
        List<AppAdapter.Entry> result = new ArrayList<>(); JSONArray list = json.optJSONObject(section).optJSONArray("items");
        for (int i=0; i<list.length(); i++) {
            JSONObject item = list.optJSONObject(i); String action = item.optString("action","app");
            AppAdapter.Entry base = null;
            for (AppAdapter.Entry e : AppAdapter.homeEntries()) if (e.key.equals(action)) base=e;
            for (AppAdapter.Entry e : AppAdapter.applicationEntries()) if (e.key.equals(action)) base=e;
            String pkg=item.optString("packageName",""); String title=item.optString("label","");
            if (title.isEmpty() && !pkg.isEmpty()) {try {title=ctx.getPackageManager().getApplicationLabel(ctx.getPackageManager().getApplicationInfo(pkg,0)).toString();}catch(Exception ignored){title=pkg;}}
            int resource = base == null ? R.drawable.ic_apps_minimal : base.icon;
            switch(item.optString("icon","app")) {
                case "music":resource=R.drawable.ic_music;break; case "video":resource=R.drawable.ic_video;break;
                case "files":resource=R.drawable.ic_folder;break;case "apps":resource=R.drawable.ic_apps_minimal;break;
                case "picture":resource=R.drawable.ic_picture;break;case "settings":resource=R.drawable.ic_settings;break;case "input":resource=R.drawable.ic_input;break;
                default:break;
            }
            result.add(new AppAdapter.Entry("layout-"+i+"-"+action+pkg,
                base==null?R.string.placeholder_app:base.label,resource,Color.parseColor(item.optString("color","#374959")),
                pkg.isEmpty()?(base==null?AppAdapter.PLACEHOLDER:base.action):AppAdapter.CUSTOM_APP,base==null?i+1:base.number,
                title,pkg,item.optString("icon","app").equals("app")));
        }
        return result;
    }
    static boolean isUserApp(Context ctx,String packageName) {
        try {
            android.content.pm.ApplicationInfo app=ctx.getPackageManager().getApplicationInfo(packageName,0);
            if((app.flags & (android.content.pm.ApplicationInfo.FLAG_SYSTEM | android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP))!=0 || (app.flags & android.content.pm.ApplicationInfo.FLAG_INSTALLED)==0 || !app.enabled) return false;
            return ctx.getPackageManager().getLeanbackLaunchIntentForPackage(packageName)!=null || ctx.getPackageManager().getLaunchIntentForPackage(packageName)!=null;
        } catch(Exception ignored) {return false;}
    }
    static JSONArray installedApps(Context ctx) throws Exception {
        TreeMap<String,ResolveInfo> found = new TreeMap<>();
        for (String category : Arrays.asList(Intent.CATEGORY_LEANBACK_LAUNCHER,Intent.CATEGORY_LAUNCHER)) {
            for (ResolveInfo info : ctx.getPackageManager().queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(category),0)) {
                if (info.activityInfo != null && isUserApp(ctx,info.activityInfo.packageName)) found.put(info.activityInfo.packageName,info);
            }
        }
        JSONArray result = new JSONArray();
        for (java.util.Map.Entry<String,ResolveInfo> pair : found.entrySet()) {
            if (result.length() >= 100) break;
            JSONObject app = new JSONObject().put("packageName",pair.getKey()).put("label",pair.getValue().loadLabel(ctx.getPackageManager()).toString());
            Bitmap bitmap = null;
            try {
                Drawable icon=pair.getValue().loadIcon(ctx.getPackageManager());bitmap=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888);
                icon.setBounds(0,0,32,32);icon.draw(new Canvas(bitmap));ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,out);
                if (out.size() <= 8192) app.put("iconPng",Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));
            } catch(Exception ignored) { /* Text fallback is sufficient. */ }
            finally {if(bitmap!=null)bitmap.recycle();}
            result.put(app);
        }
        return result;
    }
}
