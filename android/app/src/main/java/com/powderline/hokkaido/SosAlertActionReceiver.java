package com.powderline.hokkaido;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** "알림 중지" action on the SOS notification: stops the repeating alert without opening the app. */
public class SosAlertActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && SosAlertNotifier.ACTION_STOP.equals(intent.getAction())) {
            SosAlertNotifier.stopFromIntent(context, intent);
        }
    }
}
