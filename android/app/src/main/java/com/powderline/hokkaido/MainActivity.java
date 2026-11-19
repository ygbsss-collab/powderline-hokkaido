package com.powderline.hokkaido;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OfflineMapTestPlugin.class);
        registerPlugin(GpxFileSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // SOS notification "위치 보기" / tap: stop the repeating alert at once, then Capacitor routes the extras to JS.
    // BridgeActivity.onCreate also passes the launch intent through here (app started from the notification).
    @Override
    protected void onNewIntent(Intent intent) {
        SosAlertNotifier.stopFromIntent(this, intent);
        super.onNewIntent(intent);
    }
}
