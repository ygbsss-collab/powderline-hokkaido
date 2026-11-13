package com.powderline.hokkaido;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.text.TextUtils;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.FileNotFoundException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * GPX 저장 전용 플러그인.
 * Android 시스템 파일 저장창(ACTION_CREATE_DOCUMENT, SAF)을 열고
 * 사용자가 선택한 URI에 GPX 내용을 UTF-8로 기록한다.
 */
@CapacitorPlugin(name = "GpxFileSaver")
public class GpxFileSaverPlugin extends Plugin {
    private static final String TAG = "GpxFileSaver";
    private static final String GPX_MIME = "application/gpx+xml";

    @PluginMethod
    public void saveGpx(PluginCall call) {
        String content = call.getString("content");
        if (TextUtils.isEmpty(content)) {
            call.reject("저장할 GPX 내용이 없습니다.", "EMPTY_CONTENT");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(GPX_MIME);
        intent.putExtra(Intent.EXTRA_TITLE, normalizeFileName(call.getString("fileName")));
        try {
            startActivityForResult(call, intent, "onCreateDocumentResult");
        } catch (ActivityNotFoundException e) {
            call.reject("이 기기에서 파일 저장창을 열 수 없습니다.", "NO_DOCUMENT_UI", e);
        }
    }

    @ActivityCallback
    private void onCreateDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject ret = new JSObject();
            ret.put("saved", false);
            ret.put("cancelled", true);
            call.resolve(ret);
            bridge.releaseCall(call);
            return;
        }
        final String content = call.getString("content", "");
        new Thread(() -> {
            try {
                writeUtf8(uri, content);
                JSObject ret = new JSObject();
                ret.put("saved", true);
                ret.put("cancelled", false);
                ret.put("uri", uri.toString());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "GPX write failed", e);
                deletePartialDocument(uri);
                call.reject("GPX 파일을 저장하지 못했습니다: " + e.getMessage(), "WRITE_FAILED", e);
            } finally {
                bridge.releaseCall(call);
            }
        }, "GpxFileSaverWrite").start();
    }

    private void writeUtf8(Uri uri, String content) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        OutputStream out;
        try {
            out = resolver.openOutputStream(uri, "wt");
        } catch (FileNotFoundException | IllegalArgumentException | UnsupportedOperationException e) {
            out = resolver.openOutputStream(uri, "w");
        }
        if (out == null) throw new FileNotFoundException("출력 스트림을 열 수 없습니다.");
        try (OutputStream stream = out) {
            stream.write(content.getBytes(StandardCharsets.UTF_8));
            stream.flush();
        }
    }

    private void deletePartialDocument(Uri uri) {
        try {
            DocumentsContract.deleteDocument(getContext().getContentResolver(), uri);
        } catch (Exception ignored) {
        }
    }

    private static String normalizeFileName(String raw) {
        String name = raw == null ? "" : raw.trim().replaceAll("[\\\\/?%*:|\"<>]", "-");
        if (name.isEmpty()) name = "powderline-route";
        if (!name.toLowerCase(java.util.Locale.ROOT).endsWith(".gpx")) name += ".gpx";
        return name;
    }
}
