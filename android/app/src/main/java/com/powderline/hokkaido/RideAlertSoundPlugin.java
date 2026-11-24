package com.powderline.hokkaido;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;

/**
 * Ride On course alert sounds (app.js playRideAlertSound / stopRideAlertAudio). Plays only the app's own MP3s from
 * res/raw, never the phone's notification sound. The event timing stays in app.js; this plugin only plays / stops.
 * Vibration stays on OfflineMapTest.vibrateRideAlert. SOS is played by SosAlertNotifier (notification channel).
 */
@CapacitorPlugin(name = "RideAlertSound")
public class RideAlertSoundPlugin extends Plugin {
    private static final String TAG = "RideAlertSound";
    private static final Map<String, Integer> SOUNDS = new HashMap<>();
    static {
        SOUNDS.put("approach", R.raw.powderline_ride_on);
        SOUNDS.put("offroute", R.raw.powderline_warning);
        SOUNDS.put("back", R.raw.powderline_back_on_track);
        SOUNDS.put("complete", R.raw.powderline_course_finished);
        SOUNDS.put("sos", R.raw.powderline_sos_emergency);
    }

    private final Map<String, MediaPlayer> players = new HashMap<>();
    private AudioFocusRequest focusRequest;

    /** play({type, skipIfPlaying}): skipIfPlaying=true keeps a still-running copy (off-route repeat never overlaps). */
    @PluginMethod
    public void play(PluginCall call) {
        String type = call.getString("type", "");
        Integer resId = SOUNDS.get(type);
        if (resId == null) { call.reject("Unknown alert sound: " + type, "UNKNOWN_TYPE"); return; }
        boolean skipIfPlaying = Boolean.TRUE.equals(call.getBoolean("skipIfPlaying", false));
        JSObject ret = new JSObject();
        synchronized (this) {
            MediaPlayer running = players.get(type);
            if (skipIfPlaying && running != null && isPlaying(running)) {
                ret.put("played", false);
                call.resolve(ret);
                return;
            }
            release(type);
            try {
                MediaPlayer player = create(getContext(), resId);
                players.put(type, player);
                player.setOnCompletionListener(mp -> onFinished(type, mp));
                player.setOnErrorListener((mp, what, extra) -> { onFinished(type, mp); return true; });
                requestFocus();
                player.start();
                ret.put("played", true);
                ret.put("durationMs", player.getDuration());
            } catch (Throwable e) {
                release(type);
                Log.w(TAG, "play " + type + " failed: " + e.getMessage());
                call.reject("Alert sound failed: " + e.getMessage(), "PLAY_FAILED");
                return;
            }
        }
        call.resolve(ret);
    }

    /** stop({type}) stops that alert; stop({}) stops all of them. */
    @PluginMethod
    public void stop(PluginCall call) {
        String type = call.getString("type", "");
        synchronized (this) {
            if (type == null || type.isEmpty()) {
                for (String key : players.keySet().toArray(new String[0])) release(key);
            } else {
                release(type);
            }
            if (players.isEmpty()) abandonFocus();
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            for (String key : players.keySet().toArray(new String[0])) release(key);
            abandonFocus();
        }
    }

    private static MediaPlayer create(Context context, int resId) throws Exception {
        MediaPlayer player = new MediaPlayer();
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        try (AssetFileDescriptor afd = context.getResources().openRawResourceFd(resId)) {
            player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
        }
        player.prepare(); // small local file
        return player;
    }

    private static boolean isPlaying(MediaPlayer player) {
        try { return player.isPlaying(); } catch (IllegalStateException e) { return false; }
    }

    private synchronized void onFinished(String type, MediaPlayer mp) {
        if (players.get(type) == mp) players.remove(type);
        try { mp.release(); } catch (Throwable ignored) {}
        if (players.isEmpty()) abandonFocus();
    }

    private void release(String type) {
        MediaPlayer player = players.remove(type);
        if (player == null) return;
        try { if (isPlaying(player)) player.stop(); } catch (Throwable ignored) {}
        try { player.release(); } catch (Throwable ignored) {}
    }

    // Music etc. ducks while an alert plays (navigation-style), then gets its volume back.
    private void requestFocus() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build())
                    .build();
            }
            am.requestAudioFocus(focusRequest);
        } else {
            am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
    }

    private void abandonFocus() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest != null) am.abandonAudioFocusRequest(focusRequest);
        } else {
            am.abandonAudioFocus(null);
        }
    }
}
