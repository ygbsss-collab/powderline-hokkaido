package com.powderline.hokkaido;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OfflineMapTestPlugin.class);
        registerPlugin(GpxFileSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
