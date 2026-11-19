package com.powderline.hokkaido;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Replaces Capacitor's MessagingService (manifest: tools:node="remove") and extends it, so tokens and the JS
 * pushNotificationReceived event keep working unchanged. SOS data messages additionally get the native repeating
 * alert, which also runs when the app is in the background or its UI was closed.
 */
public class PowderlineMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        try {
            SosAlertNotifier.handle(getApplicationContext(), remoteMessage);
        } catch (Throwable error) {
            SosAlertNotifier.logFailure(error); // never break normal push delivery
        }
        super.onMessageReceived(remoteMessage);
    }
}
