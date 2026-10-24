package com.ecojust.music;

import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.io.IOException;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=28)
public class PlaybackApiTest {
    private static final String VIEW="{\"code\":0,\"message\":\"OK\",\"ttl\":1,\"data\":{\"bvid\":\"BV1GJ411x7h7\",\"aid\":80433022,\"cid\":137649199,\"title\":\"【官方 MV】Never Gonna Give You Up - Rick Astley\",\"duration\":213,\"pic\":\"http://i1.hdslb.com/bfs/archive/cover.jpg\",\"owner\":{\"name\":\"索尼音乐中国\"},\"pages\":[{\"cid\":137649199,\"page\":1}]}}";
    private static final String AUDIO="{\"code\":0,\"data\":{\"dash\":{\"audio\":[{\"id\":30216,\"codecs\":\"mp4a.40.2\",\"bandwidth\":64000,\"baseUrl\":\"https://cdn.example.com/audio.m4s\"}]}}}";
    private Track track() {return new Track("BV1GJ411x7h7","Rick Astley","Artist","","",213);}
    private JSONObject json(String text) throws IOException {try{return new JSONObject(text);}catch(JSONException e){throw new IOException(e);}}
    @Test public void suppliedViewResponseParsesMetadataAndCid() throws Exception {
        JSONObject response=json(VIEW);Track track=BiliApi.parseView("BV1GJ411x7h7",response);
        assertEquals(213,track.duration);assertEquals("索尼音乐中国",track.artist);assertTrue(track.title.contains("Rick Astley"));
        assertEquals(137649199,BiliApi.videoCid(response.getJSONObject("data")));
        assertEquals(137649199,BiliApi.videoCid(new JSONObject("{\"pages\":[{\"cid\":137649199}]}")));
    }
    @Test public void fullPublicDashRequestIncludesFnverWithoutRequiringWbiNav() throws Exception {
        List<String> urls=new ArrayList<>();
        BiliApi api=new BiliApi(url->{urls.add(url);return json(url.contains("/view?")?VIEW:AUDIO);});
        assertEquals("https://cdn.example.com/audio.m4s",api.audio(track()));assertEquals(2,urls.size());
        String play=urls.get(1);assertTrue(play.startsWith("https://api.bilibili.com/x/player/playurl?"));
        for(String value:new String[]{"bvid=BV1GJ411x7h7","cid=137649199","fnver=0","fnval=16","qn=0","fourk=1"})assertTrue(play,play.contains(value));
        assertFalse(play.contains("w_rid"));
    }
    @Test public void suppliedMinus400FallsBackToSignedRequestOnlyOnce() throws Exception {
        List<String> urls=new ArrayList<>();
        BiliApi api=new BiliApi(url->{
            urls.add(url);
            if(url.contains("/view?"))return json(VIEW);
            if(url.endsWith("/nav"))return json("{\"code\":-101,\"data\":{\"wbi_img\":{\"img_url\":\"https://example.com/01234567890123456789012345678901.png\",\"sub_url\":\"https://example.com/01234567890123456789012345678901.png\"}}}");
            return json("{\"code\":-400,\"message\":\"请求错误\",\"ttl\":1}");
        });
        try{api.audio(track());fail();}catch(IOException expected){assertTrue(expected.getMessage().contains("-400"));}
        assertEquals(4,urls.size());assertTrue(urls.get(3).contains("/wbi/playurl?"));assertTrue(urls.get(3).contains("w_rid="));assertTrue(urls.get(3).contains("fnver=0"));
    }
    @Test public void verificationFailureDoesNotTryOtherEndpoints() throws Exception {
        List<String> urls=new ArrayList<>();
        BiliApi api=new BiliApi(url->{urls.add(url);return json(url.contains("/view?")?VIEW:"{\"code\":-352,\"message\":\"verify\"}");});
        try{api.audio(track());fail();}catch(IOException expected){assertTrue(expected.getMessage().contains("验证"));}
        assertEquals(2,urls.size());
    }
    @Test public void singletonAudioAndBackupUrlWithoutBandwidthRemainPlayable() throws Exception {
        JSONObject response=json("{\"code\":0,\"data\":{\"dash\":{\"audio\":{\"id\":30216,\"mimeType\":\"audio/mp4\",\"baseUrl\":\"\",\"backup_url\":[\"file:///bad\",\"https://cdn.example.com/backup.m4s\"]}}}}");
        assertEquals("https://cdn.example.com/backup.m4s",BiliApi.parseAudio(response));
    }
}
