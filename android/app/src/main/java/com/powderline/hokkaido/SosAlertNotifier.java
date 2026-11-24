package com.powderline.hokkaido;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Repeating SOS alert. One notification per SOS id on the SOS channel with FLAG_INSISTENT: Android repeats the
 * channel's sound and vibration until the notification is cancelled (위치 보기 / 알림 중지 / swipe / SOS resolved /
 * 10-minute timeout) or the user opens the notification shade. It plays on the notification stream, so ringer mode,
 * Do Not Disturb, the volume and the user's channel settings always apply; nothing is forced.
 */
public final class SosAlertNotifier {
    // v2: own SOS sound (res/raw/powderline_sos_emergency.mp3 = dist/assets/audio/05_sos_emergency_final.mp3) and a
    // strong repeating vibration. A new id is required: Android never lets an app change an existing channel's sound.
    static final String CHANNEL_ID = "powderline_sos_alert_v2"; // same id as dist/push-notifications.js
    private static final String LEGACY_CHANNEL_ID = "powderline_sos_alert"; // system default sound; removed
    private static final long[] SOS_VIBRATION = {0, 800, 200, 800, 200, 800, 600}; // FLAG_INSISTENT repeats it
    static final String STATUS_CHANNEL_ID = "powderline_sos_status";
    static final String TAG = "powderline_sos"; // JS stops an alert with removeDeliveredNotifications({id, tag})
    static final String EXTRA_STOP_SOS_ID = "powderline_sos_stop";
    static final String ACTION_STOP = "com.powderline.hokkaido.SOS_ALERT_STOP";
    static final long MAX_ALERT_MS = 10 * 60 * 1000L; // hard stop: the alert can never repeat forever
    static final long STALE_MS = 30 * 60 * 1000L; // delivered late (device was offline): show without repeating
    private static final String PREFS = "powderline_sos_alerts";
    private static final long PREF_TTL_MS = 48 * 60 * 60 * 1000L;
    private static final String LOG = "PowderlineSos";

    private SosAlertNotifier() {}

    /** Same value as JS `sosNotificationId` (Java String.hashCode). */
    static int notificationId(String sosId) {
        return sosId.hashCode();
    }

