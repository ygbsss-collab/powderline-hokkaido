package com.powderline.hokkaido;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OfflineMapTestPlugin.class);
        registerPlugin(GpxFileSaverPlugin.class);
        registerPlugin(RideAlertSoundPlugin.class); // course alert MP3s (res/raw), called from app.js
        super.onCreate(savedInstanceState);
        SosAlertNotifier.ensureChannels(this); // before push-notifications.js can create the SOS channel without sound/pattern
    }

    // SOS notification "위치 보기" / tap: stop the repeating alert at once, then Capacitor routes the extras to JS.
    // BridgeActivity.onCreate also passes the launch intent through here (app started from the notification).
    @Override
    protected void onNewIntent(Intent intent) {
        SosAlertNotifier.stopFromIntent(this, intent);
        super.onNewIntent(intent);
    }
}