    /** @return true when the message was an SOS message (the caller still forwards it to Capacitor/JS). */
    static boolean handle(Context context, RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"party_sos".equals(data.get("type"))) return false;
        String sosId = data.get("sos_id");
        if (sosId == null || sosId.isEmpty()) return false;
        String action = data.get("action");
        if ("resolved".equals(action)) {
            remember(context, sosId);
            cancel(context, sosId);
            if (!isAppInForeground()) showResolved(context, message, sosId); // foreground: the JS banner shows it
            return true;
        }
        if (!"created".equals(action)) return false;
        if (seen(context, sosId)) return true; // duplicate delivery, or already stopped / resolved
        remember(context, sosId);
        long sent = message.getSentTime();
        boolean repeat = sent <= 0 || System.currentTimeMillis() - sent <= STALE_MS;
        showAlert(context, message, sosId, repeat);
        return true;
    }

    static void cancel(Context context, String sosId) {
        NotificationManagerCompat.from(context).cancel(TAG, notificationId(sosId));
    }

    /** Called for 위치 보기 / notification tap (MainActivity) and 알림 중지 (SosAlertActionReceiver). */
    static void stopFromIntent(Context context, Intent intent) {
        if (intent == null) return;
        String sosId = intent.getStringExtra(EXTRA_STOP_SOS_ID);
        if (sosId != null && !sosId.isEmpty()) cancel(context, sosId);
    }

    private static boolean canNotify(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static Uri sosSoundUri(Context context) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/" + R.raw.powderline_sos_emergency);
    }

    /** Also called from MainActivity.onCreate, so the native channel (with sound + pattern) exists before JS creates it. */
    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (manager.getNotificationChannel(LEGACY_CHANNEL_ID) != null) manager.deleteNotificationChannel(LEGACY_CHANNEL_ID);
        // Existing channels are never modified: the user's sound / vibration choices stay in effect.
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "SOS 긴급 알림", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("파티원의 긴급 SOS 위치 공유 알림");
            channel.setSound(sosSoundUri(context), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()); // own MP3, never the system notification sound
            channel.enableVibration(true);
            channel.setVibrationPattern(SOS_VIBRATION);
            channel.enableLights(true);
            channel.setLightColor(0xFFFF0000);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }
        if (manager.getNotificationChannel(STATUS_CHANNEL_ID) == null) {
            NotificationChannel status = new NotificationChannel(STATUS_CHANNEL_ID, "SOS 상태 알림", NotificationManager.IMPORTANCE_DEFAULT);
            status.setDescription("파티원의 SOS 종료 안내");
            manager.createNotificationChannel(status);
        }
    }

    private static PendingIntent openIntent(Context context, RemoteMessage message, String sosId, boolean stopAlert) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.powderline.hokkaido.SOS_OPEN." + sosId + (stopAlert ? ".created" : ".resolved"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // Capacitor turns these extras into pushNotificationActionPerformed -> app.js openPartySosFromPush (GPS view).
        String messageId = message.getMessageId();
        intent.putExtra("google.message_id", messageId != null ? messageId : "sos-" + sosId);
        for (Map.Entry<String, String> entry : message.getData().entrySet()) intent.putExtra(entry.getKey(), entry.getValue());
        if (stopAlert) intent.putExtra(EXTRA_STOP_SOS_ID, sosId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, notificationId(sosId), intent, flags);
    }

    @SuppressLint("MissingPermission") // checked in canNotify()
    private static void showAlert(Context context, RemoteMessage message, String sosId, boolean repeat) {
        if (!canNotify(context)) return; // no permission / notifications off: nothing is forced
        ensureChannels(context);
        Map<String, String> data = message.getData();
        String title = nonEmpty(data.get("title"), "POWDERLINE 긴급 SOS");
        String body = nonEmpty(data.get("body"), "파티원이 긴급 위치를 공유했습니다.");
        PendingIntent open = openIntent(context, message, sosId, true);
        Intent stop = new Intent(context, SosAlertActionReceiver.class).setAction(ACTION_STOP).putExtra(EXTRA_STOP_SOS_ID, sosId);
        PendingIntent stopIntent = PendingIntent.getBroadcast(context, notificationId(sosId), stop,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long sent = message.getSentTime();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_sos)
            .setColor(0xFFDC2626)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX) // Android 7.x; 8+ uses the channel importance
            .setDefaults(NotificationCompat.DEFAULT_LIGHTS) // Android 7.x: own sound + pattern below; 8+ uses the channel
            .setSound(sosSoundUri(context))
            .setVibrate(SOS_VIBRATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(open)
            .addAction(0, "위치 보기", open)
            .addAction(0, "알림 중지", stopIntent)
            .setTimeoutAfter(MAX_ALERT_MS)
            .setWhen(sent > 0 ? sent : System.currentTimeMillis())
            .setShowWhen(true);
        Notification notification = builder.build();
        // Android 7.x has no setTimeoutAfter(): repeat only where the 10-minute hard stop is guaranteed.
        if (repeat && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) notification.flags |= Notification.FLAG_INSISTENT;
        NotificationManagerCompat.from(context).notify(TAG, notificationId(sosId), notification);
    }

    @SuppressLint("MissingPermission") // checked in canNotify()
    private static void showResolved(Context context, RemoteMessage message, String sosId) {
        if (!canNotify(context)) return;
        ensureChannels(context);
        Map<String, String> data = message.getData();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, STATUS_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_sos)
            .setContentTitle(nonEmpty(data.get("title"), "POWDERLINE SOS 종료"))
            .setContentText(nonEmpty(data.get("body"), "파티원의 SOS가 해제되었습니다."))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(openIntent(context, message, sosId, false));
        NotificationManagerCompat.from(context).notify(TAG, notificationId(sosId), builder.build());
    }

    private static boolean isAppInForeground() {
        ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
        ActivityManager.getMyMemoryState(info);
        return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
            || info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE;
    }

    private static boolean seen(Context context, String sosId) {
        return prefs(context).contains(sosId);
    }

    private static void remember(Context context, String sosId) {
        SharedPreferences prefs = prefs(context);
        SharedPreferences.Editor editor = prefs.edit();
        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            Object at = entry.getValue();
            if (!(at instanceof Long) || now - (Long) at > PREF_TTL_MS) editor.remove(entry.getKey());
        }
        editor.putLong(sosId, now).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String nonEmpty(String value, String fallback) {
        return value != null && !value.trim().isEmpty() ? value : fallback;
    }

    static void logFailure(Throwable error) {
        Log.e(LOG, "SOS alert handling failed", error);
    }
}
